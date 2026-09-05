// المسار: routes/dns.js

const express = require('express');
const dns = require('dns').promises;
const net = require('net');

const DnsEntry = require('../models/DnsEntry');
const Application = require('../models/Application');

const {
  auth,
  requirePermission,
  requireRole,
} = require('../middleware/auth');

const router = express.Router();

/* ========================================================================= */
/* Configuration                                                             */
/* ========================================================================= */

const CHECK_TIMEOUT_MS = Math.max(
  2000,
  Number(
    process.env.DNS_CHECK_TIMEOUT_MS || 10000
  )
);

/*
 * لأسباب أمنية، لا نسمح افتراضيًا بفحص:
 *
 * localhost
 * 127.0.0.1
 * private LAN
 * link-local
 * multicast
 *
 * يمكن تفعيل ذلك في .env إذا كان النظام لديك
 * يحتاج DNS داخليًا.
 *
 * ALLOW_PRIVATE_DNS_CHECKS=true
 */
const ALLOW_PRIVATE_DNS_CHECKS =
  String(
    process.env.ALLOW_PRIVATE_DNS_CHECKS || ''
  ).toLowerCase() === 'true';

/* ========================================================================= */
/* URL helpers                                                               */
/* ========================================================================= */

function normalizeUrl(value) {
  const raw = String(
    value || ''
  ).trim();

  if (!raw) {
    throw new Error(
      'رابط DNS مطلوب'
    );
  }

  /*
   * إذا كتب المستخدم:
   *
   * example.com
   *
   * نضيف http تلقائيًا.
   */
  const withProtocol =
    /^[a-z][a-z0-9+.-]*:\/\//i.test(
      raw
    )
      ? raw
      : `http://${raw}`;

  let parsed;

  try {
    parsed = new URL(
      withProtocol
    );
  } catch {
    throw new Error(
      'رابط DNS غير صالح'
    );
  }

  if (
    !['http:', 'https:'].includes(
      parsed.protocol
    )
  ) {
    throw new Error(
      'يسمح فقط بروابط HTTP و HTTPS'
    );
  }

  if (!parsed.hostname) {
    throw new Error(
      'اسم النطاق غير موجود في الرابط'
    );
  }

  /*
   * إزالة slash الزائد من نهاية الرابط
   * مع الإبقاء على path إذا كان موجودًا.
   */
  parsed.hash = '';

  return parsed.toString().replace(
    /\/$/,
    ''
  );
}

/* ========================================================================= */
/* Private IP detection                                                      */
/* ========================================================================= */

function isPrivateIpv4(
  ip
) {
  const parts = ip
    .split('.')
    .map(Number);

  if (
    parts.length !== 4 ||
    parts.some(
      (part) =>
        !Number.isInteger(part) ||
        part < 0 ||
        part > 255
    )
  ) {
    return false;
  }

  const [a, b] = parts;

  /*
   * 10.0.0.0/8
   */
  if (a === 10) {
    return true;
  }

  /*
   * 172.16.0.0/12
   */
  if (
    a === 172 &&
    b >= 16 &&
    b <= 31
  ) {
    return true;
  }

  /*
   * 192.168.0.0/16
   */
  if (
    a === 192 &&
    b === 168
  ) {
    return true;
  }

  /*
   * 127.0.0.0/8
   */
  if (a === 127) {
    return true;
  }

  /*
   * 169.254.0.0/16
   */
  if (
    a === 169 &&
    b === 254
  ) {
    return true;
  }

  /*
   * 0.0.0.0/8
   */
  if (a === 0) {
    return true;
  }

  return false;
}

function isPrivateIpv6(
  ip
) {
  const value =
    String(ip || '')
      .toLowerCase()
      .replace(/^\[|\]$/g, '');

  if (
    value === '::1' ||
    value === '::'
  ) {
    return true;
  }

  /*
   * fc00::/7
   */
  if (
    value.startsWith(
      'fc'
    ) ||
    value.startsWith(
      'fd'
    )
  ) {
    return true;
  }

  /*
   * fe80::/10
   */
  if (
    value.startsWith(
      'fe8'
    ) ||
    value.startsWith(
      'fe9'
    ) ||
    value.startsWith(
      'fea'
    ) ||
    value.startsWith(
      'feb'
    )
  ) {
    return true;
  }

  return false;
}

/* ========================================================================= */
/* Host safety                                                               */
/* ========================================================================= */

