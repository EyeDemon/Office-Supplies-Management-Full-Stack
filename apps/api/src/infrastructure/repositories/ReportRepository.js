'use strict';
/**
 * ReportRepository.js — Data access cho các báo cáo kho và tài chính.
 *
 * Clean Architecture Layer 4:
 *   - Tập trung các query phức tạp, aggregation, joining nhiều bảng.
 */
const db = require('../../shared/config/db');

class ReportRepository {
  /**
   * Báo cáo biến động kho (nhập/xuất/điều chỉnh) theo kỳ.
   */
  async getStockActivity({ days = 30, dateFrom, dateTo, department, departmentId, warehouseId } = {}) {
    const transferFilter = `AND (t.note IS NULL OR t.note NOT LIKE '[Điều chuyển%')`;
    const warehouseFilter = warehouseId ? `AND t.warehouse_id = ?` : '';
    
    const stockSelect = warehouseId
      ? `COALESCE((SELECT ws.stock_qty FROM warehouse_stock ws WHERE ws.product_id=p.id AND ws.warehouse_id=? LIMIT 1), 0) AS current_stock,
         COALESCE((SELECT ws.avg_unit_price FROM warehouse_stock ws WHERE ws.product_id=p.id AND ws.warehouse_id=? LIMIT 1), p.avg_unit_price) AS warehouse_avg_price`
      : `p.stock_qty AS current_stock, p.avg_unit_price AS warehouse_avg_price`;
    
    const whParamsSelect = warehouseId ? [warehouseId, warehouseId] : [];

    // [FIX MISS-03] Hỗ trợ cả tên phòng ban (string) và ID phòng ban (number)
    let deptJoin = '';
    let deptWhere = '';
    const deptParams = [];

    if (department) {
      deptJoin += ` LEFT JOIN export_order_items eoi_name ON eoi_name.product_id = p.id
                    LEFT JOIN export_orders eo_name ON eo_name.id = eoi_name.order_id AND eo_name.status = 'COMPLETED' AND eo_name.department = ?`;
      deptWhere += ` AND EXISTS (SELECT 1 FROM export_order_items ei2 JOIN export_orders eo2 ON eo2.id = ei2.order_id WHERE ei2.product_id = p.id AND eo2.department = ? AND eo2.status = 'COMPLETED')`;
      deptParams.push(department, department);
    }

    if (departmentId) {
      deptJoin += ` LEFT JOIN export_order_items eoi_id ON eoi_id.product_id = p.id
                    LEFT JOIN export_orders eo_id ON eo_id.id = eoi_id.order_id AND eo_id.status = 'COMPLETED'
                    LEFT JOIN users u_dept ON u_dept.id = eo_id.created_by AND u_dept.department_id = ?`;
      deptWhere += ` AND EXISTS (SELECT 1 FROM export_order_items ei3 JOIN export_orders eo3 ON eo3.id = ei3.order_id JOIN users u3 ON u3.id = eo3.created_by WHERE ei3.product_id = p.id AND u3.department_id = ? AND eo3.status = 'COMPLETED')`;
      deptParams.push(departmentId, departmentId);
    }

    let sql, params;
    if (dateFrom && dateTo) {
      const openingDate = new Date(dateFrom);
      openingDate.setDate(openingDate.getDate() - 1);
      const openingDateStr = openingDate.toISOString().slice(0, 10);

      params = [openingDateStr];
      if (warehouseId) params.push(warehouseId);
      params.push(...whParamsSelect, ...deptParams, dateFrom, dateTo);
      if (warehouseId) params.push(warehouseId);

      sql = `
        SELECT p.id AS product_id, p.name AS product_name, p.sku,
          c.name AS category_name, p.price,
          COALESCE((SELECT s.stock_qty FROM stock_snapshot_daily s 
                    WHERE s.product_id = p.id AND s.snapshot_date = ? 
                    ${warehouseId ? 'AND s.warehouse_id = ?' : ''} 
                    LIMIT 1), 0) AS opening_stock,
          COALESCE(SUM(CASE 
            WHEN t.type IN ('IMPORT', 'TRANSFER_IN', 'RETURN_IN') THEN t.quantity 
            WHEN t.type = 'ADJUST' AND (t.stock_after - t.stock_before) > 0 THEN t.quantity
            ELSE 0 END), 0) AS imported_qty,
          COALESCE(SUM(CASE 
            WHEN t.type IN ('EXPORT', 'TRANSFER_OUT', 'RETURN_OUT') THEN t.quantity 
            WHEN t.type = 'ADJUST' AND (t.stock_after - t.stock_before) < 0 THEN t.quantity
            ELSE 0 END), 0) AS exported_qty,
          COALESCE(SUM(CASE WHEN t.type='ADJUST' THEN (t.stock_after - t.stock_before) ELSE 0 END), 0) AS adjusted_qty,
          COUNT(t.id) AS total_transactions,
          ${stockSelect},
          p.min_stock_qty, (p.stock_qty <= p.min_stock_qty) AS is_low_stock
        FROM products p
        LEFT JOIN categories c ON p.category_id = c.id AND c.deleted = FALSE
        ${deptJoin}
        LEFT JOIN stock_transactions t ON p.id = t.product_id
          AND t.created_at BETWEEN CONCAT(?, ' 00:00:00') AND CONCAT(?, ' 23:59:59')
          ${transferFilter} ${warehouseFilter}
        WHERE p.deleted = FALSE ${deptWhere}
        GROUP BY p.id, p.name, p.sku, c.name, p.price, p.stock_qty, p.min_stock_qty, p.avg_unit_price
        ORDER BY (imported_qty + exported_qty) DESC
      `;
    } else {
      params = [...whParamsSelect, ...deptParams, days, ...(warehouseId ? [warehouseId] : [])];
      sql = `
        SELECT p.id AS product_id, p.name AS product_name, p.sku,
          c.name AS category_name, p.price,
          COALESCE(SUM(CASE 
            WHEN t.type IN ('IMPORT', 'TRANSFER_IN', 'RETURN_IN') THEN t.quantity 
            WHEN t.type = 'ADJUST' AND (t.stock_after - t.stock_before) > 0 THEN t.quantity
            ELSE 0 END), 0) AS imported_qty,
          COALESCE(SUM(CASE 
            WHEN t.type IN ('EXPORT', 'TRANSFER_OUT', 'RETURN_OUT') THEN t.quantity 
            WHEN t.type = 'ADJUST' AND (t.stock_after - t.stock_before) < 0 THEN t.quantity
            ELSE 0 END), 0) AS exported_qty,
          COALESCE(SUM(CASE WHEN t.type='ADJUST' THEN (t.stock_after - t.stock_before) ELSE 0 END), 0) AS adjusted_qty,
          COUNT(t.id) AS total_transactions,
          ${stockSelect},
          p.min_stock_qty, (p.stock_qty <= p.min_stock_qty) AS is_low_stock
        FROM products p
        LEFT JOIN categories c ON p.category_id = c.id AND c.deleted = FALSE
        ${deptJoin}
        LEFT JOIN stock_transactions t ON p.id = t.product_id
          AND t.created_at > DATE_SUB(NOW(), INTERVAL ? DAY)
          ${transferFilter} ${warehouseFilter}
        WHERE p.deleted = FALSE ${deptWhere}
        GROUP BY p.id, p.name, p.sku, c.name, p.price, p.stock_qty, p.min_stock_qty, p.avg_unit_price
        ORDER BY (imported_qty + exported_qty) DESC
      `;
    }

    const [rows] = await db.query(sql, params);
    return rows;
  }

