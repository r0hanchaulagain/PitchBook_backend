const express = require('express');
const futsalController = require('../controllers/futsalController');
const { authenticate, authorize } = require('../middlewares/auth');
const { createFutsalValidator, updateFutsalValidator } = require('../validators/futsalValidators');
const { registerFutsalOwnerValidator } = require('../validators/futsalOwnerValidators');
const { futsalRegistrationPaymentValidator } = require('../validators/paymentValidators');
const multer = require('multer');
const upload = multer({ dest: 'uploads/' });

const router = express.Router();

// Public: Get all futsals with search/filter/pagination
router.get('/', futsalController.getFutsals);

// Public: Get futsal by id
router.get('/:id', futsalController.getFutsalById);

// Protected: Create futsal (futsalOwner, admin)
router.post(
  '/',
  authenticate,
  authorize('admin', 'futsalOwner'),
  createFutsalValidator,
  futsalController.createFutsal,
);

// Protected: Update futsal (futsalOwner, admin)
router.put(
  '/:id',
  authenticate,
  authorize('admin', 'futsalOwner'),
  updateFutsalValidator,
  futsalController.updateFutsal,
);

// Protected: Delete futsal (futsalOwner, admin)
router.delete(
  '/:id',
  authenticate,
  authorize('admin', 'futsalOwner'),
  futsalController.deleteFutsal,
);

// Futsal registration (for futsalOwner)
router.post(
  '/register',
  authenticate,
  registerFutsalOwnerValidator,
  futsalController.registerFutsal,
);

// Pay registration fee for futsal
router.post(
  '/pay-registration',
  authenticate,
  futsalRegistrationPaymentValidator,
  futsalController.payFutsalRegistration,
);

// Upload futsal image
router.post(
  '/upload-image',
  authenticate,
  upload.single('image'),
  createFutsalValidator,
  futsalController.uploadFutsalImage,
);

// Update futsal image
router.put(
  '/:id/update-image',
  authenticate,
  upload.single('image'),
  updateFutsalValidator,
  futsalController.updateFutsalImage,
);

module.exports = router;
