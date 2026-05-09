'use strict';
/**
 * rate-limiter.js — Redis-based Rate Limiter (Spec X.3)
 * Sử dụng Sliding Window pattern với Redis Sorted Sets.
 */
const Redis = require('ioredis');

const redisConfig = require('../config/redis');

const redis = new Redis({
  ...redisConfig,
  retryStrategy: (times) => Math.min(times * 50, 2000),
});

redis.on('error', (err) => console.error('[Redis-Limiter] Error:', err.message));

const WINDOW_MS = 15 * 60 * 1000; // 15 phút

class RedisBucketStore {
  constructor({ prefix, max, windowMs, lockMs = 0 }) {
    this.prefix   = `rl:${prefix}:`;
    this.max      = max;
    this.windowMs = windowMs;
    this.lockMs   = lockMs || windowMs;
  }

  async _check(k) {
    const key = this.prefix + k;
    const now = Date.now();
    const min = now - this.windowMs;

    const pipeline = redis.pipeline();
    pipeline.zremrangebyscore(key, 0, min);
    pipeline.zcard(key);
    const results = await pipeline.exec();
    
    const count = results[1][1];
    return { count, key, now };
  }

  async isLimited(k) {
    const { count } = await this._check(k);
    return count >= this.max;
  }

  async checkAndRecord(k) {
    const key = this.prefix + k;
    const now = Date.now();
    const min = now - this.windowMs;

    const pipeline = redis.pipeline();
    pipeline.zremrangebyscore(key, 0, min);
    pipeline.zadd(key, now, now);
    pipeline.zcard(key);
    pipeline.pexpire(key, this.windowMs);
    const results = await pipeline.exec();

    const count = results[2][1];
    return count > this.max; 
  }

  async record(k) {
    const now = Date.now();
    const key = this.prefix + k;
    await redis.pipeline()
      .zadd(key, now, now)
      .pexpire(key, this.windowMs)
      .exec();
  }

  async reset(k) {
    await redis.del(this.prefix + k);
  }

  async retryAfterSecs(k) {
    const key = this.prefix + k;
    const [first] = await redis.zrange(key, 0, 0, 'WITHSCORES');
    if (!first) return 0;
    const timestamp = parseInt(first);
    return Math.max(0, Math.ceil((timestamp + this.windowMs - Date.now()) / 1000));
  }

  // Account lockout logic (using a separate simple key)
  async isLocked(k) {
    const lockKey = `${this.prefix}lock:${k}`;
    const until = await redis.get(lockKey);
    return until && parseInt(until) > Date.now();
  }

  async recordLock(k) {
    if (!this.lockMs) return;
    const countKey = `${this.prefix}lcount:${k}`;
    const lockKey  = `${this.prefix}lock:${k}`;
    
    const count = await redis.incr(countKey);
    await redis.pexpire(countKey, this.windowMs);
    
    if (count >= this.max) {
      await redis.set(lockKey, Date.now() + this.lockMs, 'PX', this.lockMs);
    }
  }

  async resetLock(k) {
    await redis.del(`${this.prefix}lcount:${k}`, `${this.prefix}lock:${k}`);
  }

  async lockRemainingMs(k) {
    const until = await redis.get(`${this.prefix}lock:${k}`);
    return until ? Math.max(0, parseInt(until) - Date.now()) : 0;
  }
}

// Limiter instances
const loginLimiter    = new RedisBucketStore({ prefix: 'login', max: 5,  windowMs: WINDOW_MS, lockMs: WINDOW_MS });
const lockLimiter     = new RedisBucketStore({ prefix: 'acct',  max: 10, windowMs: WINDOW_MS, lockMs: WINDOW_MS });
const registerLimiter = new RedisBucketStore({ prefix: 'reg',   max: 10, windowMs: 60 * 60 * 1000 });
const forgotLimiter   = new RedisBucketStore({ prefix: 'forgot',max: 5,  windowMs: 60 * 60 * 1000 });
const resetLimiter    = new RedisBucketStore({ prefix: 'reset', max: 10, windowMs: WINDOW_MS });

// Middleware
const { getClientIp } = require('./authenticate');

