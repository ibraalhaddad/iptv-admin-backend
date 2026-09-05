
// ============================================================
// المسار: server.js
// IPTV Admin Backend
// ============================================================

require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();

/* ============================================================
 * Environment
 * ============================================================ */

const NODE_ENV =
  String(
    process.env.NODE_ENV || 'development',
  ).trim().toLowerCase();

const IS_PRODUCTION =
  NODE_ENV === 'production';

const HOST =
  String(
    process.env.HOST || '0.0.0.0',
  ).trim() || '0.0.0.0';

const PORT =
  Number(
    process.env.PORT || 5000,
  );

/*
 * في الإنتاج يجب أن يكون MONGODB_URI موجودًا.
 *
 * في التطوير المحلي فقط نسمح بالقيمة الافتراضية.
 */
const MONGODB_URI =
  String(
    process.env.MONGODB_URI ||
    (!IS_PRODUCTION
      ? 'mongodb://127.0.0.1:27017/iptv_admin'
      : ''),
  ).trim();

/*
 * CLIENT_ORIGIN:
 *
 * يمكن وضع أكثر من origin مفصولًا بفاصلة:
 *
 * CLIENT_ORIGIN=https://admin.example.com,https://example.com
 *
 * الطلبات القادمة بدون Origin مسموحة،
 * وهذا مهم لتطبيق React Native وبعض الأجهزة.
 */
const allowedOrigins = String(
  process.env.CLIENT_ORIGIN || '',
)
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

/* ============================================================
 * Validation
 * ============================================================ */

if (!MONGODB_URI) {
  console.error('');
  console.error(
    '❌ MONGODB_URI is not configured.',
  );
  console.error(
    '❌ Set MONGODB_URI in the deployment environment.',
  );
  console.error('');

  process.exit(1);
}

if (
  !Number.isFinite(PORT) ||
  PORT <= 0
) {
  console.error('');
  console.error(
    '❌ Invalid PORT value.',
  );
  console.error('');

  process.exit(1);
}

/* ============================================================
 * Express
 * ============================================================ */

if (IS_PRODUCTION) {
  /*
   * مفيد عند وجود reverse proxy مثل:
   * Nginx / Render / Railway / Fly / etc.
   */
  app.set(
    'trust proxy',
    1,
  );
}

/* ============================================================
 * Basic Headers
 * ============================================================ */

app.disable('x-powered-by');

/* ============================================================
 * CORS
 * ============================================================ */

app.use(
  cors({
    origin: (
      origin,
      callback,
    ) => {
      /*
       * الطلبات بدون Origin:
       *
       * React Native
       * بعض الأجهزة
       * Postman
       * Server-to-server
       */
      if (!origin) {
        return callback(
          null,
          true,
        );
      }

      /*
       * إذا لم يتم تحديد CLIENT_ORIGIN
       * نسمح بكل origins.
       *
       * مناسب للتطوير.
       */
      if (
        allowedOrigins.length === 0
      ) {
        return callback(
          null,
          true,
        );
      }

      if (
        allowedOrigins.includes(
          origin,
        )
      ) {
        return callback(
          null,
          true,
        );
      }

      return callback(
        new Error(
          'CORS origin not allowed',
        ),
      );
    },

    credentials: true,

    methods: [
      'GET',
      'HEAD',
      'POST',
      'PUT',
      'PATCH',
      'DELETE',
      'OPTIONS',
    ],

    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Accept',
      'Origin',
      'X-Requested-With',
      'X-Application-Id',
      'X-Device-Id',
      'X-API-Key',
    ],
  }),
);

/* ============================================================
 * Request Body
 * ============================================================ */

app.use(
  express.json({
    limit:
      process.env.JSON_BODY_LIMIT ||
      '4mb',
  }),
);

app.use(
  express.urlencoded({
    extended: true,
    limit:
      process.env.URLENCODED_BODY_LIMIT ||
      '4mb',
  }),
);

/* ============================================================
 * Uploads
 * ============================================================ */

const uploadsDirectory =
  path.join(
    __dirname,
    'uploads',
  );

/*
 * إنشاء مجلد uploads إذا لم يكن موجودًا.
 */
