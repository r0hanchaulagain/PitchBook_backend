const crypto = require("crypto");
const altchaConfig = require("../config/altcha");

const generateChallenge = () => {
	try {
		// Generate a random challenge string
		const challenge = crypto.randomBytes(16).toString("hex");
		const salt = crypto.randomBytes(8).toString("hex");

		// Create HMAC hash
		const hmac = crypto.createHmac(
			altchaConfig.algorithm,
			altchaConfig.hmacKey
		);
		hmac.update(`${salt}:${challenge}`);
		const hash = hmac.digest("hex");

		// Generate key pair for this challenge
		const { publicKey, privateKey } = crypto.generateKeyPairSync("ec", {
			namedCurve: "prime256v1",
			publicKeyEncoding: { type: "spki", format: "pem" },
			privateKeyEncoding: { type: "pkcs8", format: "pem" },
		});

		// Sign the challenge with the private key
		const sign = crypto.createSign(altchaConfig.algorithm);
		sign.update(challenge);
		sign.end();
		const signature = sign.sign(privateKey, "base64");

		// Store the full public key for verification
		const publicKeyContent = publicKey
			.replace("-----BEGIN PUBLIC KEY-----", "")
			.replace("-----END PUBLIC KEY-----", "")
			.replace(/\s/g, "");

		return {
			algorithm: altchaConfig.algorithm,
			challenge,
			salt,
			hash,
			signature,
			publicKey: publicKeyContent,
			publicKeyFull: publicKey, // Store the full PEM for verification
			maxNumber: 1000000, // Adjust based on desired complexity
			timestamp: Date.now(),
		};
	} catch (error) {
		console.error("Error generating ALTCHA challenge:", error);
		throw new Error("Failed to generate CAPTCHA challenge");
	}
};

const verifyChallenge = (challenge) => {
	try {
		if (!challenge) {
			throw new Error("Challenge is required");
		}

		// Parse if challenge is a string
		const challengeObj =
			typeof challenge === "string" ? JSON.parse(challenge) : challenge;

		// Verify required fields
		const requiredFields = [
			"algorithm",
			"challenge",
			"signature",
			"salt",
			"hash",
		];
		for (const field of requiredFields) {
			if (!challengeObj[field]) {
				throw new Error(`Missing required field: ${field}`);
			}
		}

		// Reconstruct the expected hash
		const hmac = crypto.createHmac(
			altchaConfig.algorithm,
			altchaConfig.hmacKey
		);
		hmac.update(`${challengeObj.salt}:${challengeObj.challenge}`);
		const expectedHash = hmac.digest("hex");

		// Verify the hash
		if (challengeObj.hash !== expectedHash) {
			throw new Error("Invalid hash");
		}

		// Verify the signature with proper error handling
		try {
			const verifier = crypto.createVerify(altchaConfig.algorithm);
			verifier.update(challengeObj.challenge);
			
			// Use the full public key if available, otherwise reconstruct
			let publicKeyPem;
			if (challengeObj.publicKeyFull) {
				publicKeyPem = challengeObj.publicKeyFull;
			} else {
				// Reconstruct the public key properly
				publicKeyPem = "-----BEGIN PUBLIC KEY-----\n" +
					"MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE" +
					challengeObj.publicKey +
					"\n-----END PUBLIC KEY-----";
			}
			
			const isVerified = verifier.verify(publicKeyPem, challengeObj.signature, "base64");
			
			if (!isVerified) {
				throw new Error("Invalid signature");
			}
		} catch (cryptoError) {
			console.error("Crypto verification error:", cryptoError.message);
			throw new Error("Invalid signature");
		}

		// Verify challenge expiration (if timestamp is provided)
		if (challengeObj.timestamp) {
			const challengeTime = new Date(challengeObj.timestamp).getTime();
			const currentTime = Date.now();

			if (currentTime - challengeTime > altchaConfig.maxChallengeAge) {
				throw new Error("Challenge has expired");
			}
		}

		return true;
	} catch (error) {
		console.error("Error verifying ALTCHA challenge:", error);
		throw error;
	}
};

module.exports = {
	generateChallenge,
	verifyChallenge,
};
