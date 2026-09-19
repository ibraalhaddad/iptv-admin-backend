// ============================================================
// المسار: routes/themes.js
// ============================================================

const express = require('express');
const multer = require('multer');
const { uploadBuffer, deleteFile, isConfigured } = require('../services/imagekitStorage');

const Theme = require('../models/Theme');
const Setting = require('../models/Setting');

const {
  auth,
  requirePermission,
  requireRole,
} = require('../middleware/auth');

const router = express.Router();

/* Legacy built-in themes that must remain protected from deletion. */
const BUILTIN_THEME_IDS = new Set([
  'theme_01',
  'theme_02',
  'theme_03',
]);

/* ========================================================================= */
/* ImageKit upload                                                         */
/* ========================================================================= */

const upload = multer({
 storage: multer.memoryStorage(), limits:{fileSize:5*1024*1024},
 fileFilter: (_req,file,cb)=>{const ok=['image/jpeg','image/png','image/webp','image/svg+xml'].includes(file.mimetype);cb(ok?null:new Error('نوع الصورة غير مدعوم'),ok);}
});
async function uploadThemePreview(req,themeId){
 if(!req.file)return null;if(!isConfigured()){const e=new Error('تخزين الصور غير مهيأ. أضف إعدادات ImageKit.');e.status=503;throw e;}
 return uploadBuffer({buffer:req.file.buffer,fileName:req.file.originalname,contentType:req.file.mimetype,folder:`themes/${themeId}`,tags:['iptv','theme-preview',String(themeId)]});
}

function isBuiltInTheme(
  theme,
) {
  if (!theme) {
    return false;
  }

  const themeId =
    String(
      theme.themeId || '',
    ).trim();

  const previewImage =
    String(
      theme.previewImage || '',
    ).trim();

  if (
    BUILTIN_THEME_IDS.has(
      themeId,
    )
  ) {
    return true;
  }

  if (
    previewImage.startsWith(
      '/theme-previews/',
    )
  ) {
    return true;
  }

  return false;
}

/* ========================================================================= */
/* Legacy cleanup                                                           */
/* ========================================================================= */

let legacyThemesCleanupDone =
  false;

let legacyThemesCleanupPromise =
  null;

/*
 * يحذف الثيمات القديمة نهائيًا من MongoDB.
 *
 * يتم تنفيذ العملية مرة واحدة عند
 * بدء السيرفر أو أول طلب يحتاجها.
 */

async function removeLegacyBuiltInThemes() {
  if (
    legacyThemesCleanupDone
  ) {
    return;
  }

  if (
    legacyThemesCleanupPromise
  ) {
    return legacyThemesCleanupPromise;
  }

  legacyThemesCleanupPromise =
    (async () => {
      try {
        const legacyThemes =
          await Theme.find({
            $or: [
              {
                themeId: {
                  $in: [
                    'theme_01',
                    'theme_02',
                    'theme_03',
                  ],
                },
              },
              {
                previewImage: {
                  $regex:
                    '^/theme-previews/',
                },
              },
            ],
          }).lean();

        if (
          !legacyThemes.length
        ) {
          console.log(
            '[THEMES] لا توجد ثيمات قديمة للحذف ✅',
          );

          legacyThemesCleanupDone =
            true;

          return;
        }

        console.log(
          '[THEMES] 🗑️ الثيمات القديمة التي سيتم حذفها:',
          legacyThemes.map(
            (theme) => ({
              themeId:
                theme.themeId,
              name:
                theme.name,
              sortOrder:
                theme.sortOrder,
              previewImage:
                theme.previewImage,
            }),
          ),
        );

        /*
         * حذف إعدادات التطبيقات التي تشير
         * إلى الثيمات القديمة.
         */
        for (
          const theme of legacyThemes
        ) {
          const appThemeId =
            getApplicationThemeId(
              theme,
            );

          await Setting.deleteMany({
            key:
              'active_theme_id',
            $or: [
              {
                value:
                  theme.themeId,
              },
              {
                value:
                  appThemeId,
              },
            ],
          });

          await Setting.deleteMany({
            key:
              'global_default_theme_id',
            $or: [
              {
                value:
                  theme.themeId,
              },
              {
                value:
                  appThemeId,
              },
            ],
          });
        }

        /*
         * حذف الثيمات نهائيًا.
         */
        const deleteResult =
          await Theme.deleteMany({
            $or: [
              {
                themeId: {
                  $in:
                    legacyThemes.map(
                      (theme) =>
                        theme.themeId,
                    ),
                },
              },
              {
                previewImage: {
                  $regex:
                    '^/theme-previews/',
                },
              },
            ],
          });

        console.log(
          '[THEMES] ✅ تم حذف الثيمات القديمة نهائيًا:',
          deleteResult.deletedCount,
        );

        legacyThemesCleanupDone =
          true;
      } catch (error) {
        console.error(
          '[THEMES] ❌ فشل حذف الثيمات القديمة:',
          error,
        );

        legacyThemesCleanupPromise =
          null;

        throw error;
      }
    })();

  return legacyThemesCleanupPromise;
}

