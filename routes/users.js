const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const auth = require('../middleware/auth');

// الحصول على جميع المستخدمين (Admin)
router.get('/', auth, auth.requireRole('admin'), async (req, res) => {
  try {
    const users = await User.find().select('-password');
    res.json(users);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// إنشاء مستخدم (Admin) – يمكن استخدامه أيضًا لإنشاء Resellers/Users
router.post('/', auth, auth.requireRole('admin'), async (req, res) => {
  try {
    const { username, password, email, role, isActive } = req.body;
    if (!username || !password) return res.status(400).json({ message: 'Username and password are required' });

    const existing = await User.findOne({ username });
    if (existing) return res.status(400).json({ message: 'Username already exists' });

    const hashed = await bcrypt.hash(password, 10);
    const user = new User({ username, password: hashed, email, role, isActive });
    await user.save();
    res.status(201).json({ message: 'User created', user: { id: user._id, username: user.username, role: user.role } });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// تعديل مستخدم
router.put('/:id', auth, auth.requireRole('admin'), async (req, res) => {
  try {
    const { password, ...rest } = req.body;
    const updateData = rest;
    if (password) {
      updateData.password = await bcrypt.hash(password, 10);
    }
    const updated = await User.findByIdAndUpdate(req.params.id, updateData, { new: true }).select('-password');
    if (!updated) return res.status(404).json({ message: 'User not found' });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// حذف مستخدم
router.delete('/:id', auth, auth.requireRole('admin'), async (req, res) => {
  try {
    const deleted = await User.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ message: 'User not found' });
    res.json({ message: 'User deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;