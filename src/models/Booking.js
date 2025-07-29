const mongoose = require("mongoose");

const teamBUserSchema = new mongoose.Schema({
	user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
	name: { type: String },
	email: { type: String },
	phone: { type: String },
	joinedAt: { type: Date },
});

const BookingSchema = new mongoose.Schema({
	user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
	futsal: {
		type: mongoose.Schema.Types.ObjectId,
		ref: "Futsal",
		required: true,
	},
	date: { type: Date, required: true },
	startTime: { type: String, required: true },
	endTime: { type: String, required: true },
	price: { type: Number, required: true },
	teamA: { type: Boolean, required: true },
	teamB: { type: Boolean, required: true },
	teamBUser: { type: teamBUserSchema },
	bookingType: {
		type: String,
		enum: ["full", "partial"],
		required: true,
	},
	status: {
		type: String,
		enum: ["pending", "confirmed", "cancelled", "completed"],
		default: "pending",
	},
	paymentStatus: {
		type: String,
		enum: ["pending", "pending_cash", "paid", "failed", "refunded"],
		default: "pending",
	},
	paymentDetails: {
		paymentMethod: { type: String, enum: ["khalti", "cash"] },
		paymentDate: { type: Date },
		pidx: { type: String, optional: true },
	},
	transaction: {
		type: mongoose.Schema.Types.ObjectId,
		ref: "Transaction",
	},
	isPaid: { type: Boolean, default: false },
	paymentExpiresAt: { type: Date },
	competingBookings: [
		{
			type: mongoose.Schema.Types.ObjectId,
			ref: "Booking",
		},
	],
	createdAt: { type: Date, default: Date.now },
	updatedAt: { type: Date, default: Date.now },
});

BookingSchema.pre("save", function (next) {
	this.updatedAt = new Date();
	next();
});

module.exports = mongoose.model("Booking", BookingSchema);
