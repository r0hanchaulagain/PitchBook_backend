const mongoose = require("mongoose");

const contactSchema = new mongoose.Schema({
	name: {
		type: String,
		required: [true, "Name is required"],
		trim: true,
	},
	email: {
		type: String,
		required: [true, "Email is required"],
		trim: true,
		lowercase: true,
		match: [/^\S+@\S+\.\S+$/, "Please enter a valid email address"],
	},
	subject: {
		type: String,
		required: [true, "Subject is required"],
		trim: true,
	},
	message: {
		type: String,
		required: [true, "Message is required"],
		trim: true,
	},
	createdAt: {
		type: Date,
		default: Date.now,
	},
	status: {
		type: String,
		enum: ["pending", "in_progress", "resolved"],
		default: "pending",
	},
});

module.exports = mongoose.model("Contact", contactSchema);
