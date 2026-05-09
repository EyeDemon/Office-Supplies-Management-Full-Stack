'use strict';
/**
 * notification.controller.js — Clean Architecture Layer 1
 */

const router = require('express').Router();
const db     = require('../shared/config/db');
const repo   = require('../infrastructure/repositories/NotificationRepository');
const { requireLogin, requireManagerOrAdmin } = require('../shared/middleware/authenticate');
const { idempotencyCheck } = require('../shared/middleware/idempotency');
const { ValidationError } = require('../domain/errors');
const { sendStockAlertEmail } = require('../infrastructure/services/EmailService');
const { validateDto } = require('../shared/middleware/validate');
const { ClearReadSchema, MarkReadSchema } = require('../shared/dto/notification.dto');

function mapNotif(n) {
  return {
    id: n.id, type: n.type, title: n.title, message: n.message,
    isRead: Boolean(n.is_read), readAt: n.read_at || null, createdAt: n.created_at,
    userId: n.user_id || null, refId: n.ref_id || null,
    productName: n.product_name || null, sku: n.sku || null,
    stockQty: n.stock_qty !== null ? Number(n.stock_qty) : null,
    minStockQty: n.min_stock_qty !== null ? Number(n.min_stock_qty) : null,
  };
}

async function syncLowStockNotifications() {
  const lowProds = await repo.getLowStockProducts(db);
  for (const p of lowProds) {
    const isOut = p.out_of_stock === 1 || p.out_of_stock === true;
    await repo.createStockNotification(db, {
      type: isOut ? 'OUT_OF_STOCK' : 'LOW_STOCK',
      title: isOut ? `"${p.name}" đã hết hàng` : `"${p.name}" tồn kho thấp`,
      message: isOut ? 'Tồn kho = 0. Cần nhập hàng ngay.' : `Tồn: ${p.stock_qty} (ngưỡng: ${p.min_stock_qty})`,
      productId: p.id,
    });

    try {
      const admins = await repo.getAdminEmails(db);
      for (const admin of admins) {
        sendStockAlertEmail(admin.email, p.name, Number(p.stock_qty), Number(p.min_stock_qty), isOut);
      }
    } catch (emailErr) {
      console.warn('[notif/stock-email]', emailErr.message);
    }
  }

  const highProds = await repo.getHighStockProducts(db);
  for (const p of highProds) {
    await repo.createStockNotification(db, {
      type: 'HIGH_STOCK',
      title: `"${p.name}" tồn kho quá cao`,
      message: `Tồn: ${p.stock_qty} — vượt ${p.min_stock_qty * 5} (5× ngưỡng tối thiểu). Cân nhắc giảm nhập hoặc tăng xuất.`,
      productId: p.id,
    });
  }
}

async function notifyRequisitionCreated(reqCode, reqId, requesterName) {
  try {
    const managers = await repo.getManagerIds(db);
    for (const m of managers) {
      await repo.createNotification(db, {
        type: 'REQUISITION_CREATED',
        title: `Yêu cầu cấp phát mới: ${reqCode}`,
        message: `${requesterName || 'Nhân viên'} vừa tạo phiếu yêu cầu. Cần phê duyệt.`,
        userId: m.id,
        refId: reqId
      });
    }
  } catch (e) { console.error('[notifyReqCreated]', e.message); }
}

async function notifyRequisitionStatus(reqCode, reqId, requesterId, status, actorName) {
  try {
    const isApproved = status === 'APPROVED';
    await repo.createNotification(db, {
      type: isApproved ? 'REQUISITION_APPROVED' : 'REQUISITION_REJECTED',
      title: isApproved ? `Phiếu ${reqCode} đã được phê duyệt` : `Phiếu ${reqCode} bị từ chối`,
      message: isApproved ? `${actorName || 'Quản lý'} đã phê duyệt yêu cầu của bạn.` : `${actorName || 'Quản lý'} đã từ chối yêu cầu của bạn.`,
      userId: requesterId,
      refId: reqId
    });
  } catch (e) { console.error('[notifyReqStatus]', e.message); }
}

router.post('/sync', requireLogin, requireManagerOrAdmin, idempotencyCheck, async (req, res, next) => {
  try {
    await syncLowStockNotifications();
    res.json({ success: true, message: 'Đồng bộ thành công' });
  } catch (e) { next(e); }
});

router.get('/', requireLogin, async (req, res, next) => {
  const showAll = req.query.all === 'true';
  const { userId, role } = req.session;
  const isMA = role === 'ADMIN' || role === 'MANAGER';
  try {
    const { rows, unread } = await repo.getNotifications(db, { userId, isMA, showAll });
    res.json({ success: true, message: 'OK', data: { items: rows.map(mapNotif), unreadCount: Number(unread) } });
  } catch (e) { next(e); }
});

router.put('/read-all', requireLogin, idempotencyCheck, async (req, res, next) => {
  const { userId, role } = req.session;
  const isMA = role === 'ADMIN' || role === 'MANAGER';
  try {
    await repo.readAll(db, { userId, isMA });
    res.json({ success: true, message: 'Đã đánh dấu tất cả đã đọc' });
  } catch (e) { next(e); }
});

router.delete('/clear-read', requireLogin, requireManagerOrAdmin, idempotencyCheck, validateDto(ClearReadSchema, 'query'), async (req, res, next) => {
  const { days } = req.query;
  try {
    const deleted = await repo.clearRead(db, days);
    res.json({ success: true, message: deleted > 0 ? `Đã xoá ${deleted} thông báo` : 'Không có gì cần dọn', data: { deleted } });
  } catch (e) { next(e); }
});

router.put('/:id/read', requireLogin, idempotencyCheck, validateDto(MarkReadSchema, 'params'), async (req, res, next) => {
  const { id } = req.params;
  try {
    await repo.readOne(db, id);
    res.json({ success: true, message: 'Đã đánh dấu đã đọc' });
  } catch (e) { next(e); }
});

module.exports = router;
module.exports.syncLowStockNotifications = syncLowStockNotifications;
module.exports.notifyRequisitionCreated  = notifyRequisitionCreated;
module.exports.notifyRequisitionStatus   = notifyRequisitionStatus;
