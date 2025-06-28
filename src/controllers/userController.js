const User = require('../models/User');
const jwt = require('jsonwebtoken');
const config = require('../config');
const { validationResult } = require('express-validator');
const crypto = require('crypto');
const { sendMail } = require('../utils/email');
const Session = require('../models/Session');
const futsalOwnerActivationTemplate = require('../utils/emailTemplates/futsalOwnerActivation');
const { uploadImage, deleteImage } = require('../utils/cloudinary');

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
    const { email, password, role, phone, fullName } = req.body;
    const userExists = await User.findOne({ $or: [{ email }, { phone }] });
    if (userExists) {
      res.locals.errorMessage = 'User already exists';
      return res.status(400).json({ error: 'User already exists' });
    }
    // Build user object based on role
    let userObj = { email, password, role, phone, fullName };
    if (role === 'user') {
      userObj.favoritesFutsal = [];
      userObj.bookingHistory = [];
    }
    if (role === 'futsalOwner') {
      userObj.isActiveOwner = false;
    }
    const user = await User.create(userObj);
    const token = generateToken(user);

    // Send futsal owner activation email if role is futsalOwner #TODO: add to resend the email if owner is not active and tried to create a futsal
    if (role === 'futsalOwner') {
      const html = futsalOwnerActivationTemplate({ fullName });
      await sendMail({
        to: email,
        subject: 'Futsal Owner Account Created - Activation Required',
        html,
      });
    }

    res.status(201).json({
      user: {
        id: user._id,
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

// -- LOGIN: Set tokens as HttpOnly cookies --
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
      res.locals.errorMessage = 'No user registered';
      return res.status(400).json({ error: 'No user registered' });
    }
    // Check if account is locked
    if (user.lockUntil && user.lockUntil > Date.now()) {
      return res.status(423).json({
        error: 'Account is locked due to too many failed login attempts. Try again later.',
      });
    }
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      user.loginAttempts = (user.loginAttempts || 0) + 1;
      // Lock account after 5 failed attempts for 1 hour
      if (user.loginAttempts >= 5) {
        user.lockUntil = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
      }
      await user.save();
      res.locals.errorMessage = 'Invalid credentials.Please try again.';
      return res.status(400).json({ error: 'Invalid credentials.Please try again.' });
    }
    // Reset login attempts and lockUntil on successful login
    user.loginAttempts = 0;
    user.lockUntil = undefined;
    await user.save();
    const token = generateToken(user);
    const refreshToken = generateRefreshToken(user);
    await Session.create({ user: user._id, token: refreshToken });
    // Set cookies
    res.cookie('accessToken', token, {
      httpOnly: true,
      secure: config.nodeEnv === 'production',
      sameSite: 'strict',
      maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
    });
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: config.nodeEnv === 'production',
      sameSite: 'strict',
      maxAge: 1000 * 60 * 60 * 24 * 30, // 30 days
    });
    res.json({
      user: {
        id: user._id,
        email: user.email,
        role: user.role,
        phone: user.phone,
        fullName: user.fullName,
      },
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
    // Send confirmation email
    const html = `<p>Your password has been reset successfully. If you did not perform this action, please contact support immediately.</p>`;
    await sendMail({ to: user.email, subject: 'Password Reset Successful', html });
    res.status(200).json({ message: 'Password has been reset successfully.' });
  } catch (err) {
    res.locals.errorMessage = err.message;
    res.status(500).json({ error: err.message || 'Server error' });
  }
};

// -- REFRESH TOKEN: Use HttpOnly cookie --
exports.refreshToken = async (req, res) => {
  const refreshToken = req.cookies.refreshToken;
  if (!refreshToken) {
    res.locals.errorMessage = 'Refresh token is required';
    return res.status(400).json({ error: 'Refresh token is required' });
  }
  try {
    const payload = jwt.verify(refreshToken, config.jwtSecret);
    const session = await Session.findOne({ user: payload.id, token: refreshToken });
    if (!session) {
      res.locals.errorMessage = 'Invalid refresh token';
      return res.status(401).json({ error: 'Invalid refresh token' });
    }
    const user = await User.findById(payload.id);
    if (!user) {
      res.locals.errorMessage = 'User not found';
      return res.status(404).json({ error: 'User not found' });
    }
    const newToken = generateToken(user);
    res.cookie('accessToken', newToken, {
      httpOnly: true,
      secure: config.nodeEnv === 'production',
      sameSite: 'strict',
      maxAge: 1000 * 60 * 60 * 24 * 7,
    });
    res.json({ message: 'Token refreshed' });
  } catch (err) {
    res.locals.errorMessage = err.message;
    res.status(401).json({ error: err.message || 'Invalid refresh token' });
  }
};

