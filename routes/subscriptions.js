const express = require('express');
const router = express.Router();
const Subscription = require('../models/Subscription');
const Package = require('../models/Package');
const User = require('../models/User');
const auth = require('../middleware/auth');

// الحصول على جميع الاشتراكات (Admin)
router.get('/', auth, auth.requireRole('admin'), async (req, res) => {
  try {
    const subscriptions = await Subscription.find()
      .populate('user', 'username email')
      .populate('package', 'name durationDays maxConnections')
      .populate('host', 'name url');
    res.json(subscriptions);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// إنشاء اشتراك جديد (Admin)
router.post('/', auth, auth.requireRole('admin'), async (req, res) => {
  try {
    const { userId, packageId, hostId, startDate, notes } = req.body;

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const pkg = await Package.findById(packageId);
    if (!pkg) return res.status(404).json({ message: 'Package not found' });

    const start = startDate ? new Date(startDate) : new Date();
    const end = new Date(start);
    end.setDate(end.getDate() + pkg.durationDays);

    const subscription = new Subscription({
      user: userId,
      package: packageId,
      host: hostId || null,
      startDate: start,
      endDate: end,
      status: 'active',
      notes
    });

    await subscription.save();
    res.status(201).json(subscription);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// تجديد اشتراك
router.put('/:id/renew', auth, auth.requireRole('admin'), async (req, res) => {
  try {
    const subscription = await Subscription.findById(req.params.id);
    if (!subscription) return res.status(404).json({ message: 'Subscription not found' });

    const pkg = await Package.findById(subscription.package);
    if (!pkg) return res.status(404).json({ message: 'Package not found' });

    const newEnd = new Date(subscription.endDate);
    newEnd.setDate(newEnd.getDate() + pkg.durationDays);

    subscription.endDate = newEnd;
    subscription.status = 'active';
    await subscription.save();

    res.json(subscription);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// تغيير حالة الاشتراك
router.put('/:id/status', auth, auth.requireRole('admin'), async (req, res) => {
  try {
    const { status } = req.body;
    if (!['active', 'expired', 'suspended', 'cancelled'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }
    const subscription = await Subscription.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    );
    if (!subscription) return res.status(404).json({ message: 'Subscription not found' });
    res.json(subscription);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// حذف اشتراك
router.delete('/:id', auth, auth.requireRole('admin'), async (req, res) => {
  try {
    const deleted = await Subscription.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ message: 'Subscription not found' });
    res.json({ message: 'Subscription deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;