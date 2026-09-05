// المسار: routes/appConfig.js

const express = require('express');

const Setting = require('../models/Setting');
const Banner = require('../models/Banner');
const Application = require('../models/Application');
const DnsEntry = require('../models/DnsEntry');

const { THEMES } = require('./themes');

const router = express.Router();

// ============================================================
// Helpers
// ============================================================

function getApplicationId(req) {
  return (
    req.query?.applicationId ||
    req.headers['x-application-id'] ||
    null
  );
}

function appFilter(req) {
  const applicationId =
    getApplicationId(req);

  return applicationId
    ? { applicationId }
    : { applicationId: null };
}

async function getApplication(req) {
  const applicationId =
    getApplicationId(req);

  if (!applicationId) {
    return null;
  }

  return Application.findById(
    applicationId,
  )
    .select(
      '_id name slug description logoUrl isActive',
    )
    .lean();
}

function absoluteUrl(
  req,
  value,
) {
  const raw =
    String(value || '').trim();

  if (!raw) {
    return '';
  }

  if (
    /^https?:\/\//i.test(
      raw,
    )
  ) {
    return raw;
  }

  return (
    `${req.protocol}://${req.get(
      'host',
    )}` +
    `${
      raw.startsWith('/')
        ? raw
        : `/${raw}`
    }`
  );
}

// ============================================================
// DNS
// ============================================================

async function getApplicationDns(
  applicationId,
) {
  if (!applicationId) {
    return [];
  }

  const entries =
    await DnsEntry.find({
      applicationId,
      isActive: true,
    })
      .select(
        '_id name url normalizedUrl description isActive lastCheck createdAt updatedAt',
      )
      .sort({
        createdAt: 1,
      })
      .lean();

  return entries
    .map(
      entry => ({
        id:
          String(
            entry._id,
          ),

        name:
          String(
            entry.name ||
              '',
          ).trim(),

        url:
          String(
            entry.normalizedUrl ||
              entry.url ||
              '',
          ).trim(),

        description:
          String(
            entry.description ||
              '',
          ).trim(),

        isActive:
          entry.isActive !== false,

        lastCheck:
          entry.lastCheck ||
          null,

        createdAt:
          entry.createdAt ||
          null,

        updatedAt:
          entry.updatedAt ||
          null,
      }),
    )
    .filter(
      entry =>
        Boolean(
          entry.url,
        ),
    );
}

// ============================================================
// GET /api/app-config/theme
// ============================================================

router.get(
  '/theme',
  async (
    req,
    res,
  ) => {
    try {
      const row =
        await Setting.findOne({
          ...appFilter(req),
          key:
            'active_theme_id',
        });

      return res.json({
        themeId:
          row?.value ||
          THEMES[0]?.themeId,
      });
    } catch (
      error
    ) {
      console.error(
        '[APP-CONFIG] theme:',
        error,
      );

      return res.status(
        500,
      ).json({
        success: false,
        message:
          'فشل تحميل الثيم',
      });
    }
  },
);

// ============================================================
// GET /api/app-config/banners
// ============================================================

router.get(
  '/banners',
  async (
    req,
    res,
  ) => {
    try {
      const now =
        new Date();

      const banners =
        await Banner.find({
          ...appFilter(req),

          isActive:
            true,

          $and: [
            {
              $or: [
                {
                  startAt:
                    null,
                },

                {
                  startAt: {
                    $lte:
                      now,
                  },
                },
              ],
            },

            {
              $or: [
                {
                  endAt:
                    null,
                },

                {
                  endAt: {
                    $gte:
                      now,
                  },
                },
              ],
            },
          ],
        }).sort({
          sortOrder:
            1,

          createdAt:
            -1,
        });

      return res.json({
        success:
          true,

        banners,
      });
    } catch (
      error
    ) {
      console.error(
        '[APP-CONFIG] banners:',
        error,
      );

      return res.status(
        500,
      ).json({
        success: false,
        message:
          'فشل تحميل العروض',
      });
    }
  },
);

// ============================================================
// GET /api/app-config/home
// ============================================================

router.get(
  '/home',
  async (
    req,
    res,
  ) => {
    try {
      const now =
        new Date();

      const applicationId =
        getApplicationId(
          req,
        );

      const filter =
        appFilter(req);

      const [
        themeRow,
        banners,
        application,
        settingRows,
        dnsEntries,
      ] =
        await Promise.all([
          // ----------------------------------------------------
          // Theme
          // ----------------------------------------------------

          Setting.findOne({
            ...filter,
            key:
              'active_theme_id',
          }).lean(),

          // ----------------------------------------------------
          // Banners
          // ----------------------------------------------------

          Banner.find({
            ...filter,

            isActive:
              true,

            $and: [
              {
                $or: [
                  {
                    startAt:
                      null,
                  },

                  {
                    startAt: {
                      $lte:
                        now,
                    },
                  },
                ],
              },

              {
                $or: [
                  {
                    endAt:
                      null,
                  },

                  {
                    endAt: {
                      $gte:
                        now,
                    },
                  },
                ],
              },
            ],
          }).sort({
            sortOrder:
              1,

            createdAt:
              -1,
          }),

          // ----------------------------------------------------
          // Application
          // ----------------------------------------------------

          getApplication(req),

          // ----------------------------------------------------
          // Normal settings
          //
          // DNS القديمة مستبعدة بالكامل.
          // ----------------------------------------------------

          Setting.find({
            ...filter,

            key: {
              $nin: [
                'dns_primary',
                'dns_secondary',
                'dns_third',
                'dns_fourth',
              ],
            },
          }).lean(),

          // ----------------------------------------------------
          // Official DNS source
          // ----------------------------------------------------

          getApplicationDns(
            applicationId,
          ),
        ]);

      // ========================================================
      // Settings
      // ========================================================

      const settings =
        {};

      for (
        const row of settingRows
      ) {
        if (
          !row ||
          !row.key
        ) {
          continue;
        }

        settings[
          row.key
        ] =
          row.value;
      }

      // ========================================================
      // Application
      // ========================================================

      if (
        application
      ) {
        application.logoUrl =
          absoluteUrl(
            req,
            application.logoUrl,
          );
      }

      // ========================================================
      // Theme
      // ========================================================

      const activeThemeId =
        themeRow?.value ||
        settings.active_theme_id ||
        THEMES[0]?.themeId;

      // ========================================================
      // DNS
      // ========================================================

      const dns =
        dnsEntries.map(
          entry => ({
            id:
              entry.id,

            name:
              entry.name,

            url:
              entry.url,

            description:
              entry.description,

            isActive:
              entry.isActive,

            lastCheck:
              entry.lastCheck,

            createdAt:
              entry.createdAt,

            updatedAt:
              entry.updatedAt,
          }),
        );

      console.log(
        '[APP-CONFIG] Application:',
        applicationId,
      );

      console.log(
        '[APP-CONFIG] Active DNS count:',
        dns.length,
      );

      // لا نسجل كلمات المرور أو بيانات حساسة.

      return res.json({
        success:
          true,

        applicationId,

        application,

        settings: {
          ...settings,

          active_theme_id:
            activeThemeId,
        },

        /*
         * المصدر الرسمي الوحيد للـDNS.
         */
        dns,

        dnsCount:
          dns.length,

        banners,

        themeId:
          activeThemeId,
      });
    } catch (
      error
    ) {
      console.error(
        '[APP-CONFIG] home:',
        error,
      );

      return res.status(
        500,
      ).json({
        success:
          false,

        message:
          error?.message ||
          'فشل تحميل إعدادات التطبيق',
      });
    }
  },
);

module.exports =
  router;