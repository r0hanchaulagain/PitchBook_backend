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

		// Verify HMAC hash
		const hmac = crypto.createHmac(
			altchaConfig.algorithm,
			altchaConfig.hmacKey
		);
		hmac.update(`${challenge.salt}:${challenge.challenge}`);
		const expectedHash = hmac.digest("hex");

		if (challenge.hash !== expectedHash) {
			throw new Error("Invalid ALTCHA hash");
		}

		// Verify signature with proper error handling
		try {
			const verifier = crypto.createVerify(altchaConfig.algorithm);
			verifier.update(challenge.challenge);
			
			// Use the full public key if available, otherwise reconstruct
			let publicKeyPem;
			if (challenge.publicKeyFull) {
				publicKeyPem = challenge.publicKeyFull;
			} else {
				// Reconstruct the public key properly
				publicKeyPem = "-----BEGIN PUBLIC KEY-----\n" +
					"MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE" +
					challenge.publicKey +
					"\n-----END PUBLIC KEY-----";
			}
			
			const isVerified = verifier.verify(publicKeyPem, challenge.signature, "base64");
			
			if (!isVerified) {
				throw new Error("Invalid ALTCHA signature");
			}
		} catch (cryptoError) {
			console.error("Crypto verification error:", cryptoError.message);
			throw new Error("Invalid ALTCHA signature");
		}

		// Check challenge expiration
		if (challenge.timestamp) {
			const challengeTime = new Date(challenge.timestamp).getTime();
			const currentTime = Date.now();

			if (currentTime - challengeTime > altchaConfig.maxChallengeAge) {
				throw new Error("ALTCHA challenge has expired");
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
		return next(new Error("CAPTCHA verification required"));
	}
	next();
};

module.exports = {
	verifyAltcha,
	requireAltcha,
};
