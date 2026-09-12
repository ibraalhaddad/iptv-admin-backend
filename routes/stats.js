const express = require('express');
const Entity = require('../models/Entity');
const DeviceMac = require('../models/DeviceMac');
const MacUser = require('../models/MacUser');
const Application = require('../models/Application');
const Banner = require('../models/Banner');
const { auth, requirePermission, scopeFilter } = require('../middleware/auth');

const router = express.Router();

router.get('/', auth, requirePermission('dashboard.view'), async (req, res, next) => {
  try {
    const filter = scopeFilter(req);

    // One aggregation replaces the old "load every line into Node and count it" query.
    const [entityStats, devices, macUsers, applications, banners] = await Promise.all([
      Entity.aggregate([
        { $match: filter },
        {
          $facet: {
            users: [{ $match: { type: 'users' } }, { $count: 'count' }],
            packages: [{ $match: { type: 'packages' } }, { $count: 'count' }],
            hosts: [{ $match: { type: 'hosts' } }, { $count: 'count' }],
            lines: [
              { $match: { type: 'lines' } },
              { $group: { _id: '$data.status', count: { $sum: 1 } } },
            ],
          },
        },
      ]),
      DeviceMac.countDocuments(filter),
      MacUser.countDocuments(filter),
      req.user.role === 'super_admin'
        ? Application.countDocuments()
        : Promise.resolve(0),
      Banner.countDocuments({ ...filter, isActive: true }),
    ]);

    const stats = entityStats[0] || {};
    const value = (field) => Number(stats[field]?.[0]?.count || 0);
    const lineCounts = Object.fromEntries(
      (stats.lines || []).map((item) => [String(item._id || ''), Number(item.count || 0)]),
    );

    return res.json({
      totalUsers: value('users'),
      totalPackages: value('packages'),
      totalHosts: value('hosts'),
      activeLines: lineCounts.active || 0,
      expiredLines: lineCounts.expired || 0,
      suspendedLines: lineCounts.suspended || 0,
      totalDevices: Number(devices || 0) + Number(macUsers || 0),
      macUsers: Number(macUsers || 0),
      totalApplications: Number(applications || 0),
      activeBanners: Number(banners || 0),
    });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
