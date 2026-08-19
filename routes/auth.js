const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const auth = require('../middleware/auth');

router.get('/me', auth, async (req, res) => {
  res.json({ user: req.user });
});

// تسجيل مستخدم جديد (من لوحة التحكم أو التطبيق)
router.post('/register', async (req, res) => {
  try {
    const { username, password, email } = req.body;
    const existing = await User.findOne({ username });
    if (existing) return res.status(400).json({ message: 'اسم المستخدم موجود' });

    const hashed = await bcrypt.hash(password, 10);
    const user = new User({ username, password: hashed, email });
    await user.save();
    res.status(201).json({ message: 'تم إنشاء المستخدم' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// تسجيل الدخول
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username });
    if (!user) return res.status(401).json({ message: 'بيانات خاطئة' });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ message: 'بيانات خاطئة' });

    const token = jwt.sign(
      { userId: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    res.json({ token, user: { id: user._id, username: user.username, role: user.role } });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;