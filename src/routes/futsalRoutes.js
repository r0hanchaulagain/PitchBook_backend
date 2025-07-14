const express = require("express");
const futsalController = require("../controllers/futsalController");
const { authenticate, authorize } = require("../middlewares/auth");
const {
	createFutsalValidator,
	updateFutsalValidator,
} = require("../validators/futsalValidators");
const {
	registerFutsalOwnerValidator,
} = require("../validators/futsalOwnerValidators");

const multer = require("multer");
const upload = multer({ dest: "uploads/" });

const router = express.Router();

router.get("/", futsalController.getFutsals);
router.get("/:id", futsalController.getFutsalById);
router.get("/dashboard-summary", futsalController.getDashboardSummary);

router.put(
	"/:id",
	authenticate,
	authorize("admin", "futsalOwner"),
	updateFutsalValidator,
	futsalController.updateFutsal
);
router.delete(
	"/:id",
	authenticate,
	authorize("admin", "futsalOwner"),
	futsalController.deleteFutsal
);

router.post(
	"/register",
	authenticate,
	registerFutsalOwnerValidator,
	futsalController.registerFutsal
);
router.post(
	"/upload-image",
	authenticate,
	upload.single("image"),
	createFutsalValidator,
	futsalController.uploadFutsalImage
);

router.put(
	"/:id/update-image",
	authenticate,
	upload.single("image"),
	updateFutsalValidator,
	futsalController.updateFutsalImage
);

router.patch(
	"/:id/pricing-rules",
	authenticate,
	authorize("admin", "futsalOwner"),
	futsalController.updatePricingRules
);

router.get("/:id/transactions", futsalController.getFutsalTransactions);

module.exports = router;
