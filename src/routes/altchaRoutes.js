const express = require("express");
const router = express.Router();
const altchaController = require("../controllers/altchaController");

router.get("/altcha", async (req, res) => {
	try {
		const challenge = await altchaController.generateChallenge();

		res.json(challenge);
	} catch (error) {
		console.error("Error generating ALTCHA challenge:", error);
		res.status(500).json({
			error: "Failed to create challenge",
			details: error.message,
		});
	}
});

router.post("/verify", async (req, res) => {
	try {
		const altcha = req.body.altcha;

		if (!altcha) {
			return res.status(400).json({
				error: "ALTCHA payload missing",
			});
		}

		const verificationResult = await altchaController.verifyChallenge(altcha);

		if (!verificationResult.success) {
			return res.status(400).json({
				error: verificationResult.message,
				code: verificationResult.error,
			});
		}

		res.json({
			success: true,
			message: "ALTCHA verified successfully",
		});
	} catch (error) {
		console.error("Error verifying ALTCHA:", error);
		res.status(500).json({
			error: "Failed to process verification",
			details: error.message,
		});
	}
});

router.post("/verify-spam-filter", async (req, res) => {
	try {
		const altcha = req.body.altcha;

		if (!altcha) {
			return res.status(400).json({
				error: "ALTCHA payload missing",
			});
		}

		const verificationResult = await altchaController.verifyWithSpamFilter(
			altcha,
			req.body
		);

		if (!verificationResult.success) {
			return res.status(400).json({
				error: verificationResult.message,
				code: verificationResult.error,
			});
		}

		res.json({
			success: true,
			message: "ALTCHA verified successfully with spam filter",
			verificationData: verificationResult.verificationData,
		});
	} catch (error) {
		console.error("Error verifying ALTCHA with spam filter:", error);
		res.status(500).json({
			error: "Failed to process verification with spam filter",
			details: error.message,
		});
	}
});

module.exports = router;
