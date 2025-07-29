const { createChallenge, verifySolution, verifyServerSignature, verifyFieldsHash } = require('altcha-lib');
const altchaConfig = require("../config/altcha");

const generateChallenge = async () => {
	try {
		// Generate a new random challenge with specified complexity
		const challenge = await createChallenge({
			hmacKey: altchaConfig.hmacKey,
			maxNumber: altchaConfig.maxNumber || 50_000
		});

		return challenge;
	} catch (error) {
		console.error("Error generating ALTCHA challenge:", error);
		throw new Error("Failed to generate CAPTCHA challenge");
	}
};

const verifyChallenge = async (altchaPayload) => {
	try {
		if (!altchaPayload) {
			return {
				success: false,
				message: "ALTCHA payload is required",
				error: "MISSING_PAYLOAD"
			};
		}

		// Verify the solution using the secret HMAC key
		const verified = await verifySolution(String(altchaPayload), altchaConfig.hmacKey);

		if (!verified) {
			return {
				success: false,
				message: "Invalid ALTCHA payload",
				error: "INVALID_PAYLOAD"
			};
		}

		return {
			success: true,
			message: "ALTCHA verified successfully"
		};
	} catch (error) {
		console.error("Error verifying ALTCHA challenge:", error);
		return {
			success: false,
			message: "Verification failed",
			error: "VERIFICATION_ERROR"
		};
			}
};

const verifyWithSpamFilter = async (altchaPayload, formData) => {
	try {
		if (!altchaPayload) {
			return {
				success: false,
				message: "ALTCHA payload is required",
				error: "MISSING_PAYLOAD"
			};
		}

		// Verify the server signature using the API secret
		const { verificationData, verified } = await verifyServerSignature(String(altchaPayload), altchaConfig.hmacKey);

		if (!verified || !verificationData) {
			return {
				success: false,
				message: "Invalid ALTCHA payload",
				error: "INVALID_PAYLOAD"
			};
		}

		const { classification, fields, fieldsHash } = verificationData;

		if (classification === 'BAD') {
			return {
				success: false,
				message: "Classified as spam",
				error: "SPAM_CLASSIFICATION"
			};
		}

		if (fields && fieldsHash && !await verifyFieldsHash(formData, fields, fieldsHash)) {
			return {
				success: false,
				message: "Invalid fields hash",
				error: "INVALID_FIELDS_HASH"
			};
		}

		return {
			success: true,
			message: "ALTCHA verified successfully with spam filter",
			verificationData
		};
	} catch (error) {
		console.error("Error verifying ALTCHA with spam filter:", error);
		return {
			success: false,
			message: "Verification failed",
			error: "VERIFICATION_ERROR"
		};
	}
};

module.exports = {
	generateChallenge,
	verifyChallenge,
	verifyWithSpamFilter,
};
