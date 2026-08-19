const express = require('express');
const router = express.Router();
const Package = require('../models/Package');
const auth = require('../middleware/auth');

// الحصول على جميع الباقات
router.get('/', auth, async (req, res) => {
  try {
    const packages = await Package.find().sort({ sortOrder: 1, createdAt: -1 });
    res.json(packages);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// إنشاء باقة (Admin)
router.post('/', auth, auth.requireRole('admin'), async (req, res) => {
  try {
    const {
      name, code, description, durationDays, maxConnections,
      type, price, currency, features, isActive, sortOrder
    } = req.body;

    if (!name || !durationDays || !maxConnections) {
      return res.status(400).json({ message: 'Name, durationDays and maxConnections are required' });
    }

    // التحقق من وجود كود مشابه
    if (code) {
      const existing = await Package.findOne({ code });
      if (existing) return res.status(400).json({ message: 'Package code already exists' });
    }

    const pkg = new Package({
      name,
      code,
      description,
      durationDays,
      maxConnections,
      type,
      price,
      currency,
      features,
      isActive,
      sortOrder
    });
    await pkg.save();
    res.status(201).json(pkg);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// تعديل باقة
router.put('/:id', auth, auth.requireRole('admin'), async (req, res) => {
  try {
    const updated = await Package.findByIdAndUpdate(req.params.id, req.body, { returnDocument: 'after' });
    if (!updated) return res.status(404).json({ message: 'Package not found' });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// حذف باقة
router.delete('/:id', auth, auth.requireRole('admin'), async (req, res) => {
  try {
    const deleted = await Package.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ message: 'Package not found' });
    res.json({ message: 'Package deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;