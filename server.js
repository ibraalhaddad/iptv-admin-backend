// ============================================================
// المسار: server.js
// ============================================================

require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

const app = express();

/* ============================================================
 * CORS
 * ============================================================ */

const allowedOrigins = String(
  process.env.CLIENT_ORIGIN || '',
)
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      /*
       * السماح للطلبات التي لا تحتوي Origin
       * مثل بعض طلبات الأجهزة والتطبيقات المحلية.
       *
       * وعند عدم تحديد CLIENT_ORIGIN يتم السماح للجميع.
       */
      if (
        !origin ||
        !allowedOrigins.length ||
        allowedOrigins.includes(origin)
      ) {
        return callback(null, true);
      }

      return callback(
        new Error('CORS origin not allowed'),
      );
    },

    credentials: true,
  }),
);

/* ============================================================
 * Body
 * ============================================================ */

app.use(
  express.json({
    limit: '4mb',
  }),
);

/*
 * دعم Form URL Encoded
 */
app.use(
  express.urlencoded({
    extended: true,
    limit: '4mb',
  }),
);

/* ============================================================
 * Uploads
 * ============================================================ */

app.use(
  '/uploads',
  express.static(
    path.join(
      __dirname,
      'uploads',
    ),
  ),
);

/* ============================================================
 * Helpers
 * ============================================================ */

/*
 * بعض ملفات routes في المشروع تصدر:
 *
 * module.exports = router
 *
 * وبعضها تصدر:
 *
 * module.exports = {
 *   router,
 *   ...
 * }
 *
 * لذلك نستخدم هذا helper
 * للحصول دائمًا على Express Router.
 */
function resolveRouter(
  moduleValue,
  routeName,
) {
  if (
    typeof moduleValue === 'function'
  ) {
    return moduleValue;
  }

  if (
    moduleValue &&
    typeof moduleValue.router ===
      'function'
  ) {
    return moduleValue.router;
  }

  throw new TypeError(
    `Route "${routeName}" did not export an Express router/function.`,
  );
}

/* ============================================================
 * Routes Modules
 * ============================================================ */

const authModule =
  require('./routes/auth');

const settingsModule =
  require('./routes/settings');

const themesModule =
  require('./routes/themes');

const bannersModule =
  require('./routes/banners');

const devicesModule =
  require('./routes/devices');

const macUsersModule =
  require('./routes/macUsers');

const ownerModule =
  require('./routes/owner');

const appConfigModule =
  require('./routes/appConfig');

const statsModule =
  require('./routes/stats');

const dnsModule =
  require('./routes/dns');

const applicationsModule =
  require('./routes/applications');

const notificationsModule =
  require('./routes/notifications');

const remoteUpdatesModule =
  require('./routes/remote-updates');

/* ============================================================
 * Resolved Routers
 * ============================================================ */

const auth =
  resolveRouter(
    authModule,
    'auth',
  );

const settings =
  resolveRouter(
    settingsModule,
    'settings',
  );

const themes =
  resolveRouter(
    themesModule,
    'themes',
  );

const banners =
  resolveRouter(
    bannersModule,
    'banners',
  );

const devices =
  resolveRouter(
    devicesModule,
    'devices',
  );

const macUsers =
  resolveRouter(
    macUsersModule,
    'macUsers',
  );

const owner =
  resolveRouter(
    ownerModule,
    'owner',
  );

const appConfig =
  resolveRouter(
    appConfigModule,
    'appConfig',
  );

const stats =
  resolveRouter(
    statsModule,
    'stats',
  );

const dns =
  resolveRouter(
    dnsModule,
    'dns',
  );

const applications =
  resolveRouter(
    applicationsModule,
    'applications',
  );

const notifications =
  resolveRouter(
    notificationsModule,
    'notifications',
  );

const remoteUpdates =
  resolveRouter(
    remoteUpdatesModule,
    'remote-updates',
  );

/* ============================================================
 * Route Diagnostics
 * ============================================================ */

console.log(
  '✅ Auth router loaded',
);

console.log(
  '✅ Settings router loaded',
);

console.log(
  '✅ Themes router loaded',
);

console.log(
  '✅ Banners router loaded',
);

console.log(
  '✅ Devices router loaded',
);

console.log(
  '✅ MAC Users router loaded',
);

console.log(
  '✅ Owner router loaded',
);

console.log(
  '✅ App Config router loaded',
);

console.log(
  '✅ Stats router loaded',
);

console.log(
  '✅ DNS router loaded',
);

console.log(
  '✅ Applications router loaded',
);

console.log(
  '✅ Notifications router loaded',
);

console.log(
  '✅ Remote Updates router loaded',
);

/* ============================================================
 * Dedicated Routes
 * ============================================================ */

