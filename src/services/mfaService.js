const speakeasy = require("speakeasy");
const QRCode = require("qrcode");
const crypto = require("crypto");
const { encrypt, decrypt } = require("../utils/encryption");

class MFAService {
	static generateTOTPSecret(userEmail, serviceName = "Futsal Booking System") {
		const secret = speakeasy.generateSecret({
			name: userEmail,
			issuer: serviceName,
			length: 32,
		});

		return {
			secret: secret.base32,
			otpauthUrl: secret.otpauth_url,
			qrCodeUrl: null,
		};
	}

	static async generateQRCode(otpauthUrl) {
		try {
			const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl);
			return qrCodeDataUrl;
		} catch (error) {
			throw new Error("Failed to generate QR code: " + error.message);
		}
	}

	static verifyTOTPToken(encryptedSecret, token, window = 2) {
		try {
			const secret = decrypt(encryptedSecret);

			const verified = speakeasy.totp.verify({
				secret: secret,
				encoding: "base32",
				token: token,
				window: window,
			});

			return verified;
		} catch (error) {
			console.error("TOTP verification error:", error);
			return false;
		}
	}

	static verifyTOTPTokenPlain(secret, token, window = 2) {
		try {
			const verified = speakeasy.totp.verify({
				secret: secret,
				encoding: "base32",
				token: token,
				window: window,
			});

			return verified;
		} catch (error) {
			console.error("TOTP verification error:", error);
			return false;
		}
	}

	static generateBackupCodes(count = 8) {
		const codes = [];
		for (let i = 0; i < count; i++) {
			const code = crypto.randomBytes(4).toString("hex").toUpperCase();
			codes.push({
				code: code,
				used: false,
				createdAt: new Date(),
			});
		}
		return codes;
	}

	static verifyBackupCode(user, inputCode) {
		const backupCode = user.backupCodes.find(
			(code) => code.code === inputCode.toUpperCase() && !code.used
		);

		if (backupCode) {
			backupCode.used = true;
			return true;
		}

		return false;
	}

	static isMFAConfigured(user) {
		return (
			user.isMfaEnabled &&
			user.totpSecret &&
			user.backupCodes &&
			user.backupCodes.length > 0
		);
	}

	static disableMFA(user) {
		user.isMfaEnabled = false;
		user.totpSecret = null;
		user.backupCodes = [];
	}

	static getUnusedBackupCodesCount(user) {
		if (!user.backupCodes) return 0;
		return user.backupCodes.filter((code) => !code.used).length;
	}

	static regenerateBackupCodes(user) {
		user.backupCodes = this.generateBackupCodes();
		return user.backupCodes;
	}
}

module.exports = MFAService;
