const express = require('express');
const Entity = require('../models/Entity');
const { auth, requirePermission, scopeFilter, getWriteApplicationId } = require('../middleware/auth');

function make(type) {
  const r = express.Router();

  r.get('/', auth, requirePermission('entities.view'), async (req, res) => {
    try {
      res.json(await Entity.find(scopeFilter(req, { type })).sort({ sortOrder: 1, createdAt: -1 }));
    } catch (error) {
      res.status(500).json({ message: 'فشل تحميل البيانات' });
    }
  });

  r.post('/', auth, requirePermission('entities.create'), async (req, res) => {
    try {
      const applicationId = getWriteApplicationId(req, req.body);
      const data = { ...req.body, type, applicationId };
      delete data._id;
      delete data.id;
      res.status(201).json(await Entity.create(data));
    } catch (error) {
      res.status(error.status || 400).json({ message: error.message || 'فشل إنشاء البيانات' });
    }
  });

  r.put('/:id', auth, requirePermission('entities.edit'), async (req, res) => {
    try {
      const filter = scopeFilter(req, { _id: req.params.id, type });
      const update = { ...req.body };
      delete update.applicationId;
      delete update.type;
      const e = await Entity.findOneAndUpdate(filter, update, { new: true, runValidators: true });
      if (!e) return res.status(404).json({ message: 'العنصر غير موجود' });
      res.json(e);
    } catch (error) {
      res.status(400).json({ message: error.message || 'فشل تعديل البيانات' });
    }
  });

  r.patch('/:id/status', auth, requirePermission('entities.edit'), async (req, res) => {
    const e = await Entity.findOneAndUpdate(
      scopeFilter(req, { _id: req.params.id, type }),
      { isActive: !!req.body?.isActive },
      { new: true },
    );
    if (!e) return res.status(404).json({ message: 'العنصر غير موجود' });
    res.json(e);
  });

  r.delete('/:id', auth, requirePermission('entities.delete'), async (req, res) => {
    const result = await Entity.deleteOne(scopeFilter(req, { _id: req.params.id, type }));
    if (!result.deletedCount) return res.status(404).json({ message: 'العنصر غير موجود' });
    res.json({ message: 'تم الحذف' });
  });

  return r;
}

module.exports = { make };
