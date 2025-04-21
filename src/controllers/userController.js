const User = require('../models/User');
const jwt = require('jsonwebtoken');
const config = require('../config');
const { validationResult } = require('express-validator');
const crypto = require('crypto');
const { sendMail } = require('../utils/email');
const Session = require('../models/Session');

const generateToken = (user) => {
  return jwt.sign({ id: user._id, role: user.role }, config.jwtSecret, { expiresIn: '7d' });
};

// Helper to generate refresh token
const generateRefreshToken = (user) => {
  return jwt.sign({ id: user._id, role: user.role }, config.jwtSecret, { expiresIn: '30d' });
};

exports.register = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.locals.errorMessage = JSON.stringify(errors.array());
    return res.status(400).json({ errors: errors.array() });
  }
  try {
    const { username, email, password, role, phone, fullName } = req.body;
    const userExists = await User.findOne({ $or: [{ email }, { username }, { phone }] });
    if (userExists) {
      res.locals.errorMessage = 'User already exists';
      return res.status(400).json({ error: 'User already exists' });
    }
    const user = await User.create({ username, email, password, role, phone, fullName });
    const token = generateToken(user);
    res
      .status(201)
      .json({
        user: {
          id: user._id,
          username: user.username,
          email: user.email,
          role: user.role,
          phone: user.phone,
          fullName: user.fullName,
        },
        token,
      });
  } catch (err) {
    res.locals.errorMessage = err.message;
    res.status(500).json({ error: err.message || 'Server error' });
  }
};

exports.login = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.locals.errorMessage = JSON.stringify(errors.array());
    return res.status(400).json({ errors: errors.array() });
  }
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) {
      res.locals.errorMessage = 'Invalid credentials';
      return res.status(400).json({ error: 'Invalid credentials' });
    }
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      res.locals.errorMessage = 'Invalid credentials';
      return res.status(400).json({ error: 'Invalid credentials' });
    }
    const token = generateToken(user);
    const refreshToken = generateRefreshToken(user);
    // Store refresh token in Session collection
    await Session.create({ user: user._id, token: refreshToken });
    res.json({
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
        phone: user.phone,
        fullName: user.fullName,
      },
      token,
      refreshToken,
    });
  } catch (err) {
    res.locals.errorMessage = err.message;
    res.status(500).json({ error: err.message || 'Server error' });
  }
};

exports.getProfile = async (req, res) => {
  res.json({ user: req.user });
};

exports.forgotPassword = async (req, res) => {
  const { email } = req.body;
  try {
    const user = await User.findOne({ email });
    if (!user) {
      res.locals.errorMessage = 'If that email is registered, a reset link has been sent.';
      return res
        .status(200)
        .json({ message: 'If that email is registered, a reset link has been sent.' });
    }
    // Generate token
    const token = crypto.randomBytes(32).toString('hex');
    user.resetPasswordToken = token;
    user.resetPasswordExpires = Date.now() + 1000 * 60 * 60; // 1 hour
    await user.save();
    // Send email
    const resetUrl = `${config.frontendUrl}/reset-password?token=${token}&email=${encodeURIComponent(email)}`;
    const html = `<p>You requested a password reset for your Futsal account.</p><p><a href="${resetUrl}">Click here to reset your password</a></p><p>If you did not request this, please ignore this email.</p>`;
    await sendMail({ to: email, subject: 'Password Reset', html });
    res.status(200).json({ message: 'If that email is registered, a reset link has been sent.' });
  } catch (err) {
    res.locals.errorMessage = err.message;
    res.status(500).json({ error: err.message || 'Server error' });
  }
};

exports.resetPassword = async (req, res) => {
  const { token, email, password } = req.body;
  try {
    const user = await User.findOne({
      email,
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: Date.now() },
    });
    if (!user) {
      res.locals.errorMessage = 'Invalid or expired token';
      return res.status(400).json({ error: 'Invalid or expired token' });
    }
    user.password = password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();
    res.status(200).json({ message: 'Password has been reset successfully.' });
  } catch (err) {
    res.locals.errorMessage = err.message;
    res.status(500).json({ error: err.message || 'Server error' });
  }
};

exports.refreshToken = async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) {
    res.locals.errorMessage = 'Refresh token is required';
    return res.status(400).json({ error: 'Refresh token is required' });
  }
  try {
    // Verify refresh token
    const payload = jwt.verify(refreshToken, config.jwtSecret);
    // Check if refresh token exists in DB
    const session = await Session.findOne({ user: payload.id, token: refreshToken });
    if (!session) {
      res.locals.errorMessage = 'Invalid refresh token';
      return res.status(401).json({ error: 'Invalid refresh token' });
    }
    // Generate new access token
    const user = await User.findById(payload.id);
    if (!user) {
      res.locals.errorMessage = 'User not found';
      return res.status(404).json({ error: 'User not found' });
    }
    const newToken = generateToken(user);
    res.json({ token: newToken });
  } catch (err) {
    res.locals.errorMessage = err.message;
    res.status(401).json({ error: err.message || 'Invalid refresh token' });
  }
};
