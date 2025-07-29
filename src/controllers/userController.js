const User = require("../models/User");
const jwt = require("jsonwebtoken");
const config = require("../config/env_config");
const { validationResult } = require("express-validator");
const crypto = require("node:crypto");
const { sendMail } = require("../utils/email");
const Session = require("../models/Session");
const futsalOwnerActivationTemplate = require("../utils/emailTemplates/futsalOwnerActivation");
const emailVerificationTemplate = require("../utils/emailTemplates/emailVerification");
const { uploadImage, deleteImage } = require("../utils/cloudinary");
const { decryptUserData, encrypt } = require("../utils/encryption");
const MFAService = require("../services/mfaService");
const {
	generateToken,
	generateRefreshToken,
	generateEmailVerificationToken,
	generateMFAToken,
} = require("../utils/tokens");

exports.register = async (req, res) => {
	const errors = validationResult(req);
	if (!errors.isEmpty()) {
		res.locals.errorMessage = JSON.stringify(errors.array());
		return res.status(400).json({ errors: errors.array() });
	}
	try {
		const { email, password, role, phone, fullName } = req.body;

		const userExists = await User.findByEmail(email);

		let phoneUser = null;
		if (phone) {
			phoneUser = await User.findByPhone(phone);
		}

		if (userExists || phoneUser) {
			if (
				userExists &&
				(userExists.googleEmail === email || userExists.googleId)
			) {
				res.locals.errorMessage =
					"An account with this email already exists via Google. Please use 'Continue with Google' to sign in.";
				return res.status(400).json({
					error:
						"An account with this email already exists via Google. Please use 'Continue with Google' to sign in.",
					authProvider: "google",
				});
			}

			res.locals.errorMessage = "User already exists";
			return res.status(400).json({ error: "User already exists" });
		}

		const emailVerificationToken = generateEmailVerificationToken();
		const emailVerificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

		let userObj = {
			email,
			password,
			role,
			phone,
			fullName,
			authProvider: "local",
			isEmailVerified: false,
			emailVerificationToken,
			emailVerificationExpires,
		};

		if (role === "user") {
			userObj.favoritesFutsal = [];
			userObj.bookingHistory = [];
		}
		if (role === "futsalOwner") {
			userObj.isActiveOwner = false;
		}

		const user = await User.create(userObj);

		const verificationLink = `${config.frontendUrl}/verify-email?token=${emailVerificationToken}&email=${encodeURIComponent(email)}`;
		const html = emailVerificationTemplate({ fullName, verificationLink });

		await sendMail({
			to: email,
			subject: "Verify Your Email - Futsal Booking System",
			html,
		});

		if (role === "futsalOwner") {
			const activationHtml = futsalOwnerActivationTemplate({ fullName });
			await sendMail({
				to: email,
				subject: "Futsal Owner Account Created - Activation Required",
				html: activationHtml,
			});
		}

		const decryptedUser = decryptUserData(user.toObject());

		res.status(201).json({
			message:
				"Registration successful! Please check your email to verify your account.",
			user: {
				id: user._id,
				email: decryptedUser.email,
				role: user.role,
				phone: decryptedUser.phone,
				fullName: decryptedUser.fullName,
				profileImage: user.profileImage,
				authProvider: user.authProvider,
				isEmailVerified: user.isEmailVerified,
			},
		});
	} catch (err) {
		res.locals.errorMessage = err.message;
		res.status(500).json({ error: err.message || "Server error" });
	}
};

