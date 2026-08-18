const mongoose = require('mongoose');

const planSchema = new mongoose.Schema({
  name: { type: String, required: true },
  code: { type: String, required: true, unique: true }, // مثل monthly, yearly, trial
  durationDays: { type: Number, required: true },
  price: { type: Number, default: 0 },
  currency: { type: String, default: 'USD' },
  isActive: { type: Boolean, default: true },
  sortOrder: { type: Number, default: 0 },
});

module.exports = mongoose.model('Plan', planSchema);