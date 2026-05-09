#!/usr/bin/env node
// launch.js — QLVPP Project Launcher
// Khởi động backend dev server từ thư mục root (BE-02 Fix)
// Usage:
//   node launch.js         → chạy backend (npm run dev)
//   node launch.js --help  → xem hướng dẫn

const { spawn } = require('child_process');
const path = require('path');
const fs   = require('fs');

const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  console.log(`
QLVPP Launcher
══════════════
Usage:
  node launch.js           Khởi động backend (nodemon)
  node launch.js --prod    Khởi động backend (production)
  node launch.js --help    Xem hướng dẫn này

Để chạy đầy đủ (backend + frontend + DB):
  docker-compose up --build
  `);
  process.exit(0);
}

const isProd = args.includes('--prod');
const backendDir = path.join(__dirname, 'apps/api');

if (!fs.existsSync(path.join(backendDir, 'package.json'))) {
  console.error('❌ Không tìm thấy backend/package.json');
  console.error('   Hãy chắc chắn bạn đang chạy từ thư mục gốc dự án.');
  process.exit(1);
}

// Kiểm tra .env
const envPath = path.join(backendDir, '.env');
if (!fs.existsSync(envPath)) {
  const envExample = path.join(backendDir, '.env.example');
  if (fs.existsSync(envExample)) {
    console.warn('⚠️  apps/api/.env chưa tồn tại — copy từ .env.example');
    fs.copyFileSync(envExample, envPath);
    console.log('   ✅ Đã tạo apps/api/.env từ .env.example');
    console.log('   ⚠️  Hãy cập nhật DB_PASSWORD và SESSION_SECRET trước khi chạy production!\n');
  } else {
    console.warn('⚠️  apps/api/.env không tìm thấy — backend có thể lỗi DB kết nối\n');
  }
}

const script = isProd ? 'start' : 'dev';
console.log(`🚀 Khởi động QLVPP backend (${isProd ? 'production' : 'development'})...`);
console.log(`   Thư mục: ${backendDir}`);
console.log(`   Lệnh: npm run ${script}\n`);

const proc = spawn('npm', ['run', script], {
  cwd:   backendDir,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

proc.on('error', err => {
  console.error('❌ Lỗi khởi động:', err.message);
  if (err.code === 'ENOENT') {
    console.error('   npm không tìm thấy — hãy cài Node.js: https://nodejs.org');
  }
  process.exit(1);
});

proc.on('exit', code => {
  if (code !== 0) {
    console.error(`\n❌ Backend dừng với code ${code}`);
    process.exit(code);
  }
});

process.on('SIGINT', () => {
  console.log('\n👋 Đang dừng QLVPP...');
  proc.kill('SIGINT');
});