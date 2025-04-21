const mongoose = require('mongoose');

const FutsalSchema = new mongoose.Schema({
  name: { type: String, required: true },
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  location: {
    address: String,
    city: String,
    district: String,
    coordinates: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], required: true }, // [longitude, latitude]
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
    basePrice: { type: Number, required: true },
    rules: [
      {
        day: {
          type: String,
          enum: [
            'monday',
            'tuesday',
            'wednesday',
            'thursday',
            'friday',
            'saturday',
            'sunday',
            'holiday',
            'any',
          ],
          default: 'any',
        },
        start: String, // "HH:MM"
        end: String, // "HH:MM"
        price: Number,
      },
    ],
  },
  amenities: [String],
  images: [String],
  reviews: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Review' }],
  bookings: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Booking' }],
  registrationFeeStatus: {
    paid: { type: Boolean, default: false },
    expiryDate: { type: Date },
  },
  closures: [
    {
      date: Date,
      reason: String,
    },
  ],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  isActive: { type: Boolean, default: true },
});

// Add 2dsphere index for geospatial queries
FutsalSchema.index({ 'location.coordinates': '2dsphere' });

module.exports = mongoose.model('Futsal', FutsalSchema);
