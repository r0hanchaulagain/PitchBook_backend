const crypto = require("node:crypto");
const altchaConfig = require("../../config/altcha");

const verifyAltcha = (req, res, next) => {
	try {
		const { altcha } = req.body;

		if (!altcha) {
			throw new Error("ALTCHA challenge is required");
		}

		let challenge;
		try {
			challenge = typeof altcha === "string" ? JSON.parse(altcha) : altcha;
		} catch (error) {
			throw new Error("Invalid ALTCHA challenge format");
		}

		const requiredFields = [
			"algorithm",
			"challenge",
			"signature",
			"salt",
			"hash",
		];
		for (const field of requiredFields) {
			if (!challenge[field]) {
				throw new Error(`Missing required ALTCHA field: ${field}`);
			}
		}

		if (challenge.algorithm !== altchaConfig.algorithm) {
			throw new Error("Unsupported algorithm");
		}

		const hmac = crypto.createHmac(
			altchaConfig.algorithm,
			altchaConfig.hmacKey
		);
		hmac.update(`${challenge.salt}:${challenge.challenge}`);
		const expectedHash = hmac.digest("hex");

		if (challenge.hash !== expectedHash) {
			throw new ValidationError("Invalid ALTCHA hash");
		}

		const verifier = crypto.createVerify(altchaConfig.algorithm);
		verifier.update(challenge.challenge);
		const isVerified = verifier.verify(
			"-----BEGIN PUBLIC KEY-----\n" +
				"MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE" +
				challenge.publicKey +
				"\n" +
				"-----END PUBLIC KEY-----",
			challenge.signature,
			"base64"
		);

		if (!isVerified) {
			throw new ValidationError("Invalid ALTCHA signature");
		}

		if (challenge.timestamp) {
			const challengeTime = new Date(challenge.timestamp).getTime();
			const currentTime = Date.now();

			if (currentTime - challengeTime > altchaConfig.maxChallengeAge) {
				throw new ValidationError("ALTCHA challenge has expired");
			}
		}

		req.altcha = {
			verified: true,
			challenge: challenge.challenge,
			timestamp: challenge.timestamp || Date.now(),
		};

		next();
	} catch (error) {
		next(error);
	}
};

const requireAltcha = (req, res, next) => {
	if (!req.altcha || !req.altcha.verified) {
		return next(new ValidationError("CAPTCHA verification required"));
	}
	next();
};

module.exports = {
	verifyAltcha,
	requireAltcha,
};
