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

	const shouldSanitize = (key) => {
		if (typeof key !== "string") return false;
		return (
			(denyDollar && key.startsWith("$")) || (denyDot && key.includes("."))
		);
	};

	const sanitizeObject = (obj, path = "") => {
		if (obj === null || obj === undefined) return obj;
		if (typeof obj !== "object") return obj;
		if (obj instanceof Date) return obj;

		if (Array.isArray(obj)) {
			return obj.map((item, index) =>
				sanitizeObject(item, `${path}[${index}]`)
			);
		}

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

				if (replaceWith !== null) {
					sanitized[replaceWith] = sanitizeObject(
						value,
						`${path}.${replaceWith}`
					);
				}
			} else {
				sanitized[key] = sanitizeObject(value, `${path}.${key}`);
			}
		}

		return sanitized;
	};

	return function mongoSanitize(req, res, next) {
		try {
			if (sanitizeBody && req.body) {
				req.body = sanitizeObject(req.body, "body");
			}

			if (sanitizeQuery && req.query) {
				req.query = sanitizeObject(req.query, "query");
			}

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