// -- LOGOUT: Clear cookies --
exports.logout = async (req, res) => {
  try {
    const refreshToken = req.cookies.refreshToken;
    if (!refreshToken) {
      return res.status(400).json({ error: 'Refresh token required' });
    }
    await Session.deleteOne({ token: refreshToken });
    res.clearCookie('accessToken');
    res.clearCookie('refreshToken');
    res.status(200).json({ message: 'Logged out successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Server error' });
  }
};

// Schedule futsal owner for deletion (soft delete, 24h restore window)
exports.scheduleOwnerDeletion = async (req, res) => {
  try {
    const owner = await User.findById(req.params.id);
    if (!owner || owner.role !== 'futsalOwner') {
      return res.status(404).json({ message: 'Owner not found' });
    }
    if (owner.isDeleted) {
      return res.status(400).json({ message: 'Already scheduled for deletion' });
    }
    owner.scheduledDeletion = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h from now
    owner.isDeleted = false;
    await owner.save();
    // Notify owner
    if (owner.email) {
      const html = `<p>Your futsal owner account and all related data (futsal, bookings) will be permanently deleted in 24 hours unless restored. If this was not intended, please contact support or restore your account within the next 24 hours.</p>`;
      await sendMail({ to: owner.email, subject: 'Account Deletion Scheduled', html });
    }
    res.json({ message: 'Owner scheduled for deletion in 24 hours.' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Restore owner before hard deletion
exports.restoreOwner = async (req, res) => {
  try {
    const owner = await User.findById(req.params.id);
    if (!owner || owner.role !== 'futsalOwner') {
      return res.status(404).json({ message: 'Owner not found' });
    }
    if (!owner.scheduledDeletion || owner.isDeleted) {
      return res.status(400).json({ message: 'Owner is not scheduled for deletion' });
    }
    owner.scheduledDeletion = undefined;
    owner.isDeleted = false;
    await owner.save();
    res.json({ message: 'Owner account restored.' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Add a futsal to user's favourites
exports.addFutsalToFavourites = async (req, res) => {
  try {
    const userId = req.user._id;
    const { futsalId } = req.params;
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (!user.favoritesFutsal) user.favoritesFutsal = [];
    if (user.favoritesFutsal.includes(futsalId)) {
      return res.status(400).json({ message: 'Futsal already in favourites' });
    }
    user.favoritesFutsal.push(futsalId);
    await user.save();
    res.json({ message: 'Futsal added to favourites', favorites: user.favoritesFutsal });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Remove a futsal from user's favourites
exports.removeFutsalFromFavourites = async (req, res) => {
  try {
    const userId = req.user._id;
    const { futsalId } = req.params;
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });
    user.favoritesFutsal = user.favoritesFutsal.filter((id) => id.toString() !== futsalId);
    await user.save();
    res.json({ message: 'Futsal removed from favourites', favorites: user.favoritesFutsal });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Get user's favourite futsals
exports.getFavouriteFutsals = async (req, res) => {
  try {
    const userId = req.user._id;
    const user = await User.findById(userId).populate('favoritesFutsal');
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({ favorites: user.favoritesFutsal });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// POST /api/users/upload-profile-image
exports.uploadProfileImage = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No image file provided' });
    const userId = req.user._id;
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    // Upload image
    const result = await uploadImage(req.file.path, `profiles/${userId}`);
    user.profileImage = result.secure_url;
    await user.save();
    res.status(200).json({ url: result.secure_url });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Profile image upload failed' });
  }
};

// PUT /api/users/update-profile-image
exports.updateProfileImage = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No image file provided' });
    const userId = req.user._id;
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    // Optionally delete old image if public_id is provided
    if (req.body.oldPublicId) await deleteImage(req.body.oldPublicId);
    const result = await uploadImage(req.file.path, `profiles/${userId}`);
    user.profileImage = result.secure_url;
    await user.save();
    res.status(200).json({ url: result.secure_url });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Profile image update failed' });
  }
};

// Permanently delete a user and their profile image from Cloudinary
exports.deleteUser = async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    // Delete user profile image from Cloudinary if present
    if (user.profileImage) {
      // Try to extract public_id from the URL
      const match = user.profileImage.match(/\/profiles\/([^/.]+)\/(.+)\.[a-zA-Z]+$/);
      if (match) {
        const publicId = `profiles/${match[1]}/${match[2]}`;
        await deleteImage(publicId).catch(() => {});
      }
    }
    res.json({ message: 'User deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Server error' });
  }
};
