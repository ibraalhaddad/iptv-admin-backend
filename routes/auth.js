// المسار: backend/routes/auth.js

const express = require('express');
const bcrypt = require('bcryptjs');

const User = require('../models/User');

const {
  auth,
  publicUser,
  signUser,
} = require('../middleware/auth');

const router = express.Router();

/**
 * ============================================================
 * إنشاء / إصلاح حساب المدير الرئيسي
 * ============================================================
 */
async function ensureBootstrap() {
  const username = String(
    process.env.ADMIN_USERNAME || 'admin'
  )
    .trim()
    .toLowerCase();

  const password = String(
    process.env.ADMIN_PASSWORD || 'admin123'
  );

  if (!username) {
    throw new Error('ADMIN_USERNAME غير صالح');
  }

  if (!password) {
    throw new Error('ADMIN_PASSWORD غير صالح');
  }

  // ----------------------------------------------------------
  // البحث عن الحساب بالاسم المطلوب
  // ----------------------------------------------------------
  let existing = await User.findOne({
    username,
  }).select('+passwordHash');

  // ----------------------------------------------------------
  // إذا لم يوجد، ابحث عن أي super_admin قديم
  // ----------------------------------------------------------
  if (!existing) {
    existing = await User.findOne({
      role: 'super_admin',
    }).select('+passwordHash');

    if (existing) {
      console.log(
        `[AUTH] تم العثور على حساب super_admin قديم: ${existing.username}`
      );

      if (existing.username !== username) {
        existing.username = username;
      }
    }
  }

  // ----------------------------------------------------------
  // لا يوجد أي حساب إداري -> إنشاء حساب جديد
  // ----------------------------------------------------------
  if (!existing) {
    const passwordHash = await bcrypt.hash(
      password,
      12
    );

    const created = await User.create({
      username,
      passwordHash,
      displayName:
        process.env.ADMIN_DISPLAY_NAME ||
        'المالك الرئيسي',
      role: 'super_admin',
      applicationId: null,
      isActive: true,
      lastLoginAt: null,
    });

    console.log(
      `[AUTH] تم إنشاء الحساب الإداري الرئيسي: ${username}`
    );

    return created;
  }

  let changed = false;

  // ----------------------------------------------------------
  // إصلاح username
  // ----------------------------------------------------------
  if (existing.username !== username) {
    existing.username = username;
    changed = true;
  }

  // ----------------------------------------------------------
  // إصلاح passwordHash إذا كان مفقودًا
  // ----------------------------------------------------------
  if (
    !existing.passwordHash ||
    typeof existing.passwordHash !== 'string' ||
    existing.passwordHash.trim() === ''
  ) {
    existing.passwordHash = await bcrypt.hash(
      password,
      12
    );

    changed = true;

    console.log(
      `[AUTH] تم إنشاء passwordHash للحساب: ${username}`
    );
  }

  // ----------------------------------------------------------
  // التأكد أن الحساب super_admin
  // ----------------------------------------------------------
  if (existing.role !== 'super_admin') {
    existing.role = 'super_admin';
    changed = true;
  }

  // ----------------------------------------------------------
  // المدير الرئيسي لا يرتبط بتطبيق
  // ----------------------------------------------------------
  if (existing.applicationId) {
    existing.applicationId = null;
    changed = true;
  }

  // ----------------------------------------------------------
  // التأكد أن الحساب فعال
  // ----------------------------------------------------------
  if (existing.isActive !== true) {
    existing.isActive = true;
    changed = true;
  }

  // ----------------------------------------------------------
  // حفظ التغييرات
  // ----------------------------------------------------------
  if (changed) {
    await existing.save();
  }

  // ----------------------------------------------------------
  // إعادة قراءة الحساب مع passwordHash
  // ----------------------------------------------------------
  const verified = await User.findOne({
    username,
  }).select('+passwordHash');

  if (
    !verified ||
    !verified.passwordHash ||
    typeof verified.passwordHash !== 'string' ||
    verified.passwordHash.trim() === ''
  ) {
    throw new Error(
      `تعذر تهيئة الحساب الإداري ${username}`
    );
  }

  return verified;
}

