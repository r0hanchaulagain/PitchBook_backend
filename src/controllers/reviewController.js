const Review = require("../models/Review");
const Booking = require("../models/Booking");

// POST /api/reviews - Create review for a futsal (user must have a booking)
exports.createReview = async (req, res) => {
	try {
		const { futsalId, rating, feedback } = req.body;
		if (!futsalId || !rating || !feedback) {
			return res.status(400).json({ message: "Missing required fields" });
		}
		// Only allow if user has a completed or confirmed booking for this futsal
		const booking = await Booking.findOne({
			futsal: futsalId,
			user: req.user._id,
			status: { $in: ["completed", "confirmed"] },
		});
		if (!booking) {
			return res
				.status(403)
				.json({ message: "You can only review futsals you have booked." });
		}
		// Only one review per user per futsal
		const existing = await Review.findOne({
			futsal: futsalId,
			user: req.user._id,
		});
		if (existing) {
			return res
				.status(400)
				.json({ message: "You have already reviewed this futsal." });
		}
		const review = await Review.create({
			futsal: futsalId,
			user: req.user._id,
			rating,
			feedback,
		});
		res.status(201).json(review);
	} catch (err) {
		res.status(500).json({ message: err.message });
	}
};

// GET /api/reviews/:futsalId - Get all reviews for a futsal (with pagination and filtering)
exports.getReviewsForFutsal = async (req, res) => {
	try {
		const { futsalId } = req.params;
		const { page = 1, limit = 10, rating } = req.query;
		const filter = { futsal: futsalId };
		if (rating) filter.rating = Number(rating);
		const skip = (parseInt(page) - 1) * parseInt(limit);
		const total = await Review.countDocuments(filter);
		const reviews = await Review.find(filter)
			.populate("user", "fullName")
			.sort({ createdAt: -1 })
			.skip(skip)
			.limit(parseInt(limit));
		res.json({ total, page: parseInt(page), limit: parseInt(limit), reviews });
	} catch (err) {
		res.status(500).json({ message: err.message });
	}
};

// DELETE /api/reviews/:id - Delete own review
exports.deleteReview = async (req, res) => {
	try {
		const review = await Review.findById(req.params.id);
		if (!review) {
			return res.status(404).json({ message: "Review not found" });
		}
		if (review.user.toString() !== req.user._id.toString()) {
			return res.status(403).json({ message: "Not authorized" });
		}
		await review.deleteOne();
		res.json({ message: "Review deleted" });
	} catch (err) {
		res.status(500).json({ message: err.message });
	}
};
