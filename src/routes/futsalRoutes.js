const express = require('express');
const futsalController = require('../controllers/futsalController');
const { authenticate, authorize } = require('../middlewares/auth');
const { createFutsalValidator, updateFutsalValidator } = require('../validators/futsalValidators');
const { registerFutsalOwnerValidator } = require('../validators/futsalOwnerValidators');

const multer = require('multer');
const upload = multer({ dest: 'uploads/' });

const router = express.Router();

// Public: Get all futsals with search/filter/pagination
router.get('/', futsalController.getFutsals);

// Add dashboard summary endpoint before '/:id' to avoid conflicts
router.get('/dashboard-summary', futsalController.getDashboardSummary);

// Public: Get futsal by id
router.get('/:id', futsalController.getFutsalById);

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

// Update pricing rules (futsalOwner, admin)
router.patch(
  '/:id/pricing-rules',
  authenticate,
  authorize('admin', 'futsalOwner'),
  futsalController.updatePricingRules,
);

module.exports = router;
