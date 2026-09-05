
// routes/devices.js

const express = require('express');
const mongoose = require('mongoose');

const DeviceMac = require('../models/DeviceMac');
const Setting = require('../models/Setting');
const Application = require('../models/Application');

const {
  auth,
  requirePermission,
  scopeFilter,
  getWriteApplicationId,
} = require('../middleware/auth');

const router = express.Router();

/* ========================================================================= */
/* Helpers                                                                   */
/* ========================================================================= */

function getRequestedApplicationId(req) {
  return String(
    req.query.applicationId ||
    req.headers['x-application-id'] ||
    req.body?.applicationId ||
    ''
  ).trim();
}

function isValidObjectId(value) {
  return mongoose.Types.ObjectId.isValid(value);
}

async function getActiveApplication(applicationId) {
  if (!applicationId || !isValidObjectId(applicationId)) {
    return null;
  }

  return Application.findOne({
    _id: applicationId,
    isActive: true,
  }).lean();
}

/*
 * نحن نستعمل الحقل macAddress كمفتاح جهاز ثابت لأن الموديل الحالي
 * يشترط وجود macAddress ولا يحتوي deviceId مستقلاً.
 *
 * في الأجهزة المحمولة:
 * macAddress = deviceId
 * deviceType = mobile
 */

/* ========================================================================= */
/* PUBLIC - Check Device                                                     */
/* ========================================================================= */
/*
 * GET
 * /api/device-macs/public/check
 *
 * Query:
 * applicationId
 * deviceId
 *
 * Responses:
 * 200 = الجهاز مسجل
 * 404 = الجهاز غير مسجل
 * 400 = بيانات ناقصة/خاطئة
 * 403 = التطبيق معطل
 */

router.get('/public/check', async (req, res) => {
  try {
    const applicationId = getRequestedApplicationId(req);
    const deviceId = String(req.query.deviceId || '').trim();

    if (!applicationId) {
      return res.status(400).json({
        allowed: false,
        registered: false,
        message: 'applicationId is required',
      });
    }

    if (!deviceId) {
      return res.status(400).json({
        allowed: false,
        registered: false,
        message: 'deviceId is required',
      });
    }

    if (!isValidObjectId(applicationId)) {
      return res.status(400).json({
        allowed: false,
        registered: false,
        message: 'Invalid applicationId',
      });
    }

    const application = await getActiveApplication(applicationId);

    if (!application) {
      return res.status(403).json({
        allowed: false,
        registered: false,
        message: 'Application is not available',
      });
    }

    const device = await DeviceMac.findOne({
      applicationId,
      macAddress: deviceId,
    }).lean();

    /*
     * غير مسجل:
     * نرجع 404 لأن تطبيق الهاتف الحالي يعتمد على ذلك
     * ليبدأ عملية التسجيل.
     */
    if (!device) {
      return res.status(404).json({
        allowed: false,
        registered: false,
        message: 'Device not registered',
      });
    }

    /*
     * تحديث آخر ظهور للجهاز.
     */
    await DeviceMac.updateOne(
      { _id: device._id },
      {
        $set: {
          lastSeen: new Date(),
        },
      }
    );

    if (device.isBlocked) {
      return res.status(200).json({
        allowed: false,
        registered: true,
        blocked: true,
        message: 'Device is blocked',
        device: {
          id: device._id,
          applicationId: device.applicationId,
          deviceName: device.deviceName || '',
          deviceType: device.deviceType || 'mobile',
          isBlocked: true,
        },
      });
    }

    return res.status(200).json({
      allowed: true,
      registered: true,
      blocked: false,
      message: 'Device allowed',
      device: {
        id: device._id,
        applicationId: device.applicationId,
        deviceName: device.deviceName || '',
        deviceType: device.deviceType || 'mobile',
        isBlocked: false,
      },
    });
  } catch (error) {
    console.error('[PUBLIC DEVICE CHECK]', error);

    return res.status(500).json({
      allowed: false,
      registered: false,
      message: 'Failed to check device',
    });
  }
});

/* ========================================================================= */
/* PUBLIC - Register Device                                                   */
/* ========================================================================= */
/*
 * POST
 * /api/device-macs/register
 *
 * Body:
 * {
 *   applicationId,
 *   deviceId,
 *   deviceName,
 *   deviceType
 * }
 */

