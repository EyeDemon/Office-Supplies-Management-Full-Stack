'use strict';
/**
 * ManageWarehouse.js
 * Application Layer (Clean Architecture — Layer 2)
 */
const { writeAuditLog } = require('../../shared/utils/auditLogger');

class ManageWarehouse {
  constructor({ warehouseRepository } = {}) {
    this.repo = warehouseRepository;
  }

  /**
   * Tạo kho mới
   */
  async create(conn, { data, userId, ipAddress }) {
    const { name, address: location, description, is_active } = data;
    
    // 1. Guard: Trùng tên
    const conflict = await this.repo.findByName(conn, name.trim());
    if (conflict) {
      const err = new Error(`Tên kho '${name}' đã tồn tại`);
      err.code  = 'CONFLICT';
      throw err;
    }
    
    // 2. Sinh mã & Tạo record
    const code = await this.repo.generateCode(conn);
    const nameTrim = name.trim();
    
    const newId = await this.repo.create(conn, {
      code, name: nameTrim, location: location?.trim() || null, description: description?.trim() || null,
      isActive: is_active ? 1 : 0, createdBy: userId
    });
    
    // 3. Audit log
    await writeAuditLog(conn, {
      entityType: 'warehouse', entityId: newId, action: 'CREATE',
      changedBy: userId, ipAddress: ipAddress,
      afterData: { code, name: nameTrim, is_active: is_active },
    });

    return { id: newId, code, name: nameTrim };
  }

  /**
   * Cập nhật thông tin kho
   */
  async update(conn, { id, data, userId, ipAddress }) {
    const { name, address: location, description, is_active } = data;
    
    const existing = await this.repo.findByIdForUpdate(conn, id);
    if (!existing) {
      const err = new Error('Không tìm thấy kho');
      err.code  = 'NOT_FOUND';
      throw err;
    }
    
    // 1. Guard: Trùng tên khi đổi tên
    if (name && name.trim() !== existing.name) {
      const conflict = await this.repo.findByNameExcludeId(conn, name.trim(), id);
      if (conflict) {
        const err = new Error(`Tên kho '${name}' đã tồn tại`);
        err.code  = 'CONFLICT';
        throw err;
      }
    }
    
    const newName   = name?.trim() || existing.name;
    const newLoc    = location !== undefined ? (location?.trim() || null) : existing.location;
    const newDesc   = description !== undefined ? (description?.trim() || null) : existing.description;
    const newActive = is_active !== undefined ? (is_active ? 1 : 0) : existing.is_active;
    
    // 2. Update record
    await this.repo.update(conn, id, {
      name: newName, location: newLoc, description: newDesc, isActive: newActive, updatedBy: userId
    });
    
    // 3. Audit log
    await writeAuditLog(conn, {
      entityType: 'warehouse', entityId: id, action: 'UPDATE',
      changedBy: userId, ipAddress: ipAddress,
      beforeData: { name: existing.name, location: existing.location, is_active: existing.is_active },
      afterData:  { name: newName, location: newLoc, is_active: Boolean(newActive) },
    });

    return { success: true };
  }

  /**
   * Xóa kho (chỉ xóa nếu không có tồn kho và không có giao dịch điều chuyển)
   */
  async delete(conn, { id, userId, ipAddress }) {
    const w = await this.repo.findByIdForUpdate(conn, id);
    if (!w) {
      const err = new Error('Không tìm thấy kho');
      err.code  = 'NOT_FOUND';
      throw err;
    }
    
    // 1. Guard: Check giao dịch điều chuyển
    const txCnt = await this.repo.checkTransferTransactions(conn, id);
    if (txCnt > 0) {
      const err = new Error(`Không thể xóa kho '${w.name}' — đã có ${txCnt} giao dịch điều chuyển`);
      err.code  = 'CONFLICT';
      throw err;
    }
    
    // 2. Guard: Check tồn kho
    const totalStock = await this.repo.checkStockLevels(conn, id);
    if (totalStock > 0) {
      const err = new Error(`Không thể xóa kho '${w.name}' — còn ${totalStock} đơn vị tồn kho.`);
      err.code  = 'CONFLICT';
      throw err;
    }
    
    // 3. Xóa record & Audit
    await this.repo.softDelete(conn, id, userId);
    await writeAuditLog(conn, {
      entityType: 'warehouse', entityId: id, action: 'DELETE',
      changedBy: userId, ipAddress: ipAddress,
      beforeData: { name: w.name, code: w.code, deleted: false },
      afterData:  { deleted: true },
    });

    return { success: true };
  }

  /**
   * Đảo trạng thái kích hoạt
   */
  async toggle(conn, { id, userId, ipAddress }) {
    const w = await this.repo.findByIdForUpdate(conn, id);
    if (!w) {
      const err = new Error('Không tìm thấy kho');
      err.code  = 'NOT_FOUND';
      throw err;
    }
    
    const newStatus = w.is_active ? 0 : 1;
    await this.repo.toggleActive(conn, id, newStatus, userId);
    
    await writeAuditLog(conn, {
      entityType: 'warehouse', entityId: id, action: 'TOGGLE',
      changedBy: userId, ipAddress: ipAddress,
      beforeData: { is_active: Boolean(w.is_active) },
      afterData:  { is_active: Boolean(newStatus) },
    });

    return { isActive: Boolean(newStatus) };
  }
}

module.exports = ManageWarehouse;
