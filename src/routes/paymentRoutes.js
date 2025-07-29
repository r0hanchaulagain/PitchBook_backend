const express = require("express");
const {
	verifyFutsalRegistrationPayment,
} = require("../controllers/paymentController");
const router = express.Router();

router.post("/verify", verifyFutsalRegistrationPayment);

module.exports = router;
