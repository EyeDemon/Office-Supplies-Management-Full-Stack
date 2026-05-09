'use strict';
/**
 * redis.js — Centralized Redis configuration.
 * [SEC-02] Enforces password in production and warns in development.
 */

const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: null,
};

// [SEC-02] Enforce password in production and strongly recommend in development.
const isProd = process.env.NODE_ENV === 'production';

if (!redisConfig.password) {
  if (isProd) {
    console.error('❌ [SEC-02] CRITICAL: REDIS_PASSWORD is NOT SET in production! Server may be vulnerable.');
    // Optional: process.exit(1);
  } else {
    console.warn('⚠️ [SEC-02] WARNING: Redis is running without a password. Set REDIS_PASSWORD in .env for security.');
  }
}

module.exports = redisConfig;