async function validateHost(
  parsedUrl
) {
  if (
    ALLOW_PRIVATE_DNS_CHECKS
  ) {
    return;
  }

  const hostname =
    String(
      parsedUrl.hostname || ''
    ).toLowerCase();

  /*
   * localhost
   */
  if (
    hostname ===
      'localhost' ||
    hostname.endsWith(
      '.localhost'
    )
  ) {
    throw new Error(
      'لا يمكن فحص localhost'
    );
  }

  /*
   * إذا كان hostname عبارة عن IP
   */
  if (
    net.isIP(
      hostname
    )
  ) {
    if (
      net.isIP(
        hostname
      ) === 4 &&
      isPrivateIpv4(
        hostname
      )
    ) {
      throw new Error(
        'تم رفض عنوان IP داخلي'
      );
    }

    if (
      net.isIP(
        hostname
      ) === 6 &&
      isPrivateIpv6(
        hostname
      )
    ) {
      throw new Error(
        'تم رفض عنوان IPv6 داخلي'
      );
    }

    return;
  }

  /*
   * Resolve DNS hostname
   */
  let addresses;

  try {
    addresses =
      await dns.lookup(
        hostname,
        {
          all: true,
        }
      );
  } catch {
    /*
     * إذا فشل DNS نفسه سيظهر لاحقًا كفشل اتصال.
     * هنا لا نحكم عليه بأنه private.
     */
    return;
  }

  for (
    const record of addresses
  ) {
    const address =
      record.address;

    if (
      record.family === 4 &&
      isPrivateIpv4(
        address
      )
    ) {
      throw new Error(
        'اسم النطاق يشير إلى عنوان IP داخلي غير مسموح'
      );
    }

    if (
      record.family === 6 &&
      isPrivateIpv6(
        address
      )
    ) {
      throw new Error(
        'اسم النطاق يشير إلى عنوان IPv6 داخلي غير مسموح'
      );
    }
  }
}

/* ========================================================================= */
/* Check URL                                                                 */
/* ========================================================================= */

async function checkDnsUrl(
  value
) {
  const normalizedUrl =
    normalizeUrl(
      value
    );

  const parsedUrl =
    new URL(
      normalizedUrl
    );

  await validateHost(
    parsedUrl
  );

  const controller =
    new AbortController();

  const timeout =
    setTimeout(
      () =>
        controller.abort(),
      CHECK_TIMEOUT_MS
    );

  const startedAt =
    process.hrtime.bigint();

  let response =
    null;

  let method =
    'HEAD';

  try {
    /*
     * HEAD أولًا لتقليل استهلاك البيانات.
     */
    try {
      response =
        await fetch(
          normalizedUrl,
          {
            method: 'HEAD',
            redirect:
              'manual',
            signal:
              controller.signal,
            headers: {
              'User-Agent':
                'IPTV-Admin-DNS-Checker/1.0',
              Accept:
                '*/*',
            },
          }
        );
    } catch (
      headError
    ) {
      /*
       * HEAD قد لا يكون مدعومًا.
       * نجرب GET.
       */
      response = null;
    }

    /*
     * بعض الخوادم ترجع 405 للـ HEAD.
     */
    if (
      !response ||
      response.status ===
        405
    ) {
      method = 'GET';

      response =
        await fetch(
          normalizedUrl,
          {
            method: 'GET',
            redirect:
              'manual',
            signal:
              controller.signal,
            headers: {
              'User-Agent':
                'IPTV-Admin-DNS-Checker/1.0',
              Accept:
                '*/*',
            },
          }
        );
    }

    const endedAt =
      process.hrtime.bigint();

    const latencyMs =
      Number(
        endedAt -
          startedAt
      ) /
      1_000_000;

    const status =
      Number(
        response.status
      );

    /*
     * أي HTTP response يعني أن السيرفر reachable.
     *
     * healthy:
     * 2xx / 3xx
     */
    const reachable =
      status >= 100 &&
      status < 600;

    const healthy =
      status >= 200 &&
      status < 400;

    const statusValue =
      healthy
        ? 'online'
        : reachable
        ? 'error'
        : 'offline';

    return {
      ok:
        reachable,

      healthy,

      reachable,

      status:
        statusValue,

      url:
        normalizedUrl,

      latencyMs:
        Math.round(
          latencyMs
        ),

      httpStatus:
        status,

      responseType:
        response.headers.get(
          'content-type'
        ) || '',

      error:
        healthy
          ? ''
          : `HTTP ${status}`,

      method,

      checkedAt:
        new Date(),
    };
  } catch (
    error
  ) {
    const endedAt =
      process.hrtime.bigint();

    const latencyMs =
      Number(
        endedAt -
          startedAt
      ) /
      1_000_000;

    let message =
      error?.message ||
      'فشل الاتصال';

    if (
      error?.name ===
      'AbortError'
    ) {
      message =
        `انتهت مهلة الاتصال بعد ${CHECK_TIMEOUT_MS}ms`;
    }

    return {
      ok: false,

      healthy: false,

      reachable: false,

      status:
        'offline',

      url:
        normalizedUrl,

      latencyMs:
        Math.round(
          latencyMs
        ),

      httpStatus:
        null,

      responseType:
        '',

      error:
        message,

      method,

      checkedAt:
        new Date(),
    };
  } finally {
    clearTimeout(
      timeout
    );
  }
}

