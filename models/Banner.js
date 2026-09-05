// المسار: models/Banner.js

const mongoose = require('mongoose');

const bannerSchema = new mongoose.Schema(
  {
    // رقم تسلسلي ظاهر للمستخدم
    // 1, 2, 3, 4...
    bannerId: {
      type: Number,
      required: true,
      unique: true,
      index: true,
    },

    applicationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Application',
      required: true,
      index: true,
    },

    title: {
      type: String,
      required: true,
      trim: true,
    },

    description: {
      type: String,
      default: '',
      trim: true,
    },

    imageUrl: {
      type: String,
      required: true,
      trim: true,
    },

    buttonText: {
      type: String,
      default: '',
      trim: true,
    },

    actionType: {
      type: String,
      enum: [
        'none',
        'movie',
        'series',
        'category',
        'url',
      ],
      default: 'none',
    },

    actionId: {
      type: String,
      default: '',
      trim: true,
    },

    sortOrder: {
      type: Number,
      default: 0,
      min: 0,
    },

    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },

    startAt: {
      type: Date,
      default: null,
    },

    endAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

/*
 * ترتيب الإعلانات داخل التطبيق.
 */
bannerSchema.index({
  applicationId: 1,
  isActive: 1,
  sortOrder: 1,
});

/*
 * منع تكرار رقم الإعلان داخل نفس التطبيق.
 */
bannerSchema.index(
  {
    applicationId: 1,
    bannerId: 1,
  },
  {
    unique: true,
  }
);

module.exports = mongoose.model(
  'Banner',
  bannerSchema
);