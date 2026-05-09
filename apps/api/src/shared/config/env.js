'use strict';
/**
 * env.js
 * Centralized environment configuration.
 */

module.exports = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT, 10) || 8080,

  DB: {
    HOST: process.env.DB_HOST || 'localhost',
    PORT: parseInt(process.env.DB_PORT, 10) || 3306,
    NAME: process.env.DB_NAME || 'qlvpp',
    USER: process.env.DB_USER || 'root',
    PASS: process.env.DB_PASSWORD || '0918102005PHIVAN',
  },

  REDIS: {
    HOST: process.env.REDIS_HOST || 'localhost',
    PORT: parseInt(process.env.REDIS_PORT, 10) || 6379,
    PASS: process.env.REDIS_PASSWORD || '',
  },

  SESSION_SECRET: process.env.SESSION_SECRET,
  CORS_ORIGIN: process.env.CORS_ORIGIN || 'http://localhost:5173',

  // Business Rules
  ADJUSTMENT_THRESHOLD: parseInt(process.env.ADJUSTMENT_THRESHOLD, 10) || 100,
};
