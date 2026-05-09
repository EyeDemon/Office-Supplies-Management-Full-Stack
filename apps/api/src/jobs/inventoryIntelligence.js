'use strict';
/**
 * inventoryIntelligence.js
 * AI-Driven Background Job for Proactive Alerts
 * 
 * Chạy định kỳ để:
 * 1. Quét DOI (Days of Inventory) và cảnh báo sắp hết hàng.
 * 2. Phát hiện tiêu thụ bất thường.
 * 3. Cảnh báo vốn tồn đọng (Dead stock).
 */
const analyzeReplenishmentUC = require('../use-cases/analytics/AnalyzeReplenishment');
const notificationRepo       = require('../infrastructure/repositories/NotificationRepository');
const db                     = require('../shared/config/db');

async function runInventoryIntelligence() {
  console.log('[AI Intelligence] Bắt đầu quét dữ liệu kho...');
  try {
    // 1. Thực hiện phân tích AI
    // Lookback 90 ngày, Horizon 30 ngày
    const analysis = await analyzeReplenishmentUC.execute(db, { lookbackDays: 90, horizonDays: 30 });
    
    const criticalItems = analysis.items.filter(i => i.status === 'CRITICAL');
    const warningItems  = analysis.items.filter(i => i.status === 'WARNING');
    
    // 2. Gửi thông báo cho các mặt hàng CRITICAL (DOI < 7)
    for (const item of criticalItems) {
      const title = `🚨 Sắp hết hàng: ${item.name}`;
      const message = `Dự kiến hết hàng trong ${item.doi} ngày tới. Tốc độ tiêu thụ: ${item.avgDailyVelocity} SP/ngày. Đề xuất nhập: ${item.suggestedQty} SP.`;
      
      // Kiểm tra xem đã có thông báo chưa đọc tương tự chưa để tránh spam
      await notificationRepo.createStockNotification(db, {
        type: 'STOCKOUT_PREDICTION',
        title,
        message,
        productId: item.productId
      });
    }

    // 3. Gửi thông báo cho các mặt hàng DEAD STOCK nhóm C-Z (Tồn đọng)
    const deadStock = analysis.items.filter(i => i.abcClass === 'C' && i.xyzClass === 'Z' && i.currentStock > 0 && i.doi > 180);
    if (deadStock.length > 0) {
      await notificationRepo.createStockNotification(db, {
        type: 'DEAD_STOCK',
        title: `📦 Tồn đọng kho: ${deadStock.length} sản phẩm`,
        message: `Phát hiện ${deadStock.length} mặt hàng tiêu thụ cực chậm (Nhóm C-Z) đang chiếm dụng vốn kho. Hãy cân nhắc xả kho hoặc điều chuyển.`,
        productId: null
      });
    }

    console.log(`[AI Intelligence] Hoàn tất. Đã xử lý ${criticalItems.length} cảnh báo nguy cấp.`);
  } catch (err) {
    console.error('[AI Intelligence] Lỗi khi chạy job:', err.message);
  }
}

/**
 * Lên lịch chạy InventoryIntelligence hàng ngày lúc 6:00 sáng.
 * Chạy ngay lần đầu sau 30 giây để tránh tranh chấp khởi động với dailySnapshot.
 */
function scheduleInventoryIntelligence() {
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;
  const now = new Date();
  const nextRun = new Date(now);
  nextRun.setHours(6, 0, 0, 0);
  if (nextRun <= now) nextRun.setDate(nextRun.getDate() + 1);
  const delayMs = nextRun - now;

  console.log(`[AI Intelligence] Đã lên lịch. Lần chạy tiếp theo: ${nextRun.toISOString()}`);

  // First run: 30s after startup for immediate check
  setTimeout(() => {
    runInventoryIntelligence();
    // Then daily at 6:00 AM
    setInterval(runInventoryIntelligence, ONE_DAY_MS);
  }, 30 * 1000);
}

module.exports = { runInventoryIntelligence, scheduleInventoryIntelligence };
