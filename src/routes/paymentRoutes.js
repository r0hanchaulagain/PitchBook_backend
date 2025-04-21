const express = require('express');
const { verifyFutsalRegistrationPayment } = require('../controllers/paymentController');
const router = express.Router();

// POST /api/v1/payments/verify
router.post('/verify', verifyFutsalRegistrationPayment);

module.exports = router;