/* ========================================================================= */
/* Application Theme Number                                                 */
/* ========================================================================= */

/*
 * هذا هو الرقم النهائي الذي يذهب إلى تطبيق الهاتف.
 *
 * المصدر الأساسي:
 *
 * sortOrder
 *
 * مثال:
 *
 * sortOrder = 2
 * =>
 * "2"
 */

function getApplicationThemeId(
  theme,
) {
  if (!theme) {
    return '1';
  }

  const sortOrder =
    Number(
      theme.sortOrder,
    );

  if (
    Number.isFinite(
      sortOrder,
    ) &&
    sortOrder > 0
  ) {
    return String(
      Math.trunc(
        sortOrder,
      ),
    );
  }

  /*
   * توافق مع بيانات قديمة.
   */
  const directThemeId =
    String(
      theme.themeId ||
        '',
    ).trim();

  if (
    /^\d+$/.test(
      directThemeId,
    )
  ) {
    return directThemeId;
  }

  const match =
    directThemeId.match(
      /(\d+)/,
    );

  if (
    match?.[1]
  ) {
    return String(
      Number(
        match[1],
      ),
    );
  }

  return '1';
}

/* ========================================================================= */
/* Resolve stored theme                                                     */
/* ========================================================================= */

/*
 * يحول القيم التالية إلى رقم التطبيق:
 *
 * "2"
 * "theme_02"
 * "الموضوع-2-xtaj5r"
 *
 * النتيجة:
 *
 * "2"
 */

async function resolveApplicationThemeId(
  value,
) {
  const raw =
    String(
      value ?? '',
    ).trim();

  if (!raw) {
    return null;
  }

  /*
   * القيمة الجديدة.
   */
  if (
    /^\d+$/.test(
      raw,
    )
  ) {
    return raw;
  }

  /*
   * البحث بالـthemeId الداخلي.
   */
  const byThemeId =
    await Theme.findOne({
      themeId:
        raw,
      isActive:
        true,
    }).lean();

  if (
    byThemeId
  ) {
    return getApplicationThemeId(
      byThemeId,
    );
  }

  /*
   * استخراج الرقم من معرف قديم.
   */
  const numberMatch =
    raw.match(
      /(\d+)/,
    );

  if (
    numberMatch?.[1]
  ) {
    const number =
      Number(
        numberMatch[1],
      );

    if (
      Number.isFinite(
        number,
      ) &&
      number > 0
    ) {
      const bySortOrder =
        await Theme.findOne({
          sortOrder:
            number,
          isActive:
            true,
        }).lean();

      if (
        bySortOrder
      ) {
        return getApplicationThemeId(
          bySortOrder,
        );
      }

      return String(
        number,
      );
    }
  }

  /*
   * البحث بالاسم.
   */
  const byName =
    await Theme.findOne({
      name:
        raw,
      isActive:
        true,
    }).lean();

  if (
    byName
  ) {
    return getApplicationThemeId(
      byName,
    );
  }

  return null;
}

/* ========================================================================= */
/* Ensure themes                                                            */
/* ========================================================================= */

async function ensureDefaultThemes() {
  /*
   * لا ننشئ أي ثيمات افتراضية.
   *
   * نكتفي بحذف الثيمات القديمة مرة واحدة.
   */
  await removeLegacyBuiltInThemes();
}

