// utils/xssSanitizer.js
const createDOMPurify = require('dompurify');
const { JSDOM } = require('jsdom');

const window = new JSDOM('').window;
const DOMPurify = createDOMPurify(window);

/**
 * Recursively sanitize all string fields in an object or array using DOMPurify
 * @param {object|array|string} input
 * @returns {object|array|string}
 */
function sanitizeAllStrings(input) {
  if (typeof input === 'string') {
    return DOMPurify.sanitize(input);
  }
  if (Array.isArray(input)) {
    return input.map(sanitizeAllStrings);
  }
  if (input && typeof input === 'object' && !(input instanceof Date)) {
    const sanitized = {};
    for (const [key, value] of Object.entries(input)) {
      sanitized[key] = sanitizeAllStrings(value);
    }
    return sanitized;
  }
  return input;
}

/**
 * Express middleware to sanitize req.body, req.query, req.params
 * Only mutates string values, does not replace objects
 */
function xssSanitizer(req, res, next) {
  if (req.body) req.body = sanitizeAllStrings(req.body);
  if (req.query) {
    Object.keys(req.query).forEach((key) => {
      if (typeof req.query[key] === 'string') {
        req.query[key] = DOMPurify.sanitize(req.query[key]);
      }
    });
  }
  if (req.params) {
    Object.keys(req.params).forEach((key) => {
      if (typeof req.params[key] === 'string') {
        req.params[key] = DOMPurify.sanitize(req.params[key]);
      }
    });
  }
  next();
}

module.exports = xssSanitizer;