exports.verifyEmail = async (req, res) => {
	try {
		const { token, email } = req.query;

		if (!token || !email) {
			return res.status(400).json({ error: "Token and email are required" });
		}

		const user = await User.findByEmail(email);
		if (!user) {
			return res.status(404).json({ error: "User not found" });
		}

		if (user.isEmailVerified) {
			return res.status(400).json({ error: "Email is already verified" });
		}

		if (user.emailVerificationToken !== token) {
			return res.status(400).json({ error: "Invalid verification token" });
		}

		if (user.emailVerificationExpires < new Date()) {
			return res.status(400).json({ error: "Verification token has expired" });
		}

		user.isEmailVerified = true;
		user.emailVerificationToken = undefined;
		user.emailVerificationExpires = undefined;
		await user.save();

		const decryptedUser = decryptUserData(user.toObject());

		res.json({
			message:
				"Email verified successfully! You can now log in to your account.",
			user: {
				id: user._id,
				email: decryptedUser.email,
				role: user.role,
				phone: decryptedUser.phone,
				fullName: decryptedUser.fullName,
				profileImage: user.profileImage,
				authProvider: user.authProvider,
				isEmailVerified: user.isEmailVerified,
			},
		});
	} catch (err) {
		res.locals.errorMessage = err.message;
		res.status(500).json({ error: err.message || "Server error" });
	}
};

exports.resendEmailVerification = async (req, res) => {
	try {
		const { email } = req.body;

		if (!email) {
			return res.status(400).json({ error: "Email is required" });
		}

		const user = await User.findByEmail(email);
		if (!user) {
			return res.status(404).json({ error: "User not found" });
		}

		if (user.isEmailVerified) {
			return res.status(400).json({ error: "Email is already verified" });
		}

		const emailVerificationToken = generateEmailVerificationToken();
		const emailVerificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

		user.emailVerificationToken = emailVerificationToken;
		user.emailVerificationExpires = emailVerificationExpires;
		await user.save();

		const verificationLink = `${config.frontendUrl}/verify-email?token=${emailVerificationToken}&email=${encodeURIComponent(email)}`;
		const html = emailVerificationTemplate({
			fullName: user.fullName,
			verificationLink,
		});

		await sendMail({
			to: email,
			subject: "Verify Your Email - Futsal Booking System",
			html,
		});

		res.json({
			message: "Verification email sent successfully. Please check your inbox.",
		});
	} catch (err) {
		res.locals.errorMessage = err.message;
		res.status(500).json({ error: err.message || "Server error" });
	}
};

