// validate-env.js — INFRA-01: Kiểm tra env vars trước khi khởi động server
// Nguyên lý: Fail Fast — phát hiện cấu hình sai ngay khi boot, không để crash giữa chừng
// Chạy tự động qua package.json scripts: "prestart" và "predev"
//
// Phân loại:
//   REQUIRED  — thiếu → exit(1) ngay
//   INSECURE  — giá trị không an toàn trong production → exit(1) nếu isProd, warn nếu dev
//   OPTIONAL  — thiếu → warning (không block)
//
// Cách chạy độc lập: node validate-env.js

'use strict';

require('dotenv').config();

const chalk = {
  red:    (s) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  green:  (s) => `\x1b[32m${s}\x1b[0m`,
  cyan:   (s) => `\x1b[36m${s}\x1b[0m`,
  bold:   (s) => `\x1b[1m${s}\x1b[0m`,
};

const isProd = process.env.NODE_ENV === 'production';
const env    = process.env;

const errors   = [];
const warnings = [];

// ─────────────────────────────────────────────────────────────────────────────
// REQUIRED VARS — thiếu bất kỳ cái nào → không boot
// ─────────────────────────────────────────────────────────────────────────────
const REQUIRED = [
  { key: 'SESSION_SECRET', desc: 'Khóa bí mật cho session (≥ 32 ký tự ngẫu nhiên)' },
  { key: 'DB_HOST',        desc: 'Địa chỉ host MySQL / MariaDB' },
  { key: 'DB_NAME',        desc: 'Tên database MySQL' },
  { key: 'DB_USER',        desc: 'Username kết nối database' },
  { key: 'DB_PASSWORD',    desc: 'Mật khẩu kết nối database' },
  { key: 'REDIS_HOST',     desc: 'Host của Redis (thường là localhost hoặc redis)' },
  { key: 'REDIS_PORT',     desc: 'Port của Redis (mặc định 6379)' },
];

