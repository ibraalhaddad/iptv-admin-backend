require('dotenv').config();
const { isConfigured, URL_ENDPOINT } = require('../services/imagekitStorage');
console.log(JSON.stringify({ configured: isConfigured(), endpoint: URL_ENDPOINT || null }, null, 2));
