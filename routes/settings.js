const express = require('express');
const router = express.Router();
const Setting = require('../models/Setting');
const auth = require('../middleware/auth');
const upload = require('../middleware/upload');

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

// نقطة نهاية عامة لجلب إعدادات تطبيق المستخدم (بدون مصادقة)
router.get('/public/app-config', async (req, res) => {
  try {
    const allowedKeys = [
      'user_app_theme_preset',
      'user_app_primary_color',
      'user_app_background_color',
      'user_app_text_color',
      'user_app_logo',
      'user_app_name',
      'user_app_welcome_message',
      'user_app_language',
      'user_app_splash_image',
      'user_app_splash_background',
      'user_app_splash_duration',
      'user_app_telegram',
      'user_app_whatsapp',
      'user_app_facebook'
    ];
    const settings = await Setting.find({ key: { $in: allowedKeys } });
    const config = {};
    settings.forEach(s => { config[s.key] = s.value; });
    res.json(config);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// رفع ملف (صورة) وحفظ الرابط
router.post('/upload', auth, auth.requireRole('admin'), upload.single('file'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'لم يتم رفع أي ملف' });
    const fileUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
    res.json({ url: fileUrl });
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
        { upsert: true, returnDocument: 'after' }
      );
    }
    res.json({ message: 'Settings updated' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;