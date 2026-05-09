import React from 'react';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import StocktakingCreateModal from './StocktakingCreateModal';

describe('StocktakingCreateModal Component', () => {
  it('should not render when show is false', () => {
    render(<StocktakingCreateModal show={false} onHide={vi.fn()} onCreate={vi.fn()} />);
    expect(screen.queryByText('Tạo đợt kiểm kê mới')).not.toBeInTheDocument();
  });

  it('should render modal content when show is true', () => {
    render(<StocktakingCreateModal show={true} onHide={vi.fn()} onCreate={vi.fn()} />);
    expect(screen.getByText('Tạo đợt kiểm kê mới')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Lý do kiểm kê, mô tả đợt KK...')).toBeInTheDocument();
  });

  it('should call onHide when clicking Cancel', async () => {
    const onHideMock = vi.fn();
    render(<StocktakingCreateModal show={true} onHide={onHideMock} onCreate={vi.fn()} />);
    
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Huỷ' }));
    
    expect(onHideMock).toHaveBeenCalled();
  });

  it('should call onCreate with note when clicking Create', async () => {
    const onCreateMock = vi.fn().mockResolvedValue();
    render(<StocktakingCreateModal show={true} onHide={vi.fn()} onCreate={onCreateMock} />);
    
    const user = userEvent.setup();
    const textarea = screen.getByPlaceholderText('Lý do kiểm kê, mô tả đợt KK...');
    
    await user.type(textarea, 'Kiểm kê cuối tháng 5');
    await user.click(screen.getByRole('button', { name: 'Tạo đợt kiểm kê' }));
    
    expect(onCreateMock).toHaveBeenCalledWith({ note: 'Kiểm kê cuối tháng 5' });
  });

  it('should show loading state and disable button while creating', async () => {
    let resolveCreate;
    const createPromise = new Promise(resolve => { resolveCreate = resolve; });
    const onCreateMock = vi.fn().mockReturnValue(createPromise);
    
    render(<StocktakingCreateModal show={true} onHide={vi.fn()} onCreate={onCreateMock} />);
    
    const user = userEvent.setup();
    const createBtn = screen.getByRole('button', { name: 'Tạo đợt kiểm kê' });
    
    await user.click(createBtn);
    
    // Should change to loading state
    expect(screen.getByRole('button', { name: /Đang tạo.../i })).toBeDisabled();
    
    // Resolve the promise
    await act(async () => {
      resolveCreate();
    });
    
    // Should revert back to normal state
    expect(screen.getByRole('button', { name: 'Tạo đợt kiểm kê' })).not.toBeDisabled();
  });
});
