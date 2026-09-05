
// المسار: routes/notifications.js

const express = require('express');
const mongoose = require('mongoose');

const Notification =
    require('../models/Notification');

const NotificationCounter =
    require('../models/NotificationCounter');

const Application =
    require('../models/Application');

const {
    auth,
} = require('../middleware/auth');

const router =
    express.Router();

/* ========================================================================= */
/* Helpers                                                                   */
/* ========================================================================= */

function getRole(req) {
    return String(
        req.user?.role || ''
    ).toLowerCase();
}

function isManager(req) {
    const role =
        getRole(req);

    return (
        role === 'super_admin' ||
        role === 'app_owner'
    );
}

/* ========================================================================= */
/* Application Helpers                                                       */
/* ========================================================================= */

/**
 * قراءة التطبيق المطلوب.
 *
 * الأولوية:
 * 1. query.applicationId
 * 2. body.applicationId
 * 3. X-Application-Id
 */
function getRequestedApplicationId(
    req
) {
    return (
        req.query?.applicationId ||
        req.body?.applicationId ||
        req.headers?.[
        'x-application-id'
        ] ||
        null
    );
}

/**
 * تحديد التطبيق لعمليات القراءة العامة
 * من لوحة التحكم.
 */
function getApplicationIdForRead(
    req
) {
    const role =
        getRole(req);

    /*
     * app_owner لا يستطيع رؤية
     * إشعارات تطبيق آخر.
     */
    if (
        role === 'app_owner'
    ) {
        return (
            req.user?.applicationId ||
            null
        );
    }

    /*
     * super_admin:
     *
     * تطبيق محدد = ذلك التطبيق.
     *
     * لا يوجد تطبيق = جميع التطبيقات.
     */
    return getRequestedApplicationId(
        req
    );
}

/**
 * تحديد التطبيق لعمليات الكتابة.
 */
function getApplicationIdForWrite(
    req
) {
    const role =
        getRole(req);

    /*
     * app_owner يستخدم تطبيقه فقط.
     */
    if (
        role === 'app_owner'
    ) {
        return (
            req.user?.applicationId ||
            null
        );
    }

    /*
     * super_admin يستخدم التطبيق
     * الذي اختاره.
     */
    return getRequestedApplicationId(
        req
    );
}

/* ========================================================================= */
/* Notification Counter                                                      */
/* ========================================================================= */

async function getNextNotificationId(
    applicationId
) {
    const key =
        `notification:${applicationId}`;

    /*
     * نتحقق من وجود العداد.
     */
    const counter =
        await NotificationCounter.findOne({
            key,
        });

    /*
     * إذا لم يوجد، نهيئه من آخر
     * notificationId موجود.
     */
    if (!counter) {
        const last =
            await Notification.findOne({
                applicationId,

                notificationId: {
                    $type: 'number',
                },
            })
                .sort({
                    notificationId:
                        -1,
                })
                .select(
                    'notificationId'
                )
                .lean();

        const initialValue =
            Number(
                last?.notificationId ||
                0
            );

        await NotificationCounter.updateOne(
            { key },

            {
                $setOnInsert: {
                    value:
                        initialValue,
                },
            },

            {
                upsert: true,
            }
        );
    }

    /*
     * زيادة العداد.
     */
    const result =
        await NotificationCounter.findOneAndUpdate(
            { key },

            {
                $inc: {
                    value: 1,
                },
            },

            {
                new: true,
            }
        );

    return Number(
        result.value
    );
}

/* ========================================================================= */
/* Payload                                                                   */
/* ========================================================================= */

function cleanPayload(
    body = {}
) {
    return {
        title:
            String(
                body.title || ''
            ).trim(),

        message:
            String(
                body.message || ''
            ).trim(),

        imageUrl:
            String(
                body.imageUrl || ''
            ).trim(),

        actionType:
            body.actionType ||
            'none',

        actionId:
            String(
                body.actionId || ''
            ).trim(),
    };
}

/* ========================================================================= */
/* Management Filter                                                         */
/* ========================================================================= */

