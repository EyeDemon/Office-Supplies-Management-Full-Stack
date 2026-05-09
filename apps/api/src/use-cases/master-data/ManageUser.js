'use strict';
/**
 * ManageUser.js — Use Cases cho quản lý User (Spec IX / Clean Architecture)
 */
const repo = require('../../infrastructure/repositories/UserRepository');
const bcrypt = require('bcryptjs');
const { ValidationError, ConflictError, NotFoundError } = require('../../domain/errors');

const BCRYPT_COST = 12;

class ManageUser {
  async createUser(conn, data, actorId) {
    const { username, email, fullName, password, phoneNumber, role, departmentId } = data;
    
    const usernameTrim = username.trim();
    const emailTrim = email.trim().toLowerCase();

    // 1. Check exists
    if (await repo.checkUsernameExists(conn, usernameTrim)) {
      throw new ConflictError('Username đã tồn tại');
    }
    if (await repo.checkEmailExists(conn, emailTrim)) {
      throw new ConflictError('Email đã tồn tại');
    }

    // 2. Hash password
    const hashed = await bcrypt.hash(password, BCRYPT_COST);

    // 3. Create
    const newId = await repo.create(conn, {
      username: usernameTrim,
      email: emailTrim,
      password: hashed,
      fullName: fullName.trim(),
      phoneNumber: phoneNumber?.trim() || null,
      departmentId: departmentId || null,
      role: role || 'USER'
    });

    return newId;
  }

  async updateUser(conn, id, data, actorId, isAdmin) {
    const existing = await repo.findByIdForUpdate(conn, id);
    if (!existing) throw new NotFoundError('User', id);

    const updateData = {};

    if (data.email?.trim()) {
      const emailTrim = data.email.trim().toLowerCase();
      if (emailTrim !== existing.email) {
        const ex = await repo.checkEmailExistsExcludeId(conn, emailTrim, id);
        if (ex) throw new ConflictError('Email đã được sử dụng bởi tài khoản khác');
        updateData.email = emailTrim;
      }
    }

    if (data.fullName !== undefined) updateData.fullName = data.fullName.trim();
    if (data.phoneNumber !== undefined) updateData.phoneNumber = data.phoneNumber?.trim() || null;
    if (isAdmin && data.role !== undefined) updateData.role = data.role.toUpperCase();
    if (data.departmentId !== undefined) updateData.departmentId = data.departmentId || null;
    
    if (data.password) {
      updateData.password = await bcrypt.hash(data.password, BCRYPT_COST);
    }

    // Merge with existing for repo.update call
    const finalData = {
      email: updateData.email ?? existing.email,
      fullName: updateData.fullName ?? existing.full_name,
      phoneNumber: updateData.phoneNumber ?? existing.phone_number,
      departmentId: updateData.departmentId ?? existing.department_id,
      role: updateData.role ?? existing.role,
      password: updateData.password ?? existing.password
    };

    await repo.update(conn, id, finalData);
    
    return { before: existing, after: finalData };
  }

  async deleteUser(conn, id, actorId) {
    if (actorId === id) throw new ValidationError('Không thể tự xóa tài khoản của mình');
    
    const existing = await repo.findByIdForUpdate(conn, id);
    if (!existing) throw new NotFoundError('User', id);
    
    // Check pending transactions
    const [[{ pendingCount }]] = await conn.query(
      `SELECT (
        SELECT COUNT(*) FROM import_orders WHERE (created_by = ? OR approved_by = ?) AND status NOT IN ('COMPLETED', 'CANCELLED')
      ) + (
        SELECT COUNT(*) FROM export_orders WHERE (created_by = ? OR approved_by = ?) AND status NOT IN ('COMPLETED', 'CANCELLED')
      ) AS pendingCount`,
      [id, id, id, id]
    );
    if (pendingCount > 0) {
      const err = new Error(`Không thể xóa user đang có ${pendingCount} phiếu chưa hoàn tất`);
      err.code = 'CONFLICT';
      throw err;
    }

    await repo.softDelete(conn, id);
    return existing;
  }
}

module.exports = new ManageUser();
