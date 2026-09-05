// المسار: models/Theme.js

const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    themeId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },

    name: {
      type: String,
      required: true,
      trim: true,
    },

    previewImage: {
      type: String,
      default: '',
      trim: true,
    },

    description: {
      type: String,
      default: '',
      trim: true,
    },

    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },

    sortOrder: {
      type: Number,
      default: 0,
      index: true,
    },

    /*
     * الثيم الافتراضي العام.
     * يوجد ثيم واحد منطقيًا فقط بهذه القيمة.
     */
    isGlobalDefault: {
      type: Boolean,
      default: false,
      index: true,
    },

    /*
     * إعدادات إضافية للثيم مستقبلًا.
     */
    config: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

schema.index({
  sortOrder: 1,
  createdAt: -1,
});

schema.index({
  isGlobalDefault: 1,
  isActive: 1,
});

module.exports =
  mongoose.models.Theme ||
  mongoose.model('Theme', schema);