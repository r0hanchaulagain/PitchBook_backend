const { body } = require("express-validator");

exports.futsalRegistrationPaymentValidator = [
	body("futsalId").notEmpty(),
	body("paymentToken").notEmpty(),
	body("amount").isNumeric(),
];
