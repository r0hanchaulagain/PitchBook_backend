const crypto = require('crypto');

module.exports = {
	// HMAC key for challenge generation and verification
	hmacKey: process.env.ALTCHA_HMAC_KEY || crypto.randomBytes(16).toString('hex'),
	
	// Maximum number for challenge complexity (default: 50,000)
	maxNumber: parseInt(process.env.ALTCHA_MAX_NUMBER) || 50_000,
	
	// Challenge expiration time in milliseconds (default: 5 minutes)
	maxChallengeAge: parseInt(process.env.ALTCHA_MAX_CHALLENGE_AGE) || 300000,
	
	// Algorithm for cryptographic operations
	algorithm: process.env.ALTCHA_ALGORITHM || 'sha256'
};