exports.login = async (req, res) => {
	const errors = validationResult(req);
	if (!errors.isEmpty()) {
		res.locals.errorMessage = JSON.stringify(errors.array());
		return res.status(400).json({ errors: errors.array() });
	}
	try {
		const { email, password } = req.body;

		const user = await User.findByEmail(email);
		if (!user) {
			res.locals.errorMessage = "No user registered";
			return res.status(400).json({ error: "No user registered" });
		}

		if (user.authProvider === "local" && !user.isEmailVerified) {
			return res.status(400).json({
				error:
					"Please verify your email address before logging in. Check your inbox for the verification link.",
				needsVerification: true,
			});
		}

		if (user.isPasswordExpired()) {
			return res.status(400).json({
				error:
					"Your password has expired. Please reset your password to continue.",
				passwordExpired: true,
				resetUrl: `${config.frontendUrl}/forgot-password`,
			});
		}

		if (user.isOAuthUser() && !user.canUsePassword()) {
			res.locals.errorMessage =
				"This account was created with Google. Please use 'Continue with Google' to sign in.";
			return res.status(400).json({
				error:
					"This account was created with Google. Please use 'Continue with Google' to sign in.",
				authProvider: "google",
			});
		}

		if (user.lockUntil && user.lockUntil > Date.now()) {
			return res.status(423).json({
				error:
					"Account is locked due to too many failed login attempts. Try again later.",
			});
		}

		const isMatch = await user.comparePassword(password);
		if (!isMatch) {
			user.loginAttempts = (user.loginAttempts || 0) + 1;

			if (user.loginAttempts >= 5) {
				user.lockUntil = new Date(Date.now() + 60 * 60 * 1000);
			}
			await user.save();
			res.locals.errorMessage = "Invalid credentials.Please try again.";
			return res
				.status(400)
				.json({ error: "Invalid credentials.Please try again." });
		}

		user.loginAttempts = 0;
		user.lockUntil = undefined;
		user.lastLogin = new Date();

		if (MFAService.isMFAConfigured(user)) {
			const mfaToken = generateMFAToken(
				{ id: user._id, requiresMFA: true },
				"10m"
			);

			res.cookie("mfaToken", mfaToken, {
				httpOnly: true,
				secure: config.nodeEnv === "production",
				sameSite: "strict",
				maxAge: 1000 * 60 * 10,
			});

			return res.json({
				requiresMFA: true,
				message: "Please enter your authenticator code to complete login",
			});
		}

		await user.save();

		const token = generateToken(user);
		const refreshToken = generateRefreshToken(user);
		await Session.create({ user: user._id, token: refreshToken });

		res.cookie("accessToken", token, {
			httpOnly: true,
			secure: config.nodeEnv === "production",
			sameSite: "strict",
			maxAge: 1000 * 60 * 60 * 24 * 7,
		});
		res.cookie("refreshToken", refreshToken, {
			httpOnly: true,
			secure: config.nodeEnv === "production",
			sameSite: "strict",
			maxAge: 1000 * 60 * 60 * 24 * 30,
		});

		const userData = user.toObject();

		const { decrypt } = require("../utils/encryption");
		const directDecrypt = (encryptedText) => {
			try {
				if (!encryptedText || !encryptedText.includes(":")) {
					return encryptedText;
				}
				return decrypt(encryptedText);
			} catch (error) {
				console.error("Direct decryption failed:", error.message);
				return encryptedText;
			}
		};

		const decryptedUserData = {
			...userData,
			email: directDecrypt(userData.email),
			phone: directDecrypt(userData.phone),
			fullName: directDecrypt(userData.fullName),
		};

		res.json({
			user: {
				id: user._id,
				email: decryptedUserData.email,
				role: user.role,
				phone: decryptedUserData.phone,
				fullName: decryptedUserData.fullName,
				profileImage: user.profileImage,
				authProvider: user.authProvider,
				isEmailVerified: user.isEmailVerified,
			},
		});
	} catch (err) {
		res.locals.errorMessage = err.message;
		res.status(500).json({ error: err.message || "Server error" });
	}
};

exports.getProfile = async (req, res) => {
	try {
		const decryptedUser = decryptUserData(req.user.toObject());

		const {
			password,
			passwordHistory,
			emailVerificationToken,
			emailVerificationExpires,
			resetPasswordToken,
			resetPasswordExpires,
			totpSecret,
			backupCodes,
			...safeUserData
		} = decryptedUser;

		res.json({ user: safeUserData });
	} catch (error) {
		res.locals.errorMessage = error.message;
		res.status(500).json({ error: "Failed to retrieve user profile" });
	}
};

exports.forgotPassword = async (req, res) => {
	const { email } = req.body;
	try {
		const user = await User.findByEmail(email);
		if (!user) {
			res.locals.errorMessage = "No user registered with this email";
			return res
				.status(400)
				.json({ error: "No user registered with this email" });
		}

		const resetToken = crypto.randomBytes(32).toString("hex");
		user.resetPasswordToken = resetToken;
		user.resetPasswordExpires = new Date(Date.now() + 60 * 60 * 1000);
		await user.save();

		const resetUrl = `${config.frontendUrl}/reset-password?token=${resetToken}&email=${email}`;
		const html = `
			<p>You requested a password reset.</p>
			<p>Click this <a href="${resetUrl}">link</a> to reset your password.</p>
			<p>If you didn't request this, please ignore this email.</p>
			<p>This link will expire in 1 hour.</p>
		`;
		await sendMail({
			to: email,
			subject: "Password Reset Request",
			html,
		});

		res.json({ message: "Password reset email sent" });
	} catch (err) {
		res.locals.errorMessage = err.message;
		res.status(500).json({ error: err.message || "Server error" });
	}
};

