const express = require('express');
const {
  register,
  login,
  getProfile,
  forgotPassword,
  resetPassword,
  refreshToken,
  logout,
  uploadProfileImage,
  updateProfileImage,
  deleteUser,
} = require('../controllers/userController');
const {
  registerValidator,
  loginValidator,
  forgotPasswordValidator,
  resetPasswordValidator,
  deleteUserValidator,
} = require('../validators/userValidators');
const { authenticate } = require('../middlewares/auth');
const multer = require('multer');
const upload = multer({ dest: 'uploads/' });

const router = express.Router();

// Register
router.post('/register', registerValidator, register);

// Login
router.post('/login', loginValidator, login);

// Forgot password
router.post('/forgot-password', forgotPasswordValidator, forgotPassword);

// Reset password
router.post('/reset-password', resetPasswordValidator, resetPassword);

// Logout
router.post('/logout', logout);

// Refresh token endpoint
router.post('/refresh-token', refreshToken);

// Get current user profile (protected)
router.get('/me', authenticate, getProfile);

// Upload profile image
router.post(
  '/upload-profile-image',
  authenticate,
  upload.single('image'),
  registerValidator,
  uploadProfileImage,
);

// Update profile image
router.put(
  '/update-profile-image',
  authenticate,
  upload.single('image'),
  registerValidator,
  updateProfileImage,
);

// Permanently delete a user and their profile image
router.delete('/:id', authenticate, deleteUserValidator, deleteUser);

module.exports = router;
