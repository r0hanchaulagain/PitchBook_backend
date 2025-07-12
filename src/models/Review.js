const mongoose = require("mongoose");

const ReviewSchema = new mongoose.Schema({
	futsal: {
		type: mongoose.Schema.Types.ObjectId,
		ref: "Futsal",
		required: true,
	},
	user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
	rating: { type: Number, min: 1, max: 5, required: true },
	feedback: { type: String, required: true },
	createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Review", ReviewSchema);
