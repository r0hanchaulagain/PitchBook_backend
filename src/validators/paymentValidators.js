const { body } = require("express-validator");

exports.futsalRegistrationPaymentValidator = [
	body("futsalId").notEmpty(),
	body("paymentToken").notEmpty(), // Khalti or other gateway token
	body("amount").isNumeric(),
];