const loginRateLimit = async (req, res, next) => {
  const { username } = req.body || {};
  const ip = getClientIp(req);
  const key = `${ip}:${username || 'anon'}`;
  
  try {
    if (redis.status !== 'ready') return next();

    if (await lockLimiter.isLocked(username)) {
      const ms = await lockLimiter.lockRemainingMs(username);
      return res.status(423).json({ success: false, message: `Tài khoản tạm khóa. Thử lại sau ${Math.ceil(ms/60000) + 1} phút.` });
    }
    if (await loginLimiter.isLimited(key)) {
      const secs = await loginLimiter.retryAfterSecs(key);
      res.setHeader('Retry-After', secs);
      return res.status(429).json({ success: false, message: `Quá nhiều lần thử. Thử lại sau ${Math.ceil(secs/60)} phút.` });
    }
    next();
  } catch (e) {
    console.error('[LoginRateLimit-FailSafe] Redis error:', e.message);
    next();
  }
};

const registerRateLimit = async (req, res, next) => {
  const ip = getClientIp(req);
  try {
    if (redis.status !== 'ready') return next();
    if (await registerLimiter.checkAndRecord(ip)) {
      const secs = await registerLimiter.retryAfterSecs(ip);
      return res.status(429).json({ success: false, message: `Thử lại sau ${Math.ceil(secs/60)} phút.` });
    }
    next();
  } catch (e) {
    console.error('[RegisterRateLimit-FailSafe] Redis error:', e.message);
    next();
  }
};

const forgotPasswordRateLimit = async (req, res, next) => {
  const ip = getClientIp(req);
  try {
    if (redis.status !== 'ready') return next();
    if (await forgotLimiter.checkAndRecord(ip)) {
      const secs = await forgotLimiter.retryAfterSecs(ip);
      return res.status(429).json({ success: false, message: `Thử lại sau ${Math.ceil(secs/60)} phút.` });
    }
    next();
  } catch (e) {
    console.error('[ForgotRateLimit-FailSafe] Redis error:', e.message);
    next();
  }
};

const resetPasswordRateLimit = async (req, res, next) => {
  const ip = getClientIp(req);
  try {
    if (redis.status !== 'ready') return next();
    if (await resetLimiter.checkAndRecord(ip)) {
      const secs = await resetLimiter.retryAfterSecs(ip);
      return res.status(429).json({ success: false, message: `Thử lại sau ${Math.ceil(secs/60)} phút.` });
    }
    next();
  } catch (e) {
    console.error('[ResetRateLimit-FailSafe] Redis error:', e.message);
    next();
  }
};

const globalLimiter = new RedisBucketStore({ prefix: 'global', max: 100, windowMs: 60 * 1000 });

const globalRateLimit = async (req, res, next) => {
  if (process.env.NODE_ENV === 'test') return next();
  const ip = getClientIp(req);
  // [GAP-09] Rate limiting by User if logged in, else by IP
  const userId = req.session?.userId;
  const key = userId ? `u:${userId}` : `ip:${ip}`;

  try {
    // [REDIS-FAILSAFE] Nếu Redis mất kết nối, bỏ qua rate limit thay vì trả về 500
    if (redis.status !== 'ready') {
      return next();
    }

    if (await globalLimiter.checkAndRecord(key)) {
      return res.status(429).json({ success: false, message: 'Hệ thống đang bận (Rate Limit). Vui lòng thử lại sau.' });
    }
    next();
  } catch (e) {
    console.error('[RateLimit-FailSafe] Redis error, skipping check:', e.message);
    next(); 
  }
};

module.exports = {
  globalRateLimit,
  loginRateLimit, registerRateLimit, forgotPasswordRateLimit, resetPasswordRateLimit,
  // Raw helpers for auth logic
  recordFailure: (ip, u) => loginLimiter.record(`${ip}:${u}`),
  resetOnSuccess: (ip, u) => loginLimiter.reset(`${ip}:${u}`),
  recordLockFailure: (u) => lockLimiter.recordLock(u),
  resetLockout: (u) => lockLimiter.resetLock(u),
  quit: () => redis.quit(),
};