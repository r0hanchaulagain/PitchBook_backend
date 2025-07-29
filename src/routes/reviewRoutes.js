const express = require("express");
const router = express.Router();
const reviewController = require("../controllers/reviewController");
const { authenticate } = require("../middlewares/auth");

router.post("/", authenticate, reviewController.createReview);

router.get("/:futsalId", reviewController.getReviewsForFutsal);

router.delete("/:id", authenticate, reviewController.deleteReview);

module.exports = router;