try {
  fs.mkdirSync(
    uploadsDirectory,
    {
      recursive: true,
    },
  );
} catch (error) {
  console.error(
    '❌ Failed to create uploads directory:',
    error,
  );

  process.exit(1);
}

/*
 * الملفات المرفوعة:
 *
 * /uploads/*
 */
app.use(
  '/uploads',
  express.static(
    uploadsDirectory,
    {
      fallthrough: true,

      /*
       * Cache للصور والملفات الثابتة.
       */
      maxAge: IS_PRODUCTION
        ? '7d'
        : 0,

      etag: true,

      index: false,
    },
  ),
);

/* ============================================================
 * Helpers
 * ============================================================ */

function resolveRouter(
  moduleValue,
  routeName,
) {
  /*
   * module.exports = router
   */
  if (
    typeof moduleValue ===
    'function'
  ) {
    return moduleValue;
  }

  /*
   * module.exports = {
   *   router,
   * }
   */
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

console.log('✅ Auth router loaded');
console.log('✅ Settings router loaded');
console.log('✅ Themes router loaded');
console.log('✅ Banners router loaded');
console.log('✅ Devices router loaded');
console.log('✅ MAC Users router loaded');
console.log('✅ Owner router loaded');
console.log('✅ App Config router loaded');
console.log('✅ Stats router loaded');
console.log('✅ DNS router loaded');
console.log('✅ Applications router loaded');
console.log('✅ Notifications router loaded');
console.log('✅ Remote Updates router loaded');

/* ============================================================
 * Dedicated Routes
 * ============================================================ */

app.use(
  '/api/auth',
  auth,
);

app.use(
  '/api/settings',
  settings,
);

app.use(
  '/api/themes',
  themes,
);

app.use(
  '/api/banners',
  banners,
);

app.use(
  '/api/device-macs',
  devices,
);

app.use(
  '/api/mac-users',
  macUsers,
);

app.use(
  '/api/owner',
  owner,
);

app.use(
  '/api/app',
  appConfig,
);

app.use(
  '/api/app-config',
  appConfig,
);

app.use(
  '/api/stats',
  stats,
);

app.use(
  '/api/dns',
  dns,
);

app.use(
  '/api/applications',
  applications,
);

app.use(
  '/api/notifications',
  notifications,
);

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
    const mongoState =
      mongoose.connection.readyState;

    return res.json({
      ok: true,

      service:
        'iptv-admin',

      environment:
        NODE_ENV,

      mongodb:
        mongoState === 1,

      mongodbState:
        mongoState,

      timestamp:
        new Date().toISOString(),
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

      service:
        'iptv-admin',

      message:
        'IPTV Admin API is running',

      environment:
        NODE_ENV,

      health:
        '/api/health',

      uploads:
        '/uploads/',
    });
  },
);

/* ============================================================
 * API 404
 * ============================================================ */

app.use(
  (req, res, next) => {
    if (
      req.path.startsWith(
        '/api/',
      )
    ) {
      return res
        .status(404)
        .json({
          success: false,

          message:
            'API endpoint not found',

          path:
            req.path,

          method:
            req.method,
        });
    }

    return next();
  },
);

/* ============================================================
 * General 404
 * ============================================================ */

app.use(
  (req, res) => {
    return res
      .status(404)
      .json({
        success: false,

        message:
          'Endpoint not found',

        path:
          req.path,

        method:
          req.method,
      });
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
      err?.stack ||
      err?.message ||
      err,
    );

    const statusCode =
      Number(
        err?.status,
      ) ||
      Number(
        err?.statusCode,
      ) ||
      500;

    /*
     * أخطاء CORS
     */
    if (
      err?.message ===
      'CORS origin not allowed'
    ) {
      return res
        .status(403)
        .json({
          success: false,

          message:
            'CORS origin not allowed',
        });
    }

    /*
     * لا نعرض stack trace للمستخدم
     * خصوصًا في production.
     */
    return res
      .status(
        statusCode >= 400 &&
          statusCode < 600
          ? statusCode
          : 500,
      )
      .json({
        success: false,

        message:
          err?.message ||
          'Internal server error',
      });
  },
);

