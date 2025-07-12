const mongoose = require("mongoose");

const FutsalSchema = new mongoose.Schema({
	name: { type: String, required: true },
	owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
	operatingHours: {
		weekdays: {
			open: String,
			close: String,
		},
		weekends: {
			open: String,
			close: String,
		},
		holidays: {
			open: String,
			close: String,
		},
	},
	amenities: [String],
	pricing: {
		basePrice: { type: Number, required: true },
		modifiers: {
			timeOfDay: {
				enabled: { type: Boolean, default: false },
				morning: { type: Number, default: 0 }, // e.g. 0.05 for 5%
				midday: { type: Number, default: 0 },
				evening: { type: Number, default: 0 },
			},
			holiday: {
				enabled: { type: Boolean, default: false },
				percentage: { type: Number, default: 0 },
			},
			weekend: {
				enabled: { type: Boolean, default: false },
				percentage: { type: Number, default: 0 },
			},
			location: {
				enabled: { type: Boolean, default: false },
				near: { type: Number, default: 0 },
				far: { type: Number, default: 0 },
			},
		},
	},
	location: {
		address: String,
		city: String,
		coordinates: {
			type: { type: String, enum: ["Point"], default: "Point" },
			coordinates: { type: [Number], required: true }, // [longitude, latitude]
		},
	},
	contactInfo: {
		phone: String,
		email: String,
		website: String,
	},

	images: [String],
	info: { type: String, required: true },
	side: { type: Number, enum: [5, 6, 7], default: 5 },
	reviews: [{ type: mongoose.Schema.Types.ObjectId, ref: "Review" }],
	bookings: [{ type: mongoose.Schema.Types.ObjectId, ref: "Booking" }],
	closures: [
		{
			date: Date,
			reason: String,
		},
	],
	createdAt: { type: Date, default: Date.now },
	updatedAt: { type: Date, default: Date.now },
	isActive: { type: Boolean, default: false },
});

// Add 2dsphere index for geospatial queries
FutsalSchema.index({ "location.coordinates": "2dsphere" });

module.exports = mongoose.model("Futsal", FutsalSchema);