for (const { key, desc } of REQUIRED) {
  const val = env[key];
  if (!val || val.trim() === '') {
    errors.push(`${chalk.bold(key)} — ${desc} (hiện tại: ${chalk.red('không có')})`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SESSION_SECRET — kiểm tra độ mạnh
// ─────────────────────────────────────────────────────────────────────────────
const INSECURE_SECRETS = new Set([
  'qlvpp-change-this-in-production-min-32-chars',
  'qlvpp-dev-only-secret-32chars-abc',
  'change_this_in_production_please',
  'change-me', 'secret', 'password', 'changeme',
  'your-secret-here', 'mysecret', 'my-secret-key',
  // Variants from .env templates that must be replaced before deploy
  'change_me_replace_with_64_random_hex_chars_generated_above',
  'change_me_min_32_chars_for_security_123456',
]);

const sessionSecret = env.SESSION_SECRET || '';
if (sessionSecret && sessionSecret.trim() !== '') {
  if (sessionSecret.length < 32) {
    const msg = `SESSION_SECRET quá ngắn (${sessionSecret.length} ký tự, yêu cầu ≥ 32)`;
    isProd ? errors.push(msg) : warnings.push(msg);
  } else if (INSECURE_SECRETS.has(sessionSecret) || sessionSecret.toLowerCase().startsWith('change_me') || sessionSecret.toLowerCase().startsWith('change-me')) {
    const msg = `SESSION_SECRET đang dùng giá trị mặc định không an toàn`;
    isProd ? errors.push(msg) : warnings.push(msg);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DB_PORT — phải là số hợp lệ nếu được chỉ định
// ─────────────────────────────────────────────────────────────────────────────
if (env.DB_PORT) {
  const port = parseInt(env.DB_PORT, 10);
  if (isNaN(port) || port < 1 || port > 65535) {
    errors.push(`DB_PORT không hợp lệ: "${env.DB_PORT}" (phải là số 1–65535)`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PORT — phải là số hợp lệ nếu được chỉ định
// ─────────────────────────────────────────────────────────────────────────────
if (env.PORT) {
  const port = parseInt(env.PORT, 10);
  if (isNaN(port) || port < 1 || port > 65535) {
    errors.push(`PORT không hợp lệ: "${env.PORT}" (phải là số 1–65535)`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// NODE_ENV — cảnh báo nếu không rõ ràng
// ─────────────────────────────────────────────────────────────────────────────
if (!env.NODE_ENV) {
  warnings.push('NODE_ENV chưa được đặt — server sẽ chạy ở chế độ development mặc định');
} else if (!['development', 'production', 'test'].includes(env.NODE_ENV)) {
  warnings.push(`NODE_ENV="${env.NODE_ENV}" không phải giá trị chuẩn (development | production | test)`);
}

// ─────────────────────────────────────────────────────────────────────────────
// EMAIL — kiểm tra nếu EMAIL_MODE=smtp
// ─────────────────────────────────────────────────────────────────────────────
if (env.EMAIL_MODE === 'smtp') {
  const smtpRequired = ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM'];
  for (const key of smtpRequired) {
    if (!env[key] || env[key].trim() === '') {
      warnings.push(`${key} — bắt buộc khi EMAIL_MODE=smtp (hiện tại: không có)`);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CORS_ORIGIN — cảnh báo nếu dùng wildcard trong production
// ─────────────────────────────────────────────────────────────────────────────
if (isProd && env.CORS_ORIGIN === '*') {
  warnings.push('CORS_ORIGIN="*" trong production — cho phép tất cả origins, nên giới hạn domain cụ thể');
}

// ─────────────────────────────────────────────────────────────────────────────
// OPTIONAL vars — chỉ thông báo info
// ─────────────────────────────────────────────────────────────────────────────
const optionalInfo = [];
if (!env.CORS_ORIGIN)    optionalInfo.push('CORS_ORIGIN (default: http://localhost)');
if (!env.FRONTEND_URL)   optionalInfo.push('FRONTEND_URL (default: http://localhost)');
if (!env.EMAIL_MODE)     optionalInfo.push('EMAIL_MODE (default: dev — email không gửi thật)');

// ─────────────────────────────────────────────────────────────────────────────
// OUTPUT
// ─────────────────────────────────────────────────────────────────────────────
console.log(`\n${chalk.cyan('━'.repeat(60))}`);
console.log(`${chalk.bold('🔍 QLVPP — Kiểm tra cấu hình môi trường')}`);
console.log(`${chalk.cyan('━'.repeat(60))}`);
console.log(`  Môi trường: ${chalk.bold(env.NODE_ENV || 'development')}`);
console.log(`  Backend:    ${env.DB_HOST || '?'}:${env.DB_PORT || 3306}/${env.DB_NAME || '?'}`);
console.log(`  Port:       ${env.PORT || 8080}`);
console.log(`${chalk.cyan('━'.repeat(60))}\n`);

if (warnings.length > 0) {
  console.log(chalk.yellow(`⚠  ${warnings.length} cảnh báo:`));
  warnings.forEach(w => console.log(chalk.yellow(`   • ${w}`)));
  console.log('');
}

if (optionalInfo.length > 0 && !isProd) {
  console.log(`ℹ  Biến không bắt buộc (dùng giá trị mặc định):`);
  optionalInfo.forEach(i => console.log(`   • ${i}`));
  console.log('');
}

if (errors.length > 0) {
  console.log(chalk.red(chalk.bold(`❌ ${errors.length} lỗi cấu hình nghiêm trọng — Server KHÔNG thể khởi động:\n`)));
  errors.forEach((e, i) => console.log(chalk.red(`   ${i + 1}. ${e}`)));
  console.log('');
  console.log(chalk.red('   📋 Tạo file backend/.env từ backend/.env.example:'));
  console.log(chalk.red('      cp backend/.env.example backend/.env'));
  console.log(chalk.red('      # Sau đó chỉnh sửa giá trị phù hợp\n'));
  process.exit(1);
}

console.log(chalk.green(`✅ Cấu hình hợp lệ — Đang khởi động server...\n`));
// Script thoát bình thường (exit 0) → server.js sẽ được chạy tiếp