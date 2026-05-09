import React, { useState, useEffect, useCallback } from 'react';
import { Row, Col, Card, Table, Badge, Button, Form, Spinner } from 'react-bootstrap';
import { analyticsAPI } from '@/services/api';
import { IcoRefresh, IcoAlertTriangle, IcoClipboard } from '@/components/common/Icons.jsx';

export default function InventoryIntelligence() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({ warehouseId: '', categoryId: '' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await analyticsAPI.getReplenishmentAnalysis(filters);
      setData(r.data?.data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="p-3">
      <div className="d-flex justify-content-between align-items-center mb-3">
        <div>
          <h5 className="mb-0 fw-bold">Trí tuệ tồn kho (Inventory Intelligence)</h5>
          <small className="text-muted">Phân tích nhu cầu nhập hàng & Cảnh báo tồn kho</small>
        </div>
        <Button variant="outline-primary" size="sm" onClick={load} disabled={loading}>
          <IcoRefresh size={14} className={`me-1 ${loading ? 'spin' : ''}`} /> Làm mới
        </Button>
      </div>

      <Card className="shadow-sm border-0 mb-3">
        <Card.Body className="p-0">
          <Table responsive hover className="mb-0">
            <thead className="table-light">
              <tr>
                <th>Sản phẩm</th>
                <th className="text-end">Tồn hiện tại</th>
                <th className="text-end">Định mức tối thiểu</th>
                <th className="text-end">Cần nhập thêm</th>
                <th className="text-end">Đề xuất</th>
                <th>Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="text-center py-5"><Spinner animation="border" size="sm" /></td></tr>
              ) : data.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-5 text-muted">Không có cảnh báo nào</td></tr>
              ) : data.map(item => (
                <tr key={item.id}>
                  <td>
                    <div className="fw-bold">{item.name}</div>
                    <small className="text-muted">{item.sku}</small>
                  </td>
                  <td className="text-end">{item.stock_qty} {item.unit}</td>
                  <td className="text-end text-muted">{item.min_stock_qty} {item.unit}</td>
                  <td className="text-end text-danger fw-bold">
                    {Math.max(0, item.min_stock_qty - item.stock_qty)} {item.unit}
                  </td>
                  <td className="text-end">
                    <Badge bg="info">Nhập {item.min_stock_qty * 2}</Badge>
                  </td>
                  <td>
                    {item.stock_qty <= item.min_stock_qty ? (
                      <Badge bg="danger"><IcoAlertTriangle size={12} className="me-1" /> Sắp hết hàng</Badge>
                    ) : (
                      <Badge bg="success">An toàn</Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card.Body>
      </Card>
    </div>
  );
}