  /**
   * Báo cáo tồn kho theo danh mục.
   */
  async getByCategory({ dateFrom, dateTo } = {}) {
    let sql, params = [];
    if (dateFrom && dateTo) {
      sql = `
        SELECT c.id AS category_id, c.name AS category_name,
          COUNT(DISTINCT p.id) AS product_count,
          COALESCE(SUM(p.stock_qty), 0) AS total_stock,
          COALESCE(SUM(p.stock_qty * p.avg_unit_price), 0) AS stock_value,
          SUM(CASE WHEN p.stock_qty = 0 THEN 1 ELSE 0 END) AS out_of_stock_count,
          SUM(CASE WHEN p.stock_qty > 0 AND p.stock_qty <= p.min_stock_qty THEN 1 ELSE 0 END) AS low_stock_count,
          COALESCE(SUM(CASE WHEN t.type='IMPORT' THEN t.quantity ELSE 0 END),0) AS period_imported,
          COALESCE(SUM(CASE WHEN t.type='EXPORT' THEN t.quantity ELSE 0 END),0) AS period_exported
        FROM categories c
        LEFT JOIN products p ON p.category_id = c.id AND p.deleted = FALSE
        LEFT JOIN stock_transactions t ON t.product_id = p.id
          AND t.created_at BETWEEN CONCAT(?, ' 00:00:00') AND CONCAT(?, ' 23:59:59')
          AND (t.note IS NULL OR t.note NOT LIKE '[Điều chuyển%')
        WHERE c.deleted = FALSE
        GROUP BY c.id, c.name
        ORDER BY stock_value DESC
      `;
      params = [dateFrom, dateTo];
    } else {
      sql = `
        SELECT c.id AS category_id, c.name AS category_name,
          COUNT(DISTINCT p.id) AS product_count,
          COALESCE(SUM(p.stock_qty), 0) AS total_stock,
          COALESCE(SUM(p.stock_qty * p.avg_unit_price), 0) AS stock_value,
          SUM(CASE WHEN p.stock_qty = 0 THEN 1 ELSE 0 END) AS out_of_stock_count,
          SUM(CASE WHEN p.stock_qty > 0 AND p.stock_qty <= p.min_stock_qty THEN 1 ELSE 0 END) AS low_stock_count,
          0 AS period_imported, 0 AS period_exported
        FROM categories c
        LEFT JOIN products p ON p.category_id = c.id AND p.deleted = FALSE
        WHERE c.deleted = FALSE
        GROUP BY c.id, c.name
        ORDER BY stock_value DESC
      `;
    }
    const [rows] = await db.query(sql, params);
    return rows;
  }

