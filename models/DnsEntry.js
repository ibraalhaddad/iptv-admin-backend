// المسار: models/DnsEntry.js

const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    applicationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Application',
      required: true,
      index: true,
    },

    name: {
      type: String,
      required: true,
      trim: true,
    },

    url: {
      type: String,
      required: true,
      trim: true,
    },

    normalizedUrl: {
      type: String,
      required: true,
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

    /*
     * آخر نتيجة للفحص
     */
    lastCheck: {
      checkedAt: {
        type: Date,
        default: null,
      },

      status: {
        type: String,
        enum: [
          'unknown',
          'online',
          'offline',
          'error',
        ],
        default: 'unknown',
      },

      reachable: {
        type: Boolean,
        default: false,
      },

      healthy: {
        type: Boolean,
        default: false,
      },

      latencyMs: {
        type: Number,
        default: null,
      },

      httpStatus: {
        type: Number,
        default: null,
      },

      responseType: {
        type: String,
        default: '',
      },

      error: {
        type: String,
        default: '',
      },

      method: {
        type: String,
        default: '',
      },
    },
  },
  {
    timestamps: true,
  }
);

/*
 * يمنع إضافة نفس الرابط مرتين داخل التطبيق نفسه.
 */
schema.index(
  {
    applicationId: 1,
    normalizedUrl: 1,
  },
  {
    unique: true,
  }
);

schema.index({
  applicationId: 1,
  isActive: 1,
  createdAt: -1,
});

schema.index({
  'lastCheck.status': 1,
});

schema.index({
  'lastCheck.checkedAt': -1,
});

module.exports =
  mongoose.models.DnsEntry ||
  mongoose.model(
    'DnsEntry',
    schema
  );