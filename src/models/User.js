const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const { encrypt, decrypt, isEncrypted, encryptUserData, decryptUserData } = require("../utils/encryption");

const UserSchema = new mongoose.Schema({
	fullName: { type: String, required: true },
	email: { type: String, required: true, unique: true },
	emailHash: { type: String, sparse: true }, // Hash for searching
	phone: { type: String, unique: true, sparse: true },
	phoneHash: { type: String, sparse: true }, // Hash for searching
	password: { type: String, required: false }, // Made optional for OAuth users
	passwordHistory: [{ 
		password: String, 
		createdAt: { type: Date, default: Date.now } 
	}], // Store last 5 passwords
	passwordExpiresAt: { type: Date }, // Password expiry date (90 days from creation/reset)
	role: {
		type: String,
		enum: ["admin", "user", "futsalOwner"],
		required: true,
	},
	profileImage: { type: String, required: false, default: null },
	
	// Email verification fields
	isEmailVerified: { type: Boolean, default: false },
	emailVerificationToken: { type: String },
	emailVerificationExpires: { type: Date },
	
	// OAuth Authentication Fields
	authProvider: {
		type: String,
		enum: ["local", "google"],
		default: "local"
	},
	googleId: { type: String, sparse: true },
	googleEmail: { type: String, sparse: true },
	googleProfile: {
		picture: String,
		locale: String,
		verified_email: Boolean
	},
	
	// Only for normal users (optional)
	favoritesFutsal: [{ type: mongoose.Schema.Types.ObjectId, ref: "Futsal" }],
	bookingHistory: {
		type: [{ type: mongoose.Schema.Types.ObjectId, ref: "Booking" }],
		required: false,
		default: undefined,
	},
	// Only for futsal owners (optional)
	isActiveOwner: { type: Boolean, required: false, default: false },
	khaltiPidx: { type: String, required: false },
	createdAt: { type: Date, default: Date.now },
	updatedAt: { type: Date, default: Date.now },
	isActive: { type: Boolean, default: true },
	lastLogin: { type: Date },
	lastLogout: { type: Date },
	resetPasswordToken: { type: String },
	resetPasswordExpires: { type: Date },
	// Security: Track login attempts and lockout
	loginAttempts: { type: Number, default: 0 },
	lockUntil: { type: Date },
	
	// MFA/TOTP fields
	totpSecret: { type: String }, // TOTP secret key (encrypted)
	isMfaEnabled: { type: Boolean, default: false },
	backupCodes: [{ 
		code: String, 
		used: { type: Boolean, default: false },
		createdAt: { type: Date, default: Date.now }
	}],
});

// Pre-save middleware: Hash password and encrypt sensitive data
UserSchema.pre("save", async function (next) {
	// Hash password if provided and modified
	if (this.isModified("password") && this.password) {
		// Add current password to history before hashing new one
		this.addPasswordToHistory();
		
		// Hash the new password
		this.password = await bcrypt.hash(this.password, 10);
		
		// Set password expiry (90 days from now)
		this.setPasswordExpiry();
	}
	
	// Encrypt sensitive fields if they're modified and not already encrypted
	const fieldsToEncrypt = ['email', 'phone', 'fullName'];
	
	fieldsToEncrypt.forEach(field => {
		if (this[field] && !isEncrypted(this[field])) {
			this[field] = encrypt(this[field]);
		}
	});
	
	// Create email hash for searching if email is modified
	if (this.isModified("email") && this.email) {
		const originalEmail = isEncrypted(this.email) ? decrypt(this.email) : this.email;
		this.emailHash = crypto.createHash('sha256').update(originalEmail.toLowerCase()).digest('hex');
	}
	// Create phone hash for searching if phone is modified
	if (this.isModified("phone") && this.phone) {
		const originalPhone = isEncrypted(this.phone) ? decrypt(this.phone) : this.phone;
		this.phoneHash = crypto.createHash('sha256').update(originalPhone).digest('hex');
	}
	
	next();
});

