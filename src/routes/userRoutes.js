const express = require("express");
const logger = require("../utils/logger");
const {
	register,
	login,
	getProfile,
	forgotPassword,
	resetPassword,
	refreshToken,
	logout,
	uploadProfileImage,
	updateProfileImage,
	deleteUser,
	addFutsalToFavourites,
	removeFutsalFromFavourites,
	getFavouriteFutsals,
	verifyEmail,
	resendEmailVerification,
	setupMFA,
	enableMFA,
	verifyMFA,
	disableMFA,
	getMFAStatus,
	regenerateBackupCodes,
} = require("../controllers/userController");
const {
	registerValidator,
	loginValidator,
	forgotPasswordValidator,
	resetPasswordValidator,
	deleteUserValidator,
	enableMFAValidator,
	verifyMFAValidator,
	disableMFAValidator,
	regenerateBackupCodesValidator,
} = require("../validators/userValidators");
const { authenticate, authorize } = require("../middlewares/auth");
const { verifyAltcha } = require("../middlewares/security/altcha");
const { passport } = require("../config/google_oauth");
const { upload, handleMulterError } = require("../utils/multerConfig");
const { google, frontendUrl } = require("../config/env_config");
const router = express.Router();

// Registration with ALTCHA CAPTCHA protection
router.post("/register", registerValidator, verifyAltcha, register);
router.post("/login", loginValidator, login);

// Email verification routes
router.get("/verify-email", verifyEmail);
router.post("/resend-verification", resendEmailVerification);

router.post("/forgot-password", forgotPasswordValidator, forgotPassword);
router.post("/reset-password", resetPasswordValidator, resetPassword);
router.get("/logout", authenticate, logout);
router.post("/refresh-token", authenticate, refreshToken);
router.get("/me", authenticate, getProfile);

// Google OAuth Routes - Only available if configured
if (google.clientId && google.clientSecret) {
	// Custom error handler for OAuth failures
	const handleOAuthError = (err, req, res, next) => {
		logger.error("OAuth authentication error:", {
			error: err.message,
			stack: err.stack,
			path: req.path,
			query: req.query
		});
		
		// Redirect to frontend with error (clean URL)
		const errorUrl = `${frontendUrl}/auth/google-error`;
		res.redirect(errorUrl);
	};

	router.get("/google", passport.authenticate("google", { scope: ["profile", "email"] }));

	router.get("/google/callback", 
		passport.authenticate("google", { 
			failureRedirect: "/login",
			session: false 
		}),
		handleOAuthError,
		async (req, res) => {
			try {
				// Generate JWT token for the authenticated user
				const jwt = require("jsonwebtoken");
				const config = require("../config/env_config");
				
				const token = jwt.sign(
					{ id: req.user._id, role: req.user.role }, 
					config.jwtSecret, 
					{ expiresIn: "7d" }
				);

				// Set the token as an HTTP-only cookie
				res.cookie('accessToken', token, {
					httpOnly: true,
					secure: process.env.NODE_ENV === 'production',
					sameSite: 'lax',
					maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
				});

				// Redirect to frontend success page (without token in URL)
				const redirectUrl = `${frontendUrl}/auth/google-success`;
				
				res.redirect(redirectUrl);
			} catch (error) {
				console.error("Google OAuth callback error:", error);
				// Log more details for debugging
				logger.error("Google OAuth callback error details:", {
					error: error.message,
					stack: error.stack,
					user: req.user ? req.user._id : 'no user',
					config: {
						hasJwtSecret: !!config.jwtSecret,
						hasFrontendUrl: !!frontendUrl
					}
				});
				res.redirect(`${frontendUrl}/auth/google-error`);
			}
		}
	);
} else {
	// Fallback routes when Google OAuth is not configured
	router.get("/google", (req, res) => {
		res.status(503).json({
			error: "Google OAuth is not configured",
			message: "Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables"
		});
	});

	router.get("/google/callback", (req, res) => {
		res.status(503).json({
			error: "Google OAuth is not configured",
			message: "Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables"
		});
	});
}


router.post(
	"/upload-profile-image",
	authenticate,
	upload.single("image"),
	handleMulterError,
	registerValidator,
	uploadProfileImage
);
router.post(
	"/update-profile-image",
	authenticate,
	upload.single("image"),
	handleMulterError,
	registerValidator,
	updateProfileImage
);
router.delete("/:id", authenticate, deleteUserValidator, deleteUser);
router.post(
	"/favorites/:futsalId",
	authenticate,
	authorize("user"),
	addFutsalToFavourites
);
router.delete(
	"/favorites/:futsalId",
	authenticate,
	authorize("user"),
	removeFutsalFromFavourites
);
router.get("/favorites", authenticate, authorize("user"), getFavouriteFutsals);

// MFA Routes
router.get("/mfa/setup", authenticate, setupMFA);
router.post("/mfa/enable", authenticate, enableMFAValidator, enableMFA);
router.post("/mfa/verify", verifyMFAValidator, verifyMFA); // No auth required - uses MFA token
router.post("/mfa/disable", authenticate, disableMFAValidator, disableMFA);
router.get("/mfa/status", authenticate, getMFAStatus);
router.post("/mfa/regenerate-backup-codes", authenticate, regenerateBackupCodesValidator, regenerateBackupCodes);

module.exports = router;
