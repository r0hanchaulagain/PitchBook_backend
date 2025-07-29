const express = require("express");
const cookieParser = require("cookie-parser");
const session = require("express-session");
const morgan = require("morgan");

const createMongoSanitizer = require("../utils/mongoSanitizer");
const createQuerySanitizer = require("../middlewares/security/querySanitizer");
const logger = require("../utils/logger");

const { setupSimpleCSRF } = require("../middlewares/security/csrf");
const { setupSecurityHeaders } = require("../middlewares/security/headers");
const { rateLimiterConfig } = require("../middlewares/security/rate_limit");
const { verifyAltcha } = require("../middlewares/security/altcha");
const { passport } = require("./google_oauth");
const { session_secret, cookie_secret, nodeEnv } = require("./env_config");

function setupMiddlewares(app) {
	app.set("trust proxy", 1);

	app.use(express.json({ limit: "10mb" }));
	app.use(express.urlencoded({ extended: true, limit: "10mb" }));
	app.use(cookieParser(cookie_secret));

	app.use(
		session({
			secret: session_secret || cookie_secret,
			name: "psifi.session",
			resave: false,
			saveUninitialized: false,
			rolling: true,
			cookie: {
				secure: nodeEnv === "production",
				httpOnly: true,
				maxAge: 24 * 60 * 60 * 1000,
				sameSite: nodeEnv === "production" ? "strict" : "lax",
				domain:
					nodeEnv === "production" ? process.env.COOKIE_DOMAIN : undefined,
			},
		})
	);

	app.use(passport.initialize());
	app.use(passport.session());

	const { helmetConfig, customHeaders, corsConfig } = setupSecurityHeaders();
	app.use(helmetConfig);
	app.use(customHeaders);
	app.use(corsConfig);

	const { csrfMiddleware, csrfProtection, csrfErrorHandler } =
		setupSimpleCSRF();
	app.use(csrfMiddleware);
	app.use(csrfProtection);

	app.use(
		createMongoSanitizer({
			logSanitized: true,
			logger: logger,
			replaceWith: "_",
			sanitizeBody: true,
			sanitizeParams: true,
		})
	);

	app.use(
		createQuerySanitizer({
			logSanitized: true,
			logger: logger,
			replaceWith: "_",
			strictMode: true,
		})
	);

	const { generalLimiter, burstLimiter } = rateLimiterConfig();
	app.use(burstLimiter);
	app.use((req, res, next) => {
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

	const { rateLimit } = require("express-rate-limit");
	const csrfTokenLimiter = rateLimit({
		windowMs: 15 * 60 * 1000,
		max: 50,
		message: {
			error: "Too many CSRF token requests",
			message: "Please try again later",
		},
		standardHeaders: true,
		legacyHeaders: false,
	});

	app.use("/api/v1/csrf-token", csrfTokenLimiter);

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

	app.use(csrfErrorHandler);
}

function setupRoutes(app) {
	app.get("/health", (req, res) => {
		res.status(200).json({
			status: "ok",
			timestamp: new Date().toISOString(),
			environment: nodeEnv,
		});
	});

	const { generateToken } = setupSimpleCSRF();
	app.get("/api/v1/csrf-token", (req, res) => {
		try {
			const csrfToken = generateToken(req);
			logger.debug("CSRF token generated", {
				ip: req.ip,
				userAgent: req.headers["user-agent"],
				sessionId: req.session?.id || "no-session",
			});

			res.json({
				csrfToken,
				expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
			});
		} catch (error) {
			logger.error("Failed to generate CSRF token", error);
			res.status(500).json({
				error: "Failed to generate CSRF token",
				message: "Please try again",
			});
		}
	});

	app.use("/api/v1/users", require("../routes/userRoutes"));
	app.use("/api/v1/futsals", require("../routes/futsalRoutes"));
	app.use("/api/v1/bookings", require("../routes/bookingRoutes"));
	app.use("/api/v1/notifications", require("../routes/notificationRoutes"));
	app.use("/api/v1/payments", require("../routes/paymentRoutes"));
	app.use("/api/v1/reviews", require("../routes/reviewRoutes"));
	app.use("/api/v1/altcha", require("../routes/altchaRoutes"));
	app.use("/api/v1/contact", require("../routes/contactRoutes"));

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
	app.use((err, req, res, next) => {
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

		res.locals.errorMessage = err.message;

		const message =
			nodeEnv === "production" ? "Internal Server Error" : err.message;

		res.status(err.status || 500).json({
			error: message,
			...(nodeEnv === "development" && { stack: err.stack }),
		});
	});
}

module.exports = {
	setupMiddlewares,
	setupRoutes,
	setupErrorHandling,
};
