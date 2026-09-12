const express = require('express');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const Application = require('../models/Application');
const User = require('../models/User');
const { auth, requireRole, publicUser } = require('../middleware/auth');
const { uploadBuffer, deleteFile, isConfigured } = require('../services/imagekitStorage');

const router = express.Router();

const uploadDir = path.join(__dirname, '..', 'uploads', 'application-logos');
fs.mkdirSync(uploadDir, { recursive: true });
const allowedMimeTypes = new Set(['image/jpeg','image/png','image/webp','image/gif']);
const uploadLogo = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req,file,cb) => allowedMimeTypes.has(file.mimetype) ? cb(null,true) : cb(new Error('صيغة الشعار غير مدعومة. استخدم PNG أو JPG أو WEBP أو GIF')),
});
async function saveLogo(req, applicationId){
  if(!req.file)return null;
  if(!isConfigured()){const e=new Error('تخزين الصور غير مهيأ. أضف إعدادات ImageKit إلى Railway.');e.status=503;throw e;}
  return uploadBuffer({buffer:req.file.buffer,fileName:req.file.originalname,contentType:req.file.mimetype,folder:`applications/${applicationId}`,tags:['iptv','application-logo',String(applicationId)]});
}
function normalizeSlug(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function publicLogoUrl(req, logoUrl) {
  const value = String(logoUrl || '').trim();
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value;
  return `${req.protocol}://${req.get('host')}${value.startsWith('/') ? value : `/${value}`}`;
}

function toApplicationResponse(req, app, owner = null) {
  const value = typeof app.toObject === 'function' ? app.toObject() : { ...app };
  value.logoUrl = publicLogoUrl(req, value.logoUrl);
  return {
    ...value,
    owner: owner ? publicUser(owner) : null,
  };
}

function localUploadPathFromUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;

  let pathname = raw;
  try {
    if (/^https?:\/\//i.test(raw)) pathname = new URL(raw).pathname;
  } catch {
    return null;
  }

  const prefix = '/uploads/application-logos/';
  if (!pathname.startsWith(prefix)) return null;
  const filename = path.basename(pathname);
  if (!filename || filename === '.' || filename === '..') return null;
  return path.join(uploadDir, filename);
}

async function removeOldLogo(value,fileId=''){
  if(fileId){try{await deleteFile(fileId)}catch(e){console.warn('[APPLICATIONS] ImageKit delete:',e.message)}return;}
  const filePath=localUploadPathFromUrl(value); if(!filePath)return;
  try{if(fs.existsSync(filePath))fs.unlinkSync(filePath)}catch(e){console.warn('[APPLICATIONS] legacy logo delete:',e.message)}
}

function mapMultipartValue(value, fallback) {
  return value === undefined ? fallback : value;
}

// All application endpoints require authentication.
router.use(auth);

// ---------------------------------------------------------------------------
// Super admin: all applications
// ---------------------------------------------------------------------------
router.get('/', requireRole('super_admin'), async (req, res) => {
  try {
    const apps = await Application.find().sort({ createdAt: -1 }).lean();
    const ids = apps.map(a => a._id);
    const owners = await User.find({ role: 'app_owner', applicationId: { $in: ids } })
      .select('username displayName applicationId isActive lastLoginAt')
      .lean();
    const ownersByApp = new Map(owners.map(o => [String(o.applicationId), o]));

    res.json(apps.map(app => toApplicationResponse(req, app, ownersByApp.get(String(app._id)) || null)));
  } catch (error) {
    console.error('[APPLICATIONS] list', error);
    res.status(500).json({ message: 'فشل تحميل التطبيقات' });
  }
});

router.post('/', requireRole('super_admin'), uploadLogo.single('logo'), async (req, res) => {
  try {
    const name = String(req.body?.name || '').trim();
    const slug = normalizeSlug(req.body?.slug || name);
    const ownerUsername = String(req.body?.ownerUsername || '').trim().toLowerCase();
    const ownerPassword = String(req.body?.ownerPassword || '');
    const ownerDisplayName = String(req.body?.ownerDisplayName || '').trim();

    if (!name || !slug) return res.status(400).json({ message: 'اسم التطبيق والمعرف مطلوبان' });
    if (!ownerUsername || ownerPassword.length < 6) {
      return res.status(400).json({ message: 'بيانات مالك التطبيق غير صحيحة، وكلمة المرور يجب أن تكون 6 أحرف على الأقل' });
    }
    if (await Application.exists({ slug })) return res.status(409).json({ message: 'معرف التطبيق مستخدم بالفعل' });
    if (await User.exists({ username: ownerUsername })) return res.status(409).json({ message: 'اسم مستخدم المالك مستخدم بالفعل' });

    const suppliedLogoUrl = String(req.body?.logoUrl || '').trim();
    const remoteLogo = req.file ? await saveLogo(req, `new-${Date.now()}`) : null;
    const logoUrl = remoteLogo?.url || suppliedLogoUrl;

    const app = await Application.create({
      name,
      slug,
      description: req.body?.description || '',
      logoUrl,
      logoFileId: remoteLogo?.fileId || '',
      isActive: String(req.body?.isActive ?? 'true') !== 'false',
    });

    try {
      const user = await User.create({
        username: ownerUsername,
        passwordHash: await bcrypt.hash(ownerPassword, 12),
        displayName: ownerDisplayName || name,
        role: 'app_owner',
        applicationId: app._id,
        isActive: String(req.body?.ownerActive ?? 'true') !== 'false',
      });
      res.status(201).json(toApplicationResponse(req, app, user));
    } catch (error) {
      await Application.findByIdAndDelete(app._id);
      if (remoteLogo?.fileId) await removeOldLogo('', remoteLogo.fileId);
      throw error;
    }
  } catch (error) {
    console.error('[APPLICATIONS] create', error);
    res.status(error.code === 11000 ? 409 : error.status || 400).json({ message: error.message || 'فشل إنشاء التطبيق' });
  }
});

// ---------------------------------------------------------------------------
// App owner: only their own application
// ---------------------------------------------------------------------------
router.get('/me', requireRole('app_owner'), async (req, res) => {
  try {
    if (!req.user.applicationId) return res.status(403).json({ message: 'الحساب غير مرتبط بتطبيق' });
    const app = await Application.findById(req.user.applicationId).lean();
    if (!app) return res.status(404).json({ message: 'التطبيق المرتبط بالحساب غير موجود' });
    res.json(toApplicationResponse(req, app));
  } catch (error) {
    console.error('[APPLICATIONS] me', error);
    res.status(500).json({ message: 'فشل تحميل بيانات التطبيق' });
  }
});

router.put('/me', requireRole('app_owner'), uploadLogo.single('logo'), async (req, res) => {
  let uploadedLogo = null;
  let applicationSaved = false;
  try {
    if (!req.user.applicationId) {
      if (req.file) removeOldLogo(uploadedLogo);
      return res.status(403).json({ message: 'الحساب غير مرتبط بتطبيق' });
    }

    const app = await Application.findById(req.user.applicationId);
    if (!app) {
      if (req.file) removeOldLogo(uploadedLogo);
      return res.status(404).json({ message: 'التطبيق غير موجود' });
    }

    const name = String(req.body?.name ?? app.name).trim();
    const description = String(req.body?.description ?? app.description ?? '');
    if (!name) {
      if (req.file) removeOldLogo(uploadedLogo);
      return res.status(400).json({ message: 'اسم التطبيق مطلوب' });
    }

    const previousLogo = app.logoUrl;
    const previousLogoFileId = app.logoFileId || '';
    const previousName = app.name;
    const remoteLogo = req.file ? await saveLogo(req, String(app._id)) : null;
    uploadedLogo = remoteLogo;
    app.name = name;
    app.description = description;
    if (remoteLogo) { app.logoUrl = remoteLogo.url; app.logoFileId = remoteLogo.fileId; }
    else if (req.body?.logoUrl !== undefined) { app.logoUrl = String(req.body.logoUrl || '').trim(); if (req.body?.logoFileId !== undefined) app.logoFileId = String(req.body.logoFileId || '').trim(); }
    await app.save();
    applicationSaved = true;

    if (remoteLogo && previousLogo !== remoteLogo.url) await removeOldLogo(previousLogo, previousLogoFileId);

    // Keep the owner display name useful when it was still equal to the old app name.
    const owner = await User.findById(req.user.id);
    if (owner) {
      if (!owner.displayName || owner.displayName === previousName) {
        owner.displayName = name;
        await owner.save();
      }
    }

    res.json(toApplicationResponse(req, app, owner || null));
  } catch (error) {
    if (req.file && !applicationSaved && uploadedLogo?.fileId) await removeOldLogo('', uploadedLogo.fileId);
    console.error('[APPLICATIONS] update own app', error);
    res.status(error.status || 400).json({ message: error.message || 'فشل تعديل التطبيق' });
  }
});


router.put('/:id', requireRole('super_admin'), uploadLogo.single('logo'), async (req, res) => {
  let uploadedLogo = null;
  let applicationSaved = false;
  try {
    const app = await Application.findById(req.params.id);
    if (!app) {
      if (req.file) removeOldLogo(uploadedLogo);
      return res.status(404).json({ message: 'التطبيق غير موجود' });
    }

    const nextName = String(mapMultipartValue(req.body?.name, app.name)).trim();
    const nextSlug = normalizeSlug(mapMultipartValue(req.body?.slug, app.slug));
    if (!nextName || !nextSlug) {
      if (req.file) removeOldLogo(uploadedLogo);
      return res.status(400).json({ message: 'اسم التطبيق والمعرف مطلوبان' });
    }
    if (await Application.exists({ slug: nextSlug, _id: { $ne: app._id } })) {
      if (req.file) removeOldLogo(uploadedLogo);
      return res.status(409).json({ message: 'معرف التطبيق مستخدم بالفعل' });
    }

    const previousLogo = app.logoUrl;
    const previousLogoFileId = app.logoFileId || '';
    const remoteLogo = req.file ? await saveLogo(req, String(app._id)) : null;
    uploadedLogo = remoteLogo;
    app.name = nextName;
    app.slug = nextSlug;
    app.description = mapMultipartValue(req.body?.description, app.description);
    if (remoteLogo) { app.logoUrl = remoteLogo.url; app.logoFileId = remoteLogo.fileId; }
    else if (req.body?.logoUrl !== undefined) { app.logoUrl = String(req.body.logoUrl || '').trim(); if (req.body?.logoFileId !== undefined) app.logoFileId = String(req.body.logoFileId || '').trim(); }
    app.isActive = String(mapMultipartValue(req.body?.isActive, app.isActive)) !== 'false';
    await app.save();
    applicationSaved = true;

    if (remoteLogo && previousLogo !== remoteLogo.url) await removeOldLogo(previousLogo, previousLogoFileId);

    if (req.body?.ownerUsername || req.body?.ownerPassword || req.body?.ownerDisplayName !== undefined || req.body?.ownerActive !== undefined) {
      const owner = await User.findOne({ role: 'app_owner', applicationId: app._id });
      if (!owner) return res.status(500).json({ message: 'لم يتم العثور على مالك التطبيق' });
      if (req.body.ownerUsername) {
        const nextUsername = String(req.body.ownerUsername).trim().toLowerCase();
        const exists = await User.exists({ username: nextUsername, _id: { $ne: owner._id } });
        if (exists) return res.status(409).json({ message: 'اسم مستخدم المالك مستخدم بالفعل' });
        owner.username = nextUsername;
      }
      if (req.body.ownerPassword) owner.passwordHash = await bcrypt.hash(String(req.body.ownerPassword), 12);
      if (req.body.ownerDisplayName !== undefined) owner.displayName = String(req.body.ownerDisplayName).trim();
      if (req.body.ownerActive !== undefined) owner.isActive = String(req.body.ownerActive) !== 'false';
      await owner.save();
    }

    const owner = await User.findOne({ role: 'app_owner', applicationId: app._id }).lean();
    res.json(toApplicationResponse(req, app, owner || null));
  } catch (error) {
    if (req.file && !applicationSaved && uploadedLogo?.fileId) await removeOldLogo('', uploadedLogo.fileId);
    console.error('[APPLICATIONS] update', error);
    res.status(error.code === 11000 ? 409 : error.status || 400).json({ message: error.message || 'فشل تعديل التطبيق' });
  }
});

router.patch('/:id/status', requireRole('super_admin'), async (req, res) => {
  try {
    const app = await Application.findByIdAndUpdate(req.params.id, { isActive: !!req.body?.isActive }, { new: true });
    if (!app) return res.status(404).json({ message: 'التطبيق غير موجود' });
    if (!app.isActive) await User.updateMany({ applicationId: app._id, role: 'app_owner' }, { isActive: false });
    res.json(toApplicationResponse(req, app));
  } catch (error) {
    res.status(400).json({ message: error.message || 'فشل تغيير الحالة' });
  }
});

router.delete('/:id', requireRole('super_admin'), async (req, res) => {
  try {
    const app = await Application.findById(req.params.id);
    if (!app) return res.status(404).json({ message: 'التطبيق غير موجود' });
    await Promise.all([
      User.deleteMany({ applicationId: app._id, role: 'app_owner' }),
      Application.deleteOne({ _id: app._id }),
    ]);
    await removeOldLogo(app.logoUrl, app.logoFileId || '');
    res.json({ message: 'تم حذف التطبيق ومالكه' });
  } catch (error) {
    res.status(400).json({ message: error.message || 'فشل الحذف' });
  }
});

// Multer errors are converted into clean API responses.
router.use((error, _req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ message: 'حجم الشعار يجب ألا يتجاوز 2 ميجابايت' });
    }
    return res.status(400).json({ message: error.message || 'فشل رفع الشعار' });
  }
  if (error) return res.status(400).json({ message: error.message || 'فشل رفع الشعار' });
  next();
});

module.exports = router;
