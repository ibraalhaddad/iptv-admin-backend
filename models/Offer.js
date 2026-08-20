const mongoose = require('mongoose');

const OfferSchema = new mongoose.Schema({
  title: { type: String, required: true },               // عنوان العرض
  description: { type: String, default: '' },           // وصف مختصر
  type: {
    type: String,
    enum: ['percentage', 'fixed', 'free_days', 'banner'],
    required: true
  },
  discountValue: { type: Number, default: 0 },           // قيمة الخصم (نسبة/مبلغ/أيام)
  package: { type: mongoose.Schema.Types.ObjectId, ref: 'Package', default: null },
  startDate: { type: Date, default: Date.now },
  endDate: { type: Date, required: true },
  isActive: { type: Boolean, default: true },
  image: { type: String, default: '' },                  // رابط الصورة
  ctaText: { type: String, default: 'اشترك الآن' },      // نص الزر
  ctaLink: { type: String, default: '' },                // رابط الزر (اختياري)
  sortOrder: { type: Number, default: 0 }                // ترتيب العرض
}, { timestamps: true });

module.exports = mongoose.model('Offer', OfferSchema);