const crypto = require("crypto");
const { data_encryption_key } = require("../config/env_config");

const ENCRYPTION_KEY = data_encryption_key;
const ALGORITHM = "aes-256-cbc";
const IV_LENGTH = 16;

function encrypt(text) {
	if (!text) return text;

	try {
		const iv = crypto.randomBytes(IV_LENGTH);
		const cipher = crypto.createCipheriv(
			ALGORITHM,
			Buffer.from(ENCRYPTION_KEY.slice(0, 32)),
			iv
		);

		let encrypted = cipher.update(text, "utf8", "hex");
		encrypted += cipher.final("hex");

		return iv.toString("hex") + ":" + encrypted;
	} catch (error) {
		console.error("Encryption error:", error);
		return text;
	}
}

function decrypt(encryptedText) {
	if (!encryptedText) return encryptedText;

	try {
		if (!encryptedText.includes(":")) {
			return encryptedText;
		}

		const parts = encryptedText.split(":");
		if (parts.length !== 2) {
			return encryptedText;
		}

		const iv = Buffer.from(parts[0], "hex");
		const encrypted = parts[1];

		const decipher = crypto.createDecipheriv(
			ALGORITHM,
			Buffer.from(ENCRYPTION_KEY.slice(0, 32)),
			iv
		);

		let decrypted = decipher.update(encrypted, "hex", "utf8");
		decrypted += decipher.final("utf8");

		return decrypted;
	} catch (error) {
		console.error("Decryption error:", error);
		return encryptedText;
	}
}

function isEncrypted(text) {
	if (!text) return false;
	return text.includes(":") && text.split(":").length === 2;
}


function decryptUserData(userData) {
	const decryptedData = { ...userData };

	const fieldsToDecrypt = ["email", "phone", "fullName"];

	fieldsToDecrypt.forEach((field) => {
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
	decryptUserData,
};
