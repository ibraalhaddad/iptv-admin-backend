const crypto = require('crypto');

const R2_ACCOUNT_ID = String(process.env.R2_ACCOUNT_ID || '').trim();
const R2_BUCKET = String(process.env.R2_BUCKET || '').trim();
const R2_ACCESS_KEY_ID = String(process.env.R2_ACCESS_KEY_ID || '').trim();
const R2_SECRET_ACCESS_KEY = String(process.env.R2_SECRET_ACCESS_KEY || '').trim();
const R2_PUBLIC_BASE_URL = String(process.env.R2_PUBLIC_BASE_URL || '').trim().replace(/\/$/, '');
const R2_PRESIGN_EXPIRES = Math.min(3600, Math.max(60, Number(process.env.R2_PRESIGN_EXPIRES || 900)));

function isConfigured() {
  return Boolean(R2_ACCOUNT_ID && R2_BUCKET && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_PUBLIC_BASE_URL);
}

function assertConfigured() {
  if (!isConfigured()) {
    const error = new Error('R2 storage is not configured. Set R2_ACCOUNT_ID, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_PUBLIC_BASE_URL.');
    error.code = 'R2_NOT_CONFIGURED';
    throw error;
  }
}

function sha256Hex(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function hmac(key, value, encoding) {
  return crypto.createHmac('sha256', key).update(value).digest(encoding);
}

function signingKey(secret, date) {
  const kDate = hmac(`AWS4${secret}`, date);
  const kRegion = hmac(kDate, 'auto');
  const kService = hmac(kRegion, 's3');
  return hmac(kService, 'aws4_request');
}

function encodePath(value) {
  return String(value || '')
    .split('/')
    .map(segment => encodeURIComponent(segment).replace(/[!'()*]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`))
    .join('/');
}

function encodeQuery(value) {
  return encodeURIComponent(String(value))
    .replace(/[!'()*]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

function normalizeHeaderValue(value) {
  return String(value).trim().replace(/\s+/g, ' ');
}

function createPresignedUrl({ method, key, contentType, cacheControl, expiresIn = R2_PRESIGN_EXPIRES }) {
  assertConfigured();
  if (!key) throw new Error('Storage object key is required');

  const now = new Date();
  const amzDate = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const dateStamp = amzDate.slice(0, 8);
  const host = `${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
  const canonicalUri = `/${encodePath(R2_BUCKET)}/${encodePath(key)}`;

  const headers = { host };
  if (contentType) headers['content-type'] = normalizeHeaderValue(contentType);
  if (cacheControl) headers['cache-control'] = normalizeHeaderValue(cacheControl);

  const signedHeaders = Object.keys(headers).sort();
  const credential = `${R2_ACCESS_KEY_ID}/${dateStamp}/auto/s3/aws4_request`;
  const query = {
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': credential,
    'X-Amz-Date': amzDate,
    'X-Amz-Expires': String(Math.trunc(expiresIn)),
    'X-Amz-SignedHeaders': signedHeaders.join(';'),
  };

  const canonicalQuery = Object.keys(query)
    .sort()
    .map(name => `${encodeQuery(name)}=${encodeQuery(query[name])}`)
    .join('&');

  const canonicalHeaders = signedHeaders
    .map(name => `${name}:${normalizeHeaderValue(headers[name])}\n`)
    .join('');

  const canonicalRequest = [
    method.toUpperCase(),
    canonicalUri,
    canonicalQuery,
    canonicalHeaders,
    signedHeaders.join(';'),
    'UNSIGNED-PAYLOAD',
  ].join('\n');

  const scope = `${dateStamp}/auto/s3/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    scope,
    sha256Hex(canonicalRequest),
  ].join('\n');

  const signature = hmac(signingKey(R2_SECRET_ACCESS_KEY, dateStamp), stringToSign, 'hex');
  return `https://${host}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}

async function signedRequest({ method, key, headers = {}, body }) {
  assertConfigured();
  const now = new Date();
  const amzDate = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const dateStamp = amzDate.slice(0, 8);
  const host = `${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
  const canonicalUri = `/${encodePath(R2_BUCKET)}/${encodePath(key)}`;

  const normalized = { host, ...headers, 'x-amz-date': amzDate };
  const signedHeaders = Object.keys(normalized).map(k => k.toLowerCase()).sort();
  const canonicalHeaders = signedHeaders.map(name => `${name}:${normalizeHeaderValue(normalized[name])}\n`).join('');
  const payloadHash = body ? sha256Hex(body) : sha256Hex('');
  const canonicalRequest = [
    method.toUpperCase(), canonicalUri, '', canonicalHeaders, signedHeaders.join(';'), payloadHash,
  ].join('\n');
  const scope = `${dateStamp}/auto/s3/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256Hex(canonicalRequest)].join('\n');
  const signature = hmac(signingKey(R2_SECRET_ACCESS_KEY, dateStamp), stringToSign, 'hex');
  const authorization = `AWS4-HMAC-SHA256 Credential=${R2_ACCESS_KEY_ID}/${scope}, SignedHeaders=${signedHeaders.join(';')}, Signature=${signature}`;

  const response = await fetch(`https://${host}${canonicalUri}`, {
    method,
    headers: { ...normalized, authorization },
    body,
  });

  return response;
}


async function putObject(key, body, contentType, cacheControl = 'public, max-age=31536000, immutable') {
  const response = await signedRequest({
    method: 'PUT',
    key,
    headers: {
      'content-type': contentType,
      'cache-control': cacheControl,
    },
    body,
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`R2 PUT failed (${response.status}): ${text.slice(0, 500)}`);
  }
  return response;
}

async function headObject(key) {
  return signedRequest({ method: 'HEAD', key });
}

async function deleteObject(key) {
  return signedRequest({ method: 'DELETE', key });
}

function publicUrlForKey(key) {
  assertConfigured();
  return `${R2_PUBLIC_BASE_URL}/${String(key).split('/').map(encodeURIComponent).join('/')}`;
}

function keyFromPublicUrl(value) {
  const raw = String(value || '').trim();
  if (!raw || !R2_PUBLIC_BASE_URL || !raw.startsWith(`${R2_PUBLIC_BASE_URL}/`)) return null;
  const path = raw.slice(`${R2_PUBLIC_BASE_URL}/`.length).split('?')[0];
  return path.split('/').map(segment => {
    try { return decodeURIComponent(segment); } catch { return segment; }
  }).join('/');
}

module.exports = {
  isConfigured,
  assertConfigured,
  createPresignedUrl,
  headObject,
  putObject,
  deleteObject,
  publicUrlForKey,
  keyFromPublicUrl,
};
