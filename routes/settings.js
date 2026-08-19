const express = require('express');
const router = express.Router();
const Setting = require('../models/Setting');
const auth = require('../middleware/auth');

// الحصول على جميع الإعدادات (لأي مستخدم مسجل)
router.get('/', auth, async (req, res) => {
  try {
    const settings = await Setting.find();
    const result = {};
    settings.forEach(s => { result[s.key] = s.value; });
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// الحصول على معلومات السيرفر الخاصة بالموزع (للعرض في لوحة التحكم)
router.get('/reseller-info', auth, async (req, res) => {
  try {
    const settings = await Setting.find({
      key: { $in: ['reseller_host_url', 'reseller_username', 'reseller_password'] }
    });
    const info = {};
    settings.forEach(s => { info[s.key] = s.value; });
    res.json(info);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// تحديث الإعدادات (Admin)
router.put('/', auth, auth.requireRole('admin'), async (req, res) => {
  try {
    const updates = req.body;
    for (const [key, value] of Object.entries(updates)) {
      await Setting.findOneAndUpdate(
        { key },
        { $set: { value } },
        { upsert: true, new: true }
      );
    }
    res.json({ message: 'Settings updated' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;