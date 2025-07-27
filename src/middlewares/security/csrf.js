/**
 * Simple CSRF Protection Implementation
 * 
 * This is a simplified CSRF protection that works reliably without
 * the complexity of the double-submit cookie pattern.
 */

const crypto = require('crypto');
const logger = require('../../utils/logger');

function setupSimpleCSRF() {
    // Generate a secret for CSRF tokens
    const CSRF_SECRET = process.env.CSRF_SECRET || process.env.COOKIE_SECRET || 'fallback-csrf-secret';
    
    /**
     * Get a stable session identifier based on IP + User-Agent
     */
    const getSessionIdentifier = (req) => {
        const ip = req.ip || req.connection.remoteAddress || 'unknown';
        const userAgent = req.headers['user-agent'] || '';
        const identifier = crypto.createHash('sha256').update(`${ip}:${userAgent}`).digest('hex').substring(0, 16);
        
        return `anon_${identifier}`;
    };
    
    /**
     * Generate a CSRF token
     */
    const generateToken = (req) => {
        const sessionId = getSessionIdentifier(req);
        const timestamp = Date.now();
        const random = crypto.randomBytes(32).toString('hex');
        
        // Create a hash of session + timestamp + random
        const data = `${sessionId}:${timestamp}:${random}`;
        const hash = crypto.createHmac('sha256', CSRF_SECRET).update(data).digest('hex');
        
        // Return token in format: timestamp.random.hash
        const token = `${timestamp}.${random}.${hash}`;
        
        return token;
    };
    
    /**
     * Validate a CSRF token
     */
    const validateToken = (req, token) => {
        if (!token) {
            return false;
        }
        
        try {
            const parts = token.split('.');
            if (parts.length !== 3) {
                return false;
            }
            
            const [timestamp, random, hash] = parts;
            const sessionId = getSessionIdentifier(req);
            
            // Recreate the hash to verify
            const data = `${sessionId}:${timestamp}:${random}`;
            const expectedHash = crypto.createHmac('sha256', CSRF_SECRET).update(data).digest('hex');
            
            // Check if hash matches
            if (hash !== expectedHash) {
                return false;
            }
            
            // Check if token is expired (24 hours)
            const tokenAge = Date.now() - parseInt(timestamp);
            const maxAge = 24 * 60 * 60 * 1000; // 24 hours
            
            if (tokenAge > maxAge) {
                return false;
            }
            
            return true;
        } catch (error) {
            logger.error('[CSRF] Error validating token:', error);
            return false;
        }
    };
    
    /**
     * Get CSRF token from request
     */
    const getTokenFromRequest = (req) => {
        return req.headers['x-csrf-token'] ||
               req.headers['csrf-token'] ||
               req.body?._csrf ||
               req.query?._csrf;
    };
    
    /**
     * CSRF middleware - generates and sets token
     */
    const csrfMiddleware = (req, res, next) => {
        try {
            // Generate token for all requests
            const token = generateToken(req);
            
            // Set token in response locals and headers
            res.locals.csrfToken = token;
            res.set('X-CSRF-Token', token);
            
            next();
        } catch (error) {
            logger.error('[CSRF] Error in middleware:', error);
            next();
        }
    };
    
    /**
     * CSRF protection middleware
     */
    const csrfProtection = (req, res, next) => {
        // Safe methods don't need CSRF protection
        if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
            return next();
        }
        
        // Exempt paths
        const exemptPaths = [
            '/api/v1/payments/webhook',
            '/health',
            '/api/v1/users/login',
            '/api/v1/users/register',
            '/api/v1/users/refresh-token',
            '/api/v1/users/forgot-password',
            '/api/v1/users/verify-email',
            '/api/v1/altcha/verify',
            '/api/v1/csrf-token'
        ];
        
        if (exemptPaths.includes(req.path)) {
            return next();
        }
        
        // Get token from request
        const token = getTokenFromRequest(req);
        
        // Validate token
        if (!validateToken(req, token)) {
            logger.warn('[CSRF] Token validation failed', {
                method: req.method,
                path: req.path,
                sessionId: getSessionIdentifier(req),
                ip: req.ip,
                userAgent: req.headers['user-agent']?.substring(0, 50),
                tokenProvided: !!token
            });
            
            return res.status(403).json({
                error: 'Invalid CSRF token',
                message: 'The form has expired. Please refresh the page and try again.',
                code: 'CSRF_TOKEN_INVALID'
            });
        }
        
        // Log successful validation only once
        logger.debug('[CSRF] Token validation successful', {
            method: req.method,
            path: req.path,
            sessionId: getSessionIdentifier(req)
        });
        
        next();
    };
    
    /**
     * CSRF error handler
     */
    const csrfErrorHandler = (err, req, res, next) => {
        if (err.code === 'CSRF_TOKEN_INVALID') {
            logger.warn('[CSRF] CSRF validation error', {
                method: req.method,
                path: req.path,
                ip: req.ip,
                userAgent: req.headers['user-agent']
            });
            
            return res.status(403).json({
                error: 'Invalid CSRF token',
                message: 'The form has expired. Please refresh the page and try again.',
                code: 'CSRF_TOKEN_INVALID'
            });
        }
        
        next(err);
    };
    
    return {
        csrfMiddleware,
        csrfProtection,
        csrfErrorHandler,
        generateToken,
        validateToken
    };
}

module.exports = { setupSimpleCSRF }; 