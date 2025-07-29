const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const {
	encrypt,
	decrypt,
	isEncrypted,
	decryptUserData,
} = require("../utils/encryption");

const UserSchema = new mongoose.Schema({
	fullName: { type: String, required: true },
	email: { type: String, required: true, unique: true },
	emailHash: { type: String, sparse: true },
	phone: { type: String, unique: true, sparse: true },
	phoneHash: { type: String, sparse: true },
	password: { type: String, required: false },
	passwordHistory: [
		{
			password: String,
			createdAt: { type: Date, default: Date.now },
		},
	],
	passwordExpiresAt: { type: Date },
	role: {
		type: String,
		enum: ["admin", "user", "futsalOwner"],
		required: true,
	},
	profileImage: { type: String, required: false, default: null },

	isEmailVerified: { type: Boolean, default: false },
	emailVerificationToken: { type: String },
	emailVerificationExpires: { type: Date },

	authProvider: {
		type: String,
		enum: ["local", "google"],
		default: "local",
	},
	googleId: { type: String, sparse: true },
	googleEmail: { type: String, sparse: true },
	googleProfile: {
		picture: String,
		locale: String,
		verified_email: Boolean,
	},

	favoritesFutsal: [{ type: mongoose.Schema.Types.ObjectId, ref: "Futsal" }],
	bookingHistory: {
		type: [{ type: mongoose.Schema.Types.ObjectId, ref: "Booking" }],
		required: false,
		default: undefined,
	},

	isActiveOwner: { type: Boolean, required: false, default: false },
	khaltiPidx: { type: String, required: false },
	createdAt: { type: Date, default: Date.now },
	updatedAt: { type: Date, default: Date.now },
	isActive: { type: Boolean, default: true },
	lastLogin: { type: Date },
	lastLogout: { type: Date },
	resetPasswordToken: { type: String },
	resetPasswordExpires: { type: Date },

	loginAttempts: { type: Number, default: 0 },
	lockUntil: { type: Date },

	totpSecret: { type: String },
	isMfaEnabled: { type: Boolean, default: false },
	backupCodes: [
		{
			code: String,
			used: { type: Boolean, default: false },
			createdAt: { type: Date, default: Date.now },
		},
	],
});

UserSchema.pre("save", async function (next) {
	if (this.isModified("password") && this.password) {
		this.addPasswordToHistory();

		this.password = await bcrypt.hash(this.password, 10);

		this.setPasswordExpiry();
	}

	const fieldsToEncrypt = ["email", "phone", "fullName"];

	fieldsToEncrypt.forEach((field) => {
		if (this[field] && !isEncrypted(this[field])) {
			this[field] = encrypt(this[field]);
		}
	});

	if (this.isModified("email") && this.email) {
		const originalEmail = isEncrypted(this.email)
			? decrypt(this.email)
			: this.email;
		this.emailHash = crypto
			.createHash("sha256")
			.update(originalEmail.toLowerCase())
			.digest("hex");
	}

	if (this.isModified("phone") && this.phone) {
		const originalPhone = isEncrypted(this.phone)
			? decrypt(this.phone)
			: this.phone;
		this.phoneHash = crypto
			.createHash("sha256")
			.update(originalPhone)
			.digest("hex");
	}

	next();
});

UserSchema.post("save", function (doc) {
	const decryptedDoc = decryptUserData(doc.toObject());
	Object.assign(doc, decryptedDoc);
});

UserSchema.methods.comparePassword = function (candidatePassword) {
	if (!this.password) return false;
	return bcrypt.compare(candidatePassword, this.password);
};

UserSchema.methods.isOAuthUser = function () {
	return this.authProvider === "google";
};

UserSchema.methods.canUsePassword = function () {
	return this.password && this.authProvider === "local";
};

UserSchema.methods.getDecryptedData = function () {
	const userData = this.toObject();
	return decryptUserData(userData);
};

UserSchema.methods.isPasswordReused = async function (newPassword) {
	const MAX_PASSWORD_HISTORY = 5;

	if (this.password && (await bcrypt.compare(newPassword, this.password))) {
		return true;
	}

	for (const historyEntry of this.passwordHistory || []) {
		if (await bcrypt.compare(newPassword, historyEntry.password)) {
			return true;
		}
	}

	return false;
};

UserSchema.methods.addPasswordToHistory = function (hashedPassword) {
	const MAX_PASSWORD_HISTORY = 5;

	if (!this.passwordHistory) {
		this.passwordHistory = [];
	}

	if (this.password) {
		this.passwordHistory.unshift({
			password: this.password,
			createdAt: new Date(),
		});
	}

	if (this.passwordHistory.length > MAX_PASSWORD_HISTORY) {
		this.passwordHistory = this.passwordHistory.slice(0, MAX_PASSWORD_HISTORY);
	}
};

UserSchema.methods.isPasswordExpired = function () {
	if (!this.passwordExpiresAt) return false;
	return new Date() > this.passwordExpiresAt;
};

UserSchema.methods.setPasswordExpiry = function () {
	const NINETY_DAYS = 90 * 24 * 60 * 60 * 1000;
	this.passwordExpiresAt = new Date(Date.now() + NINETY_DAYS);
};

UserSchema.statics.findByEmail = async function (email) {
	const emailHash = crypto
		.createHash("sha256")
		.update(email.toLowerCase())
		.digest("hex");

	const user = await this.findOne({ emailHash: emailHash });

	return user;
};

UserSchema.statics.findByPhone = async function (phone) {
	const phoneHash = crypto.createHash("sha256").update(phone).digest("hex");
	const user = await this.findOne({ phoneHash: phoneHash });
	return user;
};

module.exports = mongoose.model("User", UserSchema);
