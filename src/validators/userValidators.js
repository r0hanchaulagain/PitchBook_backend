const { body } = require("express-validator");

const validatePasswordComplexity = (value) => {
	if (!value) return false;

	if (value.length < 8 || value.length > 16) {
		throw new Error("Password must be between 8 and 16 characters long");
	}

	if (!/[A-Z]/.test(value)) {
		throw new Error("Password must contain at least one uppercase letter");
	}

	if (!/[a-z]/.test(value)) {
		throw new Error("Password must contain at least one lowercase letter");
	}

	if (!/\d/.test(value)) {
		throw new Error("Password must contain at least one number");
	}

	if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(value)) {
		throw new Error(
			"Password must contain at least one special character (!@#$%^&*()_+-=[]{}|;:,.<>?)"
		);
	}

	const weakPatterns = [
		"password",
		"123456",
		"qwerty",
		"admin",
		"user",
		"abc123",
		"password123",
		"admin123",
		"test123",
	];

	const lowerValue = value.toLowerCase();
	for (const pattern of weakPatterns) {
		if (lowerValue.includes(pattern)) {
			throw new Error("Password contains common weak patterns");
		}
	}

	if (/(.)\1{3,}/.test(value)) {
		throw new Error(
			"Password cannot contain more than 3 consecutive repeated characters"
		);
	}

	if (
		/(?:abc|bcd|cde|def|efg|fgh|ghi|hij|ijk|jkl|klm|lmn|mno|nop|opq|pqr|qrs|rst|stu|tuv|uvw|vwx|wxy|xyz|012|123|234|345|456|567|678|789)/i.test(
			value
		)
	) {
		throw new Error("Password cannot contain sequential characters");
	}

	return true;
};

exports.registerValidator = [
	body("email").isEmail().withMessage("Please enter a valid email address"),
	body("password").custom(validatePasswordComplexity),
	body("role")
		.isIn(["admin", "user", "futsalOwner"])
		.withMessage("Invalid role selected"),
	body("phone").notEmpty().withMessage("Phone number is required"),
	body("fullName").notEmpty().withMessage("Full name is required"),
];

exports.loginValidator = [
	body("email").isEmail().withMessage("Please enter a valid email address"),
	body("password").exists().withMessage("Password is required"),
];

exports.forgotPasswordValidator = [
	body("email").isEmail().withMessage("Please enter a valid email address"),
];

exports.resetPasswordValidator = [
	body("token").notEmpty().withMessage("Reset token is required"),
	body("email").isEmail().withMessage("Please enter a valid email address"),
	body("password").custom(validatePasswordComplexity),
];

exports.deleteUserValidator = [
	body("id").notEmpty().isString().withMessage("User ID is required"),
];

exports.enableMFAValidator = [
	body("secret").notEmpty().withMessage("TOTP secret is required"),
	body("token")
		.isLength({ min: 6, max: 6 })
		.withMessage("TOTP token must be 6 digits"),
];

exports.verifyMFAValidator = [
	body("token")
		.optional()
		.isLength({ min: 6, max: 6 })
		.withMessage("TOTP token must be 6 digits"),
	body("backupCode")
		.optional()
		.isLength({ min: 8, max: 8 })
		.withMessage("Backup code must be 8 characters"),
];

exports.disableMFAValidator = [
	body("password")
		.notEmpty()
		.withMessage("Password is required to disable MFA"),
];

exports.regenerateBackupCodesValidator = [
	body("password")
		.notEmpty()
		.withMessage("Password is required to regenerate backup codes"),
];
