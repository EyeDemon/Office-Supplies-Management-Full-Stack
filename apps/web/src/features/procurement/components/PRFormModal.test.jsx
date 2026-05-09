import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PRFormModal, SuggestModal } from './PRFormModal.jsx';
import { purchaseAPI, productAPI } from '@/services/api';

vi.mock('@/services/api', () => ({
  purchaseAPI: {
    getSuggest: vi.fn(),
    createPR: vi.fn(),
  },
  productAPI: {
    getAll: vi.fn(),
  }
}));

describe('PRFormModal Component', () => {
  const mockProducts = {
    data: {
      data: {
        items: [
          { id: 10, name: 'Sản phẩm A', sku: 'SPA', stockQty: 10 },
          { id: 20, name: 'Sản phẩm B', sku: 'SPB', stockQty: 5 },
        ]
      }
    }
  };

  const mockOnClose = vi.fn();
  const mockOnSaved = vi.fn();
  const mockSetAlert = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    productAPI.getAll.mockResolvedValue(mockProducts);
    purchaseAPI.createPR.mockResolvedValue({ data: { message: 'Thành công' } });
  });

  it('renders correctly and loads products', async () => {
    render(<PRFormModal onClose={mockOnClose} onSaved={mockOnSaved} setAlert={mockSetAlert} />);
    expect(screen.getByText('Tạo yêu cầu mua hàng (PR)')).toBeInTheDocument();
    
    // Wait for products to load
    await waitFor(() => {
      expect(productAPI.getAll).toHaveBeenCalled();
    });
  });

  it('shows error if reason is empty', async () => {
    const user = userEvent.setup();
    render(<PRFormModal onClose={mockOnClose} onSaved={mockOnSaved} setAlert={mockSetAlert} />);
    
    const submitBtn = screen.getByRole('button', { name: 'Tạo yêu cầu' });
    await user.click(submitBtn);

    expect(mockSetAlert).toHaveBeenCalledWith('error', 'Nhập lý do mua hàng');
    expect(purchaseAPI.createPR).not.toHaveBeenCalled();
  });

  it('shows error if no items selected', async () => {
    const user = userEvent.setup();
    render(<PRFormModal onClose={mockOnClose} onSaved={mockOnSaved} setAlert={mockSetAlert} />);
    
    // Type reason
    const reasonInput = screen.getByPlaceholderText(/VD: Bổ sung/i);
    await user.type(reasonInput, 'Nhập hàng tháng 5');

    const submitBtn = screen.getByRole('button', { name: 'Tạo yêu cầu' });
    await user.click(submitBtn);

    expect(mockSetAlert).toHaveBeenCalledWith('error', 'Thêm ít nhất 1 sản phẩm');
    expect(purchaseAPI.createPR).not.toHaveBeenCalled();
  });

  it('adds product from search and submits successfully', async () => {
    const user = userEvent.setup();
    render(<PRFormModal onClose={mockOnClose} onSaved={mockOnSaved} setAlert={mockSetAlert} />);
    
    // Wait for API
    await waitFor(() => expect(productAPI.getAll).toHaveBeenCalled());

    // Type reason
    const reasonInput = screen.getByPlaceholderText(/VD: Bổ sung/i);
    await user.type(reasonInput, 'Nhập hàng tháng 5');

    // Search and add product
    const searchInput = screen.getByPlaceholderText('Tìm sản phẩm để thêm...');
    await user.type(searchInput, 'Sản phẩm A');
    
    await waitFor(() => {
      expect(screen.getByText('Sản phẩm A')).toBeInTheDocument();
    });

    const prodOption = screen.getByText('Sản phẩm A');
    fireEvent.mouseDown(prodOption);

    // Verify it's added
    expect(screen.getByText('SPA')).toBeInTheDocument();

    // Submit
    const submitBtn = screen.getByRole('button', { name: 'Tạo yêu cầu' });
    await user.click(submitBtn);

    expect(purchaseAPI.createPR).toHaveBeenCalledWith({
      reason: 'Nhập hàng tháng 5',
      priority: 'MEDIUM',
      note: '',
      items: [{ productId: 10, quantity: 1, note: '' }]
    });

    await waitFor(() => {
      expect(mockSetAlert).toHaveBeenCalledWith('success', 'Thành công');
      expect(mockOnSaved).toHaveBeenCalled();
    });
  });

  it('removes item from list', async () => {
    const user = userEvent.setup();
    const initialItems = [{ productId: 10, quantity: 5, note: '', _name: 'Sản phẩm A', _sku: 'SPA', _stock: 10 }];
    
    render(<PRFormModal onClose={mockOnClose} onSaved={mockOnSaved} setAlert={mockSetAlert} initialItems={initialItems} />);
    
    // Wait
    await waitFor(() => expect(screen.getByText('SPA')).toBeInTheDocument());

    const removeBtn = screen.getByRole('button', { name: '✕' });
    await user.click(removeBtn);

    expect(screen.queryByText('SPA')).not.toBeInTheDocument();
    expect(screen.getByText('Tìm và thêm sản phẩm cần mua bên trên')).toBeInTheDocument();
  });
});

describe('SuggestModal Component', () => {
  const mockSuggests = {
    data: {
      data: [
        { id: 1, name: 'Sản phẩm A', sku: 'SPA', category_name: 'Cat', stock_quantity: 0, min_stock_level: 10, suggested_qty: 20 },
      ]
    }
  };

  const mockOnClose = vi.fn();
  const mockOnCreated = vi.fn();
  const mockSetAlert = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    purchaseAPI.getSuggest.mockResolvedValue(mockSuggests);
    purchaseAPI.createPR.mockResolvedValue({ data: { message: 'Tạo thành công' } });
  });

  it('loads suggestions and creates PR', async () => {
    const user = userEvent.setup();
    render(<SuggestModal onClose={mockOnClose} onCreated={mockOnCreated} setAlert={mockSetAlert} />);
    
    await waitFor(() => {
      expect(screen.getByText('Sản phẩm A')).toBeInTheDocument();
    });

    const createBtn = screen.getByRole('button', { name: /Tạo PR cho/i });
    await user.click(createBtn);

    expect(purchaseAPI.createPR).toHaveBeenCalledWith({
      reason: 'Bổ sung tồn kho — 1 sản phẩm tồn thấp',
      priority: 'HIGH',
      items: [{ productId: 1, quantity: 20 }]
    });

    await waitFor(() => {
      expect(mockSetAlert).toHaveBeenCalledWith('success', 'Tạo thành công');
      expect(mockOnCreated).toHaveBeenCalled();
    });
  });

  it('shows message when no products are low in stock', async () => {
    purchaseAPI.getSuggest.mockResolvedValue({ data: { data: [] } });
    render(<SuggestModal onClose={mockOnClose} onCreated={mockOnCreated} setAlert={mockSetAlert} />);
    
    await waitFor(() => {
      expect(screen.getByText('✅ Tất cả sản phẩm đang đủ tồn kho')).toBeInTheDocument();
    });
  });
});