/* ============================================================
 * MongoDB Connection
 * ============================================================ */

let server = null;

async function connectMongoDB() {
  console.log('');
  console.log(
    '============================================================',
  );

  console.log(
    '🗄️ Connecting to MongoDB...',
  );

  /*
   * لا نطبع MONGODB_URI
   * لأنها قد تحتوي على كلمة مرور.
   */

  console.log(
    `🌍 Environment: ${NODE_ENV}`,
  );

  console.log(
    '============================================================',
  );

  console.log('');

  await mongoose.connect(
    MONGODB_URI,
    {
      /*
       * محاولات الاتصال الافتراضية
       * مناسبة للنشر.
       */
      serverSelectionTimeoutMS:
        Number(
          process.env.MONGODB_SERVER_SELECTION_TIMEOUT ||
          15000,
        ),

      connectTimeoutMS:
        Number(
          process.env.MONGODB_CONNECT_TIMEOUT ||
          15000,
        ),

      socketTimeoutMS:
        Number(
          process.env.MONGODB_SOCKET_TIMEOUT ||
          45000,
        ),
    },
  );

  console.log(
    '✅ MongoDB connected',
  );
}

/* ============================================================
 * MongoDB Events
 * ============================================================ */

mongoose.connection.on(
  'connected',
  () => {
    console.log(
      '✅ MongoDB connection established',
    );
  },
);

mongoose.connection.on(
  'error',
  (error) => {
    console.error(
      '❌ MongoDB error:',
      error?.message ||
      error,
    );
  },
);

mongoose.connection.on(
  'disconnected',
  () => {
    console.warn(
      '⚠️ MongoDB disconnected',
    );
  },
);

/* ============================================================
 * Theme Cleanup
 * ============================================================ */

async function runThemeCleanup() {
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
}

/* ============================================================
 * Indexes
 * ============================================================ */

async function syncIndexes() {
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
        `[INDEX] ${name}: ${error?.message ||
        error
        }`,
      );
    }
  }
}

/* ============================================================
 * Auth Bootstrap
 * ============================================================ */

