const mongoose = require('mongoose');

const PaymentSchema = new mongoose.Schema({
  booking: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type: {
    type: String,
    enum: ['booking', 'registration', 'refund', 'payout'],
    required: true,
  },
  amount: { type: Number, required: true },
  currency: { type: String, default: 'NPR' },
  status: {
    type: String,
    enum: ['pending', 'completed', 'failed'],
    default: 'pending',
  },
  transactionId: { type: String },
  paymentMethod: { type: String },
  paidAt: { type: Date },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Payment', PaymentSchema);