/* ========================================================================= */
/* Application scope                                                         */
/* ========================================================================= */

function getUserApplicationId(
  req
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
    req.query?.applicationId ||
    req.body?.applicationId ||
    req.headers[
      'x-application-id'
    ] ||
    null
  );
}

/* ========================================================================= */
/* Scope filter                                                              */
/* ========================================================================= */

function buildScopeFilter(
  req
) {
  if (
    req.user?.role ===
    'app_owner'
  ) {
    if (
      !req.user.applicationId
    ) {
      return null;
    }

    return {
      applicationId:
        req.user.applicationId,
    };
  }

  /*
   * super_admin
   *
   * بدون applicationId:
   * جميع التطبيقات
   */
  const applicationId =
    req.query?.applicationId ||
    req.body?.applicationId ||
    req.headers[
      'x-application-id'
    ];

  if (applicationId) {
    return {
      applicationId,
    };
  }

  return {};
}

/* ========================================================================= */
/* Make sure application exists                                              */
/* ========================================================================= */

async function ensureApplication(
  applicationId
) {
  if (!applicationId) {
    const error =
      new Error(
        'يجب تحديد التطبيق'
      );

    error.status = 400;

    throw error;
  }

  const application =
    await Application.findById(
      applicationId
    ).lean();

  if (!application) {
    const error =
      new Error(
        'التطبيق غير موجود'
      );

    error.status = 404;

    throw error;
  }

  if (
    application.isActive ===
    false
  ) {
    const error =
      new Error(
        'التطبيق غير مفعل'
      );

    error.status = 400;

    throw error;
  }

  return application;
}

/* ========================================================================= */
/* GET /api/dns                                                              */
/* ========================================================================= */

router.get(
  '/',
  auth,
  requirePermission(
    'dns.view'
  ),
  async (
    req,
    res
  ) => {
    try {
      const filter =
        buildScopeFilter(
          req
        );

      if (!filter) {
        return res.status(
          403
        ).json({
          message:
            'المستخدم غير مرتبط بتطبيق',
        });
      }

      const entries =
        await DnsEntry.find(
          filter
        )
          .populate(
            'applicationId',
            'name slug isActive'
          )
          .sort({
            isActive:
              -1,
            createdAt:
              -1,
          })
          .lean();

      const total =
        entries.length;

      const online =
        entries.filter(
          (item) =>
            item.lastCheck
              ?.status ===
            'online'
        ).length;

      const offline =
        entries.filter(
          (item) =>
            item.lastCheck
              ?.status ===
            'offline'
        ).length;

      const errorCount =
        entries.filter(
          (item) =>
            item.lastCheck
              ?.status ===
            'error'
        ).length;

      const unknown =
        entries.filter(
          (item) =>
            !item.lastCheck ||
            item.lastCheck.status ===
              'unknown'
        ).length;

      return res.json({
        dns:
          entries,

        stats: {
          total,
          online,
          offline,
          error:
            errorCount,
          unknown,
        },
      });
    } catch (error) {
      console.error(
        '[DNS] GET:',
        error
      );

      return res.status(
        500
      ).json({
        message:
          error.message ||
          'فشل تحميل DNS',
      });
    }
  }
);

/* ========================================================================= */
/* POST /api/dns/check                                                       */
/*                                                                           */
/* فحص رابط قبل الإضافة                                                     */
/* ========================================================================= */

