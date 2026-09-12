const express = require('express');
const Entity = require('../models/Entity');
const { auth, requirePermission, scopeFilter, getWriteApplicationId } = require('../middleware/auth');

const MAX_LIMIT = 500;
const DEFAULT_LIMIT = 250;

function parseLimit(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(MAX_LIMIT, Math.max(1, Math.floor(parsed))) : DEFAULT_LIMIT;
}

function parseSkip(req) {
  const page = Math.max(1, Number.parseInt(req.query.page || '1', 10) || 1);
  const limit = parseLimit(req.query.limit);
  return { page, limit, skip: (page - 1) * limit };
}

function make(type) {
  const r = express.Router();

  r.get('/', auth, requirePermission('entities.view'), async (req, res, next) => {
    try {
      const filter = scopeFilter(req, { type });
      const { page, limit, skip } = parseSkip(req);
      const [rows, total] = await Promise.all([
        Entity.find(filter)
          .sort({ sortOrder: 1, createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        Entity.countDocuments(filter),
      ]);

      res.setHeader('X-Total-Count', String(total));
      res.setHeader('X-Page', String(page));
      res.setHeader('X-Page-Size', String(limit));
      res.setHeader('X-Total-Pages', String(Math.ceil(total / limit)));

      return res.json(rows);
    } catch (error) {
      return next(error);
    }
  });

  r.post('/', auth, requirePermission('entities.create'), async (req, res, next) => {
    try {
      const applicationId = getWriteApplicationId(req, req.body);
      const data = { ...req.body, type, applicationId };
      delete data._id;
      delete data.id;
      const created = await Entity.create(data);
      res.status(201).json(created);
    } catch (error) {
      error.status = error.status || 400;
      next(error);
    }
  });

  r.put('/:id', auth, requirePermission('entities.edit'), async (req, res, next) => {
    try {
      const filter = scopeFilter(req, { _id: req.params.id, type });
      const update = { ...req.body };
      delete update.applicationId;
      delete update.type;
      delete update._id;
      delete update.id;
      const e = await Entity.findOneAndUpdate(filter, update, {
        new: true,
        runValidators: true,
        lean: true,
      });
      if (!e) return res.status(404).json({ message: 'العنصر غير موجود' });
      res.json(e);
    } catch (error) {
      next(error);
    }
  });

  r.patch('/:id/status', auth, requirePermission('entities.edit'), async (req, res, next) => {
    try {
      const e = await Entity.findOneAndUpdate(
        scopeFilter(req, { _id: req.params.id, type }),
        { isActive: !!req.body?.isActive },
        { new: true, lean: true },
      );
      if (!e) return res.status(404).json({ message: 'العنصر غير موجود' });
      res.json(e);
    } catch (error) {
      next(error);
    }
  });

  r.delete('/:id', auth, requirePermission('entities.delete'), async (req, res, next) => {
    try {
      const result = await Entity.deleteOne(scopeFilter(req, { _id: req.params.id, type }));
      if (!result.deletedCount) return res.status(404).json({ message: 'العنصر غير موجود' });
      res.json({ message: 'تم الحذف' });
    } catch (error) {
      next(error);
    }
  });

  return r;
}

module.exports = { make };
