import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { useToast, ToastContainer } from './ToastNotification';

const TestComponent = () => {
  const { toasts, showToast, showUndoToast, showErrorToast, dismiss } = useToast();

  return (
    <div>
      <button onClick={() => showToast('Success msg')}>Show Success</button>
      <button onClick={() => showErrorToast('Error msg')}>Show Error</button>
      <button onClick={() => showUndoToast('Undo msg', async () => new Promise(res => setTimeout(res, 100)))}>Show Undo</button>
      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </div>
  );
};

describe('ToastNotification', () => {
  it('should show success toast', async () => {
    render(<TestComponent />);
    const user = userEvent.setup();
    
    await user.click(screen.getByText('Show Success'));
    
    expect(screen.getByText('Success msg')).toBeInTheDocument();
    expect(screen.getByText('✅ Thành công')).toBeInTheDocument();
  });

  it('should show error toast', async () => {
    render(<TestComponent />);
    const user = userEvent.setup();
    
    await user.click(screen.getByText('Show Error'));
    
    expect(screen.getByText('Error msg')).toBeInTheDocument();
    expect(screen.getByText('❌ Lỗi')).toBeInTheDocument();
  });

  it('should show undo toast and handle undo click', async () => {
    render(<TestComponent />);
    const user = userEvent.setup();
    
    await user.click(screen.getByText('Show Undo'));
    
    expect(screen.getByText('Undo msg')).toBeInTheDocument();
    
    const undoBtn = screen.getByRole('button', { name: 'Hoàn tác' });
    expect(undoBtn).toBeInTheDocument();

    await user.click(undoBtn);
    
    // Should show loading state
    expect(undoBtn).toHaveTextContent('...');
    expect(undoBtn).toBeDisabled();

    // After async undo completes, toast should be dismissed
    await waitFor(() => {
      expect(screen.queryByText('Undo msg')).not.toBeInTheDocument();
    });
  });
});
