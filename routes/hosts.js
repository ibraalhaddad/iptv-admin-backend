const express = require('express');
const router = express.Router();
const Host = require('../models/Host');
const auth = require('../middleware/auth');

router.get('/', auth, async (req, res) => {
  try {
    const hosts = await Host.find().select('-password');
    res.json(hosts);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/', auth, auth.requireRole('admin'), async (req, res) => {
  try {
    const { name, url, username, password, type, isActive } = req.body;
    if (!name || !url) return res.status(400).json({ message: 'Name and URL are required' });
    const host = new Host({ name, url, username, password, type, isActive });
    await host.save();
    res.status(201).json(host);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.put('/:id', auth, auth.requireRole('admin'), async (req, res) => {
  try {
    const updated = await Host.findByIdAndUpdate(req.params.id, req.body, { returnDocument: 'after' });
    if (!updated) return res.status(404).json({ message: 'Host not found' });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.delete('/:id', auth, auth.requireRole('admin'), async (req, res) => {
  try {
    const deleted = await Host.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ message: 'Host not found' });
    res.json({ message: 'Host deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;