/* ========================================================================= */
/* Get application id                                                       */
/* ========================================================================= */

function getApplicationId(
  req,
) {
  if (
    req.user?.role ===
    'app_owner'
  ) {
    return (
      req.user.applicationId ||
      null
    );
  }

  return (
    req.body?.applicationId ||
    req.query?.applicationId ||
    req.headers[
      'x-application-id'
    ] ||
    null
  );
}

/* ========================================================================= */
/* Remove uploaded image                                                    */
/* ========================================================================= */

function removeThemeImage(_imageUrl) {
  // Legacy local uploads are no longer writable in Deplexo.
  // Current assets are stored and deleted through ImageKit fileId.
}

/* ========================================================================= */
/* GET /api/themes                                                          */
/* ========================================================================= */

router.get(
  '/',
  auth,
  requirePermission(
    'themes.view',
  ),
  async (
    req,
    res,
  ) => {
    try {
      await ensureDefaultThemes();

      const allThemes =
        await Theme.find({
          isActive:
            true,
        })
          .sort({
            sortOrder:
              1,
            createdAt:
              -1,
          })
          .lean();

      /*
       * فقط الثيمات التي ليست
       * من الثيمات المدمجة القديمة.
       */
      const themes =
        allThemes.filter(
          (theme) =>
            !isBuiltInTheme(
              theme,
            ),
        );

      const applicationId =
        getApplicationId(
          req,
        );

      let selectedThemeId =
        null;

      if (
        applicationId
      ) {
        const row =
          await Setting.findOne({
            applicationId,
            key:
              'active_theme_id',
          }).lean();

        selectedThemeId =
          await resolveApplicationThemeId(
            row?.value,
          );
      }

      console.log(
        '[THEMES] GET:',
        {
          applicationId,
          selectedThemeId,
          themes:
            themes.map(
              (theme) => ({
                themeId:
                  theme.themeId,
                name:
                  theme.name,
                sortOrder:
                  theme.sortOrder,
                appThemeId:
                  getApplicationThemeId(
                    theme,
                  ),
              }),
            ),
        },
      );

      return res.json({
        themes,
        selectedThemeId,
        applicationId,
      });
    } catch (error) {
      console.error(
        '[THEMES] GET:',
        error,
      );

      return res.status(
        500,
      ).json({
        message:
          error.message ||
          'فشل تحميل الثيمات',
      });
    }
  },
);

/* ========================================================================= */
/* GET /api/themes/default                                                  */
/* ========================================================================= */

router.get(
  '/default',
  auth,
  requirePermission(
    'themes.view',
  ),
  async (
    _req,
    res,
  ) => {
    try {
      await ensureDefaultThemes();

      let theme =
        await Theme.findOne({
          isGlobalDefault:
            true,
          isActive:
            true,
        }).lean();

      if (
        theme &&
        isBuiltInTheme(
          theme,
        )
      ) {
        theme = null;
      }

      if (!theme) {
        const row =
          await Setting.findOne({
            applicationId:
              null,
            key:
              'global_default_theme_id',
          }).lean();

        if (
          row?.value
        ) {
          const raw =
            String(
              row.value,
            ).trim();

          if (
            /^\d+$/.test(
              raw,
            )
          ) {
            theme =
              await Theme.findOne({
                sortOrder:
                  Number(
                    raw,
                  ),
                isActive:
                  true,
              }).lean();
          } else {
            theme =
              await Theme.findOne({
                themeId:
                  raw,
                isActive:
                  true,
              }).lean();
          }

          if (
            theme &&
            isBuiltInTheme(
              theme,
            )
          ) {
            theme = null;
          }
        }
      }

      /*
       * إذا لم يوجد default،
       * نأخذ أول ثيم من الثيمات
       * التي أضافها المشرف.
       */
      if (!theme) {
        const availableThemes =
          await Theme.find({
            isActive:
              true,
          })
            .sort({
              sortOrder:
                1,
              createdAt:
                1,
            })
            .lean();

        theme =
          availableThemes.find(
            (item) =>
              !isBuiltInTheme(
                item,
              ),
          ) || null;
      }

      const appThemeId =
        theme
          ? getApplicationThemeId(
              theme,
            )
          : null;

      console.log(
        '[THEMES] DEFAULT:',
        {
          themeId:
            theme?.themeId ||
            null,
          appThemeId,
          sortOrder:
            theme?.sortOrder ||
            null,
        },
      );

      return res.json({
        theme:
          theme ||
          null,
        appThemeId,
      });
    } catch (error) {
      console.error(
        '[THEMES] DEFAULT:',
        error,
      );

      return res.status(
        500,
      ).json({
        message:
          error.message ||
          'فشل تحميل الثيم الافتراضي',
      });
    }
  },
);

