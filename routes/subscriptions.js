const express = require('express');
const router = express.Router();
const Subscription = require('../models/Subscription');
const Plan = require('../models/Plan');
const User = require('../models/User');
const auth = require('../middleware/auth');
const adminAuth = require('../middleware/adminAuth');

// الحصول على جميع الخطط
router.get('/plans', async (req, res) => {
  try {
    const plans = await Plan.find({ isActive: true }).sort({ sortOrder: 1 });
    res.json(plans);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// التحقق من حالة الاشتراك للمستخدم الحالي
router.get('/status', auth, async (req, res) => {
  try {
    const sub = await Subscription.findOne({ user: req.user.userId })
      .populate('plan')
      .sort({ createdAt: -1 });

    if (!sub) return res.json({ hasSubscription: false });

    const now = new Date();
    if (sub.status === 'active' && sub.endDate < now) {
      sub.status = 'expired';
      await sub.save();
    }

    res.json({
      hasSubscription: true,
      status: sub.status,
      plan: sub.plan?.name,
      endDate: sub.endDate,
      daysRemaining: Math.ceil((sub.endDate - now) / (1000 * 60 * 60 * 24)),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// تفعيل اشتراك (للمستخدم)
router.post('/activate', auth, async (req, res) => {
  try {
    const { planCode } = req.body;
    const plan = await Plan.findOne({ code: planCode, isActive: true });
    if (!plan) return res.status(404).json({ message: 'الخطة غير موجودة' });

    const startDate = new Date();
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + plan.durationDays);

    let sub = await Subscription.findOne({ user: req.user.userId }).sort({ createdAt: -1 });

    if (sub && sub.status === 'active' && sub.endDate > startDate) {
      // تمديد
      startDate.setTime(sub.endDate.getTime());
      endDate.setTime(startDate.getTime() + plan.durationDays * 86400000);
    }

    sub = new Subscription({
      user: req.user.userId,
      plan: plan._id,
      startDate,
      endDate,
      status: 'active',
      amountPaid: plan.price,
    });
    await sub.save();

    res.json({ message: 'تم تفعيل الاشتراك', endDate });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// إدارة الاشتراكات (للمدير)
router.get('/admin', adminAuth, async (req, res) => {
  try {
    const subs = await Subscription.find()
      .populate('user', 'username email')
      .populate('plan', 'name durationDays price')
      .sort({ createdAt: -1 });
    res.json(subs);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// تعديل حالة اشتراك (للمدير)
router.put('/admin/:id', adminAuth, async (req, res) => {
  try {
    const { status, endDate } = req.body;
    const sub = await Subscription.findById(req.params.id);
    if (!sub) return res.status(404).json({ message: 'غير موجود' });
    if (status) sub.status = status;
    if (endDate) sub.endDate = new Date(endDate);
    await sub.save();
    res.json(sub);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;