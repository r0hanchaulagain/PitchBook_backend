const logger = require("../../utils/logger");

function createQuerySanitizer(options = {}) {
	const {
		denyDot = true,
		denyDollar = true,
		replaceWith = "_",
		logSanitized = true,
		logger = console,
		strictMode = true,
	} = options;

	const shouldSanitize = (key) => {
		if (typeof key !== "string") return false;

		const mongoOperators = [
			"$",
			"$ne",
			"$gt",
			"$lt",
			"$gte",
			"$lte",
			"$in",
			"$nin",
			"$exists",
			"$regex",
			"$or",
			"$and",
			"$not",
			"$nor",
		];

		const hasMongoOperator = mongoOperators.some((op) => key.includes(op));

		return (
			(denyDollar && (key.startsWith("$") || hasMongoOperator)) ||
			(denyDot && key.includes("."))
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
						`Query sanitization: Malicious parameter detected at ${path ? path + "." : ""}${key}`
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

	return function querySanitizer(req, res, next) {
		try {
			if (!req.query || Object.keys(req.query).length === 0) {
				return next();
			}

			const maliciousParams = [];
			const checkForMalicious = (obj, path = "") => {
				for (const [key, value] of Object.entries(obj)) {
					if (shouldSanitize(key)) {
						maliciousParams.push(`${path ? path + "." : ""}${key}`);
					}
					if (typeof value === "object" && value !== null) {
						checkForMalicious(value, `${path ? path + "." : ""}${key}`);
					}
				}
			};

			checkForMalicious(req.query);

			if (maliciousParams.length > 0) {
				logger.warn("NoSQL injection attempt detected in query parameters", {
					ip: req.ip,
					userAgent: req.headers["user-agent"],
					maliciousParams,
					originalQuery: req.query,
					path: req.path,
					method: req.method,
				});

				if (strictMode) {
					return res.status(400).json({
						error: "Invalid query parameters",
						message: "Query parameters contain invalid characters",
						code: "QUERY_SANITIZATION_ERROR",
					});
				}
			}

			const sanitizedQuery = sanitizeObject(req.query, "query");

			req.query = sanitizedQuery;

			next();
		} catch (err) {
			logger.error("Query sanitization error", err);
			next(err);
		}
	};
}

module.exports = createQuerySanitizer;
