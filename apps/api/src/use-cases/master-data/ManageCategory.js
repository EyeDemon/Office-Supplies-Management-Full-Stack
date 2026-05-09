'use strict';
/**
 * ManageCategory.js
 * Application Layer (Clean Architecture — Layer 2)
 */
const repo = require('../../infrastructure/repositories/CategoryRepository');
const { writeAuditLog } = require('../../shared/utils/auditLogger');

class ManageCategory {
  /**
   * Tạo danh mục mới
   */
  async create(conn, { data, userId, ipAddress }) {
    const { name, description } = data;
    const nameTrim = name.trim();
    const descTrim = description?.trim() || null;

    // 1. Guard: Trùng tên
    const exists = await repo.findByName(conn, nameTrim);
    if (exists) {
      const err = new Error('Tên danh mục đã tồn tại');
      err.code  = 'CONFLICT';
      throw err;
    }

    // 2. Tạo record
    const newId = await repo.create(conn, { name: nameTrim, description: descTrim });

    // 3. Audit log
    await writeAuditLog(conn, {
      entityType: 'category', entityId: newId, action: 'CREATE',
      changedBy: userId, ipAddress: ipAddress,
      afterData: { name: nameTrim, description: descTrim },
    });

    return { id: newId, name: nameTrim };
  }

  /**
   * Cập nhật danh mục
   */
  async update(conn, { id, data, userId, ipAddress }) {
    const { name, description } = data;

    // 1. Verify exists
    const existing = await repo.findByIdForUpdate(conn, id);
    if (!existing) {
      const err = new Error('Danh mục không tồn tại');
      err.code  = 'NOT_FOUND';
      throw err;
    }

    // 2. Guard: Trùng tên khi đổi tên
    if (name && name.trim() !== existing.name) {
      const conflict = await repo.findByNameExcludeId(conn, name.trim(), id);
      if (conflict) {
        const err = new Error('Tên danh mục đã tồn tại');
        err.code  = 'CONFLICT';
        throw err;
      }
    }

    const nameTrim = name?.trim() || existing.name;
    const descTrim = description !== undefined ? (description?.trim() || null) : existing.description;

    // 3. Update record
    await repo.update(conn, id, { name: nameTrim, description: descTrim });

    // 4. Audit log
    await writeAuditLog(conn, {
      entityType: 'category', entityId: id, action: 'UPDATE',
      changedBy: userId, ipAddress: ipAddress,
      beforeData: { name: existing.name, description: existing.description },
      afterData:  { name: nameTrim, description: descTrim },
    });

    return { success: true };
  }

  /**
   * Xóa danh mục
   */
  async delete(conn, { id, userId, ipAddress }) {
    const cat = await repo.findByIdForUpdate(conn, id);
    if (!cat) {
      const err = new Error('Danh mục không tồn tại');
      err.code  = 'NOT_FOUND';
      throw err;
    }

    // 1. Guard: Check product count
    if (cat.product_count > 0) {
      const err = new Error(`Không thể xóa danh mục "${cat.name}" — còn ${cat.product_count} sản phẩm.`);
      err.code  = 'CONFLICT';
      throw err;
    }

    // 2. Soft delete & Audit
    await repo.softDelete(conn, id);
    await writeAuditLog(conn, {
      entityType: 'category', entityId: id, action: 'DELETE',
      changedBy: userId, ipAddress: ipAddress,
      beforeData: { name: cat.name, deleted: false }, afterData: { deleted: true },
    });

    return { success: true };
  }
}

module.exports = new ManageCategory();
