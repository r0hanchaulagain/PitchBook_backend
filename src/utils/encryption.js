const crypto = require('crypto');

// Encryption configuration
const ENCRYPTION_KEY = process.env.DATA_ENCRYPTION_KEY;
const ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16;

/**
 * Encrypt a string using AES-256-CBC
 * @param {string} text - Text to encrypt
 * @returns {string} - Encrypted text (hex encoded)
 */
function encrypt(text) {
    if (!text) return text;
    
    try {
        const iv = crypto.randomBytes(IV_LENGTH);
        const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY.slice(0, 32)), iv);
        
        let encrypted = cipher.update(text, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        
        // Return IV + encrypted data
        return iv.toString('hex') + ':' + encrypted;
    } catch (error) {
        console.error('Encryption error:', error);
        return text; // Return original text if encryption fails
    }
}

/**
 * Decrypt a string using AES-256-CBC
 * @param {string} encryptedText - Encrypted text (hex encoded)
 * @returns {string} - Decrypted text
 */
function decrypt(encryptedText) {
    if (!encryptedText) return encryptedText;
    
    try {
        // Check if the text is encrypted (contains IV separator)
        if (!encryptedText.includes(':')) {
            return encryptedText; // Return as-is if not encrypted
        }
        
        const parts = encryptedText.split(':');
        if (parts.length !== 2) {
            return encryptedText; // Return as-is if malformed
        }
        
        const iv = Buffer.from(parts[0], 'hex');
        const encrypted = parts[1];
        
        const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY.slice(0, 32)), iv);
        
        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        
        return decrypted;
    } catch (error) {
        console.error('Decryption error:', error);
        return encryptedText; // Return original text if decryption fails
    }
}

/**
 * Check if a string is encrypted
 * @param {string} text - Text to check
 * @returns {boolean} - True if encrypted
 */
function isEncrypted(text) {
    if (!text) return false;
    return text.includes(':') && text.split(':').length === 2;
}

/**
 * Encrypt user data fields
 * @param {Object} userData - User data object
 * @returns {Object} - User data with encrypted fields
 */
function encryptUserData(userData) {
    const encryptedData = { ...userData };
    
    // Fields to encrypt
    const fieldsToEncrypt = ['email', 'phone', 'fullName'];
    
    fieldsToEncrypt.forEach(field => {
        if (encryptedData[field] && !isEncrypted(encryptedData[field])) {
            encryptedData[field] = encrypt(encryptedData[field]);
        }
    });
    
    return encryptedData;
}

/**
 * Decrypt user data fields
 * @param {Object} userData - User data object
 * @returns {Object} - User data with decrypted fields
 */
function decryptUserData(userData) {
    const decryptedData = { ...userData };
    
    // Fields to decrypt
    const fieldsToDecrypt = ['email', 'phone', 'fullName'];
    
    fieldsToDecrypt.forEach(field => {
        if (decryptedData[field] && isEncrypted(decryptedData[field])) {
            decryptedData[field] = decrypt(decryptedData[field]);
        }
    });
    
    return decryptedData;
}

module.exports = {
    encrypt,
    decrypt,
    isEncrypted,
    encryptUserData,
    decryptUserData
}; 