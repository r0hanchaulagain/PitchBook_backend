const express = require("express");
const cookieParser = require("cookie-parser");
const morgan = require("morgan");

const createMongoSanitizer = require("../utils/mongoSanitizer");
const logger = require("../utils/logger");

const { setupCSRF } = require("../middlewares/security/csrf");
const { setupSecurityHeaders } = require("../middlewares/security/headers");
const { rateLimiterConfig } = require("../middlewares/security/rate_limit");

function setupMiddlewares(app) {
	// Basic express middlewares
	app.use(express.json());
	app.use(express.urlencoded({ extended: true }));
	app.use(cookieParser(process.env.COOKIE_SECRET));

	// Setup CSRF protection
	const { csrfMiddleware, csrfProtection, csrfErrorHandler } = setupCSRF();
	app.use(csrfMiddleware);
	app.use(csrfProtection);
	app.use(csrfErrorHandler);

	// Setup security headers
	const { helmetConfig, customHeaders, corsConfig } = setupSecurityHeaders();
	app.use(helmetConfig);
	app.use(customHeaders);
	app.use(corsConfig);

	// Setup request sanitization
	app.use(
		createMongoSanitizer({
			logSanitized: true,
			logger: logger,
			replaceWith: "_",
			sanitizeQuery: false,
			sanitizeBody: true,
			sanitizeParams: true,
		})
	);

	// Setup rate limiting
	const { generalLimiter, burstLimiter } = rateLimiterConfig();
	app.use(burstLimiter);
	app.use((req, res, next) => {
		if (req.path === "/api/v1/users/me") return next();
		return generalLimiter(req, res, next);
	});

	morgan.token("error-message", (req, res) => res.locals.errorMessage || "-");
	app.use(
		morgan(
			":method :url :status :response-time ms - :res[content-length] - :error-message",
			{
				stream: {
					write: (message) => logger.http(message.trim()),
				},
				skip: (req) => req.url === "/health",
			}
		)
	);
}

function setupRoutes(app) {
	app.get("/health", (req, res) => {
		res.status(200).json({ status: "OK", timestamp: new Date() });
	});

	app.use("/api/v1/users", require("../routes/userRoutes"));
	app.use("/api/v1/futsals", require("../routes/futsalRoutes"));
	app.use("/api/v1/bookings", require("../routes/bookingRoutes"));
	app.use("/api/v1/notifications", require("../routes/notificationRoutes"));
	app.use("/api/v1/payments", require("../routes/paymentRoutes"));

	const { generateCsrfToken } = setupCSRF();
	app.get("/api/v1/csrf-token", (req, res) => {
		res.json({ csrfToken: generateCsrfToken(req, res) });
	});

	app.use((req, res) => {
		res.status(404).json({ error: "Not Found" });
	});
}

function setupErrorHandling(app) {
	app.use((err, req, res, next) => {
		logger.error(`${err.stack}\nMessage: ${err.message}`);
		res.locals.errorMessage = err.message;
		res.status(500).json({ error: err.message || "Internal Server Error" });
	});
}

module.exports = {
	setupMiddlewares,
	setupRoutes,
	setupErrorHandling,
};