function buildReadFilter(req) {
    const role =
        getRole(req);

    /*
     * app_owner
     */
    if (
        role === 'app_owner'
    ) {
        if (
            !req.user?.applicationId
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
     */
    const applicationId =
        getRequestedApplicationId(
            req
        );

    /*
     * تطبيق محدد.
     */
    if (
        applicationId
    ) {
        return {
            applicationId,
        };
    }

    /*
     * لا يوجد تطبيق محدد:
     * عرض جميع التطبيقات.
     */
    return {};
}

/* ========================================================================= */
/* PUBLIC MOBILE ENDPOINT                                                    */
/* ========================================================================= */

/**
 * هذا المسار مخصص لتطبيق الهاتف.
 *
 * مهم:
 *
 * يجب أن يكون هذا المسار قبل:
 *
 * router.use(auth, ...)
 *
 * لأنه لا يحتاج JWT.
 *
 * التطبيق يرسل:
 *
 * X-Application-Id
 *
 * أو:
 *
 * ?applicationId=
 */
router.get(
    '/public/active',
    async (
        req,
        res
    ) => {
        try {
            /*
             * نفضل query ثم الهيدر.
             */
            const applicationId =
                req.query?.applicationId ||
                req.headers?.[
                'x-application-id'
                ] ||
                null;

            console.log(
                '============================================================'
            );

            console.log(
                '[NOTIFICATIONS PUBLIC ACTIVE] Request received'
            );

            console.log(
                '[NOTIFICATIONS PUBLIC ACTIVE] applicationId:',
                applicationId
            );

            /*
             * لا يوجد applicationId:
             *
             * يمكننا عرض جميع الإشعارات العامة.
             *
             * لكن في تطبيق الهاتف الخاص
             * من الأفضل إرسال APPLICATION_ID.
             */
            const filter = {
                status: 'sent',
            };

            if (
                applicationId
            ) {
                /*
                 * التأكد من صحة Mongo ObjectId.
                 */
                if (
                    !mongoose.Types.ObjectId.isValid(
                        String(
                            applicationId
                        )
                    )
                ) {
                    console.warn(
                        '[NOTIFICATIONS PUBLIC ACTIVE] Invalid applicationId:',
                        applicationId
                    );

                    return res
                        .status(400)
                        .json({
                            message:
                                'معرّف التطبيق غير صالح',
                        });
                }

                filter.applicationId =
                    applicationId;
            }

            /*
             * جلب الإشعارات المرسلة فقط.
             */
            const notifications =
                await Notification.find(
                    filter
                )
                    .sort({
                        sentAt:
                            -1,

                        notificationId:
                            -1,

                        createdAt:
                            -1,
                    })
                    .lean();

            console.log(
                '[NOTIFICATIONS PUBLIC ACTIVE] Found:',
                notifications.length
            );

            /*
             * الشكل الذي سيستقبله تطبيق React Native.
             */
            const result =
                notifications.map(
                    (
                        item
                    ) => ({
                        id:
                            item.notificationId,

                        notificationId:
                            item.notificationId,

                        title:
                            item.title,

                        message:
                            item.message,

                        imageUrl:
                            item.imageUrl ||
                            '',

                        actionType:
                            item.actionType ||
                            'none',

                        actionId:
                            item.actionId ||
                            '',

                        status:
                            item.status,

                        sentAt:
                            item.sentAt ||
                            null,

                        sentCount:
                            Number(
                                item.sentCount ||
                                0
                            ),

                        applicationId:
                            item.applicationId
                                ? String(
                                    item.applicationId
                                )
                                : null,
                    })
                );

            console.log(
                '[NOTIFICATIONS PUBLIC ACTIVE] Returning:',
                result.length
            );

            console.log(
                '============================================================'
            );

            return res.json(
                result
            );
        } catch (error) {
            console.error(
                '[NOTIFICATIONS PUBLIC ACTIVE] ERROR:',
                error
            );

            return res
                .status(500)
                .json({
                    message:
                        'تعذر جلب الإشعارات النشطة',
                });
        }
    }
);

/* ========================================================================= */
/* Access                                                                    */
/* ========================================================================= */

/*
 * من هنا تبدأ مسارات لوحة التحكم.
 *
 * كل ما بعد هذا السطر يحتاج auth.
 */
router.use(
    auth,
    (
        req,
        res,
        next
    ) => {
        if (
            !isManager(req)
        ) {
            return res
                .status(403)
                .json({
                    message:
                        'ليس لديك صلاحية إدارة الإشعارات',
                });
        }

        next();
    }
);

/* ========================================================================= */
/* GET                                                                       */
/* ========================================================================= */

router.get(
    '/',
    async (
        req,
        res
    ) => {
        try {
            const filter =
                buildReadFilter(
                    req
                );

            /*
             * app_owner غير مرتبط بتطبيق.
             */
            if (
                filter === null
            ) {
                return res
                    .status(403)
                    .json({
                        message:
                            'حساب مالك التطبيق غير مرتبط بتطبيق',
                    });
            }

            /*
             * جلب الإشعارات.
             */
            const notifications =
                await Notification.find(
                    filter
                )
                    .populate(
                        'applicationId',
                        'name title'
                    )
                    .sort({
                        applicationId:
                            1,

                        notificationId:
                            1,

                        createdAt:
                            1,
                    })
                    .lean();

            /*
             * توحيد شكل applicationId/application.
             */
            const normalized =
                notifications.map(
                    (
                        item
                    ) => ({
                        ...item,

                        application:
                            item.applicationId ||
                            null,

                        applicationId:
                            item.applicationId
                                ?._id ||
                            item.applicationId ||
                            null,
                    })
                );

            const draft =
                normalized.filter(
                    (
                        item
                    ) =>
                        item.status ===
                        'draft'
                ).length;

            const sent =
                normalized.filter(
                    (
                        item
                    ) =>
                        item.status ===
                        'sent'
                ).length;

            return res.json({
                notifications:
                    normalized,

                stats: {
                    total:
                        normalized.length,

                    draft,

                    sent,
                },
            });
        } catch (error) {
            console.error(
                '[NOTIFICATIONS GET]',
                error
            );

            return res
                .status(500)
                .json({
                    message:
                        'تعذر تحميل الإشعارات',
                });
        }
    }
);

/* ========================================================================= */
/* CREATE                                                                    */
/* ========================================================================= */

router.post(
    '/',
    async (
        req,
        res
    ) => {
        try {
            const applicationId =
                getApplicationIdForWrite(
                    req
                );

            if (
                !applicationId
            ) {
                return res
                    .status(400)
                    .json({
                        message:
                            'يجب تحديد التطبيق قبل إنشاء الإشعار',
                    });
            }

            /*
             * التحقق من صحة applicationId.
             */
            if (
                !mongoose.Types.ObjectId.isValid(
                    String(
                        applicationId
                    )
                )
            ) {
                return res
                    .status(400)
                    .json({
                        message:
                            'معرّف التطبيق غير صالح',
                    });
            }

            /*
             * التأكد من وجود التطبيق.
             */
            const application =
                await Application.findOne({
                    _id:
                        applicationId,
                }).lean();

            if (
                !application
            ) {
                return res
                    .status(404)
                    .json({
                        message:
                            'التطبيق غير موجود',
                    });
            }

            if (
                application.isActive ===
                false
            ) {
                return res
                    .status(400)
                    .json({
                        message:
                            'لا يمكن إضافة إشعار لتطبيق معطل',
                    });
            }

            const payload =
                cleanPayload(
                    req.body
                );

            if (
                !payload.title
            ) {
                return res
                    .status(400)
                    .json({
                        message:
                            'عنوان الإشعار مطلوب',
                    });
            }

            if (
                !payload.message
            ) {
                return res
                    .status(400)
                    .json({
                        message:
                            'محتوى الإشعار مطلوب',
                    });
            }

            /*
             * توليد ID خاص بهذا التطبيق.
             */
            const notificationId =
                await getNextNotificationId(
                    applicationId
                );

            /*
             * إنشاء الإشعار كمسودة.
             *
             * لن يظهر في التطبيق حتى
             * يتم تحويله إلى sent.
             */
            const notification =
                await Notification.create({
                    applicationId,

                    notificationId,

                    title:
                        payload.title,

                    message:
                        payload.message,

                    imageUrl:
                        payload.imageUrl,

                    actionType:
                        payload.actionType,

                    actionId:
                        payload.actionId,

                    status:
                        'draft',

                    sentAt:
                        null,

                    sentCount:
                        0,
                });

            /*
             * Populate التطبيق للواجهة.
             */
            const populated =
                await Notification.findById(
                    notification._id
                )
                    .populate(
                        'applicationId',
                        'name title'
                    )
                    .lean();

            return res
                .status(201)
                .json({
                    ...populated,

                    application:
                        populated?.applicationId ||
                        null,
                });
        } catch (error) {
            console.error(
                '[NOTIFICATIONS CREATE]',
                error
            );

            return res
                .status(500)
                .json({
                    message:
                        'تعذر إنشاء الإشعار',
                });
        }
    }
);

/* ========================================================================= */
/* EDIT                                                                      */
/* ========================================================================= */

router.put(
    '/:id',
    async (
        req,
        res
    ) => {
        try {
            const role =
                getRole(req);

            const applicationId =
                getApplicationIdForWrite(
                    req
                );

            if (
                !applicationId
            ) {
                return res
                    .status(403)
                    .json({
                        message:
                            'لا يوجد تطبيق مرتبط بالحساب',
                    });
            }

            if (
                !mongoose.Types.ObjectId.isValid(
                    String(
                        applicationId
                    )
                )
            ) {
                return res
                    .status(400)
                    .json({
                        message:
                            'معرّف التطبيق غير صالح',
                    });
            }

            const filter = {
                _id:
                    req.params.id,

                applicationId:
                    role ===
                        'app_owner'
                        ? req.user.applicationId
                        : applicationId,
            };

            const notification =
                await Notification.findOne(
                    filter
                );

            if (
                !notification
            ) {
                return res
                    .status(404)
                    .json({
                        message:
                            'الإشعار غير موجود',
                    });
            }

            /*
             * الإشعار المرسل لا يمكن تعديله.
             */
            if (
                notification.status ===
                'sent'
            ) {
                return res
                    .status(400)
                    .json({
                        message:
                            'لا يمكن تعديل إشعار تم إرساله',
                    });
            }

            const payload =
                cleanPayload(
                    req.body
                );

            if (
                !payload.title
            ) {
                return res
                    .status(400)
                    .json({
                        message:
                            'عنوان الإشعار مطلوب',
                    });
            }

            if (
                !payload.message
            ) {
                return res
                    .status(400)
                    .json({
                        message:
                            'محتوى الإشعار مطلوب',
                    });
            }

            /*
             * لا نسمح بتغيير applicationId.
             */
            notification.title =
                payload.title;

            notification.message =
                payload.message;

            notification.imageUrl =
                payload.imageUrl;

            notification.actionType =
                payload.actionType;

            notification.actionId =
                payload.actionId;

            await notification.save();

            /*
             * إعادة populate.
             */
            const populated =
                await Notification.findById(
                    notification._id
                )
                    .populate(
                        'applicationId',
                        'name title'
                    )
                    .lean();

            return res.json({
                ...populated,

                application:
                    populated?.applicationId ||
                    null,
            });
        } catch (error) {
            console.error(
                '[NOTIFICATIONS EDIT]',
                error
            );

            return res
                .status(500)
                .json({
                    message:
                        'تعذر تعديل الإشعار',
                });
        }
    }
);

/* ========================================================================= */
/* SEND                                                                      */
/* ========================================================================= */

router.post(
    '/:id/send',
    async (
        req,
        res
    ) => {
        try {
            const role =
                getRole(req);

            const applicationId =
                getApplicationIdForWrite(
                    req
                );

            if (
                !applicationId
            ) {
                return res
                    .status(403)
                    .json({
                        message:
                            'لا يوجد تطبيق مرتبط بالحساب',
                    });
            }

            if (
                !mongoose.Types.ObjectId.isValid(
                    String(
                        applicationId
                    )
                )
            ) {
                return res
                    .status(400)
                    .json({
                        message:
                            'معرّف التطبيق غير صالح',
                    });
            }

            const filter = {
                _id:
                    req.params.id,

                applicationId:
                    role ===
                        'app_owner'
                        ? req.user.applicationId
                        : applicationId,
            };

            const notification =
                await Notification.findOne(
                    filter
                );

            if (
                !notification
            ) {
                return res
                    .status(404)
                    .json({
                        message:
                            'الإشعار غير موجود',
                    });
            }

            /*
             * منع الإرسال الثاني.
             */
            if (
                notification.status ===
                'sent'
            ) {
                return res
                    .status(409)
                    .json({
                        message:
                            'تم إرسال هذا الإشعار مسبقًا ولا يمكن إرساله مرة أخرى',
                    });
            }

            /*
             * تسجيل الإشعار كمرسل.
             */
            notification.status =
                'sent';

            notification.sentAt =
                new Date();

            notification.sentCount =
                Number(
                    req.body?.sentCount ||
                    0
                );

            await notification.save();

            return res.json({
                message:
                    'تم إرسال الإشعار بنجاح',

                notification,
            });
        } catch (error) {
            console.error(
                '[NOTIFICATIONS SEND]',
                error
            );

            return res
                .status(500)
                .json({
                    message:
                        'تعذر إرسال الإشعار',
                });
        }
    }
);

/* ========================================================================= */
/* DELETE                                                                    */
/* ========================================================================= */

router.delete(
    '/:id',
    async (
        req,
        res
    ) => {
        try {
            const role =
                getRole(req);

            const applicationId =
                getApplicationIdForWrite(
                    req
                );

            if (
                !applicationId
            ) {
                return res
                    .status(403)
                    .json({
                        message:
                            'لا يوجد تطبيق مرتبط بالحساب',
                    });
            }

            if (
                !mongoose.Types.ObjectId.isValid(
                    String(
                        applicationId
                    )
                )
            ) {
                return res
                    .status(400)
                    .json({
                        message:
                            'معرّف التطبيق غير صالح',
                    });
            }

            const filter = {
                _id:
                    req.params.id,

                applicationId:
                    role ===
                        'app_owner'
                        ? req.user.applicationId
                        : applicationId,
            };

            const notification =
                await Notification.findOne(
                    filter
                );

            if (
                !notification
            ) {
                return res
                    .status(404)
                    .json({
                        message:
                            'الإشعار غير موجود',
                    });
            }

            await notification.deleteOne();

            return res.json({
                message:
                    'تم حذف الإشعار',
            });
        } catch (error) {
            console.error(
                '[NOTIFICATIONS DELETE]',
                error
            );

            return res
                .status(500)
                .json({
                    message:
                        'تعذر حذف الإشعار',
                });
        }
    }
);

/* ========================================================================= */
/* Export                                                                    */
/* ========================================================================= */

module.exports =
    router;
