'use strict';
/**
 * SupplierRepository.js — Clean Architecture Layer 4
 */

class SupplierRepository {
  async findWithFilters(db, { search, activeOnly, size, offset }) {
    const where = ['s.deleted = FALSE'];
    const params = [];
    if (activeOnly) { where.push('s.active = TRUE'); }
    if (search) {
      where.push('(s.name LIKE ? OR s.code LIKE ? OR s.phone LIKE ? OR s.email LIKE ?)');
      params.push(search, search, search, search);
    }
    const w = where.join(' AND ');

    const [[{ total }]] = await db.query(`SELECT COUNT(*) AS total FROM suppliers s WHERE ${w}`, params);

    const [rows] = await db.query(
      `SELECT s.*, COUNT(io.id) AS total_orders,
              COALESCE(SUM(io.total_amount),0) AS total_amount,
              MAX(io.created_at) AS last_order_at
       FROM suppliers s
       LEFT JOIN import_orders io ON io.supplier_id = s.id AND io.status = 'CONFIRMED'
       WHERE ${w}
       GROUP BY s.id
       ORDER BY s.name
       LIMIT ? OFFSET ?`,
      [...params, size, offset]
    );

    return { total: Number(total), rows };
  }

  async findAllActive(db) {
    const [rows] = await db.query('SELECT id, code, name FROM suppliers WHERE deleted=FALSE AND active=TRUE ORDER BY name');
    return rows;
  }

  async findForExport(db, { search, activeOnly }) {
    const where = ['s.deleted = FALSE'];
    const params = [];
    if (activeOnly) { where.push('s.active = TRUE'); }
    if (search) {
      where.push('(s.name LIKE ? OR s.code LIKE ? OR s.phone LIKE ? OR s.email LIKE ?)');
      params.push(search, search, search, search);
    }
    const w = where.join(' AND ');

    const [rows] = await db.query(
      `SELECT s.code, s.name, s.contact_name, s.phone, s.email,
              s.address, s.tax_code, s.note, s.active, s.created_at,
              COUNT(io.id)                      AS total_orders,
              COALESCE(SUM(io.total_amount), 0) AS total_amount,
              MAX(io.created_at)                AS last_order_at
       FROM suppliers s
       LEFT JOIN import_orders io ON io.supplier_id = s.id AND io.status = 'CONFIRMED'
       WHERE ${w}
       GROUP BY s.id
       ORDER BY s.name`, params
    );
    return rows;
  }

  async findById(db, id) {
    const [[s]] = await db.query(
      `SELECT s.*, COUNT(io.id) AS total_orders,
              COALESCE(SUM(io.total_amount),0) AS total_amount,
              MAX(io.created_at) AS last_order_at
       FROM suppliers s
       LEFT JOIN import_orders io ON io.supplier_id=s.id AND io.status='CONFIRMED'
       WHERE s.id=? AND s.deleted=FALSE GROUP BY s.id`, [id]
    );
    return s;
  }

  async findByIdForUpdate(conn, id) {
    const [[s]] = await conn.query('SELECT * FROM suppliers WHERE id=? AND deleted=FALSE FOR UPDATE', [id]);
    return s;
  }

  async checkCodeExists(db, code) {
    const [[ex]] = await db.query('SELECT id FROM suppliers WHERE code=?', [code]);
    return ex;
  }

  async getBaseCount(db) {
    const [[{ cnt }]] = await db.query('SELECT COUNT(*) AS cnt FROM suppliers');
    return Number(cnt);
  }

  async generateCode(db) {
    const baseCount = await this.getBaseCount(db);
    return `NCC-${String(baseCount + 1).padStart(3, '0')}`;
  }

  async create(conn, data) {
    const [result] = await conn.query(
      'INSERT INTO suppliers (code,name,contact_name,phone,email,address,tax_code,note) VALUES(?,?,?,?,?,?,?,?)',
      [data.code, data.name, data.contactName, data.phone, data.email, data.address, data.taxCode, data.note]
    );
    return result.insertId;
  }

  async update(conn, id, data) {
    await conn.query(
      'UPDATE suppliers SET name=?,contact_name=?,phone=?,email=?,address=?,tax_code=?,note=?,active=? WHERE id=?',
      [data.name, data.contactName, data.phone, data.email, data.address, data.taxCode, data.note, data.active, id]
    );
  }

  async delete(conn, id) {
    await conn.query('UPDATE suppliers SET deleted=1 WHERE id=?', [id]);
  }

  async softDelete(conn, id) {
    await conn.query('UPDATE suppliers SET deleted=1, active=0 WHERE id=?', [id]);
  }

  async checkPendingImportOrders(db, supplierId) {
    const [[{ ioCount }]] = await db.query(
      "SELECT COUNT(*) AS ioCount FROM import_orders WHERE supplier_id=? AND status IN ('DRAFT','PENDING','APPROVED','IN_TRANSIT')",
      [supplierId]
    );
    return Number(ioCount);
  }

  async checkPendingPurchaseOrders(db, supplierId) {
    const [[{ poCount }]] = await db.query(
      "SELECT COUNT(*) AS poCount FROM purchase_orders WHERE supplier_id=? AND status IN ('DRAFT','CONFIRMED')",
      [supplierId]
    );
    return Number(poCount);
  }

  async insertImportLog(conn, { fileName, totalRows, imported, skipped, errorCount, createdBy }) {
    await conn.query(
      `INSERT INTO import_logs (entity_type, file_name, total_rows, imported, skipped, error_count, status, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ['suppliers', fileName, totalRows, imported, skipped, errorCount, 'SUCCESS', createdBy]
    );
  }
}

module.exports = new SupplierRepository();