router.post('/register', async (req, res) => {
  try {
    const applicationId = String(
      req.body.applicationId ||
      req.headers['x-application-id'] ||
      ''
    ).trim();

    const deviceId = String(
      req.body.deviceId ||
      req.body.macAddress ||
      ''
    ).trim();

    const deviceName =
      String(req.body.deviceName || '').trim() ||
      'Unknown Device';

    const deviceType =
      String(req.body.deviceType || '').trim() ||
      'mobile';

    if (!applicationId) {
      return res.status(400).json({
        allowed: false,
        registered: false,
        message: 'applicationId is required',
      });
    }

    if (!deviceId) {
      return res.status(400).json({
        allowed: false,
        registered: false,
        message: 'deviceId is required',
      });
    }

    if (!isValidObjectId(applicationId)) {
      return res.status(400).json({
        allowed: false,
        registered: false,
        message: 'Invalid applicationId',
      });
    }

    const application = await getActiveApplication(applicationId);

    if (!application) {
      return res.status(403).json({
        allowed: false,
        registered: false,
        message: 'Application is not available',
      });
    }

    /*
     * إذا كان الجهاز موجودًا بالفعل:
     * لا ننشئ سجلًا مكررًا.
     */
    const existing = await DeviceMac.findOne({
      applicationId,
      macAddress: deviceId,
    });

    if (existing) {
      existing.lastSeen = new Date();

      /*
       * نحدّث الاسم فقط إذا كان لدينا اسم جديد.
       */
      if (deviceName) {
        existing.deviceName = deviceName;
      }

      await existing.save();

      return res.status(200).json({
        allowed: !existing.isBlocked,
        registered: true,
        blocked: !!existing.isBlocked,
        message: existing.isBlocked
          ? 'Device is blocked'
          : 'Device already registered',
        device: {
          id: existing._id,
          applicationId: existing.applicationId,
          deviceName: existing.deviceName || '',
          deviceType: existing.deviceType || deviceType,
          isBlocked: !!existing.isBlocked,
        },
      });
    }

    /*
     * إنشاء الجهاز.
     */
    const device = await DeviceMac.create({
      applicationId,
      macAddress: deviceId,
      deviceName,
      deviceType,
      isBlocked: false,
      lastSeen: new Date(),
      metadata: {
        source: 'mobile_app',
      },
    });

    return res.status(201).json({
      allowed: true,
      registered: true,
      blocked: false,
      message: 'Device registered',
      device: {
        id: device._id,
        applicationId: device.applicationId,
        deviceName: device.deviceName || '',
        deviceType: device.deviceType || deviceType,
        isBlocked: false,
      },
    });
  } catch (error) {
    console.error('[PUBLIC DEVICE REGISTER]', error);

    /*
     * معالجة duplicate key لو كان الجهاز سجل بالتوازي.
     */
    if (error?.code === 11000) {
      const applicationId = String(
        req.body.applicationId ||
        req.headers['x-application-id'] ||
        ''
      ).trim();

      const deviceId = String(
        req.body.deviceId ||
        req.body.macAddress ||
        ''
      ).trim();

      const existing = await DeviceMac.findOne({
        applicationId,
        macAddress: deviceId,
      }).lean();

      if (existing) {
        return res.status(200).json({
          allowed: !existing.isBlocked,
          registered: true,
          blocked: !!existing.isBlocked,
          message: existing.isBlocked
            ? 'Device is blocked'
            : 'Device already registered',
          device: {
            id: existing._id,
            applicationId: existing.applicationId,
            deviceName: existing.deviceName || '',
            deviceType: existing.deviceType || 'mobile',
            isBlocked: !!existing.isBlocked,
          },
        });
      }
    }

    return res.status(500).json({
      allowed: false,
      registered: false,
      message: 'Failed to register device',
    });
  }
});

/* ========================================================================= */
/* ADMIN - List Devices                                                       */
/* ========================================================================= */

router.get(
  '/',
  auth,
  requirePermission('devices.view'),
  async (req, res) => {
    try {
      const devices = await DeviceMac.find(
        scopeFilter(req)
      )
        .populate('userId', 'username macAddress')
        .populate('applicationId', 'name slug')
        .sort({
          createdAt: -1,
        });

      return res.json(devices);
    } catch (error) {
      console.error('[DEVICES LIST]', error);

      return res.status(500).json({
        message: 'Failed to load devices',
      });
    }
  }
);

/* ========================================================================= */
/* ADMIN - Create Device                                                      */
/* ========================================================================= */

router.post(
  '/',
  auth,
  requirePermission('devices.create'),
  async (req, res) => {
    try {
      const applicationId = getWriteApplicationId(
        req,
        req.body
      );

      if (!applicationId) {
        return res.status(400).json({
          message: 'applicationId is required',
        });
      }

      const macAddress = String(
        req.body.macAddress ||
        req.body.deviceId ||
        ''
      ).trim();

      if (!macAddress) {
        return res.status(400).json({
          message: 'macAddress or deviceId is required',
        });
      }

      const device = await DeviceMac.create({
        ...req.body,
        applicationId,
        macAddress,
        deviceType: req.body.deviceType || 'mobile',
        isBlocked: req.body.isBlocked === true,
      });

      return res.status(201).json(device);
    } catch (error) {
      console.error('[DEVICE CREATE]', error);

      if (error?.code === 11000) {
        return res.status(409).json({
          message: 'Device already exists',
        });
      }

      return res.status(500).json({
        message: error.message || 'Failed to create device',
      });
    }
  }
);

/* ========================================================================= */
/* ADMIN - Bulk Create                                                       */
/* ========================================================================= */

