
// routes/remote-updates.js

const express = require('express');
const mongoose = require('mongoose');

const Entity = require('../models/Entity');
const Application = require('../models/Application');

const {
    auth,
} = require('../middleware/auth');

const router = express.Router();

const TYPE = 'remote-updates';

/* ============================================================
 * Helpers
 * ============================================================ */

function normalizeId(value) {
    if (!value) return '';

    if (typeof value === 'string') {
        return value.trim();
    }

    if (value?._id) {
        return String(value._id);
    }

    if (value?.id) {
        return String(value.id);
    }

    return '';
}

function isValidObjectId(value) {
    return mongoose.Types.ObjectId.isValid(
        String(value || ''),
    );
}

function toBoolean(value) {
    return (
        value === true ||
        value === 'true' ||
        value === 1 ||
        value === '1'
    );
}

function toNumber(value, fallback = 0) {
    const number = Number(value);

    return Number.isFinite(number)
        ? number
        : fallback;
}

function normalizeUpdate(row) {
    const data =
        row?.data &&
            typeof row.data === 'object'
            ? row.data
            : {};

    return {
        _id: row?._id
            ? String(row._id)
            : null,

        id: row?._id
            ? String(row._id)
            : null,

        applicationId:
            row?.applicationId
                ? String(row.applicationId)
                : null,

        type: row?.type || TYPE,

        name:
            data.title ||
            row?.name ||
            '',

        updateId:
            data.updateId ??
            row?.sortOrder ??
            null,

        version:
            data.version ??
            '',

        title:
            data.title ||
            row?.name ||
            '',

        description:
            data.description ||
            '',

        downloadUrl:
            data.downloadUrl ||
            data.download_url ||
            '',

        isMandatory:
            toBoolean(
                data.isMandatory,
            ),

        status:
            data.status ||
            'draft',

        sentAt:
            data.sentAt ||
            null,

        sentCount:
            toNumber(
                data.sentCount,
                0,
            ),

        createdAt:
            row?.createdAt ||
            null,

        updatedAt:
            row?.updatedAt ||
            null,

        isActive:
            row?.isActive !== false,

        data,
    };
}

/* ============================================================
 * Application
 * ============================================================ */

function getRequestedApplicationId(req) {
    return normalizeId(
        req.body?.applicationId ||
        req.query?.applicationId ||
        req.headers[
        'x-application-id'
        ],
    );
}

async function getApplicationId(req) {
    const role =
        String(
            req.user?.role || '',
        ).toLowerCase();

    /* ----------------------------------------------------------
     * app_owner
     * ---------------------------------------------------------- */

    if (role === 'app_owner') {
        const applicationId =
            normalizeId(
                req.user?.applicationId,
            );

        if (!applicationId) {
            const error =
                new Error(
                    'الحساب غير مرتبط بتطبيق',
                );

            error.status = 403;

            throw error;
        }

        if (
            !isValidObjectId(
                applicationId,
            )
        ) {
            const error =
                new Error(
                    'معرّف التطبيق غير صالح',
                );

            error.status = 400;

            throw error;
        }

        return applicationId;
    }

    /* ----------------------------------------------------------
     * super_admin
     * ---------------------------------------------------------- */

    if (role === 'super_admin') {
        const applicationId =
            getRequestedApplicationId(
                req,
            );

        if (!applicationId) {
            const error =
                new Error(
                    'يجب اختيار التطبيق',
                );

            error.status = 400;

            throw error;
        }

        if (
            !isValidObjectId(
                applicationId,
            )
        ) {
            const error =
                new Error(
                    'معرّف التطبيق غير صالح',
                );

            error.status = 400;

            throw error;
        }

        return applicationId;
    }

    const error =
        new Error(
            'ليس لديك صلاحية إدارة التحديثات',
        );

    error.status = 403;

    throw error;
}

async function ensureApplication(
    applicationId,
) {
    const application =
        await Application.findById(
            applicationId,
        ).lean();

    if (!application) {
        const error =
            new Error(
                'التطبيق المحدد غير موجود',
            );

        error.status = 404;

        throw error;
    }

    if (
        application.isActive === false
    ) {
        const error =
            new Error(
                'التطبيق المحدد غير فعال',
            );

        error.status = 400;

        throw error;
    }

    return application;
}

/* ============================================================
 * Sequential update ID
 * ============================================================ */

async function getNextUpdateId(
    applicationId,
) {
    const rows =
        await Entity.find({
            type: TYPE,
            applicationId,
        })
            .select(
                'sortOrder name data',
            )
            .lean();

    let maxId = 0;

    for (const row of rows) {
        const values = [
            row?.data?.updateId,
            row?.sortOrder,
            row?.name,
        ];

        for (const value of values) {
            const number =
                Number(value);

            if (
                Number.isFinite(number) &&
                number > maxId
            ) {
                maxId = number;
            }
        }
    }

    return maxId + 1;
}

/* ============================================================
 * PUBLIC
 *
 * يجب أن يكون قبل auth لأن تطبيق الهاتف يستعمله بدون
 * تسجيل دخول لوحة التحكم.
 * ============================================================ */

