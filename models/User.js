const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      unique: true,
      index: true,
    },

    passwordHash: {
      type: String,
      required: true,
      select: true,
    },

    displayName: {
      type: String,
      default: '',
      trim: true,
    },

    role: {
      type: String,
      enum: ['super_admin', 'app_owner'],
      default: 'app_owner',
      index: true,
    },

    applicationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Application',
      default: null,
      index: true,
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    lastLoginAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

schema.index(
  { applicationId: 1, role: 1 }
);

module.exports = mongoose.model('User', schema);