/*
 * Authentication
 *
 * /api/auth/login
 * /api/auth/me
 * /api/auth/refresh
 * /api/auth/logout
 */
app.use(
  '/api/auth',
  auth,
);

/*
 * Settings
 */
app.use(
  '/api/settings',
  settings,
);

/*
 * Themes
 */
app.use(
  '/api/themes',
  themes,
);

/*
 * Banners
 */
app.use(
  '/api/banners',
  banners,
);

/*
 * Device MACs
 */
app.use(
  '/api/device-macs',
  devices,
);

/*
 * MAC Users
 */
app.use(
  '/api/mac-users',
  macUsers,
);

/*
 * Owner
 */
app.use(
  '/api/owner',
  owner,
);

/*
 * App Config
 *
 * المسارات المدعومة:
 *
 * /api/app/*
 * /api/app-config/*
 */
app.use(
  '/api/app',
  appConfig,
);

app.use(
  '/api/app-config',
  appConfig,
);

/*
 * Stats
 */
app.use(
  '/api/stats',
  stats,
);

/*
 * DNS
 */
app.use(
  '/api/dns',
  dns,
);

/*
 * Applications
 */
app.use(
  '/api/applications',
  applications,
);

/*
 * Notifications
 */
app.use(
  '/api/notifications',
  notifications,
);

/*
 * Remote Updates
 */
app.use(
  '/api/remote-updates',
  remoteUpdates,
);

/* ============================================================
 * Generic Entity Routes
 * ============================================================ */

const entitiesModule =
  require('./routes/entities');

if (
  !entitiesModule ||
  typeof entitiesModule.make !==
    'function'
) {
  throw new TypeError(
    'Route "entities" must export a make(type) function.',
  );
}

const { make } =
  entitiesModule;

/*
 * المسارات التي يتم إنشاؤها من entities.
 *
 * لا نضع:
 *
 * notifications
 * remote-updates
 *
 * هنا لأنها Routes مستقلة.
 */
const entityTypes = [
  'users',
  'packages',
  'hosts',
  'lines',
  'coupons',
  'offers',
  'activation-codes',
  'sports',
  'tmdb',
];

for (
  const type of entityTypes
) {
  const entityRouter =
    make(type);

  if (
    typeof entityRouter !==
    'function'
  ) {
    throw new TypeError(
      `Entity route "${type}" did not return an Express router/function.`,
    );
  }

  app.use(
    `/api/${type}`,
    entityRouter,
  );

  console.log(
    `✅ Entity route loaded: /api/${type}`,
  );
}

/* ============================================================
 * Health
 * ============================================================ */

app.get(
  '/api/health',
  (_req, res) => {
    return res.json({
      ok: true,
      service: 'iptv-admin',
      mongodb:
        mongoose.connection.readyState ===
        1,
    });
  },
);

/* ============================================================
 * Root
 * ============================================================ */

app.get(
  '/',
  (_req, res) => {
    return res.json({
      ok: true,
      service: 'iptv-admin',
      message:
        'IPTV Admin API is running',
    });
  },
);

/* ============================================================
 * 404
 * ============================================================ */

app.use(
  (req, res, next) => {
    /*
     * API -> JSON
     */
    if (
      req.path.startsWith('/api/')
    ) {
      return res.status(404).json({
        success: false,
        message:
          'API endpoint not found',
        path: req.path,
        method: req.method,
      });
    }

    /*
     * أي مسار غير API
     * نمرره للـ error handler
     */
    return next();
  },
);

/* ============================================================
 * Error Handler
 * ============================================================ */

app.use(
  (
    err,
    _req,
    res,
    _next,
  ) => {
    console.error(
      '[SERVER ERROR]',
      err,
    );

    const statusCode =
      Number(err?.status) ||
      Number(err?.statusCode) ||
      500;

    return res
      .status(statusCode)
      .json({
        success: false,
        message:
          err?.message ||
          'Internal server error',
      });
  },
);

/* ============================================================
 * Start
 * ============================================================ */

