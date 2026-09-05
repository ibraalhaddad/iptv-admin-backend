// المسار: models/Notification.js

const mongoose = require('mongoose');

const notificationSchema =
  new mongoose.Schema(
    {
      applicationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Application',
        required: true,
        index: true,
      },

      /*
       * معرف متسلسل داخل كل تطبيق:
       *
       * التطبيق A:
       * 1
       * 2
       * 3
       *
       * التطبيق B:
       * 1
       * 2
       * 3
       */
      notificationId: {
        type: Number,
        required: true,
        min: 1,
      },

      title: {
        type: String,
        required: true,
        trim: true,
      },

      message: {
        type: String,
        required: true,
        trim: true,
      },

      imageUrl: {
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

      /*
       * draft = لم يتم الإرسال
       * sent  = تم الإرسال ولا يمكن إرساله مرة أخرى
       */
      status: {
        type: String,
        enum: [
          'draft',
          'sent',
        ],
        default: 'draft',
        index: true,
      },

      sentAt: {
        type: Date,
        default: null,
      },

      sentCount: {
        type: Number,
        default: 0,
        min: 0,
      },
    },
    {
      timestamps: true,
    }
  );

/*
 * يمنع تكرار notificationId داخل التطبيق نفسه.
 *
 * استخدمنا partial index حتى لا تسبب
 * السجلات القديمة التي لا تحتوي notificationId
 * مشكلة.
 */
notificationSchema.index(
  {
    applicationId: 1,
    notificationId: 1,
  },
  {
    unique: true,
    partialFilterExpression: {
      notificationId: {
        $type: 'number',
      },
    },
  }
);

notificationSchema.index({
  applicationId: 1,
  status: 1,
  createdAt: -1,
});

module.exports =
  mongoose.model(
    'Notification',
    notificationSchema
  );