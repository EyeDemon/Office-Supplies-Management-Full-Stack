// src/config/db.js — MySQL connection pool (mysql2/promise) v40
'use strict';

const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306'),
  database: process.env.DB_NAME || 'qlvpp',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  connectionLimit: parseInt(process.env.DB_POOL_LIMIT || '10'),
  queueLimit: 0,
  waitForConnections: true,
  connectTimeout: 10000,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
  charset: 'utf8mb4',
  dateStrings: false,
  multipleStatements: false,
});

console.log(`[DB Config] Host: ${process.env.DB_HOST || 'localhost'}, User: ${process.env.DB_USER || 'root'}, DB: ${process.env.DB_NAME || 'qlvpp'}, PWD_LEN: ${(process.env.DB_PASSWORD || '').length}`);

pool.on('connection', (conn) => {
  const dbCfg = `${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || '3306'}/${process.env.DB_NAME || 'qlvpp'}`;
  console.log(`[DB] New connection id=${conn.threadId} → ${dbCfg}`);
});

pool.on('error', (err) => {
  console.error('[DB Pool Error]', err.code, err.message);
});

async function isHealthy() {
  try {
    const conn = await pool.getConnection();
    await conn.ping();
    conn.release();
    return true;
  } catch { return false; }
}

async function end() {
  await pool.end();
}

async function beginTransactionWithTimeout(conn, seconds = 10) {
  await conn.query(`SET innodb_lock_wait_timeout = ?`, [seconds]);
  await conn.beginTransaction();
}

module.exports = {
  pool,
  query: pool.query.bind(pool),
  getConnection: pool.getConnection.bind(pool),
  execute: pool.execute.bind(pool),
  beginTransactionWithTimeout,
  isHealthy,
  end,
};

