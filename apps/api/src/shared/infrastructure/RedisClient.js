'use strict';
const Redis = require('ioredis');
const config = require('../config/redis');

let client = null;

function getClient() {
  if (!client) {
    client = new Redis(config);

    client.on('error', (err) => {
      console.error('Redis Client Error:', err);
    });

    client.on('connect', () => {
      console.log('✅ Connected to Redis');
    });
  }
  return client;
}

module.exports = { getClient };
