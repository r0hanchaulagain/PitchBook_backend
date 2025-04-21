const mongoose = require('mongoose');

const FutsalSchema = new mongoose.Schema({
  name: { type: String, required: true },
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  location: {
    address: String,
    city: String,
    district: String,
    coordinates: {
      latitude: Number,
      longitude: Number,
    },
  },
  contactInfo: {
    phone: String,
    email: String,
    website: String,
  },
  operatingHours: {
    monday: { open: String, close: String },
    tuesday: { open: String, close: String },
    wednesday: { open: String, close: String },
    thursday: { open: String, close: String },
    friday: { open: String, close: String },
    saturday: { open: String, close: String },
    sunday: { open: String, close: String },
  },
  pricing: {
    basePrice: Number,
    weekendModifier: Number,
    timeModifiers: {
      morning: Number,
      afternoon: Number,
      evening: Number,
    },
  },
  amenities: [String],
  images: [String],
  reviews: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Review' }],
  bookings: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Booking' }],
  registrationFeeStatus: {
    paid: { type: Boolean, default: false },
    expiryDate: { type: Date },
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  isActive: { type: Boolean, default: true },
});

module.exports = mongoose.model('Futsal', FutsalSchema);