router.post(
  '/check',
  auth,
  requirePermission(
    'dns.check'
  ),
  async (
    req,
    res
  ) => {
    try {
      const result =
        await checkDnsUrl(
          req.body?.url
        );

      return res.json(
        result
      );
    } catch (error) {
      console.error(
        '[DNS] PRE-CHECK:',
        error
      );

      return res.status(
        error.status ||
          400
      ).json({
        ok: false,
        healthy: false,
        reachable: false,
        status:
          'offline',
        error:
          error.message ||
          'رابط DNS غير صالح',
      });
    }
  }
);

/* ========================================================================= */
/* GET /api/dns/:id                                                          */
/* ========================================================================= */

router.get(
  '/:id',
  auth,
  requirePermission(
    'dns.view'
  ),
  async (
    req,
    res
  ) => {
    try {
      const filter =
        buildScopeFilter(
          req
        );

      if (!filter) {
        return res.status(
          403
        ).json({
          message:
            'المستخدم غير مرتبط بتطبيق',
        });
      }

      const entry =
        await DnsEntry.findOne({
          ...filter,
          _id:
            req.params.id,
        })
          .populate(
            'applicationId',
            'name slug isActive'
          )
          .lean();

      if (!entry) {
        return res.status(
          404
        ).json({
          message:
            'DNS غير موجود',
        });
      }

      return res.json(
        entry
      );
    } catch (error) {
      console.error(
        '[DNS] GET ONE:',
        error
      );

      return res.status(
        500
      ).json({
        message:
          'فشل تحميل DNS',
      });
    }
  }
);

/* ========================================================================= */
/* POST /api/dns                                                             */
/* ========================================================================= */

router.post(
  '/',
  auth,
  requirePermission(
    'dns.create'
  ),
  async (
    req,
    res
  ) => {
    try {
      let applicationId =
        getUserApplicationId(
          req
        );

      /*
       * super_admin يمكنه اختيار التطبيق.
       */
      if (
        req.user?.role ===
        'super_admin'
      ) {
        applicationId =
          req.body
            ?.applicationId ||
          null;
      }

      await ensureApplication(
        applicationId
      );

      const name =
        String(
          req.body?.name ||
            ''
        ).trim();

      const url =
        String(
          req.body?.url ||
            ''
        ).trim();

      const description =
        String(
          req.body
            ?.description ||
            ''
        ).trim();

      const isActive =
        req.body
          ?.isActive !==
        undefined
          ? req.body
              .isActive ===
              true ||
            String(
              req.body
                .isActive
            ) === 'true'
          : true;

      if (!name) {
        return res.status(
          400
        ).json({
          message:
            'اسم DNS مطلوب',
        });
      }

      /*
       * أهم خطوة:
       * فحص الرابط قبل الحفظ.
       */
      const checkResult =
        await checkDnsUrl(
          url
        );

      /*
       * السماح بحفظ أي response HTTP
       * أقل من 500 لأنه يعني أن الخادم
       * قابل للوصول.
       *
       * لكن لا نحفظ عند فشل الشبكة.
       */
      if (
        !checkResult.reachable
      ) {
        return res.status(
          400
        ).json({
          message:
            'لا يمكن الوصول إلى رابط DNS. لم يتم الحفظ.',
          check:
            checkResult,
        });
      }

      const normalizedUrl =
        checkResult.url;

      const duplicate =
        await DnsEntry.findOne({
          applicationId,
          normalizedUrl,
        }).lean();

      if (duplicate) {
        return res.status(
          409
        ).json({
          message:
            'هذا الرابط موجود مسبقًا في التطبيق',
          entry:
            duplicate,
        });
      }

      const entry =
        await DnsEntry.create({
          applicationId,
          name,
          url:
            normalizedUrl,
          normalizedUrl,
          description,
          isActive,

          lastCheck: {
            checkedAt:
              checkResult.checkedAt,

            status:
              checkResult.status,

            reachable:
              checkResult.reachable,

            healthy:
              checkResult.healthy,

            latencyMs:
              checkResult.latencyMs,

            httpStatus:
              checkResult.httpStatus,

            responseType:
              checkResult.responseType,

            error:
              checkResult.error,

            method:
              checkResult.method,
          },
        });

      const populated =
        await DnsEntry.findById(
          entry._id
        )
          .populate(
            'applicationId',
            'name slug isActive'
          )
          .lean();

      return res.status(
        201
      ).json({
        entry:
          populated,
        check:
          checkResult,
        message:
          'تمت إضافة DNS بعد نجاح الفحص',
      });
    } catch (error) {
      console.error(
        '[DNS] CREATE:',
        error
      );

      /*
       * Duplicate key
       */
      if (
        error?.code ===
        11000
      ) {
        return res.status(
          409
        ).json({
          message:
            'هذا الرابط موجود مسبقًا في التطبيق',
        });
      }

      return res.status(
        error.status ||
          500
      ).json({
        message:
          error.message ||
          'فشل إضافة DNS',
      });
    }
  }
);

