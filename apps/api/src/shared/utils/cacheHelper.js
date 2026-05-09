'use strict';
const { getClient } = require('../infrastructure/RedisClient');

const DEFAULT_TTL = 300; // 5 minutes

/**
 * Get or set cache.
 * @param {string} key
 * @param {Function} fetchFn - Function to fetch data if cache miss
 * @param {number} [ttl=300] - Time to live in seconds
 */
async function getOrSet(key, fetchFn, ttl = DEFAULT_TTL) {
  const redis = getClient();
  
  try {
    const cached = await redis.get(key);
    if (cached) {
      return JSON.parse(cached);
    }
  } catch (err) {
    console.error(`Cache error (GET ${key}):`, err.message);
  }

  const data = await fetchFn();
  
  try {
    await redis.set(key, JSON.stringify(data), 'EX', ttl);
  } catch (err) {
    console.error(`Cache error (SET ${key}):`, err.message);
  }

  return data;
}

async function invalidate(key) {
  const redis = getClient();
  try {
    await redis.del(key);
  } catch (err) {
    console.error(`Cache error (DEL ${key}):`, err.message);
  }
}

module.exports = { getOrSet, invalidate };
