const logger = require("../../utils/logger");

/**
 * Query Parameter Sanitizer Middleware
 * Validates and sanitizes query parameters to prevent NoSQL injection
 * Works with Express 5.x by creating a new sanitized query object
 */
function createQuerySanitizer(options = {}) {
    const {
        denyDot = true,
        denyDollar = true,
        replaceWith = "_",
        logSanitized = true,
        logger = console,
        strictMode = true, // If true, reject requests with malicious params
    } = options;

    // Check if a key should be sanitized
    const shouldSanitize = (key) => {
        if (typeof key !== "string") return false;
        
        // Check for MongoDB operators (including bracket notation)
        const mongoOperators = ['$', '$ne', '$gt', '$lt', '$gte', '$lte', '$in', '$nin', '$exists', '$regex', '$or', '$and', '$not', '$nor'];
        
        // Check if key contains MongoDB operators
        const hasMongoOperator = mongoOperators.some(op => key.includes(op));
        
        return (
            (denyDollar && (key.startsWith("$") || hasMongoOperator)) || 
            (denyDot && key.includes("."))
        );
    };

    // Recursively sanitize an object
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

            // Check for malicious parameters
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
                    method: req.method
                });

                if (strictMode) {
                    return res.status(400).json({
                        error: "Invalid query parameters",
                        message: "Query parameters contain invalid characters",
                        code: "QUERY_SANITIZATION_ERROR"
                    });
                }
            }

            // Create sanitized query object
            const sanitizedQuery = sanitizeObject(req.query, "query");
            
            // Replace the query object with sanitized version
            // This works because we're creating a new object, not modifying the existing one
            req.query = sanitizedQuery;

            next();
        } catch (err) {
            logger.error("Query sanitization error", err);
            next(err);
        }
    };
}

module.exports = createQuerySanitizer; 