const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const UserSchema = new mongoose.Schema({
  fullName: { type: String, required: true },
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  phone: { type: String, unique: true },
  password: { type: String, required: true },
  role: {
    type: String,
    enum: ['admin', 'user', 'futsalOwner'],
    required: true,
  },
  profileImage: { type: String },
  // Only for normal users (optional)
  favoritesFutsal: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Futsal' }],
  bookingHistory: {
    type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Booking' }],
    required: false,
    default: undefined
  },
  // Only for futsal owners (optional)
  isActiveOwner: { type: Boolean, required: false, default: undefined },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  isActive: { type: Boolean, default: true },
  lastLogin: { type: Date },
  resetPasswordToken: { type: String },
  resetPasswordExpires: { type: Date },
  // Security: Track login attempts and lockout
  loginAttempts: { type: Number, default: 0 },
  lockUntil: { type: Date },
});

UserSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

UserSchema.methods.comparePassword = function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('User', UserSchema);
