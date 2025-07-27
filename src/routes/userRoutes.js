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
} = require("../validators/userValidators");
const { authenticate, authorize } = require("../middlewares/auth");
const multer = require("multer");
const upload = multer({ dest: "uploads/" });
const router = express.Router();

router.post("/register", registerValidator, register);
router.post("/login", loginValidator, login);
router.post("/forgot-password", forgotPasswordValidator, forgotPassword);
router.post("/reset-password", resetPasswordValidator, resetPassword);
router.get("/logout", authenticate, logout);
router.post("/refresh-token", authenticate, refreshToken);
router.get("/me", authenticate, getProfile);
router.post(
	"/upload-profile-image",
	authenticate,
	upload.single("image"),
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

module.exports = router;
