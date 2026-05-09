'use strict';
/**
 * EventWorker.js — Infrastructure Layer
 * 
 * Spec IX / X.3: Background worker to process events from Redis.
 */
const { Worker } = require('bullmq');
const Redis = require('ioredis');
const notificationRepo = require('../../infrastructure/repositories/NotificationRepository');
const db = require('../config/db');

const redisConfig = require('../config/redis');

// [FIX-BUG1] Thêm error handler — thiếu handler này Node.js sẽ crash khi Redis ECONNREFUSED
const connection = new Redis({
  ...redisConfig,
  retryStrategy: (times) => Math.min(times * 100, 3000),
  maxRetriesPerRequest: null,
  lazyConnect: true,
});
connection.on('error', (err) => {
  console.error('[EventWorker] Redis connection error (non-fatal):', err.message);
});

const worker = new Worker('qlvpp-events', async (job) => {
  const { eventName, data } = job.data;
  console.log(`[EventWorker] Processing job ${job.id}: ${eventName}`);

  const conn = await db.getConnection();
  try {
    switch (eventName) {
      case 'REQUISITION_CREATED': {
        const managers = await notificationRepo.getManagerIds(conn);
        for (const m of managers) {
          await notificationRepo.createNotification(conn, {
            type: 'REQUISITION_CREATED',
            title: `Yêu cầu cấp phát mới: ${data.reqCode}`,
            message: `${data.requesterName || 'Nhân viên'} vừa tạo phiếu yêu cầu. Cần phê duyệt.`,
            userId: m.id,
            refId: data.requisitionId
          });
        }
        break;
      }

      case 'REQUISITION_STATUS_CHANGED': {
        const isApproved = data.status === 'APPROVED';
        const isConfirmed = data.status === 'WAREHOUSE_CONFIRMED';

        let title = `Phiếu ${data.reqCode} bị từ chối`;
        let message = `${data.actorName || 'Quản lý'} đã từ chối yêu cầu của bạn.`;
        let type = 'REQUISITION_REJECTED';

        if (isApproved) {
          title = `Phiếu ${data.reqCode} đã được phê duyệt`;
          message = `${data.actorName || 'Quản lý'} đã phê duyệt yêu cầu của bạn.`;
          type = 'REQUISITION_APPROVED';
        } else if (isConfirmed) {
          title = `Phiếu ${data.reqCode} đã xuất kho`;
          message = `Kho đã xác nhận xuất hàng cho yêu cầu ${data.reqCode}.`;
          type = 'REQUISITION_CONFIRMED';
        }

        await notificationRepo.createNotification(conn, {
          type, title, message,
          userId: data.requesterId,
          refId: data.requisitionId
        });
        break;
      }

      case 'STOCK_LOW': {
        await notificationRepo.createStockNotification(conn, {
          type: data.isOut ? 'OUT_OF_STOCK' : 'LOW_STOCK',
          title: data.isOut ? `"${data.productName}" đã hết hàng` : `"${data.productName}" tồn kho thấp`,
          message: data.isOut ? 'Tồn kho = 0. Cần nhập hàng ngay.' : `Tồn: ${data.stockQty} (ngưỡng: ${data.minStockQty})`,
          productId: data.productId,
        });
        break;
      }

      case 'PURCHASE_ORDER_STATUS_CHANGED': {
        const { poId, poCode, status, actorName, requesterId } = data;
        let type = 'PO_STATUS_CHANGED';
        let title = `Đơn mua hàng ${poCode} ${status === 'APPROVED' ? 'đã được duyệt' : 'có thay đổi'}`;
        let message = `${actorName || 'Hệ thống'} đã cập nhật trạng thái đơn hàng ${poCode} sang ${status}.`;

        if (status === 'REJECTED') {
          title = `Đơn mua hàng ${poCode} bị từ chối`;
          message = `${actorName || 'Quản lý'} đã từ chối đơn mua hàng của bạn.`;
        }

        // Notify requester
        if (requesterId) {
          await notificationRepo.createNotification(conn, {
            type, title, message, userId: requesterId, refId: poId
          });
        }

        // Notify admins/managers if it's a new submission or critical change
        if (status === 'PENDING') {
          const managers = await notificationRepo.getManagerIds(conn);
          for (const m of managers) {
            await notificationRepo.createNotification(conn, {
              type: 'PO_PENDING',
              title: `Đơn mua hàng mới chờ duyệt: ${poCode}`,
              message: `Đơn hàng ${poCode} đang chờ phê duyệt.`,
              userId: m.id, refId: poId
            });
          }
        }
        break;
      }

      case 'TRANSACTION_COMPLETED': {
        const { writeAuditLog } = require('../utils/auditLogger');
        await writeAuditLog(conn, {
          entityType: 'stock_transactions',
          entityId: data.refId,
          action: 'COMPLETED',
          changedBy: data.createdBy || null,

          afterData: data,
          note: `Giao dịch ${data.type} hoàn tất cho SP ${data.productId}`
        });
        break;
      }

      case 'APPROVAL_REQUIRED': {
        const managers = await notificationRepo.getManagerIds(conn);
        for (const m of managers) {
          await notificationRepo.createNotification(conn, {
            type: 'APPROVAL_REQUIRED',
            title: `Yêu cầu phê duyệt: ${data.adjCode || data.refId}`,
            message: `Một giao dịch cần bạn phê duyệt: ${data.reason || 'Điều chỉnh tồn kho'}`,
            userId: m.id,
            refId: data.adjId || data.refId
          });
        }
        break;
      }

      default:
        console.log(`[EventWorker] No handler for event: ${eventName}`);
    }
  } catch (err) {
    console.error(`[EventWorker] Error processing ${eventName}:`, err.message);
    throw err;
  } finally {
    conn.release();
  }
}, { connection, concurrency: 3 });

worker.on('completed', (job) => {
  console.log(`[EventWorker] Job ${job.id} completed.`);
});

worker.on('failed', (job, err) => {
  console.error(`[EventWorker] Job ${job.id} failed:`, err.message);
});

console.log('[EventWorker] Started and listening for events...');

module.exports = worker;