exports.resetPassword = async (req, res) => {
	const { token, email, password } = req.body;
	try {
		const user = await User.findOne({
			email,
			resetPasswordToken: token,
			resetPasswordExpires: { $gt: Date.now() },
		});
		if (!user) {
			res.locals.errorMessage = "Invalid or expired token";
			return res.status(400).json({ error: "Invalid or expired token" });
		}

		const isReused = await user.isPasswordReused(password);
		if (isReused) {
			res.locals.errorMessage =
				"Cannot reuse recent passwords. Please choose a different password.";
			return res.status(400).json({
				error:
					"Cannot reuse recent passwords. Please choose a different password.",
				passwordReused: true,
			});
		}

		user.password = password;
		user.resetPasswordToken = undefined;
		user.resetPasswordExpires = undefined;
		await user.save();

		const html = `<p>Your password has been reset successfully. If you did not perform this action, please contact support immediately.</p>`;
		await sendMail({
			to: user.email,
			subject: "Password Reset Successful",
			html,
		});
		res.status(200).json({ message: "Password has been reset successfully." });
	} catch (err) {
		res.locals.errorMessage = err.message;
		res.status(500).json({ error: err.message || "Server error" });
	}
};

exports.refreshToken = async (req, res) => {
	const refreshToken = req.cookies.refreshToken;
	if (!refreshToken) {
		res.locals.errorMessage = "Refresh token is required";
		return res.status(400).json({ error: "Refresh token is required" });
	}
	try {
		const payload = jwt.verify(refreshToken, config.jwtSecret);
		const session = await Session.findOne({
			user: payload.id,
			token: refreshToken,
		});
		if (!session) {
			res.locals.errorMessage = "Invalid refresh token";
			return res.status(401).json({ error: "Invalid refresh token" });
		}
		const user = await User.findById(payload.id);
		if (!user) {
			res.locals.errorMessage = "User not found";
			return res.status(404).json({ error: "User not found" });
		}
		const newToken = generateToken(user);
		res.cookie("accessToken", newToken, {
			httpOnly: true,
			secure: config.nodeEnv === "production",
			sameSite: "strict",
			maxAge: 1000 * 60 * 60 * 24 * 7,
		});
		res.json({ message: "Token refreshed" });
	} catch (err) {
		res.locals.errorMessage = err.message;
		res.status(401).json({ error: err.message || "Invalid refresh token" });
	}
};

exports.logout = async (req, res) => {
	try {
		const user = req.user;
		const isOAuthUser = user && user.authProvider === "google";

		const refreshToken = req.cookies.refreshToken;
		if (refreshToken) {
			await Session.deleteOne({ token: refreshToken });
		}

		res.clearCookie("accessToken");
		res.clearCookie("refreshToken");
		res.clearCookie("mfaToken");

		if (isOAuthUser) {
			res.clearCookie("psifi.session");
		}

		if (user) {
			user.lastLogout = new Date();
			await user.save();
		}

		res.status(200).json({
			message: "Logged out successfully",
			isOAuthUser: isOAuthUser,

			...(isOAuthUser && {
				googleLogoutUrl: "https://accounts.google.com/logout",
			}),
		});
	} catch (err) {
		res.status(500).json({ error: err.message || "Server error" });
	}
};

