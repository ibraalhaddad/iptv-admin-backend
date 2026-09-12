/**
 * Lightweight in-process rate limiter.
 * Suitable for a single Node instance. For multi-instance deployments,
 * replace the store with Redis so limits are shared across instances.
 */
function createRateLimiter({
  windowMs = 60_000,
  max = 60,
  keyGenerator = (req) => req.ip || req.socket?.remoteAddress || 'unknown',
  message = 'طلبات كثيرة جدًا، حاول مرة أخرى لاحقًا',
} = {}) {
  const buckets = new Map();
  let lastSweep = Date.now();

  return (req, res, next) => {
    const now = Date.now();

    if (now - lastSweep > Math.min(windowMs, 60_000)) {
      lastSweep = now;
      for (const [key, item] of buckets) {
        if (item.resetAt <= now) buckets.delete(key);
      }
      // Hard cap to prevent the limiter itself from becoming unbounded.
      if (buckets.size > 10_000) {
        for (const [key, item] of buckets) {
          if (item.resetAt <= now || buckets.size > 8_000) {
            buckets.delete(key);
          }
        }
      }
    }

    const key = String(keyGenerator(req));
    let item = buckets.get(key);

    if (!item || item.resetAt <= now) {
      item = { count: 0, resetAt: now + windowMs };
      buckets.set(key, item);
    }

    item.count += 1;

    const remaining = Math.max(0, max - item.count);
    const retryAfter = Math.ceil((item.resetAt - now) / 1000);

    res.setHeader('RateLimit-Limit', String(max));
    res.setHeader('RateLimit-Remaining', String(remaining));
    res.setHeader('RateLimit-Reset', String(retryAfter));

    if (item.count > max) {
      res.setHeader('Retry-After', String(retryAfter));
      return res.status(429).json({ message });
    }

    next();
  };
}

module.exports = { createRateLimiter };