/* ========================================================================= */
/* PUT /api/themes/active                                                   */
/* ========================================================================= */

router.put(
  '/active',
  auth,
  async (
    req,
    res,
  ) => {
    try {
      /*
       * هذا هو المعرف الداخلي الذي ترسله
       * صفحة Themes.jsx.
       */
      const themeId =
        String(
          req.body?.themeId ||
            '',
        ).trim();

      if (!themeId) {
        return res.status(
          400,
        ).json({
          message:
            'معرف الثيم مطلوب',
        });
      }

      const theme =
        await Theme.findOne({
          themeId,
          isActive:
            true,
        }).lean();

      if (!theme) {
        return res.status(
          404,
        ).json({
          message:
            'الثيم غير موجود',
        });
      }

      if (
        isBuiltInTheme(
          theme,
        )
      ) {
        return res.status(
          400,
        ).json({
          message:
            'هذا الثيم قديم ومدمج وغير متاح للاستخدام',
        });
      }

      /*
       * الرقم الذي سيذهب إلى التطبيق.
       */
      const appThemeId =
        getApplicationThemeId(
          theme,
        );

      if (!appThemeId) {
        return res.status(
          400,
        ).json({
          message:
            'الثيم لا يحتوي على رقم صالح',
        });
      }

      console.log(
        '[THEMES] Theme selected:',
        {
          internalThemeId:
            theme.themeId,
          name:
            theme.name,
          sortOrder:
            theme.sortOrder,
          appThemeId,
        },
      );

      let applicationId =
        null;

      /* ----------------------------------------------------------------- */
      /* app_owner                                                         */
      /* ----------------------------------------------------------------- */

      if (
        req.user?.role ===
        'app_owner'
      ) {
        applicationId =
          req.user.applicationId;

        if (
          !applicationId
        ) {
          return res.status(
            403,
          ).json({
            message:
              'المستخدم غير مرتبط بتطبيق',
          });
        }
      }

      /* ----------------------------------------------------------------- */
      /* super_admin                                                       */
      /* ----------------------------------------------------------------- */

      else if (
        req.user?.role ===
        'super_admin'
      ) {
        applicationId =
          req.body?.applicationId ||
          null;
      }

      else {
        return res.status(
          403,
        ).json({
          message:
            'غير مصرح',
        });
      }

      /* ----------------------------------------------------------------- */
      /* Global default                                                     */
      /* ----------------------------------------------------------------- */

      if (
        !applicationId
      ) {
        await Setting.findOneAndUpdate(
          {
            applicationId:
              null,
            key:
              'global_default_theme_id',
          },
          {
            applicationId:
              null,
            key:
              'global_default_theme_id',
            value:
              appThemeId,
          },
          {
            upsert:
              true,
            new:
              true,
          },
        );

        await Theme.updateMany(
          {},
          {
            $set: {
              isGlobalDefault:
                false,
            },
          },
        );

        await Theme.updateOne(
          {
            _id:
              theme._id,
          },
          {
            $set: {
              isGlobalDefault:
                true,
            },
          },
        );

        console.log(
          '[THEMES] Global default saved:',
          appThemeId,
        );

        return res.json({
          ok:
            true,
          themeId:
            theme.themeId,
          appThemeId,
          applicationId:
            null,
          global:
            true,
          message:
            'تم تعيين الثيم الافتراضي العام',
        });
      }

      /* ----------------------------------------------------------------- */
      /* Application theme                                                  */
      /* ----------------------------------------------------------------- */

      await Setting.findOneAndUpdate(
        {
          applicationId,
          key:
            'active_theme_id',
        },
        {
          applicationId,
          key:
            'active_theme_id',
          value:
            appThemeId,
        },
        {
          upsert:
            true,
          new:
            true,
        },
      );

      console.log(
        '[THEMES] Application theme saved:',
        {
          applicationId,
          internalThemeId:
            theme.themeId,
          appThemeId,
        },
      );

      return res.json({
        ok:
          true,
        themeId:
          theme.themeId,
        appThemeId,
        applicationId,
        global:
          false,
        message:
          'تم اختيار الثيم للتطبيق',
      });
    } catch (error) {
      console.error(
        '[THEMES] ACTIVE:',
        error,
      );

      return res.status(
        error.status || 500,
      ).json({
        message:
          error.message ||
          'فشل اختيار الثيم',
      });
    }
  },
);

