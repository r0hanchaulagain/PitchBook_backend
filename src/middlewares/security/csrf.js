const { doubleCsrf } = require("csrf-csrf");
const logger = require("../../utils/logger");

function setupCSRF() {
	const csrfOptions = {
		getSecret: () => process.env.CSRF_SECRET || "your-strong-secret-key",
		getSessionIdentifier: (req) => {
			return req.sessionID || req.ip || "anonymous";
		},
		cookieName: "psifi.x-csrf-token",
		cookieOptions: {
			sameSite: "lax",
			secure: process.env.NODE_ENV === "production",
			httpOnly: true,
			maxAge: 24 * 60 * 60,
			path: "/",
			domain:
				process.env.NODE_ENV === "production"
					? process.env.COOKIE_DOMAIN || ".yourdomain.com"
					: undefined,
		},
		size: 64,
		getCsrfTokenFromRequest: (req) => {
			return req.headers["x-csrf-token"] || req.body?._csrf;
		},
	};

	const { doubleCsrfProtection, generateCsrfToken, invalidCsrfTokenError } =
		doubleCsrf(csrfOptions);

	const csrfMiddleware = (req, res, next) => {
		res.locals.csrfToken = generateCsrfToken(req, res);
		next();
	};

	const csrfProtection = (req, res, next) => {
		if (
			req.method === "GET" ||
			req.method === "HEAD" ||
			req.method === "OPTIONS" ||
			req.path.startsWith("/api/v1/payments/webhook") ||
			req.path === "/health" ||
			req.path === "/csrf-token" ||
			req.path.startsWith("/api/v1/auth/")
		) {
			return next();
		}

		return doubleCsrfProtection(req, res, next);
	};

	const csrfErrorHandler = (err, req, res, next) => {
		if (err.code === "EBADCSRFTOKEN" || err === invalidCsrfTokenError) {
			res.status(403).json({
				error: "Invalid CSRF token",
				message: "The form has expired. Please refresh the page and try again.",
			});
		} else {
			next(err);
		}
	};

	return {
		csrfMiddleware,
		csrfProtection,
		csrfErrorHandler,
		generateCsrfToken,
	};
}

module.exports = { setupCSRF };