async function start() {
  /* ==========================================================
   * Environment
   * ========================================================== */

  const mongoUri =
    process.env.MONGODB_URI ||
    'mongodb://127.0.0.1:27017/iptv_admin';

  const port =
    Number(
      process.env.PORT || 5000,
    );

  console.log('');
  console.log(
    '============================================================',
  );

  console.log(
    '🚀 Starting IPTV Admin Server...',
  );

  console.log(
    `📡 PORT: ${port}`,
  );

  console.log(
    `🌐 CLIENT_ORIGIN: ${
      process.env.CLIENT_ORIGIN ||
      '(all origins)'
    }`,
  );

  console.log(
    `🗄️ MongoDB: ${mongoUri}`,
  );

  console.log(
    '============================================================',
  );

  console.log('');

  /* ==========================================================
   * MongoDB
   * ========================================================== */

  await mongoose.connect(
    mongoUri,
  );

  console.log(
    '✅ MongoDB connected',
  );

  /* ==========================================================
   * Theme Cleanup
   * ========================================================== */

  try {
    if (
      themesModule &&
      typeof themesModule.ensureDefaultThemes ===
        'function'
    ) {
      await themesModule.ensureDefaultThemes();
    }

    console.log(
      '✅ Theme cleanup completed',
    );
  } catch (error) {
    console.error(
      '❌ Theme cleanup failed:',
      error,
    );

    /*
     * لا نوقف الخادم بسبب فشل
     * تنظيف الثيمات.
     */
  }

  /* ==========================================================
   * Indexes
   * ========================================================== */

  const indexedModels = [
    'Setting',
    'DeviceMac',
    'MacUser',
    'Banner',
    'Entity',
    'DnsEntry',
  ];

  for (
    const name of indexedModels
  ) {
    try {
      const model =
        mongoose.model(name);

      await model.syncIndexes();

      console.log(
        `[INDEX] ${name}: synced`,
      );
    } catch (error) {
      console.warn(
        `[INDEX] ${name}:`,
        error.message,
      );
    }
  }

  /* ==========================================================
   * Auth Bootstrap
   * ========================================================== */

  try {
    if (
      authModule &&
      typeof authModule.ensureBootstrap ===
        'function'
    ) {
      const admin =
        await authModule.ensureBootstrap();

      console.log(
        `✅ Auth bootstrap completed: ${
          admin?.username ||
          process.env.ADMIN_USERNAME ||
          'admin'
        }`,
      );

      console.log(
        `[AUTH] Role: ${
          admin?.role ||
          'unknown'
        }`,
      );

      console.log(
        `[AUTH] Active: ${
          admin?.isActive !== false
        }`,
      );
    } else {
      console.warn(
        '⚠️ ensureBootstrap() غير موجود في routes/auth.js',
      );
    }
  } catch (error) {
    console.error(
      '❌ Auth bootstrap failed:',
      error,
    );

    /*
     * لا نوقف الخادم هنا حتى لا تمنع
     * مشكلة bootstrap تشغيل بقية API.
     */
  }

  /* ==========================================================
   * Server
   * ========================================================== */

  const server =
    app.listen(
      port,
      '0.0.0.0',
      () => {
        console.log('');
        console.log(
          '============================================================',
        );

        console.log(
          `🚀 IPTV Admin API running on port ${port}`,
        );

        console.log(
          `🌐 Local: http://localhost:${port}`,
        );

        console.log(
          `🌐 Network: http://0.0.0.0:${port}`,
        );

        console.log(
          '============================================================',
        );

        console.log(
          '🔐 Authentication:',
        );

        console.log(
          `   POST /api/auth/login`,
        );

        console.log(
          `   GET  /api/auth/me`,
        );

        console.log(
          `   POST /api/auth/refresh`,
        );

        console.log(
          `   POST /api/auth/logout`,
        );

        console.log(
          '📱 Public App Config:',
        );

        console.log(
          `   GET /api/app-config/home`,
        );

        console.log(
          `   GET /api/app-config/theme`,
        );

        console.log(
          `   GET /api/app-config/banners`,
        );

        console.log(
          '🎨 Themes:',
        );

        console.log(
          `   /api/themes`,
        );

        console.log(
          '📦 Applications:',
        );

        console.log(
          `   /api/applications`,
        );

        console.log(
          `   /api/applications/me`,
        );

        console.log(
          '📤 Uploads:',
        );

        console.log(
          `   /uploads/*`,
        );

        console.log(
          '❤️ Health:',
        );

        console.log(
          `   GET /api/health`,
        );

        console.log(
          '============================================================',
        );

        console.log('');
      },
    );

  /* ==========================================================
   * Server Errors
   * ========================================================== */

  server.on(
    'error',
    (error) => {
      if (
        error.code ===
        'EADDRINUSE'
      ) {
        console.error('');
        console.error(
          `❌ المنفذ ${port} مستخدم بالفعل.`,
        );
        console.error(
          '❌ أغلق عملية Node القديمة ثم شغل الخادم من جديد.',
        );
        console.error('');
      } else {
        console.error(
          '❌ HTTP server error:',
          error,
        );
      }
    },
  );
}

/* ============================================================
 * Start
 * ============================================================ */

start().catch(
  async (error) => {
    console.error('');
    console.error(
      '❌ Server startup error:',
      error,
    );
    console.error('');

    try {
      await mongoose.disconnect();
    } catch (_) {
      // تجاهل خطأ الإغلاق
    }

    process.exit(1);
  },
);