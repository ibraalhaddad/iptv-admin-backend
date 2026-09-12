require('dotenv').config();
const mongoose = require('mongoose');

require('../models/User');
require('../models/Application');
require('../models/Theme');
require('../models/Setting');
require('../models/DeviceMac');
require('../models/MacUser');
require('../models/Banner');
require('../models/Entity');
require('../models/DnsEntry');
require('../models/Notification');
require('../models/NotificationCounter');

const uri = String(process.env.MONGODB_URI || '').trim();

if (!uri) {
  console.error('MONGODB_URI is required');
  process.exit(1);
}

(async () => {
  try {
    await mongoose.connect(uri, {
      maxPoolSize: 5,
      serverSelectionTimeoutMS: 10000,
    });

    for (const name of [
      'User',
      'Application',
      'Theme',
      'Setting',
      'DeviceMac',
      'MacUser',
      'Banner',
      'Entity',
      'DnsEntry',
      'Notification',
      'NotificationCounter',
    ]) {
      const model = mongoose.model(name);
      await model.syncIndexes();
      console.log(`[INDEX] ${name}: synced`);
    }

    await mongoose.disconnect();
    console.log('All indexes synchronized.');
  } catch (error) {
    console.error(error?.stack || error);
    try { await mongoose.disconnect(); } catch {}
    process.exit(1);
  }
})();
