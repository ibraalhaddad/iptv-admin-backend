const express = require('express');
const router = express.Router();
const Notification = require('../models/Notification');
const auth = require('../middleware/auth');

// الحصول على جميع الإشعارات (Admin)
router.get('/', auth, auth.requireRole('admin'), async (req, res) => {
  try {
    const notifications = await Notification.find().sort({ createdAt: -1 });
    res.json(notifications);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// إنشاء إشعار جديد (Admin)
router.post('/', auth, auth.requireRole('admin'), async (req, res) => {
  try {
    const { title, message, type, isActive } = req.body;
    if (!title || !message) {
      return res.status(400).json({ message: 'العنوان والرسالة مطلوبان' });
    }
    const notification = new Notification({ title, message, type, isActive });
    await notification.save();
    res.status(201).json(notification);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// تعديل إشعار
router.put('/:id', auth, auth.requireRole('admin'), async (req, res) => {
  try {
    const updated = await Notification.findByIdAndUpdate(req.params.id, req.body, { returnDocument: 'after' });
    if (!updated) return res.status(404).json({ message: 'إشعار غير موجود' });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// حذف إشعار
router.delete('/:id', auth, auth.requireRole('admin'), async (req, res) => {
  try {
    const deleted = await Notification.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ message: 'إشعار غير موجود' });
    res.json({ message: 'تم حذف الإشعار' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// نقطة عامة لجلب الإشعارات النشطة لتطبيق المستخدم
router.get('/public/active', async (req, res) => {
  try {
    const notifications = await Notification.find({ isActive: true }).sort({ createdAt: -1 });
    res.json(notifications);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;