exports.scheduleOwnerDeletion = async (req, res) => {
	try {
		const owner = await User.findById(req.params.id);
		if (!owner || owner.role !== "futsalOwner") {
			return res.status(404).json({ message: "Owner not found" });
		}
		if (owner.isDeleted) {
			return res
				.status(400)
				.json({ message: "Already scheduled for deletion" });
		}
		owner.scheduledDeletion = new Date(Date.now() + 24 * 60 * 60 * 1000);
		owner.isDeleted = false;
		await owner.save();

		if (owner.email) {
			const html = `<p>Your futsal owner account and all related data (futsal, bookings) will be permanently deleted in 24 hours unless restored. If this was not intended, please contact support or restore your account within the next 24 hours.</p>`;
			await sendMail({
				to: owner.email,
				subject: "Account Deletion Scheduled",
				html,
			});
		}
		res.json({ message: "Owner scheduled for deletion in 24 hours." });
	} catch (err) {
		res.status(500).json({ message: err.message });
	}
};

exports.restoreOwner = async (req, res) => {
	try {
		const owner = await User.findById(req.params.id);
		if (!owner || owner.role !== "futsalOwner") {
			return res.status(404).json({ message: "Owner not found" });
		}
		if (!owner.scheduledDeletion || owner.isDeleted) {
			return res
				.status(400)
				.json({ message: "Owner is not scheduled for deletion" });
		}
		owner.scheduledDeletion = undefined;
		owner.isDeleted = false;
		await owner.save();
		res.json({ message: "Owner account restored." });
	} catch (err) {
		res.status(500).json({ message: err.message });
	}
};

exports.addFutsalToFavourites = async (req, res) => {
	try {
		const userId = req.user._id;
		const { futsalId } = req.params;
		const user = await User.findById(userId);
		if (!user) return res.status(404).json({ message: "User not found" });
		if (!user.favoritesFutsal) user.favoritesFutsal = [];
		if (user.favoritesFutsal.includes(futsalId)) {
			return res.status(400).json({ message: "Futsal already in favourites" });
		}
		user.favoritesFutsal.push(futsalId);
		await user.save();
		res.json({
			message: "Futsal added to favourites",
			favorites: user.favoritesFutsal,
		});
	} catch (err) {
		res.status(500).json({ message: err.message });
	}
};

exports.removeFutsalFromFavourites = async (req, res) => {
	try {
		const userId = req.user._id;
		const { futsalId } = req.params;
		const user = await User.findById(userId);
		if (!user) return res.status(404).json({ message: "User not found" });
		user.favoritesFutsal = user.favoritesFutsal.filter(
			(id) => id.toString() !== futsalId
		);
		await user.save();
		res.json({
			message: "Futsal removed from favourites",
			favorites: user.favoritesFutsal,
		});
	} catch (err) {
		res.status(500).json({ message: err.message });
	}
};

exports.getFavouriteFutsals = async (req, res) => {
	try {
		const userId = req.user._id;
		const user = await User.findById(userId).populate({
			path: "favoritesFutsal",
			select:
				"name location.address location.coordinates images pricing.basePrice",
		});

		if (!user) return res.status(404).json({ message: "User not found" });

		const formattedFavorites = user.favoritesFutsal.map((futsal) => ({
			_id: futsal._id,
			name: futsal.name,
			address: futsal.location?.address || "",
			coordinates: futsal.location?.coordinates || [],
			image: futsal.images?.[0] || null,
			price: futsal.pricing?.basePrice || 0,
		}));

		res.json({ favorites: formattedFavorites });
	} catch (err) {
		res.status(500).json({ message: err.message });
	}
};

exports.uploadProfileImage = async (req, res) => {
	try {
		if (!req.file)
			return res.status(400).json({ error: "No image file provided" });
		const userId = req.user._id;
		const user = await User.findById(userId);
		if (!user) return res.status(404).json({ error: "User not found" });

		const result = await uploadImage(req.file.path, `profiles/${userId}`);
		user.profileImage = result.secure_url;
		await user.save();
		res.status(200).json({ url: result.secure_url });
	} catch (err) {
		res
			.status(500)
			.json({ error: err.message || "Profile image upload failed" });
	}
};

