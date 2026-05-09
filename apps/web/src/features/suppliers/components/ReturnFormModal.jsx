// apps/web/src/features/suppliers/components/ReturnFormModal.jsx
import React, { useState, useEffect } from 'react';
import { Modal, Form, Button, Row, Col, Spinner } from 'react-bootstrap';
import { returnAPI, productAPI, supplierAPI, warehouseAPI } from '@/services/api';
import { IcoPlus, IcoTrash } from '@/components/common/Icons.jsx';

const ReturnFormModal = ({ show, onHide, editItem, onSaved }) => {
   const [loading, setLoading] = useState(false);
   const [products, setProducts] = useState([]);
   const [suppliers, setSuppliers] = useState([]);
   const [warehouses, setWarehouses] = useState([]);

   const [formData, setFormData] = useState({
      returnType: 'EMPLOYEE_RETURN',
      returnerName: '',
      department: '',
      supplierId: '',
      warehouseId: '',
      reason: '',
      note: '',
      items: [{ productId: '', quantity: 1, conditionNote: '' }]
   });

   useEffect(() => {
      const loadRefData = async () => {
         try {
            const [p, s, w] = await Promise.all([
               productAPI.getAll({ size: 1000 }),
               supplierAPI.getAll({ size: 1000 }),
               warehouseAPI.getAll({ size: 1000 })
            ]);
            
            // Fix: Log to verify data structure if needed
            console.log('[ReturnForm] Products response:', p.data);
            
            setProducts(p.data?.data?.items || p.data?.items || []);
            setSuppliers(s.data?.data?.items || s.data?.items || []);
            setWarehouses(w.data?.data?.items || w.data?.items || []);
         } catch (e) { 
            console.error('Lỗi tải dữ liệu tham chiếu', e); 
         }
      };
      if (show) loadRefData();
   }, [show]);

   useEffect(() => {
      if (editItem) {
         setFormData({
            returnType: editItem.return_type,
            returnerName: editItem.returner_name || '',
            department: editItem.department || '',
            supplierId: editItem.supplier_id || '',
            warehouseId: editItem.warehouse_id || '',
            reason: editItem.reason || '',
            note: editItem.note || '',
            items: editItem.items?.map(it => ({
               productId: it.product_id,
               quantity: it.quantity,
               conditionNote: it.condition_note || ''
            })) || [{ productId: '', quantity: 1, conditionNote: '' }]
         });
      } else {
         setFormData({
            returnType: 'EMPLOYEE_RETURN',
            returnerName: '',
            department: '',
            supplierId: '',
            warehouseId: '',
            reason: '',
            note: '',
            items: [{ productId: '', quantity: 1, conditionNote: '' }]
         });
      }
   }, [editItem, show]);

   const handleAddItem = () => {
      setFormData(prev => ({
         ...prev,
         items: [...prev.items, { productId: '', quantity: 1, conditionNote: '' }]
      }));
   };

   const handleRemoveItem = (index) => {
      const newItems = [...formData.items];
      newItems.splice(index, 1);
      setFormData(prev => ({ ...prev, items: newItems }));
   };

   const handleItemChange = (index, field, value) => {
      const newItems = [...formData.items];
      newItems[index][field] = value;
      setFormData(prev => ({ ...prev, items: newItems }));
   };

   const handleSave = async () => {
      if (!formData.reason) return alert('Vui lòng nhập lý do trả hàng');
      if (formData.items.some(it => !it.productId || it.quantity <= 0)) {
         return alert('Vui lòng kiểm tra lại danh sách sản phẩm và số lượng');
      }
      if (formData.returnType === 'SUPPLIER_RETURN' && !formData.supplierId) {
         return alert('Trả về NCC cần chọn nhà cung cấp');
      }

      setLoading(true);
      try {
         const payload = {
            ...formData,
            supplierId: formData.supplierId ? parseInt(formData.supplierId) : null,
            warehouseId: formData.warehouseId ? parseInt(formData.warehouseId) : null,
            items: formData.items.map(it => ({
               productId: parseInt(it.productId),
               quantity: parseInt(it.quantity),
               conditionNote: it.conditionNote
            }))
         };

         if (editItem) {
            await returnAPI.update(editItem.id, payload);
         } else {
            await returnAPI.create(payload);
         }
         onSaved();
      } catch (e) {
         alert(e.response?.data?.message || 'Lỗi khi lưu phiếu trả hàng');
      } finally {
         setLoading(false);
      }
   };

   return (
      <Modal show={show} onHide={onHide} size="lg" centered backdrop="static">
         <Modal.Header closeButton className="bg-light">
            <Modal.Title className="fw-bold">{editItem ? 'Sửa phiếu trả hàng' : 'Tạo phiếu trả hàng mới'}</Modal.Title>
         </Modal.Header>
         <Modal.Body className="p-4">
            <Form>
               <Row className="g-3 mb-4">
                  <Col md={6}>
                     <Form.Group>
                        <Form.Label className="small fw-bold text-muted text-uppercase">Loại hình trả hàng</Form.Label>
                        <Form.Select 
                           value={formData.returnType} 
                           onChange={e => setFormData({ ...formData, returnType: e.target.value })}
                           disabled={!!editItem}
                        >
                           <option value="EMPLOYEE_RETURN">Nhân viên trả về kho (Cộng tồn)</option>
                           <option value="SUPPLIER_RETURN">Trả hàng về NCC (Trừ tồn)</option>
                        </Form.Select>
                     </Form.Group>
                  </Col>
                  <Col md={6}>
                     <Form.Group>
                        <Form.Label className="small fw-bold text-muted text-uppercase">Kho nhận/xuất</Form.Label>
                        <Form.Select 
                           value={formData.warehouseId} 
                           onChange={e => setFormData({ ...formData, warehouseId: e.target.value })}
                        >
                           <option value="">Chọn kho hàng</option>
                           {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                        </Form.Select>
                     </Form.Group>
                  </Col>
               </Row>

               {formData.returnType === 'EMPLOYEE_RETURN' ? (
                  <Row className="g-3 mb-4">
                     <Col md={6}>
                        <Form.Group>
                           <Form.Label className="small fw-bold text-muted text-uppercase">Người trả hàng</Form.Label>
                           <Form.Control 
                              type="text" 
                              placeholder="Tên nhân viên..." 
                              value={formData.returnerName}
                              onChange={e => setFormData({ ...formData, returnerName: e.target.value })}
                           />
                        </Form.Group>
                     </Col>
                     <Col md={6}>
                        <Form.Group>
                           <Form.Label className="small fw-bold text-muted text-uppercase">Phòng ban</Form.Label>
                           <Form.Control 
                              type="text" 
                              placeholder="Phòng ban..." 
                              value={formData.department}
                              onChange={e => setFormData({ ...formData, department: e.target.value })}
                           />
                        </Form.Group>
                     </Col>
                  </Row>
               ) : (
                  <Row className="g-3 mb-4">
                     <Col md={12}>
                        <Form.Group>
                           <Form.Label className="small fw-bold text-muted text-uppercase">Nhà cung cấp nhận lại</Form.Label>
                           <Form.Select 
                              value={formData.supplierId} 
                              onChange={e => setFormData({ ...formData, supplierId: e.target.value })}
                           >
                              <option value="">Chọn nhà cung cấp</option>
                              {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                           </Form.Select>
                        </Form.Group>
                     </Col>
                  </Row>
               )}

               <Row className="g-3 mb-4">
                  <Col md={12}>
                     <Form.Group>
                        <Form.Label className="small fw-bold text-muted text-uppercase">Lý do trả hàng</Form.Label>
                        <Form.Control 
                           as="textarea" 
                           rows={2} 
                           placeholder="Lý do chi tiết..." 
                           value={formData.reason}
                           onChange={e => setFormData({ ...formData, reason: e.target.value })}
                        />
                     </Form.Group>
                  </Col>
               </Row>

               <div className="d-flex justify-content-between align-items-center mb-2">
                  <h6 className="small fw-bold text-muted text-uppercase mb-0">Danh sách sản phẩm</h6>
                  <Button variant="link" size="sm" onClick={handleAddItem} className="text-decoration-none">
                     <IcoPlus size={14} /> Thêm dòng
                  </Button>
               </div>

               <div className="table-responsive bg-light rounded p-2">
                  <table className="table table-sm table-borderless mb-0 small">
                     <thead>
                        <tr>
                           <th style={{ width: '45%' }}>Sản phẩm</th>
                           <th style={{ width: '15%' }} className="text-center">SL</th>
                           <th style={{ width: '30%' }}>Tình trạng hàng</th>
                           <th style={{ width: '10%' }}></th>
                        </tr>
                     </thead>
                     <tbody>
                        {formData.items.map((it, idx) => (
                           <tr key={idx}>
                              <td>
                                 <Form.Select 
                                    size="sm" 
                                    value={it.productId} 
                                    onChange={e => handleItemChange(idx, 'productId', e.target.value)}
                                 >
                                    <option value="">Chọn SP...</option>
                                    {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                 </Form.Select>
                              </td>
                              <td>
                                 <Form.Control 
                                    size="sm" 
                                    type="number" 
                                    min="1" 
                                    className="text-center"
                                    value={it.quantity}
                                    onChange={e => handleItemChange(idx, 'quantity', e.target.value)}
                                 />
                              </td>
                              <td>
                                 <Form.Control 
                                    size="sm" 
                                    type="text" 
                                    placeholder="Lỗi, hết hạn..." 
                                    value={it.conditionNote}
                                    onChange={e => handleItemChange(idx, 'conditionNote', e.target.value)}
                                 />
                              </td>
                              <td className="text-center">
                                 {formData.items.length > 1 && (
                                    <Button variant="link" size="sm" className="text-danger p-0" onClick={() => handleRemoveItem(idx)}>
                                       <IcoTrash size={14} />
                                    </Button>
                                 )}
                              </td>
                           </tr>
                        ))}
                     </tbody>
                  </table>
               </div>
            </Form>
         </Modal.Body>
         <Modal.Footer className="bg-light border-top">
            <Button variant="link" className="text-muted text-decoration-none" onClick={onHide} disabled={loading}>Hủy bỏ</Button>
            <Button className="btn-premium px-4" onClick={handleSave} disabled={loading}>
               {loading ? <Spinner size="sm" animation="border" /> : (editItem ? 'Cập nhật phiếu' : 'Lưu phiếu nháp')}
            </Button>
         </Modal.Footer>
      </Modal>
   );
};

export default ReturnFormModal;
