const express = require("express");
const router = express.Router();
const registrationController = require("../controllers/registrationController");

// Register futsal owner and initiate payment
router.post("/owner", registrationController.registerOwner);

// Verify payment (return URL)
router.get("/verify", registrationController.verifyPayment);

// Resend payment URL if owner is not active
router.post("/resend-payment-url", registrationController.resendPaymentUrl);

module.exports = router;
