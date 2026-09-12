const jwt = require('jsonwebtoken');
const User = require('../models/User');

const USER_CACHE_TTL_MS = Math.max(
  1000,
  Number(process.env.AUTH_USER_CACHE_TTL_MS || 5000),
);
const USER_CACHE_MAX = Math.max(
  100,
  Number(process.env.AUTH_USER_CACHE_MAX || 5000),
);

const userCache = new Map();

function getToken(req) {
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7) : null;
}

function signUser(user) {
  return jwt.sign(
    {
      sub: String(user._id),
      username: user.username,
      displayName: user.displayName || user.username,
      role: user.role,
      applicationId: user.applicationId ? String(user.applicationId) : null,
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '30m' },
  );
}

async function loadUser(id) {
  const key = String(id);
  const now = Date.now();
  const cached = userCache.get(key);

  if (cached && cached.expiresAt > now) {
    return cached.user;
  }

  const user = await User.findById(key)
    .select('_id username displayName role applicationId isActive')
    .lean();

  if (user) {
    userCache.set(key, {
      user,
      expiresAt: now + USER_CACHE_TTL_MS,
    });
    if (userCache.size > USER_CACHE_MAX) {
      const firstKey = userCache.keys().next().value;
      if (firstKey) userCache.delete(firstKey);
    }
  } else {
    userCache.delete(key);
  }

  return user;
}

function invalidateUserCache(id) {
  if (id) userCache.delete(String(id));
}

async function auth(req, res, next) {
  const token = getToken(req);
  if (!token) return res.status(401).json({ message: 'Unauthorized' });

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await loadUser(payload.sub);

    if (!user || !user.isActive) {
      return res.status(401).json({ message: 'الحساب غير موجود أو معطل' });
    }

    req.user = {
      id: String(user._id),
      username: user.username,
      displayName: user.displayName || user.username,
      role: user.role,
      applicationId: user.applicationId ? String(user.applicationId) : null,
    };
    req.authPayload = payload;
    next();
  } catch {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'ليس لديك صلاحية للوصول إلى هذه الصفحة' });
    }
    next();
  };
}

const ROLE_PERMISSIONS = {
  super_admin: new Set(['*']),
  app_owner: new Set([
    'dashboard.view',
    'themes.view', 'themes.edit',
    'ads.view', 'ads.create', 'ads.edit', 'ads.delete',
    'settings.view', 'settings.edit',
    'devices.view', 'devices.create', 'devices.edit', 'devices.delete',
    'mac_users.view', 'mac_users.create', 'mac_users.edit', 'mac_users.delete',
    'entities.view', 'entities.create', 'entities.edit', 'entities.delete',
    'dns.view', 'dns.create', 'dns.edit', 'dns.delete', 'dns.check',
    'notifications.view', 'notifications.create', 'notifications.edit', 'notifications.delete', 'notifications.send',
    'remote_updates.view', 'remote_updates.create', 'remote_updates.edit', 'remote_updates.delete', 'remote_updates.send',
  ]),
};

function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
    const permissions = ROLE_PERMISSIONS[req.user.role] || new Set();
    if (permissions.has('*') || permissions.has(permission)) return next();
    return res.status(403).json({ message: 'ليس لديك صلاحية لتنفيذ هذا الإجراء' });
  };
}

function getSelectedApplicationId(req) {
  if (req.user?.role !== 'super_admin') return req.user?.applicationId || null;
  return bodyOrHeaderApplicationId(req);
}

function bodyOrHeaderApplicationId(req, body = {}) {
  return body.applicationId || req.headers['x-application-id'] || null;
}

function scopeFilter(req, filter = {}) {
  const applicationId = getSelectedApplicationId(req);
  if (applicationId) return { ...filter, applicationId };
  if (req.user?.role === 'super_admin') return { ...filter };
  return { ...filter, applicationId: null };
}

function getWriteApplicationId(req, body = {}) {
  if (req.user?.role === 'super_admin') {
    const applicationId = bodyOrHeaderApplicationId(req, body);
    if (!applicationId) {
      const error = new Error('يجب تحديد التطبيق');
      error.status = 400;
      throw error;
    }
    return applicationId;
  }
  if (!req.user?.applicationId) {
    const error = new Error('الحساب غير مرتبط بتطبيق');
    error.status = 403;
    throw error;
  }
  return req.user.applicationId;
}

function publicUser(user) {
  return {
    id: String(user._id),
    username: user.username,
    displayName: user.displayName || user.username,
    role: user.role,
    applicationId: user.applicationId ? String(user.applicationId) : null,
    isActive: user.isActive !== false,
  };
}

module.exports = {
  auth,
  requireRole,
  requirePermission,
  scopeFilter,
  getWriteApplicationId,
  publicUser,
  signUser,
  getSelectedApplicationId,
  invalidateUserCache,
  ROLE_PERMISSIONS,
};
