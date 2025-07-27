// api_config.js
const express = require("express");
const cookieParser = require("cookie-parser");
// const session = require("express-session");
const morgan = require("morgan");


const createMongoSanitizer = require("../utils/mongoSanitizer");
const logger = require("../utils/logger");

const { setupCSRF } = require("../middlewares/security/csrf");
const { setupSecurityHeaders } = require("../middlewares/security/headers");
const { rateLimiterConfig } = require("../middlewares/security/rate_limit");
const { verifyAltcha } = require("../middlewares/security/altcha");

function setupMiddlewares(app) {
	app.set("trust proxy", 1);

	// Basic express middlewares
	app.use(express.json({ limit: "10mb" }));
	app.use(express.urlencoded({ extended: true, limit: "10mb" }));
	app.use(cookieParser(process.env.COOKIE_SECRET));

	// Session middleware
	// app.use(session({
	// 	secret: process.env.SESSION_SECRET,
	// 	name: 'psifi.session',
	// 	resave: false,
	// 	saveUninitialized: false,
	// 	rolling: true,
	// 	cookie: {
	// 		secure: process.env.NODE_ENV === 'production',
	// 		httpOnly: true,
	// 		maxAge: 24 * 60 * 60 * 1000, // 24 hours
	// 		sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
	// 		domain: process.env.NODE_ENV === 'production' ? process.env.COOKIE_DOMAIN : undefined
	// 	},
	// }));

	// Setup security headers
	const { helmetConfig, customHeaders, corsConfig } = setupSecurityHeaders();
	app.use(helmetConfig);
	app.use(customHeaders);
	app.use(corsConfig);

	// Setup CSRF protection
	// const { csrfMiddleware, csrfProtection, csrfErrorHandler } = setupCSRF();
	// app.use(csrfMiddleware);
	// app.use(csrfProtection);

	// Setup request sanitization
	app.use(
		createMongoSanitizer({
			logSanitized: true,
			logger: logger,
			replaceWith: "_",
			sanitizeQuery: true,
			sanitizeBody: true,
			sanitizeParams: true,
		})
	);

	// Setup rate limiting
	const { generalLimiter, burstLimiter } = rateLimiterConfig();
	app.use(burstLimiter);
	app.use((req, res, next) => {
		// Skip rate limiting for specific endpoints
		const skipPaths = [
			"/api/v1/users/me",
			"/health",
			"/api/v1/payments/webhook",
		];

		if (skipPaths.includes(req.path)) {
			return next();
		}

		return generalLimiter(req, res, next);
	});

	// Special rate limiter for CSRF token endpoint
	// const csrfTokenLimiter = rateLimit({
	// 	windowMs: 15 * 60 * 1000, // 15 minutes
	// 	max: 50, // limit each IP to 50 requests per windowMs
	// 	message: {
	// 		error: "Too many CSRF token requests",
	// 		message: "Please try again later"
	// 	},
	// 	standardHeaders: true,
	// 	legacyHeaders: false,
	// });

	// app.use("/api/v1/csrf-token", csrfTokenLimiter);

	// Setup logging
	morgan.token("error-message", (req, res) => res.locals.errorMessage || "-");
	morgan.token("session-id", (req, res) => req.session?.id || "-");
	morgan.token("user-id", (req, res) => req.user?.id || "-");

	app.use(
		morgan(
			":method :url :status :response-time ms - :res[content-length] - :error-message - session::session-id - user::user-id",
			{
				stream: {
					write: (message) => logger.http(message.trim()),
				},
				skip: (req) => req.url === "/health",
			}
		)
	);
	// app.use(csrfErrorHandler);
}

function setupRoutes(app) {
	app.get("/health", (req, res) => {
		res.status(200).json({
			status: "ok",
			timestamp: new Date().toISOString(),
			environment: process.env.NODE_ENV,
		});
	});

	// const { generateCsrfToken } = setupCSRF();
	// app.get("/api/v1/csrf-token", (req, res) => {
	// 	try {
	// 		const csrfToken = generateCsrfToken(req, res);
	// 		logger.debug("CSRF token generated", {
	// 			ip: req.ip,
	// 			userAgent: req.headers['user-agent'],
	// 			sessionId: req.session?.id || 'no-session'
	// 		});

	// 		res.json({
	// 			csrfToken,
	// 			expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
	// 		});
	// 	} catch (error) {
	// 		logger.error("Failed to generate CSRF token", error);
	// 		res.status(500).json({
	// 			error: "Failed to generate CSRF token",
	// 			message: "Please try again"
	// 		});
	// 	}
	// });

	// API routes
	app.use("/api/v1/users", require("../routes/userRoutes"));
	app.use("/api/v1/futsals", require("../routes/futsalRoutes"));
	app.use("/api/v1/bookings", require("../routes/bookingRoutes"));
	app.use("/api/v1/notifications", require("../routes/notificationRoutes"));
	app.use("/api/v1/payments", require("../routes/paymentRoutes"));
	app.use("/api/v1/reviews", require("../routes/reviewRoutes"));
	app.use("/api/v1/altcha", require("../routes/altchaRoutes"));
	app.use("/api/v1/contact", require("../routes/contactRoutes"));

	// 404 handler
	app.use((req, res) => {
		logger.warn(`404 - Route not found: ${req.method} ${req.path}`, {
			ip: req.ip,
			userAgent: req.headers["user-agent"],
		});
		res.status(404).json({
			error: "Not Found",
			message: "The requested resource was not found",
		});
	});
}

function setupErrorHandling(app) {
	// Global error handler
	app.use((err, req, res, next) => {
		// Log the error with context
		logger.error("Unhandled error", {
			error: err.message,
			stack: err.stack,
			path: req.path,
			method: req.method,
			ip: req.ip,
			userAgent: req.headers["user-agent"],
			sessionId: req.session?.id || "no-session",
			userId: req.user?.id || "anonymous",
		});

		// Set error message for logging
		res.locals.errorMessage = err.message;

		// Don't expose internal errors in production
		const message =
			process.env.NODE_ENV === "production"
				? "Internal Server Error"
				: err.message;

		res.status(err.status || 500).json({
			error: message,
			...(process.env.NODE_ENV === "development" && { stack: err.stack }),
		});
	});
}

module.exports = {
	setupMiddlewares,
	setupRoutes,
	setupErrorHandling,
};