router.get(
    '/public/latest',
    async (req, res) => {
        try {
            const applicationId =
                normalizeId(
                    req.query?.applicationId ||
                    req.headers[
                    'x-application-id'
                    ],
                );

            const filter = {
                type: TYPE,
                isActive: true,
                'data.status': 'sent',
            };

            if (applicationId) {
                if (
                    !isValidObjectId(
                        applicationId,
                    )
                ) {
                    return res.status(400).json({
                        message:
                            'معرّف التطبيق غير صالح',
                    });
                }

                filter.applicationId =
                    applicationId;
            }

            const row =
                await Entity.findOne(
                    filter,
                )
                    .sort({
                        createdAt: -1,
                        sortOrder: -1,
                    })
                    .lean();

            if (!row) {
                return res.json({
                    updateId: null,
                    version: '',
                    title: '',
                    description: '',
                    downloadUrl: '',
                    isMandatory: false,
                    status: null,
                    sentAt: null,
                    sentCount: 0,
                    applicationId:
                        applicationId ||
                        null,
                });
            }

            return res.json(
                normalizeUpdate(row),
            );
        } catch (error) {
            console.error(
                '[REMOTE UPDATE PUBLIC]',
                error,
            );

            return res.status(
                error.status || 500,
            ).json({
                message:
                    error.message ||
                    'تعذر جلب آخر تحديث',
            });
        }
    },
);

/* ============================================================
 * AUTHENTICATION
 * ============================================================ */

router.use(auth);

/* ============================================================
 * ROLE
 * ============================================================ */

router.use(
    (req, res, next) => {
        const role =
            String(
                req.user?.role || '',
            ).toLowerCase();

        if (
            role !== 'super_admin' &&
            role !== 'app_owner'
        ) {
            return res.status(403).json({
                message:
                    'ليس لديك صلاحية إدارة التحديثات',
            });
        }

        next();
    },
);

/* ============================================================
 * GET
 * ============================================================ */

router.get(
    '/',
    async (req, res) => {
        try {
            const applicationId =
                await getApplicationId(
                    req,
                );

            const rows =
                await Entity.find({
                    type: TYPE,
                    applicationId,
                })
                    .sort({
                        sortOrder: -1,
                        createdAt: -1,
                    })
                    .lean();

            return res.json({
                updates:
                    rows.map(
                        normalizeUpdate,
                    ),
            });
        } catch (error) {
            console.error(
                '[REMOTE UPDATES GET]',
                error,
            );

            return res.status(
                error.status || 500,
            ).json({
                message:
                    error.message ||
                    'تعذر تحميل التحديثات',
            });
        }
    },
);

/* ============================================================
 * CREATE
 * ============================================================ */

router.post(
    '/',
    async (req, res) => {
        try {
            const applicationId =
                await getApplicationId(
                    req,
                );

            await ensureApplication(
                applicationId,
            );

            const version =
                String(
                    req.body?.version || '',
                ).trim();

            const title =
                String(
                    req.body?.title ||
                    req.body?.name ||
                    '',
                ).trim();

            const description =
                String(
                    req.body?.description ||
                    '',
                ).trim();

            const downloadUrl =
                String(
                    req.body?.downloadUrl ||
                    req.body?.download_url ||
                    '',
                ).trim();

            const isMandatory =
                toBoolean(
                    req.body?.isMandatory,
                );

            if (!version) {
                return res.status(400).json({
                    message:
                        'رقم الإصدار مطلوب',
                });
            }

            if (!title) {
                return res.status(400).json({
                    message:
                        'عنوان التحديث مطلوب',
                });
            }

            if (!downloadUrl) {
                return res.status(400).json({
                    message:
                        'رابط التحميل مطلوب',
                });
            }

            const updateId =
                await getNextUpdateId(
                    applicationId,
                );

            const row =
                await Entity.create({
                    applicationId,
                    type: TYPE,

                    name: title,

                    sortOrder:
                        updateId,

                    isActive:
                        true,

                    data: {
                        updateId,
                        version,
                        title,
                        description,
                        downloadUrl,
                        isMandatory,

                        status:
                            'draft',

                        sentAt:
                            null,

                        sentCount:
                            0,
                    },
                });

            return res.status(201).json({
                message:
                    'تم إنشاء التحديث كمسودة',

                update:
                    normalizeUpdate(row),
            });
        } catch (error) {
            console.error(
                '[REMOTE UPDATES CREATE]',
                error,
            );

            return res.status(
                error.status || 500,
            ).json({
                message:
                    error.message ||
                    'تعذر إنشاء التحديث',
            });
        }
    },
);

/* ============================================================
 * EDIT DRAFT
 * ============================================================ */

