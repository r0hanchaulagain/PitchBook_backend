const { verifySolution } = require('altcha-lib');
const altchaConfig = require("../../config/altcha");

const verifyAltcha = async (req, res, next) => {
	try {
		const { altcha } = req.body;

		if (!altcha) {
			throw new Error("ALTCHA payload is required");
		}

		// Verify the solution using the secret HMAC key
		const verified = await verifySolution(String(altcha), altchaConfig.hmacKey);

		if (!verified) {
			throw new Error("Invalid ALTCHA payload");
		}

		req.altcha = {
			verified: true,
			payload: altcha,
			timestamp: Date.now(),
		};

		next();
	} catch (error) {
		next(error);
	}
};

const requireAltcha = (req, res, next) => {
	if (!req.altcha || !req.altcha.verified) {
		return next(new Error("CAPTCHA verification required"));
	}
	next();
};

module.exports = {
	verifyAltcha,
	requireAltcha,
};