  /**
   * Top sản phẩm nhập/xuất/điều chỉnh.
   */
  async getTopProducts({ type = 'EXPORT', days = 30, limit = 10 } = {}) {
    const [rows] = await db.query(`
      SELECT p.id, p.name, p.sku, c.name AS category_name,
             SUM(t.quantity) AS total_qty, COUNT(t.id) AS tx_count
      FROM stock_transactions t
      JOIN products p   ON p.id = t.product_id
      LEFT JOIN categories c ON c.id = p.category_id AND c.deleted = FALSE
      WHERE t.type = ? AND t.created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
        AND p.deleted = FALSE
        AND (t.note IS NULL OR t.note NOT LIKE '[Điều chuyển%')
      GROUP BY p.id, p.name, p.sku, c.name
      ORDER BY total_qty DESC
      LIMIT ?`,
      [type, days, limit]
    );
    return rows;
  }

  /**
   * Báo cáo tài chính: Chi phí nhập/xuất theo danh mục hoặc phòng ban.
   */
  async getFinancial({ dateFrom, dateTo, grouping = 'category', departmentId } = {}) {
    let sql, params = [dateFrom, dateTo];
    if (grouping === 'category') {
      sql = `
        SELECT c.name AS group_name,
          COALESCE(SUM(CASE WHEN t.type='IMPORT' THEN t.quantity * COALESCE(NULLIF(t.unit_price, 0), p.avg_unit_price) ELSE 0 END), 0) AS total_import_cost,
          COALESCE(SUM(CASE WHEN t.type='EXPORT' THEN t.quantity * COALESCE(NULLIF(t.unit_price, 0), p.avg_unit_price) ELSE 0 END), 0) AS total_export_cost
        FROM categories c
        LEFT JOIN products p ON p.category_id = c.id
        LEFT JOIN stock_transactions t ON t.product_id = p.id
          AND t.created_at BETWEEN CONCAT(?, ' 00:00:00') AND CONCAT(?, ' 23:59:59')
          AND (t.note IS NULL OR t.note NOT LIKE '[Điều chuyển%')
        WHERE c.deleted = FALSE
        GROUP BY c.id, c.name
        ORDER BY total_export_cost DESC
      `;
    } else {
      const deptFilter = departmentId ? 'AND u.department_id = ?' : '';
      if (departmentId) params.push(departmentId);

      sql = `
        SELECT COALESCE(eo.department, 'Không xác định') AS group_name,
          COALESCE(SUM(eoi.quantity * p.avg_unit_price), 0) AS total_export_cost
        FROM export_orders eo
        JOIN export_order_items eoi ON eo.id = eoi.order_id
        JOIN products p ON p.id = eoi.product_id
        JOIN users u ON u.id = eo.created_by
        WHERE eo.status = 'COMPLETED'
          AND eo.completed_at BETWEEN CONCAT(?, ' 00:00:00') AND CONCAT(?, ' 23:59:59')
          ${deptFilter}
        GROUP BY eo.department
        ORDER BY total_export_cost DESC
      `;
    }
    const [rows] = await db.query(sql, params);
    return rows;
  }