// Post-save middleware: Decrypt data for API responses
UserSchema.post("save", function(doc) {
	// Decrypt sensitive fields for API responses
	const decryptedDoc = decryptUserData(doc.toObject());
	Object.assign(doc, decryptedDoc);
});

// Post-find middleware: Decrypt data when retrieving users
// Temporarily disabled due to decryption key issues
// UserSchema.post(['find', 'findOne', 'findById'], function(docs) {
// 	if (!docs) return;
// 	
// 	if (Array.isArray(docs)) {
// 		// Handle array of documents
// 		docs.forEach(doc => {
// 			if (doc && typeof doc.toObject === 'function') {
// 				const decryptedDoc = decryptUserData(doc.toObject());
// 				Object.assign(doc, decryptedDoc);
// 			}
// 		});
// 	} else {
// 		// Handle single document
// 		if (docs && typeof docs.toObject === 'function') {
// 			const decryptedDoc = decryptUserData(docs.toObject());
// 			Object.assign(docs, decryptedDoc);
// 		}
// 	}
// });

// Method to compare password
UserSchema.methods.comparePassword = function (candidatePassword) {
	// If no password (OAuth user), return false
	if (!this.password) return false;
	return bcrypt.compare(candidatePassword, this.password);
};

// Method to check if user is OAuth user
UserSchema.methods.isOAuthUser = function() {
	return this.authProvider === "google";
};

// Method to check if user can use password authentication
UserSchema.methods.canUsePassword = function() {
	return this.password && this.authProvider === "local";
};

// Method to get decrypted user data
UserSchema.methods.getDecryptedData = function() {
	const userData = this.toObject();
	return decryptUserData(userData);
};

// Method to check if password was used recently
UserSchema.methods.isPasswordReused = async function(newPassword) {
	const MAX_PASSWORD_HISTORY = 5;
	
	// Check current password
	if (this.password && await bcrypt.compare(newPassword, this.password)) {
		return true;
	}
	
	// Check password history
	for (const historyEntry of this.passwordHistory || []) {
		if (await bcrypt.compare(newPassword, historyEntry.password)) {
			return true;
		}
	}
	
	return false;
};

// Method to add password to history
UserSchema.methods.addPasswordToHistory = function(hashedPassword) {
	const MAX_PASSWORD_HISTORY = 5;
	
	if (!this.passwordHistory) {
		this.passwordHistory = [];
	}
	
	// Add current password to history if it exists
	if (this.password) {
		this.passwordHistory.unshift({
			password: this.password,
			createdAt: new Date()
		});
	}
	
	// Keep only last 5 passwords
	if (this.passwordHistory.length > MAX_PASSWORD_HISTORY) {
		this.passwordHistory = this.passwordHistory.slice(0, MAX_PASSWORD_HISTORY);
	}
};

// Method to check if password is expired
UserSchema.methods.isPasswordExpired = function() {
	if (!this.passwordExpiresAt) return false;
	return new Date() > this.passwordExpiresAt;
};

// Method to set password expiry (90 days from now)
UserSchema.methods.setPasswordExpiry = function() {
	const NINETY_DAYS = 90 * 24 * 60 * 60 * 1000; // 90 days in milliseconds
	this.passwordExpiresAt = new Date(Date.now() + NINETY_DAYS);
};

// Static method to find user by email (handles both encrypted and plain text)
UserSchema.statics.findByEmail = async function(email) {
	// Create hash of the email for searching
	const emailHash = crypto.createHash('sha256').update(email.toLowerCase()).digest('hex');
	
	// Find user by email hash
	const user = await this.findOne({ emailHash: emailHash });
	
	return user;
};

// Static method to find user by phone (handles both encrypted and plain text)
UserSchema.statics.findByPhone = async function(phone) {
	const phoneHash = crypto.createHash('sha256').update(phone).digest('hex');
	const user = await this.findOne({ phoneHash: phoneHash });
	return user;
};

module.exports = mongoose.model("User", UserSchema);
