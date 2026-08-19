const mongoose = require('mongoose');

const PackageSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  durationDays: { type: Number, required: true },
  maxConnections: { type: Number, required: true, default: 1 },
  type: { type: String, enum: ['live', 'vod', 'series', 'full'], default: 'full' },
  price: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.model('Package', PackageSchema);