/* ========================================================================= */
/* DELETE /api/themes/active/:applicationId                                 */
/* ========================================================================= */

router.delete(
  '/active/:applicationId',
  auth,
  async (
    req,
    res,
  ) => {
    try {
      const applicationId =
        String(
          req.params
            .applicationId,
        );

      if (
        req.user?.role ===
        'app_owner'
      ) {
        if (
          String(
            req.user.applicationId,
          ) !==
          applicationId
        ) {
          return res.status(
            403,
          ).json({
            message:
              'غير مصرح لهذا التطبيق',
          });
        }
      } else if (
        req.user?.role !==
        'super_admin'
      ) {
        return res.status(
          403,
        ).json({
          message:
            'غير مصرح',
        });
      }

      await Setting.findOneAndDelete(
        {
          applicationId,
          key:
            'active_theme_id',
        },
      );

      console.log(
        '[THEMES] Application theme reset:',
        applicationId,
      );

      return res.json({
        ok:
          true,
        message:
          'تمت إعادة التطبيق للثيم الافتراضي',
      });
    } catch (error) {
      console.error(
        '[THEMES] RESET:',
        error,
      );

      return res.status(
        500,
      ).json({
        message:
          error.message ||
          'فشل إعادة الثيم الافتراضي',
      });
    }
  },
);

/* ========================================================================= */
/* POST /api/themes                                                         */
/* ========================================================================= */

router.post(
  '/',
  auth,
  requireRole(
    'super_admin',
  ),
  upload.single(
    'previewImage',
  ),
  async (
    req,
    res,
  ) => {
    try {
      const name =
        String(
          req.body?.name ||
            '',
        ).trim();

      if (!name) {
        return res.status(
          400,
        ).json({
          message:
            'اسم الثيم مطلوب',
        });
      }

      const themeId =
        String(
          req.body?.themeId ||
            '',
        ).trim() ||
        `theme_${Date.now()}`;

      const numericSortOrder =
        Number(
          req.body?.sortOrder,
        );

      if (
        !Number.isFinite(
          numericSortOrder,
        ) ||
        numericSortOrder <= 0
      ) {
        return res.status(
          400,
        ).json({
          message:
            'رقم الثيم يجب أن يكون رقمًا صحيحًا أكبر من صفر',
        });
      }

      const sortOrder =
        Math.trunc(
          numericSortOrder,
        );

      /*
       * منع تكرار المعرف أو الاسم أو الرقم.
       */
      const exists =
        await Theme.findOne({
          $or: [
            {
              themeId,
            },
            {
              name,
            },
            {
              sortOrder,
            },
          ],
        }).lean();

      if (exists) {
        if (
          exists.sortOrder ===
          sortOrder
        ) {
          return res.status(
            409,
          ).json({
            message:
              `رقم الثيم ${sortOrder} مستخدم بالفعل`,
          });
        }

        if (
          exists.themeId ===
          themeId
        ) {
          return res.status(
            409,
          ).json({
            message:
              'يوجد ثيم بنفس المعرف',
          });
        }

        return res.status(
          409,
        ).json({
          message:
            'يوجد ثيم بنفس الاسم',
        });
      }

      const remotePreview = req.file ? await uploadThemePreview(req, themeId) : null;
      const previewImage = remotePreview?.url || String(req.body?.previewImage || '').trim();
      const previewFileId = remotePreview?.fileId || '';

      /*
       * لا نسمح بإدخال صور الثيمات
       * القديمة.
       */
      if (
        previewImage.startsWith(
          '/theme-previews/',
        )
      ) {
        return res.status(
          400,
        ).json({
          message:
            'صور theme-previews القديمة غير مسموحة',
        });
      }

      const theme =
        await Theme.create({
          themeId,
          name,
          previewImage,
          previewFileId,
          description:
            String(
              req.body
                ?.description ||
                '',
            ),

          /*
           * هذا هو رقم الثيم في التطبيق.
           */
          sortOrder,

          isActive:
            true,

          isGlobalDefault:
            false,
        });

      console.log(
        '[THEMES] Created theme:',
        {
          themeId:
            theme.themeId,
          name:
            theme.name,
          sortOrder:
            theme.sortOrder,
          appThemeId:
            getApplicationThemeId(
              theme,
            ),
        },
      );

      return res.status(
        201,
      ).json(theme);
    } catch (error) {
      console.error(
        '[THEMES] CREATE:',
        error,
      );

      return res.status(
        500,
      ).json({
        message:
          error.message ||
          'فشل إضافة الثيم',
      });
    }
  },
);

