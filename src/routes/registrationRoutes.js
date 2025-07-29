const express = require("express");
const router = express.Router();
const registrationController = require("../controllers/registrationController");

router.post("/owner", registrationController.registerOwner);

router.get("/verify", registrationController.verifyPayment);

router.post("/resend-payment-url", registrationController.resendPaymentUrl);

module.exports = router;
