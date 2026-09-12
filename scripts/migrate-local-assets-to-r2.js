require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const Banner = require('../models/Banner');
const Theme = require('../models/Theme');
const Application = require('../models/Application');
const { putObject, publicUrlForKey, isConfigured } = require('../services/r2Storage');

const root = path.join(__dirname, '..');
const dryRun = process.argv.includes('--dry-run');

function localPathFromUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  let pathname = raw;
  try { if (/^https?:\/\//i.test(raw)) pathname = new URL(raw).pathname; } catch { return null; }
  if (!pathname.startsWith('/uploads/')) return null;
  const relative = pathname.replace(/^\/uploads\//, '');
  const candidate = path.resolve(root, 'uploads', relative);
  const uploadsRoot = path.resolve(root, 'uploads');
  if (!candidate.startsWith(`${uploadsRoot}${path.sep}`)) return null;
  return candidate;
}

function keyFor(kind, filePath) {
  const relative = path.relative(path.join(root, 'uploads'), filePath).replace(/\\/g, '/');
  const safe = relative.split('/').map(part => part.replace(/[^a-zA-Z0-9._-]/g, '_')).join('/');
  return `${kind}/legacy/${safe}`;
}

async function migrateDoc(Model, id, field, kind) {
  const doc = await Model.findById(id);
  if (!doc) return { status: 'missing' };
  const current = String(doc[field] || '').trim();
  if (!current || /^https:\/\//i.test(current) && current.startsWith(process.env.R2_PUBLIC_BASE_URL)) return { status: 'skip' };
  const filePath = localPathFromUrl(current);
  if (!filePath || !fs.existsSync(filePath)) return { status: 'missing-file', value: current };
  const ext = path.extname(filePath).toLowerCase();
  const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : ext === '.gif' ? 'image/gif' : ext === '.svg' ? 'image/svg+xml' : 'image/jpeg';
  const key = keyFor(kind, filePath);
  if (!dryRun) {
    await putObject(key, fs.readFileSync(filePath), mime);
    doc[field] = publicUrlForKey(key);
    await doc.save();
  }
  return { status: dryRun ? 'would-migrate' : 'migrated', old: current, new: publicUrlForKey(key) };
}

async function run() {
  if (!isConfigured()) throw new Error('Configure R2 environment variables before running migration.');
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required.');
  await mongoose.connect(process.env.MONGODB_URI);
  const summary = { banners: 0, themes: 0, applications: 0, migrated: 0, skipped: 0, missing: 0 };

  const [banners, themes, applications] = await Promise.all([
    Banner.find({ imageUrl: { $regex: '^/uploads/' } }).select('_id imageUrl').lean(),
    Theme.find({ previewImage: { $regex: '^/uploads/' } }).select('_id previewImage').lean(),
    Application.find({ logoUrl: { $regex: '^/uploads/' } }).select('_id logoUrl').lean(),
  ]);

  for (const row of banners) {
    summary.banners++;
    const r = await migrateDoc(Banner, row._id, 'imageUrl', 'banners');
    if (r.status === 'migrated' || r.status === 'would-migrate') summary.migrated++; else if (r.status === 'skip') summary.skipped++; else summary.missing++;
    console.log('[BANNER]', r);
  }
  for (const row of themes) {
    summary.themes++;
    const r = await migrateDoc(Theme, row._id, 'previewImage', 'themes');
    if (r.status === 'migrated' || r.status === 'would-migrate') summary.migrated++; else if (r.status === 'skip') summary.skipped++; else summary.missing++;
    console.log('[THEME]', r);
  }
  for (const row of applications) {
    summary.applications++;
    const r = await migrateDoc(Application, row._id, 'logoUrl', 'application-logos');
    if (r.status === 'migrated' || r.status === 'would-migrate') summary.migrated++; else if (r.status === 'skip') summary.skipped++; else summary.missing++;
    console.log('[APPLICATION]', r);
  }

  console.log(JSON.stringify({ dryRun, ...summary }, null, 2));
  await mongoose.disconnect();
}

run().catch(async error => {
  console.error('[STORAGE MIGRATION FAILED]', error);
  try { await mongoose.disconnect(); } catch {}
  process.exit(1);
});
