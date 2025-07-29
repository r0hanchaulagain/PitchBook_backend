function createMongoSanitizer(options = {}) {
	const {
		denyDot = true,
		denyDollar = true,
		replaceWith = null,
		sanitizeBody = true,
		sanitizeQuery = true,
		sanitizeParams = true,
		logSanitized = false,
		logger = console,
	} = options;

	// Check if a key should be sanitized
	const shouldSanitize = (key) => {
		if (typeof key !== "string") return false;
		return (
			(denyDollar && key.startsWith("$")) || (denyDot && key.includes("."))
		);
	};

	// Recursively sanitize an object or array
	const sanitizeObject = (obj, path = "") => {
		// Handle edge cases
		if (obj === null || obj === undefined) return obj;
		if (typeof obj !== "object") return obj;
		if (obj instanceof Date) return obj;

		// Handle arrays
		if (Array.isArray(obj)) {
			return obj.map((item, index) =>
				sanitizeObject(item, `${path}[${index}]`)
			);
		}

		// Handle objects
		const sanitized = {};
		let hasSanitized = false;

		for (const [key, value] of Object.entries(obj)) {
			if (shouldSanitize(key)) {
				hasSanitized = true;
				if (logSanitized) {
					logger.warn(
						`Sanitized MongoDB operator in request at ${path ? path + "." : ""}${key}`
					);
				}

				// Add replacement if specified
				if (replaceWith !== null) {
					sanitized[replaceWith] = sanitizeObject(
						value,
						`${path}.${replaceWith}`
					);
				}
			} else {
				// Recursively sanitize nested objects
				sanitized[key] = sanitizeObject(value, `${path}.${key}`);
			}
		}

		return sanitized;
	};

	// Return the actual middleware function
	return function mongoSanitize(req, res, next) {
		try {
			// Sanitize req.body if it exists and sanitizeBody is true
			if (sanitizeBody && req.body) {
				req.body = sanitizeObject(req.body, "body");
			}

			// Sanitize req.query
			if (sanitizeQuery && req.query) {
				req.query = sanitizeObject(req.query, "query");
			}

			// Sanitize req.params
			if (sanitizeParams && req.params) {
				req.params = sanitizeObject(req.params, "params");
			}

			next();
		} catch (err) {
			next(err);
		}
	};
}

module.exports = createMongoSanitizer;
