const jwt = require("jsonwebtoken");
const { jwtSecret } = require("../config/env_config");
const crypto = require("crypto");

const generateToken = (user) => {
	return jwt.sign({ id: user._id, role: user.role }, jwtSecret, {
		expiresIn: "7d",
	});
};

const generateRefreshToken = (user) => {
	return jwt.sign({ id: user._id, role: user.role }, jwtSecret, {
		expiresIn: "30d",
	});
};

const generateEmailVerificationToken = () => {
	return crypto.randomBytes(32).toString("hex");
};

const generateMFAToken = (payload, expiresIn = "10m") => {
	return jwt.sign(payload, jwtSecret, {
		expiresIn: expiresIn,
	});
};

module.exports = {
	generateToken,
	generateRefreshToken,
	generateEmailVerificationToken,
	generateMFAToken,
};
