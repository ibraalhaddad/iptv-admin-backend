const mongoose = require('mongoose');

const SubscriptionSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  package: { type: mongoose.Schema.Types.ObjectId, ref: 'Package', required: true },
  host: { type: mongoose.Schema.Types.ObjectId, ref: 'Host' },
  startDate: { type: Date, default: Date.now },
  endDate: { type: Date, required: true },
  status: { type: String, enum: ['active', 'expired', 'suspended', 'cancelled'], default: 'active' },
  notes: { type: String }
}, { timestamps: true });

module.exports = mongoose.model('Subscription', SubscriptionSchema);