'use strict';
/**
 * notification.controller.test.js — Unit Tests: Notification Use-Cases
 */

const { syncLowStockNotifications, notifyRequisitionCreated, notifyRequisitionStatus } = require('../../controllers/notification.controller');
const repo = require('../../infrastructure/repositories/NotificationRepository');
const emailService = require('../../infrastructure/services/EmailService');
const db = require('../../shared/config/db');

// Mock dependencies
jest.mock('../../infrastructure/repositories/NotificationRepository');
jest.mock('../../infrastructure/services/EmailService');
jest.mock('../../shared/config/db');

describe('Notification Controller Helpers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('syncLowStockNotifications', () => {
    it('should create OUT_OF_STOCK and LOW_STOCK notifications and send emails', async () => {
      // Mock data
      repo.getLowStockProducts.mockResolvedValue([
        { id: 1, name: 'Prod A', stock_qty: 0, min_stock_qty: 10, out_of_stock: 1 }, // OUT
        { id: 2, name: 'Prod B', stock_qty: 5, min_stock_qty: 10, out_of_stock: 0 }, // LOW
      ]);
      repo.getHighStockProducts.mockResolvedValue([]);
      repo.getAdminEmails.mockResolvedValue([{ email: 'admin@test.com' }]);

      await syncLowStockNotifications();

      // Check repo calls
      expect(repo.createStockNotification).toHaveBeenCalledTimes(2);
      expect(repo.createStockNotification).toHaveBeenNthCalledWith(1, db, expect.objectContaining({
        type: 'OUT_OF_STOCK',
        productId: 1,
      }));
      expect(repo.createStockNotification).toHaveBeenNthCalledWith(2, db, expect.objectContaining({
        type: 'LOW_STOCK',
        productId: 2,
      }));

      // Check email calls
      expect(emailService.sendStockAlertEmail).toHaveBeenCalledTimes(2);
      expect(emailService.sendStockAlertEmail).toHaveBeenNthCalledWith(1, 'admin@test.com', 'Prod A', 0, 10, true);
      expect(emailService.sendStockAlertEmail).toHaveBeenNthCalledWith(2, 'admin@test.com', 'Prod B', 5, 10, false);
    });

    it('should ignore email errors gracefully', async () => {
      repo.getLowStockProducts.mockResolvedValue([{ id: 1, name: 'Prod A', stock_qty: 0, min_stock_qty: 10, out_of_stock: 1 }]);
      repo.getHighStockProducts.mockResolvedValue([]);
      repo.getAdminEmails.mockRejectedValue(new Error('Email DB error'));

      // Should not throw
      await expect(syncLowStockNotifications()).resolves.not.toThrow();
    });

    it('should create HIGH_STOCK notifications', async () => {
      repo.getLowStockProducts.mockResolvedValue([]);
      repo.getHighStockProducts.mockResolvedValue([
        { id: 3, name: 'Prod C', stock_qty: 100, min_stock_qty: 5 },
      ]);

      await syncLowStockNotifications();

      expect(repo.createStockNotification).toHaveBeenCalledTimes(1);
      expect(repo.createStockNotification).toHaveBeenCalledWith(db, expect.objectContaining({
        type: 'HIGH_STOCK',
        productId: 3,
      }));
    });
  });

  describe('notifyRequisitionCreated', () => {
    it('should notify all managers', async () => {
      repo.getManagerIds.mockResolvedValue([{ id: 10 }, { id: 11 }]);
      
      await notifyRequisitionCreated('REQ-001', 99, 'John Doe');

      expect(repo.createNotification).toHaveBeenCalledTimes(2);
      expect(repo.createNotification).toHaveBeenCalledWith(db, expect.objectContaining({
        type: 'REQUISITION_CREATED',
        userId: 10,
        refId: 99
      }));
    });

    it('should catch errors gracefully', async () => {
      repo.getManagerIds.mockRejectedValue(new Error('DB error'));
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      
      await expect(notifyRequisitionCreated('REQ-001', 99, 'John')).resolves.not.toThrow();
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('notifyRequisitionStatus', () => {
    it('should notify requester on APPROVE', async () => {
      await notifyRequisitionStatus('REQ-001', 99, 5, 'APPROVED', 'Admin');

      expect(repo.createNotification).toHaveBeenCalledTimes(1);
      expect(repo.createNotification).toHaveBeenCalledWith(db, expect.objectContaining({
        type: 'REQUISITION_APPROVED',
        userId: 5,
        refId: 99
      }));
    });

    it('should notify requester on REJECT', async () => {
      await notifyRequisitionStatus('REQ-001', 99, 5, 'REJECTED', 'Admin');

      expect(repo.createNotification).toHaveBeenCalledTimes(1);
      expect(repo.createNotification).toHaveBeenCalledWith(db, expect.objectContaining({
        type: 'REQUISITION_REJECTED',
        userId: 5,
        refId: 99
      }));
    });
  });
});
