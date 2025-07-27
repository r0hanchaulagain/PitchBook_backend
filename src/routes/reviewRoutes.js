const express = require("express");
const router = express.Router();
const reviewController = require("../controllers/reviewController");
const { authenticate } = require("../middlewares/auth");

// POST /api/reviews - Create a new review for a futsal

router.post("/", authenticate, reviewController.createReview);

// GET /api/reviews/:futsalId - Get all reviews for a specific futsal
router.get("/:futsalId", reviewController.getReviewsForFutsal);

// DELETE /api/reviews/:id - Delete a review
router.delete("/:id", authenticate, reviewController.deleteReview);

module.exports = router;