  /**
   * Báo cáo burn-rate (tốc độ tiêu dùng).
   */
  async getBurnRate({ days = 30, categoryId, departmentId } = {}) {
    const conds  = ['p.deleted = FALSE', 'p.stock_qty > 0'];
    const params = [days, days];
    if (categoryId) { conds.push('p.category_id = ?'); params.push(categoryId); }
    
    let deptJoin = '';
    if (departmentId) {
      deptJoin = ' JOIN users u_burn ON t.created_by = u_burn.id ';
      conds.push('u_burn.department_id = ?');
      params.push(departmentId);
    }

    const [rows] = await db.query(`
      SELECT p.id AS product_id, p.sku, p.name AS product_name, p.stock_qty AS current_stock,
             p.reserved_quantity, (p.stock_qty - p.reserved_quantity) AS available_stock,
             p.min_stock_qty, COALESCE(p.reorder_point, p.min_stock_qty) AS reorder_point,
             p.avg_unit_price, (p.stock_qty * p.avg_unit_price) AS stock_value,
             c.name AS category_name,
             COALESCE(SUM(CASE WHEN t.type = 'EXPORT' AND t.created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
                               AND (t.note IS NULL OR t.note NOT LIKE '[Điều chuyển%') THEN t.quantity ELSE 0 END), 0) AS total_exported,
             COUNT(DISTINCT CASE WHEN t.type = 'EXPORT' AND t.created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
                                 AND (t.note IS NULL OR t.note NOT LIKE '[Điều chuyển%') THEN DATE(t.created_at) END) AS active_days
      FROM products p
      LEFT JOIN categories c ON c.id = p.category_id AND c.deleted = FALSE
      LEFT JOIN stock_transactions t ON t.product_id = p.id
      ${deptJoin}
      WHERE ${conds.join(' AND ')}
      GROUP BY p.id, p.sku, p.name, p.stock_qty, p.reserved_quantity, p.min_stock_qty, p.avg_unit_price, c.name
      HAVING total_exported > 0
      ORDER BY total_exported DESC
    `, params);
    return rows;
  }