exports.updateProfileImage = async (req, res) => {
	try {
		if (!req.file)
			return res.status(400).json({ error: "No image file provided" });
		const userId = req.user._id;
		const user = await User.findById(userId);
		if (!user) return res.status(404).json({ error: "User not found" });

		if (req.body.oldPublicId) await deleteImage(req.body.oldPublicId);
		const result = await uploadImage(req.file.path, `profiles/${userId}`);
		user.profileImage = result.secure_url;
		await user.save();
		res.status(200).json({ url: result.secure_url });
	} catch (err) {
		res
			.status(500)
			.json({ error: err.message || "Profile image update failed" });
	}
};

exports.deleteUser = async (req, res) => {
	try {
		const user = await User.findByIdAndDelete(req.params.id);
		if (!user) {
			return res.status(404).json({ error: "User not found" });
		}

		if (user.profileImage) {
			const match = user.profileImage.match(
				/\/profiles\/([^/.]+)\/(.+)\.[a-zA-Z]+$/
			);
			if (match) {
				const publicId = `profiles/${match[1]}/${match[2]}`;
				await deleteImage(publicId).catch(() => {});
			}
		}
		res.json({ message: "User deleted" });
	} catch (err) {
		res.status(500).json({ error: err.message || "Server error" });
	}
};

exports.setupMFA = async (req, res) => {
	try {
		const user = await User.findById(req.user.id);
		if (!user) {
			return res.status(404).json({ error: "User not found" });
		}

		const mfaData = MFAService.generateTOTPSecret(user.email);

		const qrCodeUrl = await MFAService.generateQRCode(mfaData.otpauthUrl);

		res.json({
			secret: mfaData.secret,
			qrCodeUrl: qrCodeUrl,
			manualEntryKey: mfaData.secret,
		});
	} catch (err) {
		res.locals.errorMessage = err.message;
		res.status(500).json({ error: err.message || "Server error" });
	}
};

exports.enableMFA = async (req, res) => {
	try {
		const { secret, token } = req.body;

		if (!secret || !token) {
			return res.status(400).json({ error: "Secret and token are required" });
		}

		const user = await User.findById(req.user.id);
		if (!user) {
			return res.status(404).json({ error: "User not found" });
		}

		const isValid = MFAService.verifyTOTPTokenPlain(secret, token);
		if (!isValid) {
			return res.status(400).json({ error: "Invalid authenticator code" });
		}

		user.totpSecret = encrypt(secret);
		user.isMfaEnabled = true;

		user.backupCodes = MFAService.generateBackupCodes();

		await user.save();

		res.json({
			message: "MFA enabled successfully",
			backupCodes: user.backupCodes.map((code) => code.code),
		});
	} catch (err) {
		res.locals.errorMessage = err.message;
		res.status(500).json({ error: err.message || "Server error" });
	}
};

