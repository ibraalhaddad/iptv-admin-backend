const mongoose = require('mongoose');

const LineSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  package: { type: mongoose.Schema.Types.ObjectId, ref: 'Package', required: true },
  startDate: { type: Date, default: Date.now },
  endDate: { type: Date, required: true },
  maxConnections: { type: Number, required: true },
  status: { type: String, enum: ['active', 'expired', 'suspended', 'cancelled'], default: 'active' },
  notes: { type: String },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Line', LineSchema);