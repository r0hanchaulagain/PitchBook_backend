const { body } = require("express-validator");

exports.createFutsalValidator = [
	body("name").notEmpty(),
	body("location.city").notEmpty(),
	body("location.district").notEmpty(),
	body("contactInfo.phone").notEmpty(),
	body("pricing.basePrice").isNumeric(),
];

exports.updateFutsalValidator = [
	body("name").optional().notEmpty(),
	// add more fields as needed
];
