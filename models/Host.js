const mongoose = require('mongoose');

const HostSchema = new mongoose.Schema({
  name: { type: String, required: true },
  url: { type: String, required: true },
  username: { type: String },
  password: { type: String },
  type: { type: String, enum: ['xtream', 'm3u', 'other'], default: 'xtream' },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.model('Host', HostSchema);