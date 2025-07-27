const crypto = require("crypto");

const HMAC_KEY =
	process.env.ALTCHA_HMAC_KEY || crypto.randomBytes(32).toString("hex");

const config = {
	hmacKey: process.env.ALTCHA_HMAC_KEY || HMAC_KEY,
	complexity: 4,
	maxChallengeAge: 1 * 60 * 1000, //1 minute
	algorithm: "sha256",
};

if (process.env.NODE_ENV === "production" && !process.env.ALTCHA_HMAC_KEY) {
	console.warn(
		"WARNING: Using a random ALTCHA_HMAC_KEY. For production, please set ALTCHA_HMAC_KEY in your environment variables."
	);
	console.warn("Current HMAC key:", HMAC_KEY);
}

module.exports = config;
