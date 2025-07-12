const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const cookieParser = require("cookie-parser");
const rateLimit = require("express-rate-limit");
const morgan = require("morgan");
const createMongoSanitizer = require("../utils/mongoSanitizer");
const logger = require("../utils/logger");

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

const corsConfig = () => ({
	origin: (origin, callback) => {
		const allowedOrigins = [process.env.FRONTEND_URL];
		if (!origin || allowedOrigins.includes(origin)) {
			callback(null, true);
		} else {
			callback(new Error("Not allowed by CORS"));
		}
	},
	credentials: true,
	methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
	allowedHeaders: ["Content-Type", "Authorization"],
	maxAge: 86400,
});

function setupMiddlewares(app) {
	app.use(express.json());
	app.use(express.urlencoded({ extended: true }));
	app.use(cookieParser());
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

	app.use(
		helmet({
			crossOriginEmbedderPolicy: true,
			crossOriginOpenerPolicy: { policy: "same-origin" },
			crossOriginResourcePolicy: { policy: "same-site" },
			dnsPrefetchControl: { allow: false },
			frameguard: { action: "deny" },
			hidePoweredBy: true,
			hsts: {
				maxAge: 63072000, // 2 years in seconds
				includeSubDomains: true,
				preload: true,
			},
			ieNoOpen: true,
			noSniff: true,
			referrerPolicy: "strict-origin-when-cross-origin",
			xssFilter: true,
		})
	);

	app.use((req, res, next) => {
		res.setHeader("X-Frame-Options", "DENY");
		res.setHeader(
			"Cache-Control",
			"no-store, no-cache, must-revalidate, proxy-revalidate"
		);
		res.setHeader("Pragma", "no-cache");
		res.setHeader("Expires", "0");
		res.setHeader("Surrogate-Control", "no-store");

		res.setHeader("X-Content-Type-Options", "nosniff");

		res.setHeader("X-XSS-Protection", "1; mode=block");

		res.setHeader("X-Permitted-Cross-Domain-Policies", "none");

		res.setHeader("X-Download-Options", "noopen");

		res.setHeader("X-DNS-Prefetch-Control", "off");
		res.setHeader(
			"X-Content-Security-Policy",
			"default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: blob: https://*.khalti.com https://khalti.s3.amazonaws.com; font-src 'self' https://fonts.gstatic.com; connect-src 'self' https://khalti.com https://a.khalti.com https://*.khalti.com; object-src 'none'; upgrade-insecure-requests; block-all-mixed-content"
		);

		next();
	});
	app.use(cors(corsConfig()));

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
