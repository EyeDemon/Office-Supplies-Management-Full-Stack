import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RequisitionCreateModal from './RequisitionCreateModal.jsx';
import { productAPI, requisitionAPI, warehouseAPI } from '@/services/api';

vi.mock('@/services/api', () => ({
  productAPI: {
    getAll: vi.fn(),
  },
  requisitionAPI: {
    getAll: vi.fn(),
    create: vi.fn(),
  },
  warehouseAPI: {
    getAllList: vi.fn(),
  }
}));

describe('RequisitionCreateModal Component', () => {
  const mockProducts = {
    data: {
      data: {
        items: [
          { id: 1, name: 'Bút Bi', sku: 'BB01', unit: 'CAI', stockQty: 100, reservedQty: 0, availableQty: 100, minStockQty: 10 },
          { id: 2, name: 'Giấy A4', sku: 'GA4', unit: 'RAM', stockQty: 50, reservedQty: 50, availableQty: 0, minStockQty: 5 },
        ]
      }
    }
  };

  const mockWarehouses = {
    data: {
      data: [
        { id: 1, name: 'Kho Trung Tâm' },
      ]
    }
  };

  const mockOnClose = vi.fn();
  const mockOnSuccess = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    productAPI.getAll.mockResolvedValue(mockProducts);
    requisitionAPI.getAll.mockResolvedValue({});
    warehouseAPI.getAllList.mockResolvedValue(mockWarehouses);
  });

  it('renders correctly and loads products/warehouses', async () => {
    render(<RequisitionCreateModal onClose={mockOnClose} onSuccess={mockOnSuccess} />);

    expect(screen.getByText('Tạo phiếu yêu cầu mới')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Bút Bi')).toBeInTheDocument();
      expect(screen.getByText('Giấy A4')).toBeInTheDocument();
      expect(screen.getByRole('combobox')).toHaveValue('1');
    });
  });

  it('disables Add button for out-of-stock items', async () => {
    render(<RequisitionCreateModal onClose={mockOnClose} onSuccess={mockOnSuccess} />);
    await waitFor(() => expect(screen.getByText('Giấy A4')).toBeInTheDocument());

    const outOfStockBtn = screen.getByTitle('Hết hàng (hết khả dụng)');
    expect(outOfStockBtn).toBeDisabled();
  });

  it('adds item to cart and updates cart summary', async () => {
    const user = userEvent.setup();
    render(<RequisitionCreateModal onClose={mockOnClose} onSuccess={mockOnSuccess} />);
    await waitFor(() => {
      expect(screen.getByText('Bút Bi')).toBeInTheDocument();
      expect(screen.getByRole('combobox')).toHaveValue('1');
    });

    const addBtn = screen.getByTitle('Thêm vào giỏ');
    await user.click(addBtn);

    expect(screen.getByText('Giỏ hàng')).toBeInTheDocument();
    const badge = screen.getByText('1', { selector: 'span.badge' });
    expect(badge).toBeInTheDocument();

    const qtyInput = screen.getByRole('spinbutton');
    expect(qtyInput).toHaveValue(1);
  });

  it('removes item from cart', async () => {
    const user = userEvent.setup();
    render(<RequisitionCreateModal onClose={mockOnClose} onSuccess={mockOnSuccess} />);
    await waitFor(() => {
      expect(screen.getByText('Bút Bi')).toBeInTheDocument();
      expect(screen.getByRole('combobox')).toHaveValue('1');
    });

    const addBtn = screen.getByTitle('Thêm vào giỏ');
    await user.click(addBtn);

    const removeBtns = screen.getAllByRole('button').filter(b => b.classList.contains('text-danger'));
    await user.click(removeBtns[0]);

    expect(screen.getByText('Chưa chọn mặt hàng nào')).toBeInTheDocument();
  });
});
