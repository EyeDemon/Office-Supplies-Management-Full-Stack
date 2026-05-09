'use strict';
/**
 * swagger.js — Configuration for Swagger/OpenAPI documentation.
 */
const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'QLVPP API Documentation',
      version: '4.1.0',
      description: 'API documentation for the Office Supply Management System (QLVPP)',
      contact: {
        name: 'Technical Support',
      },
    },
    servers: [
      {
        url: process.env.API_URL || 'http://localhost:3000',
        description: 'Primary API Server',
      },
    ],
    components: {
      securitySchemes: {
        cookieAuth: {
          type: 'apiKey',
          in: 'cookie',
          name: 'qlvpp.sid',
        },
        csrfToken: {
          type: 'apiKey',
          in: 'header',
          name: 'x-csrf-token',
        }
      },
    },
    security: [
      { cookieAuth: [] },
      { csrfToken: [] }
    ]
  },
  apis: [
    './server.js',
    './src/controllers/*.js',
    './src/shared/dto/*.js'
  ],
};

const specs = swaggerJsdoc(options);

module.exports = {
  serve: swaggerUi.serve,
  setup: swaggerUi.setup(specs, {
    swaggerOptions: {
      withCredentials: true,
    },
    customSiteTitle: 'QLVPP API Docs',
  }),
};