async function runAuthBootstrap() {
  try {
    if (
      authModule &&
      typeof authModule.ensureBootstrap ===
      'function'
    ) {
      const admin =
        await authModule.ensureBootstrap();

      console.log(
        `✅ Auth bootstrap completed: ${admin?.username ||
        process.env.ADMIN_USERNAME ||
        'admin'
        }`,
      );

      console.log(
        `[AUTH] Role: ${admin?.role ||
        'unknown'
        }`,
      );

      console.log(
        `[AUTH] Active: ${admin?.isActive !== false
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
     * لا نوقف الخادم.
     */
  }
}

/* ============================================================
 * Start HTTP Server
 * ============================================================ */

async function startHttpServer() {
  server =
    app.listen(
      PORT,
      HOST,
      () => {
        console.log('');
        console.log(
          '============================================================',
        );

        console.log(
          `🚀 IPTV Admin API running on ${HOST}:${PORT}`,
        );

        console.log(
          `🌐 Environment: ${NODE_ENV}`,
        );

        console.log(
          `🌐 CLIENT_ORIGIN: ${allowedOrigins.length
            ? allowedOrigins.join(', ')
            : '(all origins)'
          }`,
        );

        console.log('');

        console.log(
          '🔐 Authentication:',
        );

        console.log(
          '   POST /api/auth/login',
        );

        console.log(
          '   GET  /api/auth/me',
        );

        console.log(
          '   POST /api/auth/refresh',
        );

        console.log(
          '   POST /api/auth/logout',
        );

        console.log('');

        console.log(
          '📱 Public App Config:',
        );

        console.log(
          '   GET /api/app-config/home',
        );

        console.log(
          '   GET /api/app-config/theme',
        );

        console.log(
          '   GET /api/app-config/banners',
        );

        console.log('');

        console.log(
          '🎨 Themes:',
        );

        console.log(
          '   /api/themes',
        );

        console.log('');

        console.log(
          '📦 Applications:',
        );

        console.log(
          '   /api/applications',
        );

        console.log(
          '   /api/applications/me',
        );

        console.log('');

        console.log(
          '📤 Uploads:',
        );

        console.log(
          '   /uploads/*',
        );

        console.log('');

        console.log(
          '❤️ Health:',
        );

        console.log(
          '   GET /api/health',
        );

        console.log(
          '============================================================',
        );

        console.log('');
      },
    );

  server.on(
    'error',
    (error) => {
      if (
        error.code ===
        'EADDRINUSE'
      ) {
        console.error('');
        console.error(
          `❌ المنفذ ${PORT} مستخدم بالفعل.`,
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
 * Graceful Shutdown
 * ============================================================ */

let isShuttingDown =
  false;

async function shutdown(
  signal,
) {
  if (
    isShuttingDown
  ) {
    return;
  }

  isShuttingDown =
    true;

  console.log('');
  console.log(
    `🛑 Received ${signal}. Shutting down...`,
  );

  try {
    if (server) {
      await new Promise(
        (resolve) => {
          server.close(
            () => {
              console.log(
                '✅ HTTP server closed',
              );

              resolve();
            },
          );
        },
      );
    }
  } catch (error) {
    console.error(
      '❌ HTTP server shutdown error:',
      error,
    );
  }

  try {
    if (
      mongoose.connection
    ) {
      await mongoose.disconnect();

      console.log(
        '✅ MongoDB disconnected',
      );
    }
  } catch (error) {
    console.error(
      '❌ MongoDB shutdown error:',
      error,
    );
  }

  process.exit(0);
}

process.on(
  'SIGINT',
  () =>
    shutdown(
      'SIGINT',
    ),
);

process.on(
  'SIGTERM',
  () =>
    shutdown(
      'SIGTERM',
    ),
);

/* ============================================================
 * Global Process Errors
 * ============================================================ */

process.on(
  'unhandledRejection',
  (reason) => {
    console.error(
      '❌ Unhandled Promise Rejection:',
      reason,
    );
  },
);

process.on(
  'uncaughtException',
  (error) => {
    console.error(
      '❌ Uncaught Exception:',
      error,
    );

    /*
     * في حالة خطأ قاتل، الأفضل إنهاء
     * العملية حتى تعيد منصة الاستضافة
     * تشغيلها بشكل نظيف.
     */
    process.exit(1);
  },
);

/* ============================================================
 * Start Application
 * ============================================================ */

async function start() {
  try {
    console.log('');
    console.log(
      '============================================================',
    );

    console.log(
      '🚀 Starting IPTV Admin Server...',
    );

    console.log(
      `📡 PORT: ${PORT}`,
    );

    console.log(
      `🌐 HOST: ${HOST}`,
    );

    console.log(
      `🌍 NODE_ENV: ${NODE_ENV}`,
    );

    console.log(
      `🌐 CLIENT_ORIGIN: ${allowedOrigins.length
        ? allowedOrigins.join(', ')
        : '(all origins)'
      }`,
    );

    console.log(
      `📤 Uploads: ${uploadsDirectory}`,
    );

    console.log(
      '🗄️ MongoDB: configured',
    );

    console.log(
      '============================================================',
    );

    console.log('');

    /* ---------------------------------------------------------- */
    /* MongoDB                                                     */
    /* ---------------------------------------------------------- */

    await connectMongoDB();

    /* ---------------------------------------------------------- */
    /* Theme                                                       */
    /* ---------------------------------------------------------- */

    await runThemeCleanup();

    /* ---------------------------------------------------------- */
    /* Indexes                                                     */
    /* ---------------------------------------------------------- */

    await syncIndexes();

    /* ---------------------------------------------------------- */
    /* Auth                                                        */
    /* ---------------------------------------------------------- */

    await runAuthBootstrap();

    /* ---------------------------------------------------------- */
    /* HTTP                                                        */
    /* ---------------------------------------------------------- */

    await startHttpServer();
  } catch (error) {
    console.error('');
    console.error(
      '❌ Server startup error:',
      error,
    );

    console.error('');

    try {
      await mongoose.disconnect();
    } catch (_) {
      // تجاهل
    }

    process.exit(1);
  }
}

/* ============================================================
 * Run
 * ============================================================ */

start();
