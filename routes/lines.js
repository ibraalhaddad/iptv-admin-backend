const express = require('express');
const router = express.Router();
const Line = require('../models/Line');
const Package = require('../models/Package');
const Coupon = require('../models/Coupon');
const auth = require('../middleware/auth');

// الحصول على جميع الخطوط (Admin)
router.get('/', auth, auth.requireRole('admin'), async (req, res) => {
  try {
    const lines = await Line.find().populate('package', 'name durationDays maxConnections');
    res.json(lines);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// إنشاء خط جديد مع دعم الكوبون
router.post('/', auth, auth.requireRole('admin'), async (req, res) => {
  try {
    const {
      username,
      password,
      packageId,
      startDate,
      maxConnections,
      notes,
      autoRenew,
      amountPaid,
      couponCode,
      devices
    } = req.body;

    if (!username || !password || !packageId) {
      return res.status(400).json({ message: 'Username, password and package are required' });
    }

    const pkg = await Package.findById(packageId);
    if (!pkg) return res.status(404).json({ message: 'Package not found' });

    // معالجة الكوبون إن وجد
    let couponUsed = '';
    let finalAmountPaid = amountPaid || pkg.price;
    if (couponCode) {
      const coupon = await Coupon.findOne({ code: couponCode, isActive: true });
      if (!coupon) return res.status(400).json({ message: 'Invalid coupon code' });

      // التحقق من الصلاحية
      const now = new Date();
      if (now < coupon.validFrom || now > coupon.validUntil) {
        return res.status(400).json({ message: 'Coupon expired' });
      }
      if (coupon.usedCount >= coupon.maxUses) {
        return res.status(400).json({ message: 'Coupon usage limit reached' });
      }

      // تطبيق الخصم
      if (coupon.discountType === 'percentage') {
        finalAmountPaid = finalAmountPaid * (1 - coupon.discountValue / 100);
      } else if (coupon.discountType === 'fixed') {
        finalAmountPaid = Math.max(0, finalAmountPaid - coupon.discountValue);
      }

      couponUsed = coupon.code;
      coupon.usedCount += 1;
      await coupon.save();
    }

    const start = startDate ? new Date(startDate) : new Date();
    const end = new Date(start);
    end.setDate(end.getDate() + pkg.durationDays);

    const line = new Line({
      username,
      password,
      package: packageId,
      startDate: start,
      endDate: end,
      maxConnections: maxConnections || pkg.maxConnections,
      status: 'active',
      notes,
      autoRenew: autoRenew || false,
      amountPaid: finalAmountPaid,
      couponUsed,
      devices: devices || []
    });

    await line.save();
    res.status(201).json(line);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// تسجيل جهاز جديد لخط
router.post('/:id/register-device', auth, auth.requireRole('admin'), async (req, res) => {
  try {
    const { deviceId } = req.body;
    if (!deviceId) return res.status(400).json({ message: 'Device ID is required' });

    const line = await Line.findById(req.params.id);
    if (!line) return res.status(404).json({ message: 'Line not found' });

    if (line.status !== 'active') {
      return res.status(403).json({ message: 'Line is not active' });
    }

    if (line.devices.includes(deviceId)) {
      return res.status(400).json({ message: 'Device already registered' });
    }

    if (line.devices.length >= line.maxConnections) {
      return res.status(403).json({ message: 'Maximum device limit reached' });
    }

    line.devices.push(deviceId);
    await line.save();

    res.json({ message: 'Device registered successfully', devices: line.devices });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// إزالة جهاز من خط
router.delete('/:id/device/:deviceId', auth, auth.requireRole('admin'), async (req, res) => {
  try {
    const line = await Line.findById(req.params.id);
    if (!line) return res.status(404).json({ message: 'Line not found' });

    line.devices = line.devices.filter(d => d !== req.params.deviceId);
    await line.save();

    res.json({ message: 'Device removed', devices: line.devices });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// تجديد خط
router.put('/:id/renew', auth, auth.requireRole('admin'), async (req, res) => {
  try {
    const line = await Line.findById(req.params.id);
    if (!line) return res.status(404).json({ message: 'Line not found' });

    const pkg = await Package.findById(line.package);
    if (!pkg) return res.status(404).json({ message: 'Package not found' });

    const newEnd = new Date(line.endDate);
    newEnd.setDate(newEnd.getDate() + pkg.durationDays);

    line.endDate = newEnd;
    line.status = 'active';
    await line.save();

    res.json(line);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// تغيير حالة الخط
router.put('/:id/status', auth, auth.requireRole('admin'), async (req, res) => {
  try {
    const { status } = req.body;
    if (!['active', 'expired', 'suspended', 'cancelled'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }
    const line = await Line.findByIdAndUpdate(req.params.id, { status }, { returnDocument: 'after' });
    if (!line) return res.status(404).json({ message: 'Line not found' });
    res.json(line);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// حذف خط
router.delete('/:id', auth, auth.requireRole('admin'), async (req, res) => {
  try {
    const deleted = await Line.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ message: 'Line not found' });
    res.json({ message: 'Line deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;