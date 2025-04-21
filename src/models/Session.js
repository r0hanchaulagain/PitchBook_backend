const mongoose = require('mongoose');

const SessionSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  token: { type: String, required: true },
  createdAt: { type: Date, default: Date.now, expires: '7d' }, // expires in 7 days
});

module.exports = mongoose.model('Session', SessionSchema);
