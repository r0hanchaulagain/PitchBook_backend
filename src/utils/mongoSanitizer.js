/**
 * Custom MongoDB sanitization middleware
 * Protects against MongoDB injection attacks by removing any keys containing
 * MongoDB operators (starting with $) or containing dots (.)
 * 
 * Features:
 * - Deep recursive sanitization of nested objects and arrays
 * - Proper handling of arrays to maintain order
 * - Efficient implementation with minimal memory usage
 * - Special handling for null values and dates
 * - Enhanced logging of sanitization events
 * - Configurable options
 */
function createMongoSanitizer(options = {}) {
  const {
    // Characters/patterns to sanitize (defaults to MongoDB operators and dots)
    denyDot = true,
    denyDollar = true,
    
    // What to replace sanitized keys with (if null, the key is removed)
    replaceWith = null,
    
    // Whether to sanitize the req.body, req.query, and req.params objects
    sanitizeBody = true,
    sanitizeQuery = true,
    sanitizeParams = true,
    
    // Logging options
    logSanitized = false,
    logger = console
  } = options;
  
  // Check if a key should be sanitized
  const shouldSanitize = (key) => {
    if (typeof key !== 'string') return false;
    return (denyDollar && key.startsWith('$')) || (denyDot && key.includes('.'));
  };

  // Recursively sanitize an object or array
  const sanitizeObject = (obj, path = '') => {
    // Handle edge cases
    if (obj === null || obj === undefined) return obj;
    if (typeof obj !== 'object') return obj;
    if (obj instanceof Date) return obj;
    
    // Handle arrays
    if (Array.isArray(obj)) {
      return obj.map((item, index) => sanitizeObject(item, `${path}[${index}]`));
    }
    
    // Handle objects
    const sanitized = {};
    let hasSanitized = false;
    
    for (const [key, value] of Object.entries(obj)) {
      if (shouldSanitize(key)) {
        hasSanitized = true;
        if (logSanitized) {
          logger.warn(`Sanitized MongoDB operator in request at ${path ? path + '.' : ''}${key}`);
        }
        
        // Add replacement if specified
        if (replaceWith !== null) {
          sanitized[replaceWith] = sanitizeObject(value, `${path}.${replaceWith}`);
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
        req.body = sanitizeObject(req.body, 'body');
      }
      
      // Sanitize req.query (only mutate existing keys)
      if (sanitizeQuery && req.query) {
        const sanitizedQuery = sanitizeObject(req.query, 'query');
        Object.keys(req.query).forEach(key => {
          if (key in sanitizedQuery) {
            req.query[key] = sanitizedQuery[key];
          }
        });
      }
      
      // Sanitize req.params (only mutate existing keys)
      if (sanitizeParams && req.params) {
        const sanitizedParams = sanitizeObject(req.params, 'params');
        Object.keys(req.params).forEach(key => {
          if (key in sanitizedParams) {
            req.params[key] = sanitizedParams[key];
          }
        });
      }
      
      next();
    } catch (err) {
      next(err);
    }
  };
}

module.exports = createMongoSanitizer;
