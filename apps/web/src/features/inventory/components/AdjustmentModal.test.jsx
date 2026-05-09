import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AdjustmentModal from './AdjustmentModal.jsx';
import { productAPI } from '@/services/api';

// Mock API
vi.mock('@/services/api', () => ({
  productAPI: {
    getWarehouseStocks: vi.fn(),
  },
}));

describe('AdjustmentModal Component', () => {
  const mockProduct = {
    id: 10,
    name: 'Bút Bi Thiên Long',
    sku: 'SP001',
    stockQty: 100,
    unit: 'CAI',
    lowStock: false,
  };

  const mockWarehouses = [
    { id: 1, name: 'Kho Trung Tâm' },
    { id: 2, name: 'Kho Chi Nhánh' },
  ];

  const mockOnHide = vi.fn();
  const mockOnSubmit = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    productAPI.getWarehouseStocks.mockResolvedValue({
      data: {
        data: [
          { warehouseId: 1, warehouseName: 'Kho Trung Tâm', stockQty: 80 },
          { warehouseId: 2, warehouseName: 'Kho Chi Nhánh', stockQty: 20 },
        ],
      },
    });
  });

  it('renders modal content correctly when show is true', async () => {
    render(
      <AdjustmentModal
        show={true}
        product={mockProduct}
        onHide={mockOnHide}
        onSubmit={mockOnSubmit}
        warehouses={mockWarehouses}
      />
    );

    expect(screen.getByText('Điều chỉnh tồn kho')).toBeInTheDocument();
    expect(screen.getByText('Bút Bi Thiên Long')).toBeInTheDocument();
    expect(screen.getByText('SP001')).toBeInTheDocument();

    // API should be called to fetch warehouse stocks
    await waitFor(() => {
      expect(productAPI.getWarehouseStocks).toHaveBeenCalledWith(10);
    });
  });

  it('shows validation error if quantity is invalid', async () => {
    const user = userEvent.setup();
    render(
      <AdjustmentModal
        show={true}
        product={mockProduct}
        onHide={mockOnHide}
        onSubmit={mockOnSubmit}
        warehouses={mockWarehouses}
      />
    );

    await waitFor(() => expect(productAPI.getWarehouseStocks).toHaveBeenCalled());

    // Enter empty quantity
    const qtyInput = screen.getByLabelText('Số lượng mới');
    await user.clear(qtyInput);
    
    const submitBtn = screen.getByText('Xác nhận điều chỉnh');
    await user.click(submitBtn);

    expect(screen.getByText('Số lượng phải là số nguyên ≥ 0')).toBeInTheDocument();
    expect(mockOnSubmit).not.toHaveBeenCalled();
  });

  it('shows validation error if quantity does not change', async () => {
    const user = userEvent.setup();
    render(
      <AdjustmentModal
        show={true}
        product={mockProduct}
        onHide={mockOnHide}
        onSubmit={mockOnSubmit}
        warehouses={mockWarehouses}
      />
    );

    await waitFor(() => expect(productAPI.getWarehouseStocks).toHaveBeenCalled());

    // Initial qty is 100 (total), enter 100
    const qtyInput = screen.getByLabelText('Số lượng mới');
    await user.clear(qtyInput);
    await user.type(qtyInput, '100');

    // Enter valid reason
    const reasonInput = screen.getByLabelText('Lý do điều chỉnh');
    await user.type(reasonInput, 'Kiểm kê kho hàng tuần');

    const submitBtn = screen.getByText('Xác nhận điều chỉnh');
    await user.click(submitBtn);

    expect(screen.getByText('Số lượng không thay đổi — không cần điều chỉnh')).toBeInTheDocument();
    expect(mockOnSubmit).not.toHaveBeenCalled();
  });

  it('shows validation error if reason is too short', async () => {
    const user = userEvent.setup();
    render(
      <AdjustmentModal
        show={true}
        product={mockProduct}
        onHide={mockOnHide}
        onSubmit={mockOnSubmit}
        warehouses={mockWarehouses}
      />
    );

    await waitFor(() => expect(productAPI.getWarehouseStocks).toHaveBeenCalled());

    // Enter valid qty
    const qtyInput = screen.getByLabelText('Số lượng mới');
    await user.clear(qtyInput);
    await user.type(qtyInput, '120');

    // Enter short reason
    const reasonInput = screen.getByLabelText('Lý do điều chỉnh');
    await user.type(reasonInput, 'Lỗi');

    const submitBtn = screen.getByText('Xác nhận điều chỉnh');
    await user.click(submitBtn);

    expect(screen.getByText('Lý do điều chỉnh quá ngắn (tối thiểu 5 ký tự)')).toBeInTheDocument();
    expect(mockOnSubmit).not.toHaveBeenCalled();
  });

  it('submits successfully with valid data for total stock (no warehouse selected)', async () => {
    const user = userEvent.setup();
    mockOnSubmit.mockResolvedValueOnce();

    render(
      <AdjustmentModal
        show={true}
        product={mockProduct}
        onHide={mockOnHide}
        onSubmit={mockOnSubmit}
        warehouses={mockWarehouses}
      />
    );

    await waitFor(() => expect(productAPI.getWarehouseStocks).toHaveBeenCalled());

    // Enter valid qty
    const qtyInput = screen.getByLabelText('Số lượng mới');
    await user.clear(qtyInput);
    await user.type(qtyInput, '120'); // Delta: +20

    // Enter valid reason
    const reasonInput = screen.getByLabelText('Lý do điều chỉnh');
    await user.type(reasonInput, 'Kiểm kê định kỳ 20/05');

    const submitBtn = screen.getByText('Xác nhận điều chỉnh');
    await user.click(submitBtn);

    expect(mockOnSubmit).toHaveBeenCalledWith({
      productId: 10,
      quantity: 120,
      reason: 'Kiểm kê định kỳ 20/05',
      warehouseId: undefined, // Total
      baseQty: 100,
      whName: 'tổng kho'
    });

    await waitFor(() => expect(mockOnHide).toHaveBeenCalled());
  });

  it('submits successfully for specific warehouse', async () => {
    const user = userEvent.setup();
    mockOnSubmit.mockResolvedValueOnce();

    render(
      <AdjustmentModal
        show={true}
        product={mockProduct}
        onHide={mockOnHide}
        onSubmit={mockOnSubmit}
        warehouses={mockWarehouses}
      />
    );

    await waitFor(() => expect(productAPI.getWarehouseStocks).toHaveBeenCalled());

    // Select warehouse 1
    const whSelect = screen.getByLabelText('Kho cần điều chỉnh');
    await user.selectOptions(whSelect, '1');

    // Input qty for warehouse 1 (base is 80)
    const qtyInput = screen.getByLabelText('Số lượng mới');
    await user.clear(qtyInput);
    await user.type(qtyInput, '75'); // Delta: -5

    // Enter valid reason
    const reasonInput = screen.getByLabelText('Lý do điều chỉnh');
    await user.type(reasonInput, 'Hư hỏng lúc vận chuyển');

    const submitBtn = screen.getByText('Xác nhận điều chỉnh');
    await user.click(submitBtn);

    expect(mockOnSubmit).toHaveBeenCalledWith({
      productId: 10,
      quantity: 75,
      reason: 'Hư hỏng lúc vận chuyển',
      warehouseId: 1,
      baseQty: 80,
      whName: 'Kho Trung Tâm'
    });
  });

  it('displays API error when submission fails', async () => {
    const user = userEvent.setup();
    mockOnSubmit.mockRejectedValueOnce({ response: { data: { message: 'Lỗi server' } } });

    render(
      <AdjustmentModal
        show={true}
        product={mockProduct}
        onHide={mockOnHide}
        onSubmit={mockOnSubmit}
        warehouses={mockWarehouses}
      />
    );

    await waitFor(() => expect(productAPI.getWarehouseStocks).toHaveBeenCalled());

    // Enter valid qty and reason
    const qtyInput = screen.getByLabelText('Số lượng mới');
    await user.clear(qtyInput);
    await user.type(qtyInput, '150');

    const reasonInput = screen.getByLabelText('Lý do điều chỉnh');
    await user.type(reasonInput, 'Nhập bù sai số');

    const submitBtn = screen.getByText('Xác nhận điều chỉnh');
    await user.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText('Lỗi server')).toBeInTheDocument();
    });
    expect(mockOnHide).not.toHaveBeenCalled();
  });
});