/* ========================================================================= */
/* PUT /api/themes/:id                                                      */
/* ========================================================================= */

router.put(
  '/:id',
  auth,
  requireRole(
    'super_admin',
  ),
  upload.single(
    'previewImage',
  ),
  async (
    req,
    res,
  ) => {
    try {
      const theme =
        await Theme.findOne({
          themeId:
            req.params.id,
        });

      if (!theme) {
        return res.status(
          404,
        ).json({
          message:
            'الثيم غير موجود',
        });
      }

      if (
        isBuiltInTheme(
          theme,
        )
      ) {
        return res.status(
          400,
        ).json({
          message:
            'هذا الثيم قديم ومدمج وغير متاح للتعديل',
        });
      }

      if (
        req.body?.name !==
        undefined
      ) {
        const nextName =
          String(
            req.body.name,
          ).trim();

        if (!nextName) {
          return res.status(
            400,
          ).json({
            message:
              'اسم الثيم مطلوب',
          });
        }

        const duplicateName =
          await Theme.findOne({
            _id: {
              $ne:
                theme._id,
            },
            name:
              nextName,
          }).lean();

        if (
          duplicateName
        ) {
          return res.status(
            409,
          ).json({
            message:
              'يوجد ثيم آخر بنفس الاسم',
          });
        }

        theme.name =
          nextName;
      }

      if (
        req.body
          ?.description !==
        undefined
      ) {
        theme.description =
          String(
            req.body
              .description,
          );
      }

      if (
        req.body
          ?.sortOrder !==
        undefined
      ) {
        const nextSortOrder =
          Number(
            req.body
              .sortOrder,
          );

        if (
          !Number.isFinite(
            nextSortOrder,
          ) ||
          nextSortOrder <= 0
        ) {
          return res.status(
            400,
          ).json({
            message:
              'رقم الثيم يجب أن يكون رقمًا صحيحًا أكبر من صفر',
          });
        }

        const normalizedSortOrder =
          Math.trunc(
            nextSortOrder,
          );

        const duplicate =
          await Theme.findOne({
            _id: {
              $ne:
                theme._id,
            },
            sortOrder:
              normalizedSortOrder,
            isActive:
              true,
          }).lean();

        if (
          duplicate
        ) {
          return res.status(
            409,
          ).json({
            message:
              `رقم الثيم ${normalizedSortOrder} مستخدم بالفعل`,
          });
        }

        theme.sortOrder =
          normalizedSortOrder;
      }

      if (
        req.body
          ?.isActive !==
        undefined
      ) {
        theme.isActive =
          String(
            req.body.isActive,
          ) ===
            'true' ||
          req.body.isActive ===
            true;

        /*
         * إذا تم تعطيل الثيم الحالي
         * وكان هو الافتراضي العام،
         * لا نتركه كافتراضي غير صالح.
         */
        if (
          !theme.isActive
        ) {
          theme.isGlobalDefault =
            false;
        }
      }

      if (req.file) {
        const remotePreview = await uploadThemePreview(req, theme.themeId);
        const oldFileId = theme.previewFileId || '';
        const oldUrl = theme.previewImage;
        theme.previewImage = remotePreview.url;
        theme.previewFileId = remotePreview.fileId;
        if (oldFileId) { try { await deleteFile(oldFileId); } catch (error) { console.warn('[THEMES] ImageKit delete:', error.message); } }
        else removeThemeImage(oldUrl);
      } else if (
        req.body
          ?.previewImage !==
        undefined
      ) {
        const nextPreviewImage =
          String(
            req.body
              .previewImage,
          ).trim();

        if (
          nextPreviewImage.startsWith(
            '/theme-previews/',
          )
        ) {
          return res.status(
            400,
          ).json({
            message:
              'صور theme-previews القديمة غير مسموحة',
          });
        }

        const previousPreviewFileId = theme.previewFileId || '';
        theme.previewImage = nextPreviewImage;
        if (req.body?.previewFileId !== undefined) {
          theme.previewFileId = String(req.body.previewFileId || '').trim();
          if (previousPreviewFileId && previousPreviewFileId !== theme.previewFileId) { try { await deleteFile(previousPreviewFileId); } catch (error) { console.warn('[THEMES] ImageKit delete:', error.message); } }
        }
      }

      await theme.save();

      console.log(
        '[THEMES] Updated theme:',
        {
          themeId:
            theme.themeId,
          name:
            theme.name,
          sortOrder:
            theme.sortOrder,
          appThemeId:
            getApplicationThemeId(
              theme,
            ),
        },
      );

      return res.json(
        theme,
      );
    } catch (error) {
      console.error(
        '[THEMES] UPDATE:',
        error,
      );

      return res.status(
        500,
      ).json({
        message:
          error.message ||
          'فشل تعديل الثيم',
      });
    }
  },
);

