'use strict';
/**
 * ManageProduct.js
 * Application Layer (Clean Architecture — Layer 2)
 *
 * Nhóm các nghiệp vụ CRUD sản phẩm để đảm bảo tính nhất quán và audit log.
 */
const { writeAuditLog } = require('../../shared/utils/auditLogger');

class ManageProduct {
  constructor({ productRepository } = {}) {
    this.repo = productRepository;
  }

  /**
   * Tạo sản phẩm mới
   */
  async create(conn, { dto, userId, ipAddress }) {
    // 1. Guard: SKU phải unique
    const existing = await this.repo.findBySku(dto.sku);
    if (existing && !existing.deleted) {
      const err = new Error(`SKU '${dto.sku}' đã tồn tại`);
      err.code  = 'CONFLICT';
      throw err;
    }

    // 2. Tạo record
    const insertId = await this.repo.create(conn, {
      sku:          dto.sku,
      barcode:      dto.barcode || null,
      name:         dto.name,
      categoryId:   dto.categoryId || null,
      baseUnitId:   dto.baseUnitId || null,
      unit:         dto.unit || null,
      price:        dto.price ?? 0,
      minStockQty:  dto.minStockQty ?? 0,
      reorderPoint: dto.reorderPoint || null,
      description:  dto.description || null,
      imageUrl:     null,
      createdBy:    userId,
    });

    // 2.1. Initial Price History
    if (dto.price > 0) {
      await this.repo.insertPriceHistory(conn, {
        productId: insertId,
        oldPrice: 0,
        newPrice: dto.price,
        changedBy: userId,
        note: 'Giá khởi tạo'
      });
    }

    // 3. Audit log
    await writeAuditLog(conn, {
      entityType: 'product',
      entityId:   insertId,
      action:     'CREATE',
      changedBy:  userId,
      ipAddress:  ipAddress,
      afterData:  { sku: dto.sku, name: dto.name },
    });

    return { id: insertId, sku: dto.sku, name: dto.name };
  }

  /**
   * Cập nhật thông tin sản phẩm
   */
  async update(conn, { id, dto, userId, ipAddress }) {
    // 1. Lock + verify exists
    const product = await this.repo.findById(conn, id, true /* FOR UPDATE NOWAIT */);
    if (!product) {
      const err = new Error('Sản phẩm không tồn tại');
      err.code  = 'NOT_FOUND';
      throw err;
    }

    // 2. Guard: SKU uniqueness check IF SKU is being changed
    if (dto.sku && dto.sku !== product.sku) {
      const existing = await this.repo.findBySku(dto.sku);
      if (existing && !existing.deleted) {
        const err = new Error(`SKU '${dto.sku}' đã tồn tại`);
        err.code  = 'CONFLICT';
        throw err;
      }
    }

    // 3. Thực hiện update
    await this.repo.update(conn, id, {
      sku:          dto.sku || product.sku,
      name:         dto.name || product.name,
      categoryId:   dto.categoryId || null,
      baseUnitId:   dto.baseUnitId || null,
      unit:         dto.unit || product.unit,
      price:        dto.price ?? product.price,
      minStockQty:  dto.minStockQty ?? product.min_stock_qty,
      reorderPoint: dto.reorderPoint ?? product.reorder_point,
      description:  dto.description ?? product.description,
      imageUrl:     product.image_url,
      updatedBy:    userId,
    });

    // 3.1. Record Price History if changed
    if (dto.price !== undefined && Number(dto.price) !== Number(product.price)) {
      await this.repo.insertPriceHistory(conn, {
        productId: id,
        oldPrice: product.price,
        newPrice: dto.price,
        changedBy: userId,
        note: 'Cập nhật giá bán'
      });
    }

    // 4. Audit log
    await writeAuditLog(conn, {
      entityType: 'product',
      entityId:   id,
      action:     'UPDATE',
      changedBy:  userId,
      ipAddress:  ipAddress,
      beforeData: { name: product.name, price: product.price },
      afterData:  { name: dto.name, price: dto.price },
    });

    return { success: true };
  }

  /**
   * Xóa mềm sản phẩm
   */
  async delete(conn, { id, userId, ipAddress }) {
    // repo.softDelete đã có logic check stock_qty > 0
    await this.repo.softDelete(conn, id, userId);

    await writeAuditLog(conn, {
      entityType: 'product',
      entityId:   id,
      action:     'DELETE',
      changedBy:  userId,
      ipAddress:  ipAddress,
      afterData:  { deleted: true },
    });

    return { success: true };
  }
}

module.exports = ManageProduct;