exports.verifyMFA = async (req, res) => {
	try {
		const { token, backupCode } = req.body;
		const mfaToken = req.cookies.mfaToken;

		if (!mfaToken) {
			return res
				.status(400)
				.json({ error: "MFA session expired. Please login again." });
		}

		let decoded;
		try {
			decoded = jwt.verify(mfaToken, config.jwtSecret);
		} catch (err) {
			return res
				.status(400)
				.json({ error: "Invalid MFA session. Please login again." });
		}

		if (!decoded.requiresMFA) {
			return res.status(400).json({ error: "Invalid MFA session" });
		}

		const user = await User.findById(decoded.id);
		if (!user) {
			return res.status(404).json({ error: "User not found" });
		}

		let isValid = false;

		if (token) {
			isValid = MFAService.verifyTOTPToken(user.totpSecret, token);
		} else if (backupCode) {
			isValid = MFAService.verifyBackupCode(user, backupCode);
			if (isValid) {
				await user.save();
			}
		} else {
			return res
				.status(400)
				.json({ error: "TOTP token or backup code required" });
		}

		if (!isValid) {
			return res
				.status(400)
				.json({ error: "Invalid authenticator code or backup code" });
		}

		user.lastLogin = new Date();
		await user.save();

		const accessToken = generateToken(user);
		const refreshToken = generateRefreshToken(user);
		await Session.create({ user: user._id, token: refreshToken });

		res.clearCookie("mfaToken");
		res.cookie("accessToken", accessToken, {
			httpOnly: true,
			secure: config.nodeEnv === "production",
			sameSite: "strict",
			maxAge: 1000 * 60 * 60 * 24 * 7,
		});
		res.cookie("refreshToken", refreshToken, {
			httpOnly: true,
			secure: config.nodeEnv === "production",
			sameSite: "strict",
			maxAge: 1000 * 60 * 60 * 24 * 30,
		});

		const userData = user.toObject();
		const { decrypt } = require("../utils/encryption");
		const directDecrypt = (encryptedText) => {
			try {
				if (!encryptedText || !encryptedText.includes(":")) {
					return encryptedText;
				}
				return decrypt(encryptedText);
			} catch (error) {
				console.error("Direct decryption failed:", error.message);
				return encryptedText;
			}
		};

		const decryptedUserData = {
			...userData,
			email: directDecrypt(userData.email),
			phone: directDecrypt(userData.phone),
			fullName: directDecrypt(userData.fullName),
		};

		res.json({
			user: {
				id: user._id,
				email: decryptedUserData.email,
				role: user.role,
				phone: decryptedUserData.phone,
				fullName: decryptedUserData.fullName,
				profileImage: user.profileImage,
				authProvider: user.authProvider,
				isEmailVerified: user.isEmailVerified,
				isMfaEnabled: user.isMfaEnabled,
			},
		});
	} catch (err) {
		res.locals.errorMessage = err.message;
		res.status(500).json({ error: err.message || "Server error" });
	}
};

exports.disableMFA = async (req, res) => {
	try {
		const { password } = req.body;

		if (!password) {
			return res
				.status(400)
				.json({ error: "Password is required to disable MFA" });
		}

		const user = await User.findById(req.user.id);
		if (!user) {
			return res.status(404).json({ error: "User not found" });
		}

		const isMatch = await user.comparePassword(password);
		if (!isMatch) {
			return res.status(400).json({ error: "Invalid password" });
		}

		MFAService.disableMFA(user);
		await user.save();

		res.json({
			message: "MFA disabled successfully",
		});
	} catch (err) {
		res.locals.errorMessage = err.message;
		res.status(500).json({ error: err.message || "Server error" });
	}
};

exports.getMFAStatus = async (req, res) => {
	try {
		const user = await User.findById(req.user.id);
		if (!user) {
			return res.status(404).json({ error: "User not found" });
		}

		res.json({
			isMfaEnabled: user.isMfaEnabled,
			backupCodesRemaining: MFAService.getUnusedBackupCodesCount(user),
		});
	} catch (err) {
		res.locals.errorMessage = err.message;
		res.status(500).json({ error: err.message || "Server error" });
	}
};

exports.regenerateBackupCodes = async (req, res) => {
	try {
		const { password } = req.body;

		if (!password) {
			return res.status(400).json({ error: "Password is required" });
		}

		const user = await User.findById(req.user.id);
		if (!user) {
			return res.status(404).json({ error: "User not found" });
		}

		if (!user.isMfaEnabled) {
			return res.status(400).json({ error: "MFA is not enabled" });
		}

		const isMatch = await user.comparePassword(password);
		if (!isMatch) {
			return res.status(400).json({ error: "Invalid password" });
		}

		const newBackupCodes = MFAService.regenerateBackupCodes(user);
		await user.save();

		res.json({
			message: "Backup codes regenerated successfully",
			backupCodes: newBackupCodes.map((code) => code.code),
		});
	} catch (err) {
		res.locals.errorMessage = err.message;
		res.status(500).json({ error: err.message || "Server error" });
	}
};