router.post(
  '/bulk',
  auth,
  requirePermission('devices.create'),
  async (req, res) => {
    try {
      const devices = Array.isArray(req.body.devices)
        ? req.body.devices
        : [];

      const applicationId = getWriteApplicationId(
        req,
        req.body
      );

      if (!applicationId) {
        return res.status(400).json({
          message: 'applicationId is required',
        });
      }

      let inserted = 0;
      let skipped = 0;

      for (const raw of devices) {
        try {
          const macAddress = String(
            raw.macAddress ||
            raw.deviceId ||
            ''
          ).trim();

          if (!macAddress) {
            skipped++;
            continue;
          }

          await DeviceMac.updateOne(
            {
              applicationId,
              macAddress,
            },
            {
              $setOnInsert: {
                ...raw,
                applicationId,
                macAddress,
                deviceType:
                  raw.deviceType || 'mobile',
                isBlocked:
                  raw.isBlocked === true,
                lastSeen:
                  raw.lastSeen || new Date(),
              },
            },
            {
              upsert: true,
            }
          );

          inserted++;
        } catch {
          skipped++;
        }
      }

      return res.json({
        inserted,
        skipped,
      });
    } catch (error) {
      console.error('[DEVICE BULK]', error);

      return res.status(500).json({
        message: 'Failed to import devices',
      });
    }
  }
);

/* ========================================================================= */
/* ADMIN - Update Device                                                      */
/* ========================================================================= */

router.put(
  '/:id',
  auth,
  requirePermission('devices.edit'),
  async (req, res) => {
    try {
      const payload = {
        ...req.body,
      };

      /*
       * لا نسمح بتغيير التطبيق من خلال التعديل العادي.
       */
      delete payload.applicationId;

      const device = await DeviceMac.findOneAndUpdate(
        scopeFilter(req, {
          _id: req.params.id,
        }),
        payload,
        {
          new: true,
          runValidators: true,
        }
      ).populate('applicationId', 'name slug');

      if (!device) {
        return res.status(404).json({
          message: 'Device not found',
        });
      }

      return res.json(device);
    } catch (error) {
      console.error('[DEVICE UPDATE]', error);

      return res.status(500).json({
        message: error.message || 'Failed to update device',
      });
    }
  }
);

/* ========================================================================= */
/* ADMIN - Block / Unblock                                                    */
/* ========================================================================= */

router.patch(
  '/:id/status',
  auth,
  requirePermission('devices.edit'),
  async (req, res) => {
    try {
      const isBlocked = req.body.isBlocked === true;

      const device = await DeviceMac.findOneAndUpdate(
        scopeFilter(req, {
          _id: req.params.id,
        }),
        {
          $set: {
            isBlocked,
          },
        },
        {
          new: true,
        }
      ).populate('applicationId', 'name slug');

      if (!device) {
        return res.status(404).json({
          message: 'Device not found',
        });
      }

      return res.json(device);
    } catch (error) {
      console.error('[DEVICE STATUS]', error);

      return res.status(500).json({
        message: 'Failed to change device status',
      });
    }
  }
);

/* ========================================================================= */
/* ADMIN - Delete                                                            */
/* ========================================================================= */

router.delete(
  '/:id',
  auth,
  requirePermission('devices.delete'),
  async (req, res) => {
    try {
      const device = await DeviceMac.findOneAndDelete(
        scopeFilter(req, {
          _id: req.params.id,
        })
      );

      if (!device) {
        return res.status(404).json({
          message: 'Device not found',
        });
      }

      return res.json({
        message: 'Deleted',
      });
    } catch (error) {
      console.error('[DEVICE DELETE]', error);

      return res.status(500).json({
        message: 'Failed to delete device',
      });
    }
  }
);

/* ========================================================================= */
/* ADMIN - MAC length setting                                                 */
/* ========================================================================= */

router.get(
  '/settings/mac-length',
  auth,
  requirePermission('devices.view'),
  async (req, res) => {
    try {
      const s = await Setting.findOne({
        ...scopeFilter(req),
        key: 'mac_length',
      });

      return res.json({
        mac_length: s?.value || '17',
      });
    } catch (error) {
      return res.status(500).json({
        message: 'Failed to load MAC length',
      });
    }
  }
);

router.put(
  '/settings/mac-length',
  auth,
  requirePermission('devices.edit'),
  async (req, res) => {
    try {
      const applicationId = getWriteApplicationId(
        req,
        req.body
      );

      const value =
        String(req.body.mac_length || '17').trim();

      if (!applicationId) {
        return res.status(400).json({
          message: 'applicationId is required',
        });
      }

      await Setting.findOneAndUpdate(
        {
          applicationId,
          key: 'mac_length',
        },
        {
          applicationId,
          key: 'mac_length',
          value,
        },
        {
          upsert: true,
          new: true,
        }
      );

      return res.json({
        mac_length: value,
      });
    } catch (error) {
      console.error('[MAC LENGTH UPDATE]', error);

      return res.status(500).json({
        message: 'Failed to update MAC length',
      });
    }
  }
);

module.exports = router;
