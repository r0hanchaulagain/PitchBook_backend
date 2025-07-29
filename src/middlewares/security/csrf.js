const crypto = require("crypto");
const logger = require("../../utils/logger");
const { csrf_secret, cookie_secret } = require("../../config/env_config");

function setupSimpleCSRF() {
	const CSRF_SECRET = csrf_secret || cookie_secret || "fallback-csrf-secret";

	const getSessionIdentifier = (req) => {
		const ip = req.ip || req.connection.remoteAddress || "unknown";
		const userAgent = req.headers["user-agent"] || "";
		const identifier = crypto
			.createHash("sha256")
			.update(`${ip}:${userAgent}`)
			.digest("hex")
			.substring(0, 16);

		return `anon_${identifier}`;
	};

	const generateToken = (req) => {
		const sessionId = getSessionIdentifier(req);
		const timestamp = Date.now();
		const random = crypto.randomBytes(32).toString("hex");

		const data = `${sessionId}:${timestamp}:${random}`;
		const hash = crypto
			.createHmac("sha256", CSRF_SECRET)
			.update(data)
			.digest("hex");

		const token = `${timestamp}.${random}.${hash}`;

		return token;
	};

	const validateToken = (req, token) => {
		if (!token) {
			return false;
		}

		try {
			const parts = token.split(".");
			if (parts.length !== 3) {
				return false;
			}

			const [timestamp, random, hash] = parts;
			const sessionId = getSessionIdentifier(req);

			const data = `${sessionId}:${timestamp}:${random}`;
			const expectedHash = crypto
				.createHmac("sha256", CSRF_SECRET)
				.update(data)
				.digest("hex");

			if (hash !== expectedHash) {
				return false;
			}

			const tokenAge = Date.now() - parseInt(timestamp);
			const maxAge = 24 * 60 * 60 * 1000;

			if (tokenAge > maxAge) {
				return false;
			}

			return true;
		} catch (error) {
			logger.error("[CSRF] Error validating token:", error);
			return false;
		}
	};

	const getTokenFromRequest = (req) => {
		return (
			req.headers["x-csrf-token"] ||
			req.headers["csrf-token"] ||
			req.body?._csrf ||
			req.query?._csrf
		);
	};

	const csrfMiddleware = (req, res, next) => {
		try {
			const token = generateToken(req);

			res.locals.csrfToken = token;
			res.set("X-CSRF-Token", token);

			next();
		} catch (error) {
			logger.error("[CSRF] Error in middleware:", error);
			next();
		}
	};

	const csrfProtection = (req, res, next) => {
		if (["GET", "HEAD", "OPTIONS"].includes(req.method)) {
			return next();
		}

		const exemptPaths = [
			"/api/v1/payments/webhook",
			"/health",
			"/api/v1/users/login",
			"/api/v1/users/register",
			"/api/v1/users/refresh-token",
			"/api/v1/users/forgot-password",
			"/api/v1/users/verify-email",
			"/api/v1/altcha/verify",
			"/api/v1/csrf-token",
		];

		if (exemptPaths.includes(req.path)) {
			return next();
		}

		const token = getTokenFromRequest(req);

		if (!validateToken(req, token)) {
			logger.warn("[CSRF] Token validation failed", {
				method: req.method,
				path: req.path,
				sessionId: getSessionIdentifier(req),
				ip: req.ip,
				userAgent: req.headers["user-agent"]?.substring(0, 50),
				tokenProvided: !!token,
			});

			return res.status(403).json({
				error: "Invalid CSRF token",
				message: "The form has expired. Please refresh the page and try again.",
				code: "CSRF_TOKEN_INVALID",
			});
		}

		logger.debug("[CSRF] Token validation successful", {
			method: req.method,
			path: req.path,
			sessionId: getSessionIdentifier(req),
		});

		next();
	};

	const csrfErrorHandler = (err, req, res, next) => {
		if (err.code === "CSRF_TOKEN_INVALID") {
			logger.warn("[CSRF] CSRF validation error", {
				method: req.method,
				path: req.path,
				ip: req.ip,
				userAgent: req.headers["user-agent"],
			});

			return res.status(403).json({
				error: "Invalid CSRF token",
				message: "The form has expired. Please refresh the page and try again.",
				code: "CSRF_TOKEN_INVALID",
			});
		}

		next(err);
	};

	return {
		csrfMiddleware,
		csrfProtection,
		csrfErrorHandler,
		generateToken,
		validateToken,
	};
}

module.exports = { setupSimpleCSRF };