/* ========================================================================= */
/* PUT /api/dns/:id                                                          */
/* ========================================================================= */

router.put(
  '/:id',
  auth,
  requirePermission(
    'dns.edit'
  ),
  async (
    req,
    res
  ) => {
    try {
      const filter =
        buildScopeFilter(
          req
        );

      if (!filter) {
        return res.status(
          403
        ).json({
          message:
            'المستخدم غير مرتبط بتطبيق',
        });
      }

      const entry =
        await DnsEntry.findOne({
          ...filter,
          _id:
            req.params.id,
        });

      if (!entry) {
        return res.status(
          404
        ).json({
          message:
            'DNS غير موجود',
        });
      }

      if (
        req.body?.name !==
        undefined
      ) {
        const name =
          String(
            req.body.name
          ).trim();

        if (!name) {
          return res.status(
            400
          ).json({
            message:
              'اسم DNS مطلوب',
          });
        }

        entry.name =
          name;
      }

      if (
        req.body
          ?.description !==
        undefined
      ) {
        entry.description =
          String(
            req.body
              .description ||
              ''
          ).trim();
      }

      if (
        req.body
          ?.isActive !==
        undefined
      ) {
        entry.isActive =
          req.body
            .isActive ===
            true ||
          String(
            req.body
              .isActive
          ) === 'true';
      }

      let checkResult =
        null;

      /*
       * إذا تغير الرابط أو حتى تم إرساله،
       * نعيد فحصه.
       */
      if (
        req.body?.url !==
          undefined
      ) {
        const newUrl =
          String(
            req.body.url ||
              ''
          ).trim();

        checkResult =
          await checkDnsUrl(
            newUrl
          );

        if (
          !checkResult.reachable
        ) {
          return res.status(
            400
          ).json({
            message:
              'لا يمكن الوصول إلى رابط DNS الجديد. لم يتم الحفظ.',
            check:
              checkResult,
          });
        }

        /*
         * منع تكرار الرابط
         */
        const duplicate =
          await DnsEntry.findOne({
            applicationId:
              entry.applicationId,
            normalizedUrl:
              checkResult.url,
            _id: {
              $ne:
                entry._id,
            },
          }).lean();

        if (duplicate) {
          return res.status(
            409
          ).json({
            message:
              'الرابط موجود مسبقًا في التطبيق',
            entry:
              duplicate,
          });
        }

        entry.url =
          checkResult.url;

        entry.normalizedUrl =
          checkResult.url;

        entry.lastCheck = {
          checkedAt:
            checkResult.checkedAt,

          status:
            checkResult.status,

          reachable:
            checkResult.reachable,

          healthy:
            checkResult.healthy,

          latencyMs:
            checkResult.latencyMs,

          httpStatus:
            checkResult.httpStatus,

          responseType:
            checkResult.responseType,

          error:
            checkResult.error,

          method:
            checkResult.method,
        };
      } else {
        /*
         * لم يتغير الرابط.
         * نعيد فحص الرابط الحالي أيضًا.
         */
        checkResult =
          await checkDnsUrl(
            entry.url
          );

        entry.lastCheck = {
          checkedAt:
            checkResult.checkedAt,

          status:
            checkResult.status,

          reachable:
            checkResult.reachable,

          healthy:
            checkResult.healthy,

          latencyMs:
            checkResult.latencyMs,

          httpStatus:
            checkResult.httpStatus,

          responseType:
            checkResult.responseType,

          error:
            checkResult.error,

          method:
            checkResult.method,
        };
      }

      await entry.save();

      const populated =
        await DnsEntry.findById(
          entry._id
        )
          .populate(
            'applicationId',
            'name slug isActive'
          )
          .lean();

      return res.json({
        entry:
          populated,

        check:
          checkResult,

        message:
          'تم تعديل DNS وإعادة فحص الرابط',
      });
    } catch (error) {
      console.error(
        '[DNS] UPDATE:',
        error
      );

      if (
        error?.code ===
        11000
      ) {
        return res.status(
          409
        ).json({
          message:
            'الرابط موجود مسبقًا في التطبيق',
        });
      }

      return res.status(
        error.status ||
          500
      ).json({
        message:
          error.message ||
          'فشل تعديل DNS',
      });
    }
  }
);

