const express = require('express');
const router = express.Router();
const Line = require('../models/Line');
const Package = require('../models/Package');
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

// إنشاء خط جديد (Admin)
router.post('/', auth, auth.requireRole('admin'), async (req, res) => {
  try {
    const { username, password, packageId, startDate, maxConnections, notes } = req.body;
    if (!username || !password || !packageId) {
      return res.status(400).json({ message: 'Username, password, and package are required' });
    }

    const pkg = await Package.findById(packageId);
    if (!pkg) return res.status(404).json({ message: 'Package not found' });

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
      notes
    });

    await line.save();
    res.status(201).json(line);
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
    const line = await Line.findByIdAndUpdate(req.params.id, { status }, { new: true });
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