router.put(
    '/:id',
    async (req, res) => {
        try {
            const applicationId =
                await getApplicationId(
                    req,
                );

            if (
                !isValidObjectId(
                    req.params.id,
                )
            ) {
                return res.status(400).json({
                    message:
                        'معرّف التحديث غير صالح',
                });
            }

            const row =
                await Entity.findOne({
                    _id: req.params.id,
                    type: TYPE,
                    applicationId,
                });

            if (!row) {
                return res.status(404).json({
                    message:
                        'التحديث غير موجود',
                });
            }

            const currentData =
                row.data &&
                    typeof row.data === 'object'
                    ? row.data
                    : {};

            const currentStatus =
                String(
                    currentData.status ||
                    'draft',
                ).toLowerCase();

            if (
                currentStatus !==
                'draft'
            ) {
                return res.status(409).json({
                    message:
                        'لا يمكن تعديل التحديث بعد إرساله',
                });
            }

            const version =
                String(
                    req.body?.version ??
                    currentData.version ??
                    '',
                ).trim();

            const title =
                String(
                    req.body?.title ??
                    req.body?.name ??
                    currentData.title ??
                    row.name ??
                    '',
                ).trim();

            const description =
                String(
                    req.body?.description ??
                    currentData.description ??
                    '',
                ).trim();

            const downloadUrl =
                String(
                    req.body?.downloadUrl ??
                    req.body?.download_url ??
                    currentData.downloadUrl ??
                    '',
                ).trim();

            const isMandatory =
                toBoolean(
                    req.body?.isMandatory ??
                    currentData.isMandatory,
                );

            if (!version) {
                return res.status(400).json({
                    message:
                        'رقم الإصدار مطلوب',
                });
            }

            if (!title) {
                return res.status(400).json({
                    message:
                        'عنوان التحديث مطلوب',
                });
            }

            if (!downloadUrl) {
                return res.status(400).json({
                    message:
                        'رابط التحميل مطلوب',
                });
            }

            row.name =
                title;

            row.data = {
                ...currentData,

                updateId:
                    currentData.updateId ??
                    row.sortOrder,

                version,

                title,

                description,

                downloadUrl,

                isMandatory,

                status:
                    'draft',

                sentAt:
                    null,

                sentCount:
                    toNumber(
                        currentData.sentCount,
                        0,
                    ),
            };

            await row.save();

            return res.json({
                message:
                    'تم تعديل التحديث',

                update:
                    normalizeUpdate(row),
            });
        } catch (error) {
            console.error(
                '[REMOTE UPDATES EDIT]',
                error,
            );

            return res.status(
                error.status || 500,
            ).json({
                message:
                    error.message ||
                    'تعذر تعديل التحديث',
            });
        }
    },
);

/* ============================================================
 * SEND
 * ============================================================ */

router.post(
    '/:id/send',
    async (req, res) => {
        try {
            const applicationId =
                await getApplicationId(
                    req,
                );

            if (
                !isValidObjectId(
                    req.params.id,
                )
            ) {
                return res.status(400).json({
                    message:
                        'معرّف التحديث غير صالح',
                });
            }

            const row =
                await Entity.findOne({
                    _id: req.params.id,
                    type: TYPE,
                    applicationId,
                });

            if (!row) {
                return res.status(404).json({
                    message:
                        'التحديث غير موجود',
                });
            }

            const currentData =
                row.data &&
                    typeof row.data === 'object'
                    ? row.data
                    : {};

            const currentStatus =
                String(
                    currentData.status ||
                    'draft',
                ).toLowerCase();

            if (
                currentStatus ===
                'sent'
            ) {
                return res.status(409).json({
                    message:
                        'تم إرسال هذا التحديث مسبقًا ولا يمكن إعادة إرساله',
                });
            }

            row.data = {
                ...currentData,

                status:
                    'sent',

                sentAt:
                    new Date(),

                sentCount:
                    toNumber(
                        currentData.sentCount,
                        0,
                    ) + 1,
            };

            await row.save();

            return res.json({
                message:
                    'تم إرسال التحديث',

                update:
                    normalizeUpdate(row),
            });
        } catch (error) {
            console.error(
                '[REMOTE UPDATES SEND]',
                error,
            );

            return res.status(
                error.status || 500,
            ).json({
                message:
                    error.message ||
                    'تعذر إرسال التحديث',
            });
        }
    },
);

/* ============================================================
 * DELETE
 * ============================================================ */

router.delete(
    '/:id',
    async (req, res) => {
        try {
            const applicationId =
                await getApplicationId(
                    req,
                );

            if (
                !isValidObjectId(
                    req.params.id,
                )
            ) {
                return res.status(400).json({
                    message:
                        'معرّف التحديث غير صالح',
                });
            }

            const row =
                await Entity.findOne({
                    _id: req.params.id,
                    type: TYPE,
                    applicationId,
                });

            if (!row) {
                return res.status(404).json({
                    message:
                        'التحديث غير موجود',
                });
            }

            await Entity.deleteOne({
                _id: row._id,
            });

            return res.json({
                message:
                    'تم حذف التحديث',
            });
        } catch (error) {
            console.error(
                '[REMOTE UPDATES DELETE]',
                error,
            );

            return res.status(
                error.status || 500,
            ).json({
                message:
                    error.message ||
                    'تعذر حذف التحديث',
            });
        }
    },
);

module.exports = router;
