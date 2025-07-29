const crypto = require("crypto");
const { altcha } = require("../config/env_config");

module.exports = {
	hmacKey: altcha.hmac_key || crypto.randomBytes(16).toString("hex"),

	maxNumber: parseInt(altcha.max_number) || 50_000,

	maxChallengeAge: parseInt(altcha.max_challenge_age) || 300000,

	algorithm: altcha.algorithm || "sha256",
};
