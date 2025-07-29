const { body } = require("express-validator");

exports.registerFutsalOwnerValidator = [
	body("name").notEmpty(),
	body("location.city").notEmpty(),
	body("location.district").notEmpty(),
	body("location.address").notEmpty(),
	body("contactInfo.phone").notEmpty(),
	body("pricing.basePrice").isNumeric(),
];
