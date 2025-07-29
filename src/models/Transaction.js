const mongoose = require("mongoose");

const transactionSchema = new mongoose.Schema({
	user: {
		type: mongoose.Schema.Types.ObjectId,
		ref: "User",
		required: true,
	},
	booking: {
		type: mongoose.Schema.Types.ObjectId,
		ref: "Booking",
		required: true,
	},
	amount: {
		type: Number,
		required: true,
		min: 0,
	},
	status: {
		type: String,
		enum: ["pending", "completed", "failed", "refunded"],
		default: "pending",
	},
	paymentMethod: {
		type: String,
		enum: ["khalti", "cash"],
		required: true,
	},
	transactionId: {
		type: String,
		unique: true,
	},
	paymentDetails: {
		type: Object,
		default: {},
	},
	createdAt: {
		type: Date,
		default: Date.now,
	},
	updatedAt: {
		type: Date,
		default: Date.now,
	},
});

transactionSchema.pre("save", function (next) {
	this.updatedAt = new Date();
	next();
});

const Transaction = mongoose.model("Transaction", transactionSchema);

module.exports = Transaction;
