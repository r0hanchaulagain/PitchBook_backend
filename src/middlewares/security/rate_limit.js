const rateLimit = require("express-rate-limit");

const rateLimiterConfig = () => {
	const generalLimiter = rateLimit({
		windowMs: 15 * 60 * 1000,
		max: 100,
		message: "Too many requests from this IP, please try again later.",
	});

	const burstLimiter = rateLimit({
		windowMs: 1000,
		max: 10,
		message: "Too many requests in a short time, slow down.",
	});

	return {
		generalLimiter,
		burstLimiter,
	};
};

module.exports = { rateLimiterConfig };
