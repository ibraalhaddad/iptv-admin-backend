const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    applicationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Application',
      default: null,
      index: true,
    },

    type: {
      type: String,
      index: true,
    },

    name: {
      type: String,
      required: true,
      trim: true,
    },

    data: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    sortOrder: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

schema.index({
  applicationId: 1,
  type: 1,
  sortOrder: 1,
});

module.exports = mongoose.model(
  'Entity',
  schema
);