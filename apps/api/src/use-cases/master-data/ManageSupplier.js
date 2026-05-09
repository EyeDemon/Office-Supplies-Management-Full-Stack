'use strict';
/**
 * ManageSupplier.js — Use Cases cho quản lý Supplier (Spec IX / Clean Architecture)
 */
const repo = require('../../infrastructure/repositories/SupplierRepository');
const { ValidationError, ConflictError, NotFoundError } = require('../../domain/errors');

class ManageSupplier {
  async createSupplier(conn, data, actorId) {
    const { code, name, contactName, phone, email, address, taxCode } = data;
    
    const codeTrim = code.trim().toUpperCase();
    
    // 1. Check exists
    if (await repo.checkCodeExists(conn, codeTrim)) {
      throw new ConflictError(`Mã nhà cung cấp "${codeTrim}" đã tồn tại`);
    }

    // 2. Create
    const newId = await repo.create(conn, {
      code: codeTrim,
      name: name.trim(),
      contactName: contactName?.trim() || null,
      phone: phone?.trim() || null,
      email: email?.trim() || null,
      address: address?.trim() || null,
      taxCode: taxCode?.trim() || null
    });

    return newId;
  }

  async updateSupplier(conn, id, data, actorId) {
    const existing = await repo.findByIdForUpdate(conn, id);
    if (!existing) throw new NotFoundError('Nhà cung cấp', id);

    const updateData = {
      name: data.name?.trim() || existing.name,
      contactName: data.contactName !== undefined ? (data.contactName?.trim() || null) : existing.contact_name,
      phone: data.phone !== undefined ? (data.phone?.trim() || null) : existing.phone,
      email: data.email !== undefined ? (data.email?.trim() || null) : existing.email,
      address: data.address !== undefined ? (data.address?.trim() || null) : existing.address,
      taxCode: data.taxCode !== undefined ? (data.taxCode?.trim() || null) : existing.tax_code,
      active: data.active !== undefined ? (data.active ? 1 : 0) : existing.active
    };

    await repo.update(conn, id, updateData);
    return { before: existing, after: updateData };
  }

  async deleteSupplier(conn, id, actorId) {
    const existing = await repo.findByIdForUpdate(conn, id);
    if (!existing) throw new NotFoundError('Nhà cung cấp', id);
    
    // Check if supplier has orders? (Simple soft delete for now)
    await repo.softDelete(conn, id);
    return existing;
  }
}

module.exports = new ManageSupplier();
