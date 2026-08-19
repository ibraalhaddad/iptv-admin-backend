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

    // إجمالي الأجهزة: نستخدم $ifNull لتفادي خطأ إذا كانت devices غير موجودة أو ليست مصفوفة
    const totalDevicesAgg = await Line.aggregate([
      {
        $project: {
          deviceCount: { $size: { $ifNull: ['$devices', []] } }
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$deviceCount' }
        }
      }
    ]);

    // إجمالي الإيرادات: نستخدم $ifNull لتفادي خطأ إذا كانت amountPaid غير موجودة
    const totalRevenueAgg = await Line.aggregate([
      {
        $group: {
          _id: null,
          total: { $sum: { $ifNull: ['$amountPaid', 0] } }
        }
      }
    ]);

    res.json({
      totalUsers,
      totalPackages,
      totalHosts,
      activeLines,
      expiredLines,
      suspendedLines,
      totalDevices: totalDevicesAgg.length > 0 ? totalDevicesAgg[0].total : 0,
      totalRevenue: totalRevenueAgg.length > 0 ? totalRevenueAgg[0].total : 0
    });
  } catch (err) {
    console.error('Stats error:', err);
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;