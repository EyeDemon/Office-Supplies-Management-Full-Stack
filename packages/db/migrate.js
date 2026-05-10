'use strict';

const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
const env = require('../../apps/api/src/shared/config/env');

async function migrate() {
  console.log('[Migration] Starting database migration runner...');

  const connection = await mysql.createConnection({
    host: env.DB.HOST,
    user: env.DB.USER,
    password: env.DB.PASS,
    database: env.DB.NAME,
    multipleStatements: true
  });

  try {
    // 1. Đảm bảo bảng tracking tồn tại
    await connection.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version VARCHAR(50) NOT NULL PRIMARY KEY,
        applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 2. Lấy danh sách file migrations
    const migrationsDir = path.join(__dirname, 'migrations');
    if (!fs.existsSync(migrationsDir)) {
      console.log('[Migration] No migrations directory found. Skipping.');
      return;
    }

    const files = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort(); // Đảm bảo chạy đúng thứ tự v4.1.0 -> v4.2.0

    // 3. Lấy danh sách đã chạy
    const [rows] = await connection.query('SELECT version FROM schema_migrations');
    const appliedVersions = new Set(rows.map(r => r.version));

    // 4. Thực thi các file chưa chạy
    for (const file of files) {
      if (appliedVersions.has(file)) {
        console.log(`[Migration] Skipping ${file} (Already applied)`);
        continue;
      }

      console.log(`[Migration] Applying ${file}...`);
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');

      // Chạy trong Transaction
      await connection.beginTransaction();
      try {
        await connection.query(sql);
        await connection.query('INSERT INTO schema_migrations (version) VALUES (?)', [file]);
        await connection.commit();
        console.log(`[Migration] Successfully applied ${file}`);
      } catch (err) {
        await connection.rollback();
        console.error(`[Migration] Error applying ${file}. Transaction rolled back.`);
        throw err;
      }
    }

    console.log('[Migration] All migrations completed successfully.');
  } catch (error) {
    console.error('[Migration] Failed:', error.message);
    process.exit(1);
  } finally {
    await connection.end();
  }
}

if (require.main === module) {
  migrate();
}

module.exports = migrate;
