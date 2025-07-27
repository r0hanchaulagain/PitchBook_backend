const express = require("express");
const router = express.Router();
const altchaController = require("../controllers/altchaController");
const { verifyAltcha } = require("../middlewares/security/altcha");

router.get("/challenge", (req, res) => {
	try {
		const challenge = altchaController.generateChallenge();
		res.json({
			success: true,
			data: challenge,
		});
	} catch (error) {
		console.error("Error generating ALTCHA challenge:", error);
		res.status(500).json({
			success: false,
			message: "Failed to generate CAPTCHA challenge",
		});
	}
});

router.post("/verify", verifyAltcha, (req, res) => {
	try {
		res.json({
			success: true,
			message: "CAPTCHA verified successfully",
		});
	} catch (error) {
		console.error("Error verifying ALTCHA:", error);
		res.status(500).json({
			success: false,
			message: "Failed to verify CAPTCHA",
		});
	}
});

module.exports = router;