/**
 * ============================================================
 * تسجيل الدخول
 * POST /api/auth/login
 * ============================================================
 */
router.post('/login', async (req, res) => {
  try {
    const username = String(
      req.body?.username || ''
    )
      .trim()
      .toLowerCase();

    const password = String(
      req.body?.password || ''
    );

    // --------------------------------------------------------
    // التحقق من البيانات
    // --------------------------------------------------------
    if (!username || !password) {
      return res.status(400).json({
        message:
          'أدخل اسم المستخدم وكلمة المرور',
      });
    }

    // --------------------------------------------------------
    // التأكد من وجود حساب المدير الرئيسي
    // --------------------------------------------------------
    await ensureBootstrap();

    // --------------------------------------------------------
    // البحث عن المستخدم
    // --------------------------------------------------------
    const user = await User.findOne({
      username,
    })
      .select('+passwordHash')
      .populate(
        'applicationId',
        'name slug logoUrl isActive'
      );

    // --------------------------------------------------------
    // المستخدم غير موجود
    // --------------------------------------------------------
    if (!user) {
      console.warn(
        `[AUTH] محاولة دخول لمستخدم غير موجود: ${username}`
      );

      return res.status(401).json({
        message:
          'بيانات الدخول غير صحيحة',
      });
    }

    // --------------------------------------------------------
    // الحساب معطل
    // --------------------------------------------------------
    if (user.isActive === false) {
      return res.status(403).json({
        message:
          'الحساب معطل',
      });
    }

    // --------------------------------------------------------
    // التحقق من التطبيق المرتبط بمالك التطبيق
    // --------------------------------------------------------
    if (
      user.role === 'app_owner' &&
      (
        !user.applicationId ||
        user.applicationId.isActive === false
      )
    ) {
      return res.status(403).json({
        message:
          'التطبيق المرتبط بهذا الحساب غير متاح حاليًا',
      });
    }

    // --------------------------------------------------------
    // التأكد من وجود passwordHash
    // --------------------------------------------------------
    if (
      !user.passwordHash ||
      typeof user.passwordHash !== 'string' ||
      user.passwordHash.trim() === ''
    ) {
      console.error(
        `[AUTH] المستخدم ${username} لا يحتوي على passwordHash`
      );

      // ------------------------------------------------------
      // إصلاح حساب super_admin
      // ------------------------------------------------------
      if (user.role === 'super_admin') {
        const bootstrap =
          await ensureBootstrap();

        if (
          bootstrap &&
          bootstrap.passwordHash &&
          typeof bootstrap.passwordHash === 'string'
        ) {
          user.passwordHash =
            bootstrap.passwordHash;
        }
      }
    }

    // --------------------------------------------------------
    // إذا بقي passwordHash مفقودًا
    // --------------------------------------------------------
    if (
      !user.passwordHash ||
      typeof user.passwordHash !== 'string' ||
      user.passwordHash.trim() === ''
    ) {
      return res.status(500).json({
        message:
          'حساب المستخدم غير مهيأ بشكل صحيح. لا يوجد passwordHash.',
      });
    }

    // --------------------------------------------------------
    // مقارنة كلمة المرور
    // --------------------------------------------------------
    const passwordMatches =
      await bcrypt.compare(
        password,
        user.passwordHash
      );

    if (!passwordMatches) {
      console.warn(
        `[AUTH] كلمة مرور غير صحيحة للحساب: ${username}`
      );

      return res.status(401).json({
        message:
          'بيانات الدخول غير صحيحة',
      });
    }

    // --------------------------------------------------------
    // تحديث آخر تسجيل دخول
    // --------------------------------------------------------
    user.lastLoginAt = new Date();

    await user.save();

    // --------------------------------------------------------
    // إنشاء JWT
    // --------------------------------------------------------
    const token = signUser(user);

    // --------------------------------------------------------
    // تجهيز بيانات التطبيق
    // --------------------------------------------------------
    let application = null;

    if (
      user.applicationId &&
      typeof user.applicationId === 'object'
    ) {
      application = {
        id: String(
          user.applicationId._id
        ),
        name:
          user.applicationId.name || '',
        slug:
          user.applicationId.slug || '',
        logoUrl:
          user.applicationId.logoUrl || '',
        isActive:
          user.applicationId.isActive !==
          false,
      };
    }

    // --------------------------------------------------------
    // الاستجابة
    // --------------------------------------------------------
    return res.json({
      token,

      user: {
        ...publicUser(user),
        application,
      },
    });
  } catch (error) {
    console.error(
      '[AUTH] login error:',
      error
    );

    return res.status(500).json({
      message:
        'تعذر تسجيل الدخول',
    });
  }
});

