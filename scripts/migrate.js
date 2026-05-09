#!/usr/bin/env node
/**
 * scripts/migrate.js — Simple Database Migration Runner
 * Tracks applied migrations in schema_migrations table (đã có trong schema.sql).
 *
 * Usage:
 *   node scripts/migrate.js            # Chạy tất cả pending migrations
 *   node scripts/migrate.js --status   # Xem trạng thái migrations
 *
 * Convention: Migration files đặt tên theo pattern v{semver}_{description}.sql
 *             trong thư mục packages/db/migrations/
 */
'use strict';

require('dotenv').config();
const fs   = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

const MIGRATIONS_DIR = path.join(__dirname, '../packages/db/migrations');
const STATUS_MODE    = process.argv.includes('--status');

async function getConnection() {
  return mysql.createConnection({
    host    : process.env.DB_HOST     || '127.0.0.1',
    port    : Number(process.env.DB_PORT || 3306),
    user    : process.env.DB_USER     || 'root',
    password: process.env.DB_PASSWORD || process.env.MYSQL_ROOT_PASSWORD || '',
    database: process.env.DB_NAME     || 'qlvpp',
    multipleStatements: true,          // cần để chạy file SQL nhiều statements
  });
}

async function getAppliedVersions(conn) {
  const [rows] = await conn.query(
    'SELECT version FROM schema_migrations ORDER BY applied_at ASC'
  );
  return new Set(rows.map(r => r.version));
}

async function getMigrationFiles() {
  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort(); // sắp xếp theo tên file (semver pattern đảm bảo đúng thứ tự)
  return files;
}

async function main() {
  let conn;
  try {
    conn = await getConnection();
    console.log('✅ Connected to MySQL');

    const applied  = await getAppliedVersions(conn);
    const files    = await getMigrationFiles();

    if (STATUS_MODE) {
      console.log('\n📋 Migration Status:');
      console.log('─'.repeat(60));
      if (files.length === 0) {
        console.log('  (no migration files found)');
      }
      for (const file of files) {
        // Extract version from filename: v4.1.0_add_reserved_qty.sql → v4.1.0
        const version = file.match(/^(v[\d.]+)/)?.[1] || file;
        const status  = applied.has(version) ? '✅ applied' : '⏳ pending';
        console.log(`  ${status}  ${file}`);
      }
      console.log('─'.repeat(60));
      return;
    }

    const pending = files.filter(file => {
      const version = file.match(/^(v[\d.]+)/)?.[1] || file;
      return !applied.has(version);
    });

    if (pending.length === 0) {
      console.log('✅ All migrations are up to date. Nothing to run.');
      return;
    }

    console.log(`\n🚀 Running ${pending.length} pending migration(s)...`);

    for (const file of pending) {
      const version = file.match(/^(v[\d.]+)/)?.[1] || file;
      const filePath = path.join(MIGRATIONS_DIR, file);
      const sql = fs.readFileSync(filePath, 'utf8');

      console.log(`\n  ⚙  Applying: ${file}`);
      try {
        await conn.beginTransaction();
        await conn.query(sql);
        await conn.query(
          'INSERT INTO schema_migrations (version) VALUES (?)',
          [version]
        );
        await conn.commit();
        console.log(`  ✅ Applied: ${version}`);
      } catch (err) {
        await conn.rollback();
        console.error(`  ❌ Failed: ${version}`);
        console.error(`     ${err.message}`);
        process.exit(1);
      }
    }

    console.log('\n✅ All migrations applied successfully.');
  } finally {
    if (conn) await conn.end();
  }
}

main().catch(err => {
  console.error('❌ Migration runner error:', err.message);
  process.exit(1);
});