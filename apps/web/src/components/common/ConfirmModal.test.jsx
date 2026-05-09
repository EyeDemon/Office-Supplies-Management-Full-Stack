import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { useConfirm } from './ConfirmModal';

const TestComponent = () => {
  const { confirm, ConfirmDialog } = useConfirm();
  const [result, setResult] = React.useState(null);

  const handleClick = async () => {
    const res = await confirm({
      title: 'Xóa mục này?',
      message: 'Hành động không thể hoàn tác.',
      variant: 'danger',
    });
    setResult(res ? 'YES' : 'NO');
  };

  return (
    <div>
      <button onClick={handleClick}>Delete</button>
      <div data-testid="result">{result}</div>
      <ConfirmDialog />
    </div>
  );
};

describe('useConfirm Hook & ConfirmModal', () => {
  it('should not show modal initially', () => {
    render(<TestComponent />);
    expect(screen.queryByText('Xóa mục này?')).not.toBeInTheDocument();
  });

  it('should show modal when confirm is called and return false when cancelled', async () => {
    render(<TestComponent />);
    const user = userEvent.setup();
    
    await user.click(screen.getByText('Delete'));
    
    // Modal should be visible
    expect(screen.getByText('Xóa mục này?')).toBeInTheDocument();
    expect(screen.getByText('Hành động không thể hoàn tác.')).toBeInTheDocument();

    // Click cancel
    await user.click(screen.getByText('Huỷ'));

    await waitFor(() => {
      expect(screen.queryByText('Xóa mục này?')).not.toBeInTheDocument();
      expect(screen.getByTestId('result')).toHaveTextContent('NO');
    });
  });

  it('should show modal and return true when confirmed', async () => {
    render(<TestComponent />);
    const user = userEvent.setup();
    
    await user.click(screen.getByText('Delete'));
    
    // Modal should be visible
    expect(screen.getByText('Xóa mục này?')).toBeInTheDocument();

    // Click confirm
    await user.click(screen.getByText('Xác nhận'));

    await waitFor(() => {
      expect(screen.queryByText('Xóa mục này?')).not.toBeInTheDocument();
      expect(screen.getByTestId('result')).toHaveTextContent('YES');
    });
  });
});
