const mongoose = require('mongoose');

const PackageSchema = new mongoose.Schema({
  name: { type: String, required: true },
  code: { type: String, unique: true, sparse: true }, // كود معرف فريد
  description: { type: String, default: '' },
  durationDays: { type: Number, required: true },
  maxConnections: { type: Number, required: true, default: 1 },
  type: { type: String, enum: ['live', 'vod', 'series', 'full'], default: 'full' },
  price: { type: Number, default: 0 },
  currency: { type: String, default: 'USD' },
  features: [{ type: String }],
  isActive: { type: Boolean, default: true },
  sortOrder: { type: Number, default: 0 },
}, { timestamps: true });

module.exports = mongoose.model('Package', PackageSchema);