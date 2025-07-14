// csrf.js - Fixed version
const { doubleCsrf } = require("csrf-csrf");
const logger = require("../../utils/logger");

function setupCSRF() {
	// Validate required environment variables
	if (!process.env.CSRF_SECRET) {
		throw new Error("CSRF_SECRET environment variable is required");
	}

	const csrfOptions = {
		getSecret: () => process.env.CSRF_SECRET,
		getSessionIdentifier: (req) => {
			// Priority 1: Use session ID if session middleware is available
			if (req.session?.id) {
				logger.debug('[CSRF] Using session ID:', req.session.id);
				return req.session.id;
			}

			// Priority 2: Use authenticated user ID
			if (req.user?.id) {
				logger.debug('[CSRF] Using user ID:', req.user.id);
				return `user_${req.user.id}`;
			}

			// Priority 3: Use a more stable fingerprint for anonymous users
			const ip = req.ip || req.connection.remoteAddress || 'unknown';
			const userAgent = req.headers['user-agent'] || '';
			const acceptLanguage = req.headers['accept-language'] || '';
			
			// Create a more stable fingerprint
			const fingerprint = Buffer.from(
				`${ip}-${userAgent}-${acceptLanguage}`
			).toString('base64').slice(0, 32);

			logger.debug('[CSRF] Using fingerprint for anonymous user:', fingerprint);
			return `anon_${fingerprint}`;
		},
		cookieName: "psifi.x-csrf-token",
		cookieOptions: {
			sameSite: process.env.NODE_ENV === "production" ? "strict" : "lax",
			secure: process.env.NODE_ENV === "production",
			httpOnly: true,
			maxAge: 24 * 60 * 60 * 1000, // 24 hours in milliseconds
			path: "/",
			domain:
				process.env.NODE_ENV === "production"
					? process.env.COOKIE_DOMAIN
					: undefined,
		},
		size: 64,
		getCsrfTokenFromRequest: (req) => {
			const token = req.headers["x-csrf-token"] ||
				req.headers["csrf-token"] ||
				req.body?._csrf ||
				req.query?._csrf;
			
			if (token) {
				logger.debug('[CSRF] Token found in request:', {
					source: req.headers["x-csrf-token"] ? 'x-csrf-token header' :
							req.headers["csrf-token"] ? 'csrf-token header' :
							req.body?._csrf ? 'body' :
							req.query?._csrf ? 'query' : 'unknown',
					tokenPrefix: token.substring(0, 10) + '...',
					path: req.path,
					method: req.method
				});
			} else {
				logger.debug('[CSRF] No token found in request:', {
					path: req.path,
					method: req.method,
					headers: Object.keys(req.headers).filter(h => h.toLowerCase().includes('csrf'))
				});
			}
			
			return token;
		},
	};

	const { doubleCsrfProtection, generateCsrfToken, invalidCsrfTokenError } =
		doubleCsrf(csrfOptions);

	const csrfMiddleware = (req, res, next) => {
		try {
			// Always generate token and make it available
			const token = generateCsrfToken(req, res);
			res.locals.csrfToken = token;

			// Add CSRF token to response headers for SPA convenience
			res.set('X-CSRF-Token', token);

			logger.debug('[CSRF] Token generated and set in response:', {
				tokenPrefix: token.substring(0, 10) + '...',
				path: req.path,
				method: req.method,
				sessionId: req.session?.id || 'no-session',
				userId: req.user?.id || 'anonymous'
			});

			next();
		} catch (error) {
			logger.error('[CSRF] Error in csrf middleware:', error);
			next(error);
		}
	};

	const csrfProtection = (req, res, next) => {
		// Safe methods that don't modify state
		if (
			req.method === "GET" ||
			req.method === "HEAD" ||
			req.method === "OPTIONS"
		) {
			return next();
		}

		// Log the request details for debugging
		logger.debug('[CSRF] Validating request:', {
			method: req.method,
			path: req.path,
			sessionId: req.session?.id || 'no-session',
			userId: req.user?.id || 'anonymous',
			ip: req.ip,
			userAgent: req.headers['user-agent']?.substring(0, 50) + '...',
			hasToken: !!csrfOptions.getCsrfTokenFromRequest(req)
		});

		// Validate request origin for additional security
		if (!isValidOrigin(req)) {
			logger.warn(`Invalid origin for CSRF protection: ${req.headers.origin}`, {
				ip: req.ip,
				userAgent: req.headers['user-agent'],
				path: req.path
			});
			return res.status(403).json({
				error: "Invalid request origin",
				message: "Request origin is not allowed",
				code: "INVALID_ORIGIN"
			});
		}

		// Specific endpoints that should be exempt from CSRF
		const exemptPaths = [
			"/api/v1/payments/webhook", // Third-party webhooks
			"/health", // Health check endpoint
			"/api/v1/auth/login", // Initial login
			"/api/v1/auth/register", // User registration
			"/api/v1/auth/forgot-password", // Password reset request
			"/api/v1/auth/verify-email", // Email verification
			"/api/v1/altcha/verify" // ALTCHA verification
		];

		// Check for exact path matches
		if (exemptPaths.includes(req.path)) {
			logger.debug('[CSRF] Path exempt from CSRF protection:', req.path);
			return next();
		}

		// Check for path prefixes that should be exempt
		const exemptPrefixes = [
			"/api/v1/payments/webhook/" // All webhook subpaths
		];

		if (exemptPrefixes.some(prefix => req.path.startsWith(prefix))) {
			logger.debug('[CSRF] Path prefix exempt from CSRF protection:', req.path);
			return next();
		}

		// Apply CSRF protection
		logger.debug('[CSRF] Applying CSRF protection to:', {
			method: req.method,
			path: req.path
		});

		return doubleCsrfProtection(req, res, (err) => {
			if (err) {
				logger.warn('[CSRF] Protection failed:', {
					error: err.message,
					method: req.method,
					path: req.path,
					sessionId: req.session?.id || 'no-session',
					userId: req.user?.id || 'anonymous',
					ip: req.ip,
					tokenProvided: !!csrfOptions.getCsrfTokenFromRequest(req)
				});
			}
			next(err);
		});
	};

	const csrfErrorHandler = (err, req, res, next) => {
		if (err.code === "EBADCSRFTOKEN" || err === invalidCsrfTokenError) {
			// Log CSRF failures for security monitoring
			logger.warn(`CSRF token validation failed`, {
				method: req.method,
				path: req.path,
				ip: req.ip,
				userAgent: req.headers['user-agent'],
				referer: req.headers.referer,
				origin: req.headers.origin,
				sessionId: req.session?.id || 'no-session',
				userId: req.user?.id || 'anonymous',
				tokenProvided: !!csrfOptions.getCsrfTokenFromRequest(req),
				errorMessage: err.message
			});

			return res.status(403).json({
				error: "Invalid CSRF token",
				message: "The form has expired. Please refresh the page and try again.",
				code: "CSRF_TOKEN_INVALID"
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

function isValidOrigin(req) {
	const origin = req.headers.origin;
	const referer = req.headers.referer;

	// For development, be more lenient
	if (process.env.NODE_ENV === 'development') {
		const allowedOrigins = [
			'http://localhost:3000',
			'http://localhost:5173',
			'http://127.0.0.1:3000',
			'http://127.0.0.1:5173',
			process.env.FRONTEND_URL
		].filter(Boolean);

		if (!origin && !referer) {
			return true; // Allow requests without origin/referer in development
		}

		if (origin && allowedOrigins.includes(origin)) {
			return true;
		}

		if (!origin && referer) {
			try {
				const refererUrl = new URL(referer);
				const refererOrigin = refererUrl.origin;
				return allowedOrigins.includes(refererOrigin);
			} catch (e) {
				return false;
			}
		}

		return false;
	}

	// Production validation
	if (!origin && !referer) {
		return true;
	}

	const allowedOrigins = [
		process.env.FRONTEND_URL
	].filter(Boolean);

	if (origin && allowedOrigins.includes(origin)) {
		return true;
	}

	if (!origin && referer) {
		try {
			const refererUrl = new URL(referer);
			const refererOrigin = refererUrl.origin;
			return allowedOrigins.includes(refererOrigin);
		} catch (e) {
			return false;
		}
	}

	return false;
}

module.exports = { setupCSRF };