  /**
   * Báo cáo hàng chết (dead stock).
   */
  async getDeadStock({ days = 90, categoryId } = {}) {
    const params = [days];
    const catWhere = categoryId ? 'AND p.category_id = ?' : '';
    if (categoryId) params.unshift(categoryId);

    const [rows] = await db.query(`
      SELECT p.id AS product_id, p.sku, p.name AS product_name, p.stock_qty AS current_stock,
             p.reserved_quantity, p.min_stock_qty, p.avg_unit_price, (p.stock_qty * p.avg_unit_price) AS stock_value,
             c.name AS category_name, MAX(t.created_at) AS last_export,
             DATEDIFF(NOW(), MAX(t.created_at)) AS days_since_last_export,
             COUNT(t.id) AS total_export_count
      FROM products p
      LEFT JOIN categories c ON c.id = p.category_id AND c.deleted = FALSE
      LEFT JOIN stock_transactions t ON t.product_id = p.id AND t.type = 'EXPORT'
                                     AND (t.note IS NULL OR t.note NOT LIKE '[Điều chuyển%')
      WHERE p.deleted = FALSE AND p.stock_qty > 0 ${catWhere}
      GROUP BY p.id, p.sku, p.name, p.stock_qty, p.reserved_quantity, p.min_stock_qty, p.avg_unit_price, c.name
      HAVING last_export IS NULL OR days_since_last_export >= ?
      ORDER BY stock_value DESC, days_since_last_export DESC
    `, params);
    return rows;
  }
  /**
   * Báo cáo lịch sử tồn kho (Snapshot-based).
   * [FIX MISS-05] Fallback sang warehouse_stock nếu không có snapshot.
   */
  async getStockHistory({ dateFrom, dateTo, warehouseId, productId } = {}) {
    let where = '1=1';
    const params = [];
    if (dateFrom && dateTo) {
      where += ' AND snapshot_date BETWEEN ? AND ?';
      params.push(dateFrom, dateTo);
    }
    if (warehouseId) {
      where += ' AND warehouse_id = ?';
      params.push(warehouseId);
    }
    if (productId) {
      where += ' AND product_id = ?';
      params.push(productId);
    }

    let [rows] = await db.query(`
      SELECT s.snapshot_date AS snapshotDate, w.name AS warehouseName,
             p.sku, p.name AS productName, s.stock_qty AS stockQty,
             s.reserved_quantity AS reservedQty, (s.stock_qty - s.reserved_quantity) AS availableQty,
             s.avg_unit_price AS avgUnitPrice, s.total_value AS totalValue
      FROM stock_snapshot_daily s
      JOIN warehouses w ON s.warehouse_id = w.id
      JOIN products p ON s.product_id = p.id
      WHERE ${where}
      ORDER BY s.snapshot_date DESC, p.name ASC
      LIMIT 1000
    `, params);

    let [chartData] = await db.query(`
      SELECT snapshot_date AS snapshotDate, SUM(stock_qty) AS totalStockQty
      FROM stock_snapshot_daily
      WHERE ${where}
      GROUP BY snapshot_date
      ORDER BY snapshot_date ASC
    `, params);

    // Fallback logic: Nếu không có snapshot cho ngày hôm nay/hiện tại, lấy từ live data
    const isTodayIncluded = !dateTo || dateTo >= new Date().toISOString().slice(0, 10);
    if (rows.length === 0 && isTodayIncluded) {
      const liveWhere = [];
      const liveParams = [];
      if (warehouseId) { liveWhere.push('ws.warehouse_id = ?'); liveParams.push(warehouseId); }
      if (productId)   { liveWhere.push('ws.product_id = ?');   liveParams.push(productId); }
      const lw = liveWhere.length ? 'WHERE ' + liveWhere.join(' AND ') : '';

      const [liveRows] = await db.query(`
        SELECT CURDATE() AS snapshotDate, w.name AS warehouseName,
               p.sku, p.name AS productName, ws.stock_qty AS stockQty,
               ws.reserved_quantity AS reservedQty, (ws.stock_qty - ws.reserved_quantity) AS availableQty,
               ws.avg_unit_price AS avgUnitPrice, (ws.stock_qty * ws.avg_unit_price) AS totalValue
        FROM warehouse_stock ws
        JOIN warehouses w ON ws.warehouse_id = w.id
        JOIN products p ON ws.product_id = p.id
        ${lw}
        LIMIT 1000
      `, liveParams);
      
      rows = liveRows;
      chartData = [{ snapshotDate: new Date().toISOString().slice(0, 10), totalStockQty: liveRows.reduce((s, r) => s + r.stockQty, 0) }];
    }

    return {
      rows,
      chartData,
      meta: {
        usingSnapshot: rows.length > 0 && !(rows[0].snapshotDate instanceof Date && rows[0].snapshotDate.toISOString().slice(0,10) === new Date().toISOString().slice(0,10)),
        rowCount: rows.length,
        isFallback: rows.length > 0 && rows[0].snapshotDate.toString().includes(new Date().getFullYear()) 
      }
    };
  }

  /**
   * Báo cáo Nhập-Xuất-Tồn.
   */
  async getInOutBalance({ dateFrom, dateTo, warehouseId } = {}) {
    const params = [dateTo, dateFrom, dateTo];
    let whFilter = '';
    let snapshotWh = '';
    if (warehouseId) {
      whFilter = ' AND t.warehouse_id = ?';
      snapshotWh = ' AND s.warehouse_id = ?';
      params.push(warehouseId);
      params.push(warehouseId);
    }

    const [rows] = await db.query(`
      SELECT p.id AS productId, p.name AS productName, p.sku,
             COALESCE(s.stock_qty, 0) AS closingQty,
             COALESCE(SUM(CASE 
               WHEN t.type IN ('IMPORT', 'TRANSFER_IN', 'RETURN_IN') THEN t.quantity 
               WHEN t.type = 'ADJUST' AND (t.stock_after - t.stock_before) > 0 THEN t.quantity
               ELSE 0 END), 0) AS totalImport,
             COALESCE(SUM(CASE 
               WHEN t.type IN ('EXPORT', 'TRANSFER_OUT', 'RETURN_OUT') THEN t.quantity 
               WHEN t.type = 'ADJUST' AND (t.stock_after - t.stock_before) < 0 THEN t.quantity
               ELSE 0 END), 0) AS totalExport
      FROM products p
      LEFT JOIN stock_snapshot_daily s ON p.id = s.product_id AND s.snapshot_date = ? ${snapshotWh}
      LEFT JOIN stock_transactions t ON p.id = t.product_id
           AND t.created_at BETWEEN CONCAT(?, ' 00:00:00') AND CONCAT(?, ' 23:59:59')
           ${whFilter}
      WHERE p.deleted = FALSE
      GROUP BY p.id, p.name, p.sku, s.stock_qty
      HAVING totalImport > 0 OR totalExport > 0 OR closingQty > 0
      ORDER BY p.name ASC
    `, params);

    return rows.map(r => ({
      ...r,
      openingQty: Number(r.closingQty) - (Number(r.totalImport) - Number(r.totalExport))
    }));
  }

