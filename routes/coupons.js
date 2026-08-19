const express = require('express');
const router = express.Router();
const Coupon = require('../models/Coupon');
const auth = require('../middleware/auth');

// الحصول على جميع الكوبونات (Admin)
router.get('/', auth, auth.requireRole('admin'), async (req, res) => {
  try {
    const coupons = await Coupon.find().sort({ createdAt: -1 });
    res.json(coupons);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// إنشاء كوبون جديد (Admin)
router.post('/', auth, auth.requireRole('admin'), async (req, res) => {
  try {
    const { code, discountType, discountValue, maxUses, validFrom, validUntil, isActive } = req.body;
    if (!code || !discountType || !discountValue || !validUntil) {
      return res.status(400).json({ message: 'Code, discountType, discountValue and validUntil are required' });
    }

    const existing = await Coupon.findOne({ code });
    if (existing) return res.status(400).json({ message: 'Coupon code already exists' });

    const coupon = new Coupon({
      code,
      discountType,
      discountValue,
      maxUses: maxUses || 1,
      validFrom: validFrom || new Date(),
      validUntil,
      isActive: isActive !== false
    });

    await coupon.save();
    res.status(201).json(coupon);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// تعديل كوبون
router.put('/:id', auth, auth.requireRole('admin'), async (req, res) => {
  try {
    const updated = await Coupon.findByIdAndUpdate(req.params.id, req.body, { returnDocument: 'after' });
    if (!updated) return res.status(404).json({ message: 'Coupon not found' });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// حذف كوبون
router.delete('/:id', auth, auth.requireRole('admin'), async (req, res) => {
  try {
    const deleted = await Coupon.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ message: 'Coupon not found' });
    res.json({ message: 'Coupon deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;