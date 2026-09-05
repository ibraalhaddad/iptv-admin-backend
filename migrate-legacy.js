require('dotenv').config();
const mongoose = require('mongoose');
const Application = require('./models/Application');
const Entity = require('./models/Entity');
const DeviceMac = require('./models/DeviceMac');
const MacUser = require('./models/MacUser');
const Banner = require('./models/Banner');
const DnsEntry = require('./models/DnsEntry');
const Setting = require('./models/Setting');

(async () => {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/iptv_admin');
  const slug = String(process.env.MIGRATE_LEGACY_TO_SLUG || '').trim().toLowerCase();
  if (!slug) throw new Error('ضع MIGRATE_LEGACY_TO_SLUG=app-slug في البيئة قبل تشغيل الترحيل');
  const app = await Application.findOne({ slug });
  if (!app) throw new Error(`التطبيق غير موجود: ${slug}`);

  const filter = { applicationId: { $in: [null] } };
  const options = { applicationId: app._id };
  const results = {};
  results.entities = (await Entity.updateMany(filter, { $set: options })).modifiedCount;
  results.devices = (await DeviceMac.updateMany(filter, { $set: options })).modifiedCount;
  results.macUsers = (await MacUser.updateMany(filter, { $set: options })).modifiedCount;
  results.banners = (await Banner.updateMany(filter, { $set: options })).modifiedCount;
  results.dns = (await DnsEntry.updateMany(filter, { $set: options })).modifiedCount;
  results.settings = (await Setting.updateMany(filter, { $set: options })).modifiedCount;

  console.log('Legacy records migrated:', results);
  await mongoose.disconnect();
})().catch(error => { console.error(error); process.exit(1); });