/* ========================================================================= */
/* POST /api/dns/:id/check                                                   */
/* ========================================================================= */

router.post(
  '/:id/check',
  auth,
  requirePermission(
    'dns.check'
  ),
  async (
    req,
    res
  ) => {
    try {
      const filter =
        buildScopeFilter(
          req
        );

      if (!filter) {
        return res.status(
          403
        ).json({
          message:
            'المستخدم غير مرتبط بتطبيق',
        });
      }

      const entry =
        await DnsEntry.findOne({
          ...filter,
          _id:
            req.params.id,
        });

      if (!entry) {
        return res.status(
          404
        ).json({
          message:
            'DNS غير موجود',
        });
      }

      const result =
        await checkDnsUrl(
          entry.url
        );

      entry.lastCheck = {
        checkedAt:
          result.checkedAt,

        status:
          result.status,

        reachable:
          result.reachable,

        healthy:
          result.healthy,

        latencyMs:
          result.latencyMs,

        httpStatus:
          result.httpStatus,

        responseType:
          result.responseType,

        error:
          result.error,

        method:
          result.method,
      };

      await entry.save();

      return res.json({
        entry: {
          _id:
            entry._id,
          applicationId:
            entry.applicationId,
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
        },

        check:
          result,

        message:
          result.healthy
            ? 'DNS يعمل بشكل طبيعي'
            : result.reachable
            ? 'الخادم استجاب ولكن النتيجة غير ناجحة'
            : 'تعذر الاتصال بـ DNS',
      });
    } catch (error) {
      console.error(
        '[DNS] CHECK:',
        error
      );

      return res.status(
        error.status ||
          500
      ).json({
        message:
          error.message ||
          'فشل فحص DNS',
      });
    }
  }
);

/* ========================================================================= */
/* PATCH /api/dns/:id/toggle                                                 */
/* ========================================================================= */

router.patch(
  '/:id/toggle',
  auth,
  requirePermission(
    'dns.edit'
  ),
  async (
    req,
    res
  ) => {
    try {
      const filter =
        buildScopeFilter(
          req
        );

      if (!filter) {
        return res.status(
          403
        ).json({
          message:
            'المستخدم غير مرتبط بتطبيق',
        });
      }

      const entry =
        await DnsEntry.findOne({
          ...filter,
          _id:
            req.params.id,
        });

      if (!entry) {
        return res.status(
          404
        ).json({
          message:
            'DNS غير موجود',
        });
      }

      entry.isActive =
        !entry.isActive;

      await entry.save();

      return res.json({
        entry,
        message:
          entry.isActive
            ? 'تم تفعيل DNS'
            : 'تم تعطيل DNS',
      });
    } catch (error) {
      console.error(
        '[DNS] TOGGLE:',
        error
      );

      return res.status(
        500
      ).json({
        message:
          'فشل تغيير حالة DNS',
      });
    }
  }
);

/* ========================================================================= */
/* DELETE /api/dns/:id                                                       */
/* ========================================================================= */

router.delete(
  '/:id',
  auth,
  requirePermission(
    'dns.delete'
  ),
  async (
    req,
    res
  ) => {
    try {
      const filter =
        buildScopeFilter(
          req
        );

      if (!filter) {
        return res.status(
          403
        ).json({
          message:
            'المستخدم غير مرتبط بتطبيق',
        });
      }

      const entry =
        await DnsEntry.findOne({
          ...filter,
          _id:
            req.params.id,
        });

      if (!entry) {
        return res.status(
          404
        ).json({
          message:
            'DNS غير موجود',
        });
      }

      await DnsEntry.deleteOne({
        _id:
          entry._id,
      });

      return res.json({
        ok: true,
        message:
          'تم حذف DNS',
      });
    } catch (error) {
      console.error(
        '[DNS] DELETE:',
        error
      );

      return res.status(
        500
      ).json({
        message:
          error.message ||
          'فشل حذف DNS',
      });
    }
  }
);

/* ========================================================================= */
/* Export                                                                    */
/* ========================================================================= */

module.exports =
  router;