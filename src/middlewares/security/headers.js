const cors = require("cors");
const helmet = require("helmet");

function corsConfig() {
	return {
		origin: (origin, callback) => {
			const allowedOrigins = [process.env.FRONTEND_URL];
			if (
				!origin ||
				allowedOrigins.some(
					(allowedOrigin) =>
						origin === allowedOrigin ||
						(process.env.NODE_ENV === "development" &&
							origin.includes("localhost"))
				)
			) {
				callback(null, true);
			} else {
				callback(new Error("Not allowed by CORS"));
			}
		},
		credentials: true,
		methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
		allowedHeaders: [
			"Content-Type",
			"Authorization",
			"x-csrf-token",
			"x-requested-with",
		],
		exposedHeaders: ["x-csrf-token"],
		maxAge: 86400,
	};
}

function setupSecurityHeaders() {
	const helmetConfig = helmet({
		crossOriginEmbedderPolicy: true,
		crossOriginOpenerPolicy: { policy: "same-origin" },
		crossOriginResourcePolicy: { policy: "same-site" },
		dnsPrefetchControl: { allow: false },
		frameguard: { action: "deny" },
		hidePoweredBy: true,
		hsts: {
			maxAge: 63072000,
			includeSubDomains: true,
			preload: true,
		},
		ieNoOpen: true,
		noSniff: true,
		referrerPolicy: "strict-origin-when-cross-origin",
		xssFilter: true,
	});

	const customHeaders = (req, res, next) => {
		// Common security headers for all requests
		res.setHeader("X-Frame-Options", "DENY");
		res.setHeader("X-Content-Type-Options", "nosniff");
		res.setHeader("X-XSS-Protection", "1; mode=block");
		res.setHeader("X-Permitted-Cross-Domain-Policies", "none");
		res.setHeader("X-Download-Options", "noopen");
		res.setHeader("X-DNS-Prefetch-Control", "off");

		// Cache control - different for GET vs other methods
		if (req.method === "GET") {
			res.setHeader("Cache-Control", "public, max-age=300");
			res.removeHeader("Pragma");
			res.removeHeader("Expires");
			res.removeHeader("Surrogate-Control");
		} else {
			// No caching for non-GET requests
			res.setHeader(
				"Cache-Control",
				"no-store, no-cache, must-revalidate, proxy-revalidate"
			);
			res.setHeader("Pragma", "no-cache");
			res.setHeader("Expires", "0");
			res.setHeader("Surrogate-Control", "no-store");
		}

		// Content Security Policy
		res.setHeader(
			"Content-Security-Policy",
			"default-src 'self'; " +
				"script-src 'self' 'unsafe-inline' 'unsafe-eval'; " +
				"style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
				"img-src 'self' data: blob: https://*.khalti.com https://khalti.s3.amazonaws.com; " +
				"font-src 'self' https://fonts.gstatic.com; " +
				"connect-src 'self' https://khalti.com https://a.khalti.com https://*.khalti.com; " +
				"object-src 'none'; " +
				"upgrade-insecure-requests; " +
				"block-all-mixed-content"
		);

		next();
	};

	return {
		helmetConfig,
		customHeaders,
		corsConfig: cors(corsConfig()),
	};
}

module.exports = { setupSecurityHeaders };
