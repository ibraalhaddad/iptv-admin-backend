const express = require('express');
const router = express.Router();
const Settings = require('../models/Settings');
const auth = require('../middleware/auth');

// جلب الإعدادات العامة (للتطبيق - بدون حماية)
router.get('/public', async (req, res) => {
  try {
    let settings = await Settings.findOne().sort({ updatedAt: -1 });
    if (!settings) {
      settings = await Settings.create({
        host: 'http://example.com:8080',
        theme: 'dark'
      });
    }
    res.json(settings);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// جلب الإعدادات (للوحة التحكم - محمي)
router.get('/', auth, async (req, res) => {
  try {
    let settings = await Settings.findOne().sort({ updatedAt: -1 });
    if (!settings) {
      settings = await Settings.create({
        host: 'http://example.com:8080',
        theme: 'dark'
      });
    }
    res.json(settings);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// تحديث الإعدادات (محمي)
router.put('/', auth, async (req, res) => {
  try {
    const { host, theme } = req.body;
    let settings = await Settings.findOne();
    if (!settings) {
      settings = new Settings({ host, theme });
    } else {
      if (host) settings.host = host;
      if (theme) settings.theme = theme;
    }
    await settings.save();
    res.json(settings);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;