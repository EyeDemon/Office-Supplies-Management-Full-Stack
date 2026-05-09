// src/jobs/dailySnapshot.js — v1.0.0 [GAP-02]
// Cron job: chạy mỗi ngày lúc 23:59 — snapshot toàn bộ warehouse_stock vào stock_snapshot_daily
// Mục đích: tăng tốc báo cáo lịch sử, tránh tính lại từ stock_transactions (brute-force scan)
// Spec III.4: "Cron job RunDailySnapshot chạy mỗi 23:59"
'use strict';

const db = require('../shared/config/db');
const snapshotRepo = require('../infrastructure/repositories/SnapshotRepository');
const { runInventoryIntelligence } = require('./inventoryIntelligence');

/**
 * Tính thời gian ms đến 23:59:00 ngày hôm nay (hoặc ngày mai nếu đã qua).
 * Dùng để lên lịch setTimeout chính xác theo giờ server.
 */
function msUntilNextSnapshot() {
  const now  = new Date();
  const next = new Date(now);
  next.setHours(23, 59, 0, 0);
  if (next <= now) {
    // Đã qua 23:59 hôm nay → schedule cho ngày mai
    next.setDate(next.getDate() + 1);
  }
  return next.getTime() - now.getTime();
}

/**
 * Thực thi snapshot: INSERT ... ON DUPLICATE KEY UPDATE
 * Ghi toàn bộ warehouse_stock hiện tại vào stock_snapshot_daily cho ngày hôm nay.
 *
 * Idempotent: nếu chạy 2 lần cùng ngày → ON DUPLICATE KEY UPDATE giữ giá trị mới nhất.
 *
 * @returns {Promise<{inserted: number, skipped: number, snapshotDate: string}>}
 */
async function runDailySnapshot() {
  const snapshotDate = new Date().toISOString().slice(0, 10); // 'YYYY-MM-DD'
  const startMs      = Date.now();

  console.log(`[DailySnapshot] Bắt đầu snapshot ngày ${snapshotDate}...`);

  try {
    const result = await snapshotRepo.upsertDailySnapshot(snapshotDate);
    const affected = result.affectedRows;
    const elapsed = result.elapsedMs;

    console.log(
      `[DailySnapshot] ✅ Hoàn tất ${snapshotDate}: ${affected} dòng (${elapsed}ms)`
    );

    // Chạy phân tích AI ngay sau khi snapshot thành công
    runInventoryIntelligence().catch(e => console.error('[AI Intelligence] Lỗi khi chạy sau snapshot:', e.message));

    return { snapshotDate, affected, elapsed };
  } catch (err) {
    console.error(`[DailySnapshot] ❌ Lỗi snapshot ${snapshotDate}:`, err.message);
    throw err;
  }
}

/**
 * Đăng ký cron job tự chạy hàng ngày lúc 23:59.
 * Dùng setInterval 24h + setTimeout để sync với đồng hồ thực.
 *
 * Gọi một lần trong server.js sau khi DB đã kết nối.
 */
function scheduleDailySnapshot() {
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  const delayMs    = msUntilNextSnapshot();
  const nextRun    = new Date(Date.now() + delayMs);

  console.log(
    `[DailySnapshot] Đã lên lịch: lần đầu chạy lúc ${nextRun.toLocaleString('vi-VN')} ` +
    `(còn ${Math.round(delayMs / 60000)} phút)`
  );

  // Chạy thử AI Intelligence ngay khi khởi động server (Dev mode)
  setTimeout(() => runInventoryIntelligence().catch(() => {}), 5000);

  // setTimeout đến 23:59 hôm nay (hoặc ngày mai nếu đã qua)
  setTimeout(() => {
    // Chạy ngay lần đầu
    runDailySnapshot().catch(e => console.error('[DailySnapshot] Lỗi lần đầu:', e.message));

    // Sau đó lặp mỗi 24h
    setInterval(() => {
      runDailySnapshot().catch(e => console.error('[DailySnapshot] Lỗi định kỳ:', e.message));
    }, MS_PER_DAY);
  }, delayMs);
}

module.exports = { scheduleDailySnapshot, runDailySnapshot };
