const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  slug: { type: String, required: true, unique: true, index: true, trim: true, lowercase: true },
  description: { type: String, default: '' },
  logoUrl: { type: String, default: '' },
  isActive: { type: Boolean, default: true },
  settings: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { timestamps: true });

module.exports = mongoose.model('Application', schema);
