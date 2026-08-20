const express = require('express');
const router = express.Router();
const Offer = require('../models/Offer');
const Package = require('../models/Package');
const auth = require('../middleware/auth');
const upload = require('../middleware/upload');

// الحصول على جميع العروض (Admin)
router.get('/', auth, auth.requireRole('admin'), async (req, res) => {
  try {
    const offers = await Offer.find()
      .populate('package', 'name durationDays maxConnections price')
      .sort({ sortOrder: 1, createdAt: -1 });
    res.json(offers);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// إنشاء عرض جديد (Admin) مع دعم رفع صورة
router.post('/', auth, auth.requireRole('admin'), upload.single('image'), async (req, res) => {
  try {
    const {
      title, description, type, discountValue, packageId,
      startDate, endDate, isActive, ctaText, ctaLink, sortOrder
    } = req.body;

    if (!title || !type || !endDate) {
      return res.status(400).json({ message: 'العنوان والنوع وتاريخ النهاية مطلوبة' });
    }

    // التحقق من وجود الباقة إذا كان type مرتبط بباقة (percentage, fixed, free_days)
    let packageRef = null;
    if (packageId && ['percentage', 'fixed', 'free_days'].includes(type)) {
      const pkg = await Package.findById(packageId);
      if (!pkg) return res.status(404).json({ message: 'الباقة غير موجودة' });
      packageRef = packageId;
    }

    // إذا تم رفع صورة، نحفظ رابطها
    let imageUrl = '';
    if (req.file) {
      imageUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
    }

    const offer = new Offer({
      title,
      description,
      type,
      discountValue: discountValue || 0,
      package: packageRef,
      startDate: startDate || new Date(),
      endDate,
      isActive: isActive !== 'false' && isActive !== false,
      image: imageUrl,
      ctaText: ctaText || 'اشترك الآن',
      ctaLink: ctaLink || '',
      sortOrder: sortOrder || 0
    });

    await offer.save();
    res.status(201).json(offer);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// تعديل عرض (Admin) مع إمكانية تغيير الصورة
router.put('/:id', auth, auth.requireRole('admin'), upload.single('image'), async (req, res) => {
  try {
    const updateData = { ...req.body };

    // تحويل packageId إلى package إذا أرسل
    if (updateData.packageId) {
      const pkg = await Package.findById(updateData.packageId);
      if (!pkg) return res.status(404).json({ message: 'الباقة غير موجودة' });
      updateData.package = updateData.packageId;
      delete updateData.packageId;
    }

    // إذا تم رفع صورة جديدة، نضيف رابطها
    if (req.file) {
      updateData.image = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
    }

    // تحويل القيم النصية إلى أنواع صحيحة
    if (updateData.isActive !== undefined) {
      updateData.isActive = updateData.isActive === 'true' || updateData.isActive === true;
    }
    if (updateData.discountValue !== undefined) {
      updateData.discountValue = Number(updateData.discountValue);
    }
    if (updateData.sortOrder !== undefined) {
      updateData.sortOrder = Number(updateData.sortOrder);
    }

    const updated = await Offer.findByIdAndUpdate(
      req.params.id,
      updateData,
      { returnDocument: 'after' }
    ).populate('package', 'name durationDays maxConnections price');

    if (!updated) return res.status(404).json({ message: 'العرض غير موجود' });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// حذف عرض
router.delete('/:id', auth, auth.requireRole('admin'), async (req, res) => {
  try {
    const deleted = await Offer.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ message: 'العرض غير موجود' });
    res.json({ message: 'تم حذف العرض' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// نقطة عامة لجلب العروض النشطة لتطبيق المستخدم
router.get('/public/active', async (req, res) => {
  try {
    const now = new Date();
    const offers = await Offer.find({
      isActive: true,
      startDate: { $lte: now },
      endDate: { $gte: now }
    })
      .populate('package', 'name durationDays maxConnections price')
      .sort({ sortOrder: 1, createdAt: -1 });
    res.json(offers);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;