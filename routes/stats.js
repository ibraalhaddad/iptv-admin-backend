const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Package = require('../models/Package');
const Host = require('../models/Host');
const Line = require('../models/Line');
const auth = require('../middleware/auth');

// الحصول على إحصائيات شاملة (Admin)
router.get('/', auth, auth.requireRole('admin'), async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const totalPackages = await Package.countDocuments();
    const totalHosts = await Host.countDocuments();
    const activeLines = await Line.countDocuments({ status: 'active' });
    const expiredLines = await Line.countDocuments({ status: 'expired' });
    const suspendedLines = await Line.countDocuments({ status: 'suspended' });
    const totalDevices = await Line.aggregate([
      { $project: { deviceCount: { $size: '$devices' } } },
      { $group: { _id: null, total: { $sum: '$deviceCount' } } }
    ]);
    const totalRevenue = await Line.aggregate([
      { $group: { _id: null, total: { $sum: '$amountPaid' } } }
    ]);

    res.json({
      totalUsers,
      totalPackages,
      totalHosts,
      activeLines,
      expiredLines,
      suspendedLines,
      totalDevices: totalDevices.length > 0 ? totalDevices[0].total : 0,
      totalRevenue: totalRevenue.length > 0 ? totalRevenue[0].total : 0
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;