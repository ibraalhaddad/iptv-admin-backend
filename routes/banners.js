// المسار: routes/banners.js

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const Banner = require('../models/Banner');
const Application = require('../models/Application');

const {
  auth,
  requirePermission,
  scopeFilter,
  getWriteApplicationId,
} = require('../middleware/auth');

const router = express.Router();

/* ========================================================================= */
/* Upload                                                                    */
/* ========================================================================= */

const uploadDir = path.join(
  __dirname,
  '..',
  'uploads',
  'banners'
);

fs.mkdirSync(uploadDir, {
  recursive: true,
});

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadDir);
  },

  filename: (_req, file, cb) => {
    const ext = path
      .extname(file.originalname || '')
      .toLowerCase();

    const safeExt = ext || '.jpg';

    const name =
      `${Date.now()}-` +
      `${Math.random()
        .toString(36)
        .slice(2, 10)}` +
      safeExt;

    cb(null, name);
  },
});

const upload = multer({
  storage,
});

/* ========================================================================= */
/* Helpers                                                                   */
/* ========================================================================= */

function getApplicationId(req) {
  return (
    req.query?.applicationId ||
    req.body?.applicationId ||
    req.headers['x-application-id'] ||
    null
  );
}

function normalizeDate(value) {
  if (
    value === undefined ||
    value === null ||
    value === ''
  ) {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

/*
 * توليد رقم تسلسلي داخل التطبيق.
 *
 * مثال:
 * Application A -> 1,2,3,4
 * Application B -> 1,2,3
 *
 * نستخدم أعلى رقم موجود + 1.
 */
async function getNextBannerId(applicationId) {
  const lastBanner =
    await Banner.findOne({
      applicationId,
    })
      .sort({
        bannerId: -1,
      })
      .select('bannerId')
      .lean();

  return (
    Number(
      lastBanner?.bannerId || 0
    ) + 1
  );
}

/*
 * تنظيف payload القادم من الواجهة.
 */
function buildPayload(body = {}) {
  return {
    title: String(
      body.title || ''
    ).trim(),

    description: String(
      body.description || ''
    ).trim(),

    imageUrl: String(
      body.imageUrl || ''
    ).trim(),

    buttonText: String(
      body.buttonText || ''
    ).trim(),

    actionType:
      body.actionType ||
      'none',

    actionId: String(
      body.actionId || ''
    ).trim(),

    sortOrder: Math.max(
      0,
      Number(
        body.sortOrder || 0
      )
    ),

    isActive:
      body.isActive !== false,

    startAt:
      normalizeDate(
        body.startAt
      ),

    endAt:
      normalizeDate(
        body.endAt
      ),
  };
}

/* ========================================================================= */
/* GET                                                                       */
/* ========================================================================= */

router.get(
  '/',
  auth,
  requirePermission('ads.view'),
  async (req, res) => {
    try {
      const filter =
        scopeFilter(req);

      const banners =
        await Banner.find(
          filter
        )
          .populate(
            'applicationId',
            'name isActive'
          )
          .sort({
            sortOrder: 1,
            bannerId: 1,
            createdAt: -1,
          })
          .lean();

      const total =
        banners.length;

      const active =
        banners.filter(
          item =>
            item.isActive !== false
        ).length;

      const inactive =
        banners.filter(
          item =>
            item.isActive === false
        ).length;

      return res.json({
        banners,
        stats: {
          total,
          active,
          inactive,
        },
      });
    } catch (error) {
      console.error(
        '[Banners GET]',
        error
      );

      return res.status(500).json({
        message:
          'تعذر تحميل الإعلانات',
      });
    }
  }
);

/* ========================================================================= */
/* POST                                                                      */
/* ========================================================================= */

router.post(
  '/',
  auth,
  requirePermission('ads.create'),
  async (req, res) => {
    try {
      const applicationId =
        getWriteApplicationId(
          req,
          req.body
        );

      if (!applicationId) {
        return res.status(400).json({
          message:
            'يجب تحديد التطبيق',
        });
      }

      const application =
        await Application.findOne({
          _id: applicationId,
          isActive: true,
        }).lean();

      if (!application) {
        return res.status(400).json({
          message:
            'التطبيق غير موجود أو غير نشط',
        });
      }

      const payload =
        buildPayload(
          req.body
        );

      if (!payload.title) {
        return res.status(400).json({
          message:
            'عنوان الإعلان مطلوب',
        });
      }

      if (!payload.description) {
        return res.status(400).json({
          message:
            'معلومات الإعلان مطلوبة',
        });
      }

      if (!payload.imageUrl) {
        return res.status(400).json({
          message:
            'صورة الإعلان مطلوبة',
        });
      }

      /*
       * ضمان الترقيم:
       * 1 ثم 2 ثم 3...
       */
      let bannerId =
        await getNextBannerId(
          applicationId
        );

      /*
       * حماية إضافية في حال وجود تعارض.
       */
      let created = null;

      for (
        let attempt = 0;
        attempt < 5;
        attempt += 1
      ) {
        try {
          created =
            await Banner.create({
              ...payload,
              applicationId,
              bannerId,
            });

          break;
        } catch (error) {
          if (
            error?.code !== 11000
          ) {
            throw error;
          }

          bannerId += 1;
        }
      }

      if (!created) {
        throw new Error(
          'تعذر توليد رقم الإعلان'
        );
      }

      const result =
        await Banner.findById(
          created._id
        )
          .populate(
            'applicationId',
            'name isActive'
          )
          .lean();

      return res.status(201).json({
        message:
          'تمت إضافة الإعلان بنجاح',
        banner: result,
      });
    } catch (error) {
      console.error(
        '[Banners POST]',
        error
      );

      return res.status(500).json({
        message:
          error?.message ||
          'فشل إضافة الإعلان',
      });
    }
  }
);

/* ========================================================================= */
/* PUT                                                                       */
/* ========================================================================= */

router.put(
  '/:id',
  auth,
  requirePermission('ads.edit'),
  async (req, res) => {
    try {
      /*
       * لا نسمح بنقل الإعلان
       * من تطبيق إلى تطبيق.
       */
      const payload =
        buildPayload(
          req.body
        );

      if (!payload.title) {
        return res.status(400).json({
          message:
            'عنوان الإعلان مطلوب',
        });
      }

      if (!payload.description) {
        return res.status(400).json({
          message:
            'معلومات الإعلان مطلوبة',
        });
      }

      if (!payload.imageUrl) {
        return res.status(400).json({
          message:
            'صورة الإعلان مطلوبة',
        });
      }

      const banner =
        await Banner.findOneAndUpdate(
          scopeFilter(
            req,
            {
              _id: req.params.id,
            }
          ),
          payload,
          {
            new: true,
            runValidators: true,
          }
        )
          .populate(
            'applicationId',
            'name isActive'
          );

      if (!banner) {
        return res.status(404).json({
          message:
            'الإعلان غير موجود',
        });
      }

      return res.json({
        message:
          'تم تعديل الإعلان بنجاح',
        banner,
      });
    } catch (error) {
      console.error(
        '[Banners PUT]',
        error
      );

      return res.status(500).json({
        message:
          'فشل تعديل الإعلان',
      });
    }
  }
);

/* ========================================================================= */
/* STATUS                                                                    */
/* ========================================================================= */

router.patch(
  '/:id/status',
  auth,
  requirePermission('ads.edit'),
  async (req, res) => {
    try {
      const banner =
        await Banner.findOneAndUpdate(
          scopeFilter(
            req,
            {
              _id: req.params.id,
            }
          ),
          {
            isActive:
              Boolean(
                req.body.isActive
              ),
          },
          {
            new: true,
          }
        )
          .populate(
            'applicationId',
            'name isActive'
          );

      if (!banner) {
        return res.status(404).json({
          message:
            'الإعلان غير موجود',
        });
      }

      return res.json({
        message:
          banner.isActive
            ? 'تم تفعيل الإعلان'
            : 'تم تعطيل الإعلان',
        banner,
      });
    } catch (error) {
      console.error(
        '[Banners PATCH STATUS]',
        error
      );

      return res.status(500).json({
        message:
          'فشل تغيير حالة الإعلان',
      });
    }
  }
);

/* ========================================================================= */
/* DELETE                                                                    */
/* ========================================================================= */

router.delete(
  '/:id',
  auth,
  requirePermission('ads.delete'),
  async (req, res) => {
    try {
      const banner =
        await Banner.findOneAndDelete(
          scopeFilter(
            req,
            {
              _id: req.params.id,
            }
          )
        );

      if (!banner) {
        return res.status(404).json({
          message:
            'الإعلان غير موجود',
        });
      }

      return res.json({
        message:
          'تم حذف الإعلان بنجاح',
      });
    } catch (error) {
      console.error(
        '[Banners DELETE]',
        error
      );

      return res.status(500).json({
        message:
          'فشل حذف الإعلان',
      });
    }
  }
);

/* ========================================================================= */
/* UPLOAD                                                                    */
/* ========================================================================= */

router.post(
  '/upload',
  auth,
  requirePermission('ads.create'),
  upload.single('file'),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          message:
            'لم يتم اختيار صورة',
        });
      }

      const url =
        `/uploads/banners/${req.file.filename}`;

      return res.json({
        message:
          'تم رفع الصورة بنجاح',
        url,
      });
    } catch (error) {
      console.error(
        '[Banners UPLOAD]',
        error
      );

      return res.status(500).json({
        message:
          'فشل رفع الصورة',
      });
    }
  }
);

module.exports = router;