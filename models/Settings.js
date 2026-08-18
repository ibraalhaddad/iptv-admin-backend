const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema({
  host: {
    type: String,
    required: true,
    default: 'http://example.com:8080'
  },
  theme: {
    type: String,
    enum: ['dark', 'light', 'oled', 'purple'],
    default: 'dark'
  }
}, { timestamps: true });

module.exports = mongoose.model('Settings', settingsSchema);