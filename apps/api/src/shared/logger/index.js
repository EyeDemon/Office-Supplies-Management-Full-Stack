'use strict';
const pino = require('pino');

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: process.env.NODE_ENV !== 'production' ? {
    target: 'pino-pretty',
    options: {
      colorize: true,
      ignore: 'pid,hostname',
      translateTime: 'SYS:standard'
    }
  } : undefined,
  base: {
    env: process.env.NODE_ENV,
    service: 'qlvpp-api'
  },
  timestamp: pino.stdTimeFunctions.isoTime
});

const pinoHttp = require('pino-http')({
  logger,
  genReqId: (req) => req.headers['x-request-id'] || require('crypto').randomUUID(),
  customLogLevel: (res, err) => {
    if (res.statusCode >= 500 || err) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  serializers: {
    req: (req) => ({
      id: req.id,
      method: req.method,
      url: req.url,
      ip: req.remoteAddress
    }),
  }
});

module.exports = logger;
module.exports.pinoHttp = pinoHttp;
