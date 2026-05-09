'use strict';
const XLSX = require('xlsx');
const { writeAuditLog } = require('../../shared/utils/auditLogger');

class ImportProducts {
  constructor({ productRepository } = {}) {
    this.repo = productRepository;
  }

  async execute(conn, { fileBuffer, fileName, userId, ipAddress }) {
    const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet);

    if (rows.length === 0) {
      throw new Error('File rỗng hoặc định dạng không đúng');
    }

    const logId = await this._createLog(conn, { fileName, userId });
    
    let successCount = 0;
    let errorCount = 0;
    const errors = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        const sku = String(row['Mã SKU'] || row['SKU'] || '').trim();
        const name = String(row['Tên sản phẩm'] || row['Name'] || '').trim();
        const price = parseFloat(row['Đơn giá'] || row['Price'] || 0);
        const unit = String(row['Đơn vị'] || row['Unit'] || 'Cái').trim();
        const minStock = parseInt(row['Tồn tối thiểu'] || row['Min Stock'] || 0);

        if (!sku || !name) {
          throw new Error(`Dòng ${i + 2}: Thiếu SKU hoặc tên sản phẩm`);
        }

        const existing = await this.repo.findBySku(sku);
        if (existing && !existing.deleted) {
          // Update existing
          await this.repo.update(conn, existing.id, {
            name, price, unit, minStockQty: minStock, updatedBy: userId
          });
        } else if (existing && existing.deleted) {
          // Restore and update
          await this.repo.restore(conn, existing.id);
          await this.repo.update(conn, existing.id, {
            name, price, unit, minStockQty: minStock, updatedBy: userId
          });
        } else {
          // Create new
          await this.repo.create(conn, {
            sku, name, price, unit, minStockQty: minStock, createdBy: userId
          });
        }
        successCount++;
      } catch (e) {
        errorCount++;
        errors.push(`Dòng ${i + 2}: ${e.message}`);
      }
    }

    const finalStatus = errorCount === 0 ? 'SUCCESS' : (successCount > 0 ? 'PARTIAL' : 'FAILED');
    await this._updateLog(conn, logId, {
      records: rows.length,
      errors: errorCount,
      status: finalStatus,
      errorLog: errors.join('\n')
    });

    await writeAuditLog(conn, {
      entityType: 'product',
      action: 'IMPORT',
      changedBy: userId,
      ipAddress,
      afterData: { fileName, successCount, errorCount, status: finalStatus }
    });

    return { successCount, errorCount, status: finalStatus, logId };
  }

  async _createLog(conn, { fileName, userId }) {
    const [result] = await conn.query(
      'INSERT INTO import_logs (file_name, file_type, status, created_by) VALUES (?, ?, ?, ?)',
      [fileName, 'xlsx/csv', 'PROCESSING', userId]
    );
    return result.insertId;
  }

  async _updateLog(conn, id, { records, errors, status, errorLog }) {
    await conn.query(
      'UPDATE import_logs SET records = ?, errors = ?, status = ?, error_log = ? WHERE id = ?',
      [records, errors, status, errorLog, id]
    );
  }
}

module.exports = ImportProducts;