/**
 * ============================================================
 * المستخدم الحالي
 * GET /api/auth/me
 * ============================================================
 */
router.get(
  '/me',
  auth,
  async (req, res) => {
    try {
      // ------------------------------------------------------
      // التحقق من وجود req.user
      // ------------------------------------------------------
      if (!req.user?.id) {
        return res.status(401).json({
          message:
            'Unauthorized',
        });
      }

      // ------------------------------------------------------
      // تحميل المستخدم الحالي
      // ------------------------------------------------------
      const user =
        await User.findById(
          req.user.id
        )
          .populate(
            'applicationId',
            'name slug logoUrl isActive'
          )
          .lean();

      // ------------------------------------------------------
      // المستخدم غير موجود
      // ------------------------------------------------------
      if (!user) {
        return res.status(404).json({
          message:
            'المستخدم غير موجود',
        });
      }

      // ------------------------------------------------------
      // تجهيز بيانات التطبيق
      // ------------------------------------------------------
      let application = null;

      if (
        user.applicationId &&
        typeof user.applicationId ===
          'object'
      ) {
        application = {
          _id: String(
            user.applicationId._id
          ),
          name:
            user.applicationId.name ||
            '',
          slug:
            user.applicationId.slug ||
            '',
          logoUrl:
            user.applicationId.logoUrl ||
            '',
          isActive:
            user.applicationId
              .isActive !== false,
        };
      }

      // ------------------------------------------------------
      // الاستجابة
      // ------------------------------------------------------
      return res.json({
        id: String(
          user._id
        ),

        username:
          user.username,

        displayName:
          user.displayName ||
          user.username,

        role:
          user.role,

        applicationId:
          user.applicationId
            ? String(
                user.applicationId._id ||
                user.applicationId
              )
            : null,

        application,

        isActive:
          user.isActive !== false,
      });
    } catch (error) {
      console.error(
        '[AUTH] /me error:',
        error
      );

      return res.status(500).json({
        message:
          error.message ||
          'فشل تحميل بيانات المستخدم',
      });
    }
  }
);

/**
 * ============================================================
 * تحديث / تجديد التوكن
 * POST /api/auth/refresh
 * ============================================================
 */
router.post(
  '/refresh',
  auth,
  async (req, res) => {
    try {
      if (!req.user?.id) {
        return res.status(401).json({
          message:
            'Unauthorized',
        });
      }

      const user =
        await User.findById(
          req.user.id
        );

      if (
        !user ||
        user.isActive === false
      ) {
        return res.status(401).json({
          message:
            'Unauthorized',
        });
      }

      const token =
        signUser(user);

      return res.json({
        token,
        user:
          publicUser(user),
      });
    } catch (error) {
      console.error(
        '[AUTH] refresh error:',
        error
      );

      return res.status(500).json({
        message:
          'تعذر تحديث الجلسة',
      });
    }
  }
);

/**
 * ============================================================
 * تسجيل الخروج
 * POST /api/auth/logout
 * ============================================================
 */
router.post(
  '/logout',
  auth,
  async (_req, res) => {
    return res.json({
      message:
        'تم تسجيل الخروج',
    });
  }
);

/**
 * ============================================================
 * تصدير الراوتر
 * ============================================================
 */
module.exports = {
  router,
  ensureBootstrap,
};