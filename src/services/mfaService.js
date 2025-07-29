const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const crypto = require('crypto');
const { encrypt, decrypt } = require('../utils/encryption');

class MFAService {
    /**
     * Generate TOTP secret for a user
     */
    static generateTOTPSecret(userEmail, serviceName = 'Futsal Booking System') {
        const secret = speakeasy.generateSecret({
            name: userEmail,
            issuer: serviceName,
            length: 32
        });

        return {
            secret: secret.base32,
            otpauthUrl: secret.otpauth_url,
            qrCodeUrl: null // Will be generated separately
        };
    }

    /**
     * Generate QR code for TOTP setup
     */
    static async generateQRCode(otpauthUrl) {
        try {
            const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl);
            return qrCodeDataUrl;
        } catch (error) {
            throw new Error('Failed to generate QR code: ' + error.message);
        }
    }

    /**
     * Verify TOTP token (for encrypted secrets from database)
     */
    static verifyTOTPToken(encryptedSecret, token, window = 2) {
        try {
            // Decrypt the secret
            const secret = decrypt(encryptedSecret);
            
            const verified = speakeasy.totp.verify({
                secret: secret,
                encoding: 'base32',
                token: token,
                window: window // Allow 2 steps before/after current time
            });

            return verified;
        } catch (error) {
            console.error('TOTP verification error:', error);
            return false;
        }
    }

    /**
     * Verify TOTP token (for plain text secrets during setup)
     */
    static verifyTOTPTokenPlain(secret, token, window = 2) {
        try {
            const verified = speakeasy.totp.verify({
                secret: secret,
                encoding: 'base32',
                token: token,
                window: window // Allow 2 steps before/after current time
            });

            return verified;
        } catch (error) {
            console.error('TOTP verification error:', error);
            return false;
        }
    }

    /**
     * Generate backup codes for MFA
     */
    static generateBackupCodes(count = 8) {
        const codes = [];
        for (let i = 0; i < count; i++) {
            // Generate 8-character backup code
            const code = crypto.randomBytes(4).toString('hex').toUpperCase();
            codes.push({
                code: code,
                used: false,
                createdAt: new Date()
            });
        }
        return codes;
    }

    /**
     * Verify backup code
     */
    static verifyBackupCode(user, inputCode) {
        const backupCode = user.backupCodes.find(
            code => code.code === inputCode.toUpperCase() && !code.used
        );

        if (backupCode) {
            backupCode.used = true;
            return true;
        }

        return false;
    }

    /**
     * Check if user has MFA enabled and properly configured
     */
    static isMFAConfigured(user) {
        return user.isMfaEnabled && user.totpSecret && user.backupCodes && user.backupCodes.length > 0;
    }

    /**
     * Disable MFA for a user
     */
    static disableMFA(user) {
        user.isMfaEnabled = false;
        user.totpSecret = null;
        user.backupCodes = [];
    }

    /**
     * Get unused backup codes count
     */
    static getUnusedBackupCodesCount(user) {
        if (!user.backupCodes) return 0;
        return user.backupCodes.filter(code => !code.used).length;
    }

    /**
     * Regenerate backup codes
     */
    static regenerateBackupCodes(user) {
        user.backupCodes = this.generateBackupCodes();
        return user.backupCodes;
    }
}

module.exports = MFAService; 