  /**
   * Báo cáo giá trị tồn kho hiện tại.
   */
  async getInventoryValue({ warehouseId } = {}) {
    let sql = `
      SELECT w.name AS warehouse_name, p.name AS product_name, p.sku,
             ws.stock_qty, ws.reserved_quantity, (ws.stock_qty - ws.reserved_quantity) AS available_qty,
             ws.avg_unit_price, (ws.stock_qty * ws.avg_unit_price) AS total_value,
             ws.warehouse_id, ws.product_id
      FROM warehouse_stock ws
      JOIN warehouses w ON ws.warehouse_id = w.id
      JOIN products p ON ws.product_id = p.id
      WHERE p.deleted = FALSE AND ws.stock_qty > 0
    `;
    const params = [];
    if (warehouseId) {
      sql += ' AND ws.warehouse_id = ?';
      params.push(warehouseId);
    }
    sql += ' ORDER BY total_value DESC';

    const [rows] = await db.query(sql, params);
    const grandTotal = rows.reduce((acc, r) => acc + Number(r.total_value), 0);

    return {
      data: rows,
      meta: { grandTotal }
    };
  }

  /**
   * Báo cáo tiêu hao.
   */
  async getConsumption({ dateFrom, dateTo, warehouseId, departmentId } = {}) {
    let whFilter = '';
    const params = [dateFrom, dateTo];
    if (warehouseId) {
      whFilter = ' AND t.warehouse_id = ?';
      params.push(warehouseId);
    }
    
    let deptJoin = '';
    let deptFilter = '';
    if (departmentId) {
      deptJoin = ' JOIN users u ON t.created_by = u.id ';
      deptFilter = ' AND u.department_id = ? ';
      params.push(departmentId);
    }

    const [rows] = await db.query(`
      SELECT p.id AS product_id, p.name AS product_name, p.sku,
             SUM(t.quantity) AS total_qty_out,
             AVG(t.unit_price) AS avg_cost,
             SUM(t.quantity * t.unit_price) AS total_cost,
             COUNT(t.id) AS transaction_count
      FROM stock_transactions t
      ${deptJoin}
      JOIN products p ON t.product_id = p.id
      WHERE (t.type IN ('EXPORT', 'TRANSFER_OUT', 'RETURN_OUT') OR (t.type = 'ADJUST' AND (t.stock_after - t.stock_before) < 0))
        AND t.created_at BETWEEN CONCAT(?, ' 00:00:00') AND CONCAT(?, ' 23:59:59')
        ${whFilter}
        ${deptFilter}
      GROUP BY p.id, p.name, p.sku
      ORDER BY total_cost DESC
    `, params);

    return rows;
  }

  /**
   * Xu hướng tồn kho của 1 sản phẩm.
   * [FIX MISS-05] Fallback nếu không có snapshot.
   */
  async getStockTrend({ warehouseId, productId, dateFrom, dateTo } = {}) {
    const [rows] = await db.query(`
      SELECT snapshot_date, stock_qty, reserved_quantity, avg_unit_price
      FROM stock_snapshot_daily
      WHERE warehouse_id = ? AND product_id = ?
        AND snapshot_date BETWEEN ? AND ?
      ORDER BY snapshot_date ASC
    `, [warehouseId, productId, dateFrom, dateTo]);

    if (rows.length === 0) {
      // Fallback: lấy dữ liệu hiện tại nếu dateTo là hôm nay
      const isTodayIncluded = !dateTo || dateTo >= new Date().toISOString().slice(0, 10);
      if (isTodayIncluded) {
        const [[live]] = await db.query(`
          SELECT CURDATE() AS snapshot_date, stock_qty, reserved_quantity, avg_unit_price
          FROM warehouse_stock
          WHERE warehouse_id = ? AND product_id = ?
        `, [warehouseId, productId]);
        return live ? [live] : [];
      }
    }

    return rows;
  }
}

module.exports = new ReportRepository();
