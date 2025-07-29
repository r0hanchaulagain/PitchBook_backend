const mongoose = require("mongoose");

const PaymentSchema = new mongoose.Schema({
	booking: { type: mongoose.Schema.Types.ObjectId, ref: "Booking" },
	user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
	futsal: {
		type: mongoose.Schema.Types.ObjectId,
		ref: "Futsal",
		required: true,
	},
	type: {
		type: String,
		enum: ["booking", "registration", "refund", "payout"],
		required: true,
	},
	amount: { type: Number, required: true },
	currency: { type: String, default: "NPR" },
	status: {
		type: String,
		enum: ["pending", "completed", "failed"],
		default: "pending",
	},
	transactionId: { type: String },
	paymentMethod: { type: String, enum: ["khalti", "cash"], required: true },
	paidAt: { type: Date },
	metadata: { type: Object, default: {} },
	createdAt: { type: Date, default: Date.now },
	updatedAt: { type: Date, default: Date.now },
});

PaymentSchema.pre("save", function (next) {
	this.updatedAt = new Date();
	next();
});

module.exports = mongoose.model("Payment", PaymentSchema);
