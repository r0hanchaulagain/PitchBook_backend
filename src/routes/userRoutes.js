const express = require('express');
const {
  register,
  login,
  getProfile,
  forgotPassword,
  resetPassword,
  refreshToken,
} = require('../controllers/userController');
const {
  registerValidator,
  loginValidator,
  forgotPasswordValidator,
  resetPasswordValidator,
} = require('../validators/userValidators');
const { authenticate } = require('../middlewares/auth');

const router = express.Router();

// Register
router.post('/register', registerValidator, register);

// Login
router.post('/login', loginValidator, login);

// Forgot password
router.post('/forgot-password', forgotPasswordValidator, forgotPassword);

// Reset password
router.post('/reset-password', resetPasswordValidator, resetPassword);

// Refresh token endpoint
router.post('/refresh-token', refreshToken);

// Get current user profile (protected)
router.get('/me', authenticate, getProfile);

module.exports = router;
