import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import POFormModal from './POFormModal.jsx';
import { purchaseAPI, productAPI, supplierAPI, warehouseAPI } from '@/services/api';

vi.mock('@/services/api', () => ({
  purchaseAPI: {
    getAllPR: vi.fn(),
    getPRById: vi.fn(),
    createPO: vi.fn(),
  },
  productAPI: {
    getAll: vi.fn(),
  },
  supplierAPI: {
    getAllList: vi.fn(),
  },
  warehouseAPI: {
    getAllList: vi.fn(),
  }
}));

describe('POFormModal Component', () => {
  const mockSuppliers = { data: { data: [{ id: 1, name: 'Nhà cung cấp A' }] } };
  const mockPRs = { data: { data: { items: [{ id: 10, pr_code: 'PR-001', reason: 'Nhập hàng' }] } } };
  const mockProducts = { data: { data: { items: [{ id: 100, name: 'Sản phẩm X', sku: 'SPX', stockQty: 50 }] } } };
  const mockWarehouses = { data: { data: [{ id: 5, code: 'K01', name: 'Kho Trung Tâm' }] } };

  const mockOnClose = vi.fn();
  const mockOnSaved = vi.fn();
  const mockSetAlert = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    supplierAPI.getAllList.mockResolvedValue(mockSuppliers);
    purchaseAPI.getAllPR.mockResolvedValue(mockPRs);
    productAPI.getAll.mockResolvedValue(mockProducts);
    warehouseAPI.getAllList.mockResolvedValue(mockWarehouses);
    purchaseAPI.createPO.mockResolvedValue({ data: { message: 'Tạo PO thành công' } });
  });

  it('renders correctly and loads dependencies', async () => {
    render(<POFormModal onClose={mockOnClose} onSaved={mockOnSaved} setAlert={mockSetAlert} />);
    
    expect(screen.getByText('Tạo đơn mua hàng (PO)')).toBeInTheDocument();
    
    await waitFor(() => {
      expect(screen.getByText('Nhà cung cấp A')).toBeInTheDocument();
      expect(screen.getByText('K01 — Kho Trung Tâm')).toBeInTheDocument();
    });
  });

  it('shows error if supplier not selected', async () => {
    const user = userEvent.setup();
    render(<POFormModal onClose={mockOnClose} onSaved={mockOnSaved} setAlert={mockSetAlert} />);
    
    const submitBtn = screen.getByRole('button', { name: 'Tạo đơn mua hàng' });
    await user.click(submitBtn);

    expect(mockSetAlert).toHaveBeenCalledWith('error', 'Chọn nhà cung cấp');
  });

  it('shows error if no items added', async () => {
    const user = userEvent.setup();
    render(<POFormModal onClose={mockOnClose} onSaved={mockOnSaved} setAlert={mockSetAlert} />);
    
    await waitFor(() => expect(screen.getByText('Nhà cung cấp A')).toBeInTheDocument());

    // Select supplier
    const supplierSelect = screen.getByRole('combobox', { name: /Nhà cung cấp/i });
    await user.selectOptions(supplierSelect, '1');

    const submitBtn = screen.getByRole('button', { name: 'Tạo đơn mua hàng' });
    await user.click(submitBtn);

    expect(mockSetAlert).toHaveBeenCalledWith('error', 'Thêm ít nhất 1 sản phẩm');
  });

  it('loads PR items when PR is selected', async () => {
    const user = userEvent.setup();
    purchaseAPI.getPRById.mockResolvedValue({
      data: { data: { items: [{ product_id: 100, product_name: 'Sản phẩm X', sku: 'SPX', quantity: 10, stock_quantity: 50 }] } }
    });

    render(<POFormModal onClose={mockOnClose} onSaved={mockOnSaved} setAlert={mockSetAlert} />);
    
    await waitFor(() => expect(screen.getByText('PR-001 — Nhập hàng')).toBeInTheDocument());

    const prSelect = screen.getAllByRole('combobox')[1];
    await user.selectOptions(prSelect, '10');

    await waitFor(() => {
      expect(purchaseAPI.getPRById).toHaveBeenCalledWith(10);
      expect(screen.getByText('Sản phẩm X')).toBeInTheDocument();
    });
    
    // Check if quantity is populated
    const qtyInput = screen.getAllByRole('spinbutton')[0]; // First spinbutton is qty
    expect(qtyInput).toHaveValue(10);
  });

  it('adds product from search and submits successfully', async () => {
    const user = userEvent.setup();
    render(<POFormModal onClose={mockOnClose} onSaved={mockOnSaved} setAlert={mockSetAlert} />);
    
    await waitFor(() => expect(screen.getByText('Nhà cung cấp A')).toBeInTheDocument());

    // Select supplier
    const supplierSelect = screen.getByRole('combobox', { name: /Nhà cung cấp/i });
    await user.selectOptions(supplierSelect, '1');

    // Search and add product
    const searchInput = screen.getByPlaceholderText('Tìm thêm sản phẩm...');
    await user.type(searchInput, 'Sản phẩm X');
    
    await waitFor(() => {
      expect(screen.getByText('Sản phẩm X')).toBeInTheDocument();
    });

    const prodOption = screen.getByText('Sản phẩm X');
    fireEvent.mouseDown(prodOption);

    // Enter Unit Price
    // Get all spinbuttons. There's Qty and UnitPrice per item.
    // Qty is first, UnitPrice is second.
    const inputs = screen.getAllByRole('spinbutton');
    const priceInput = inputs[1]; 
    
    await user.clear(priceInput);
    await user.type(priceInput, '15000');

    // Submit
    const submitBtn = screen.getByRole('button', { name: 'Tạo đơn mua hàng' });
    await user.click(submitBtn);

    expect(purchaseAPI.createPO).toHaveBeenCalledWith({
      supplierId: 1,
      prId: null,
      deliveryDate: null,
      note: '',
      warehouseId: null,
      items: [{ productId: 100, quantity: 1, unitPrice: 15000, note: '' }]
    });

    await waitFor(() => {
      expect(mockSetAlert).toHaveBeenCalledWith('success', 'Tạo PO thành công');
      expect(mockOnSaved).toHaveBeenCalled();
    });
  });
});
