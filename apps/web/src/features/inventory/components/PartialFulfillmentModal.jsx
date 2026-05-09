import React, { useState, useEffect } from 'react';
import { Modal, Table, Form, Button, Alert, Spinner } from 'react-bootstrap';
import { exportOrderAPI } from '@/services/api';
import { SkeletonRow } from '@/components/common/SkeletonRow.jsx';
import { IcoCheck, IcoFilter } from '@/components/common/Icons.jsx';

const PartialFulfillmentModal = ({ orderId, show, onHide, onConfirm, actionLoading }) => {
  const [items, setItems]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [fulfilled, setFulfilled] = useState({}); 
  const [err, setErr]           = useState('');

  useEffect(() => {
    if (!show) return;
    setLoading(true); setErr('');
    exportOrderAPI.getById(orderId)
      .then(r => {
        const orderItems = r.data.data?.items || [];
        setItems(orderItems);
        const init = {};
        orderItems.forEach(it => { init[it.item_id || it.id] = it.quantity; });
        setFulfilled(init);
      })
      .catch(() => setErr('Không thể tải chi tiết phiếu'))
      .finally(() => setLoading(false));
  }, [orderId, show]);

  const handleConfirm = () => {
    const fulfilledItems = items.map(it => {
      const id = it.item_id || it.id;
      return { itemId: id, quantityFulfilled: Number(fulfilled[id] ?? it.quantity) };
    });
    onConfirm(orderId, fulfilledItems);
  };

  const totalApproved  = items.reduce((s, it) => s + (it.quantity || 0), 0);
  const totalFulfilled = items.reduce((s, it) => s + Number(fulfilled[it.item_id || it.id] ?? it.quantity), 0);
  const isPartial      = totalFulfilled < totalApproved;

  return (
    <Modal show={show} onHide={onHide} size="lg">
      <Modal.Header closeButton>
        <Modal.Title>⚡ Xuất kho một phần</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {loading ? (
          <table className="table table-sm"><tbody><SkeletonRow cols={4} /><SkeletonRow cols={4} /></tbody></table>
        ) : err ? (
          <Alert variant="danger">{err}</Alert>
        ) : (
          <>
            <div className="mb-3">
              <small className="text-muted">Nhập số lượng thực tế xuất kho. Bạn có thể xuất ít hơn số lượng đã được duyệt.</small>
            </div>
            <Table bordered hover size="sm" className="mb-3">
              <thead className="bg-light">
                <tr>
                  <th>Sản phẩm</th>
                  <th className="text-center" style={{ width: 100 }}>SL duyệt</th>
                  <th className="text-center" style={{ width: 140 }}>SL thực xuất</th>
                  <th className="text-center" style={{ width: 100 }}>Còn lại</th>
                </tr>
              </thead>
              <tbody>
                {items.map(it => {
                  const id          = it.item_id || it.id;
                  const approved    = it.quantity || 0;
                  const fulfilledQty = Number(fulfilled[id] ?? approved);
                  const remaining   = approved - fulfilledQty;
                  return (
                    <tr key={id} className={remaining > 0 ? 'table-warning' : ''}>
                      <td className="align-middle">{it.product_name || it.productName}</td>
                      <td className="text-center align-middle fw-bold">{approved}</td>
                      <td>
                        <Form.Control
                          type="number" size="sm" className="text-center fw-bold"
                          min={0} max={approved}
                          value={fulfilled[id] ?? approved}
                          onChange={e => setFulfilled(prev => ({
                            ...prev,
                            [id]: Math.min(approved, Math.max(0, parseInt(e.target.value) || 0))
                          }))}
                        />
                      </td>
                      <td className="text-center align-middle">
                        {remaining > 0 ? <span className="text-danger fw-bold">{remaining}</span> : <span className="text-success">0</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-light fw-bold">
                <tr>
                  <td>Tổng cộng</td>
                  <td className="text-center">{totalApproved}</td>
                  <td className="text-center">{totalFulfilled}</td>
                  <td className="text-center text-danger">{totalApproved - totalFulfilled}</td>
                </tr>
              </tfoot>
            </Table>
            {isPartial && (
              <Alert variant="warning" className="py-2 mb-0 small">
                <IcoFilter size={14} className="me-2" />
                <strong>Lưu ý:</strong> Bạn đang thực hiện xuất một phần. {totalApproved - totalFulfilled} sản phẩm dư thừa sẽ không được xuất.
              </Alert>
            )}
          </>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="outline-secondary" onClick={onHide} disabled={actionLoading}>Hủy</Button>
        <Button variant="success" onClick={handleConfirm} disabled={actionLoading || loading || !!err}>
          {actionLoading ? <Spinner size="sm" /> : <IcoCheck size={14} />} {isPartial ? 'Xác nhận xuất một phần' : 'Hoàn tất & Xuất kho'}
        </Button>
      </Modal.Footer>
    </Modal>
  );
};

export default PartialFulfillmentModal;