/* ========================================================================= */
/* DELETE /api/themes/:id                                                   */
/* ========================================================================= */

router.delete(
  '/:id',
  auth,
  requireRole(
    'super_admin',
  ),
  async (
    req,
    res,
  ) => {
    try {
      const theme =
        await Theme.findOne({
          themeId:
            req.params.id,
        });

      if (!theme) {
        return res.status(
          404,
        ).json({
          message:
            'الثيم غير موجود',
        });
      }

      /*
       * لا نحذف الثيم الافتراضي العام
       * قبل تغييره.
       */
      if (
        theme.isGlobalDefault
      ) {
        return res.status(
          400,
        ).json({
          message:
            'لا يمكن حذف الثيم الافتراضي العام، قم بتغيير الافتراضي أولاً',
        });
      }

      const appThemeId =
        getApplicationThemeId(
          theme,
        );

      /*
       * إزالة الإعدادات القديمة
       * والجديدة.
       */
      await Setting.deleteMany({
        key:
          'active_theme_id',

        $or: [
          {
            value:
              theme.themeId,
          },
          {
            value:
              appThemeId,
          },
        ],
      });

      await Setting.deleteMany({
        applicationId:
          null,

        key:
          'global_default_theme_id',

        $or: [
          {
            value:
              theme.themeId,
          },
          {
            value:
              appThemeId,
          },
        ],
      });

      if (theme.previewFileId) {
        try {
          await deleteFile(theme.previewFileId);
        } catch (error) {
          console.warn('[THEMES] ImageKit delete:', error.message);
        }
      } else {
        removeThemeImage(theme.previewImage);
      }

      await Theme.deleteOne({
        themeId:
          theme.themeId,
      });

      console.log(
        '[THEMES] Deleted theme:',
        {
          themeId:
            theme.themeId,
          appThemeId,
        },
      );

      return res.json({
        ok:
          true,
        message:
          'تم حذف الثيم',
      });
    } catch (error) {
      console.error(
        '[THEMES] DELETE:',
        error,
      );

      return res.status(
        500,
      ).json({
        message:
          error.message ||
          'فشل حذف الثيم',
      });
    }
  },
);

/* ========================================================================= */
/* Export                                                                    */
/* ========================================================================= */

module.exports = {
  router,

  /*
   * لم تعد هناك ثيمات افتراضية يتم إنشاؤها.
   */
  DEFAULT_THEMES: [],

  ensureDefaultThemes,
};