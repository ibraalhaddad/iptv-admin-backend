const express = require('express');
const Setting = require('../models/Setting');
const { auth, requirePermission, scopeFilter, getWriteApplicationId } = require('../middleware/auth');

const router = express.Router();

router.get('/', auth, requirePermission('settings.view'), async (req, res, next) => {
  try {
    const rows = await Setting.find(scopeFilter(req))
      .select('key value -_id')
      .lean();

    const out = {};
    rows.forEach((r) => {
      if (r?.key) out[r.key] = r.value;
    });
    res.json(out);
  } catch (error) {
    next(error);
  }
});

router.put('/', auth, requirePermission('settings.edit'), async (req, res, next) => {
  try {
    const applicationId = getWriteApplicationId(req, req.body);
    const entries = Object.entries(req.body || {}).filter(([k]) => k !== 'applicationId');

    const operations = entries.map(([key, value]) => ({
      updateOne: {
        filter: { applicationId, key },
        update: { $set: { applicationId, key, value } },
        upsert: true,
      },
    }));

    if (operations.length) {
      await Setting.bulkWrite(operations, { ordered: false });
    }

    res.json({ message: 'تم الحفظ', updated: operations.length });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
