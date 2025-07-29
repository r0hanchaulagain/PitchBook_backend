const express = require("express");
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
const multer = require("multer");
const upload = multer({ dest: "uploads/" });
const router = express.Router();

// Registration with ALTCHA CAPTCHA protection
router.post("/register", registerValidator, verifyAltcha, register);
router.post("/login", loginValidator, login);
router.post("/forgot-password", forgotPasswordValidator, forgotPassword);
router.post("/reset-password", resetPasswordValidator, resetPassword);
router.get("/logout", authenticate, logout);
router.post("/refresh-token", authenticate, refreshToken);
router.get("/me", authenticate, getProfile);

// Google OAuth Routes - Only available if configured
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
	router.get("/google", passport.authenticate("google", { scope: ["profile", "email"] }));

	router.get("/google/callback", 
		passport.authenticate("google", { 
			failureRedirect: "/login",
			session: false 
		}),
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

				// Redirect to frontend with token
				const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
				const redirectUrl = `${frontendUrl}/auth/google-success?token=${token}&user=${encodeURIComponent(JSON.stringify({
					id: req.user._id,
					email: req.user.email,
					role: req.user.role,
					phone: req.user.phone,
					fullName: req.user.fullName,
					profileImage: req.user.profileImage,
					authProvider: req.user.authProvider
				}))}`;
				
				res.redirect(redirectUrl);
			} catch (error) {
				console.error("Google OAuth callback error:", error);
				const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
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
