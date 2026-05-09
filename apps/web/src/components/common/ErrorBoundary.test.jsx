import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import ErrorBoundary from './ErrorBoundary';

const ProblemChild = ({ shouldThrow }) => {
  if (shouldThrow) {
    throw new Error('Test Error from Child');
  }
  return <div>Everything is fine</div>;
};

describe('ErrorBoundary Component', () => {
  const originalConsoleError = console.error;

  beforeEach(() => {
    // Suppress console.error during the test because ErrorBoundary tests intentionally throw errors
    console.error = vi.fn();
  });

  afterEach(() => {
    console.error = originalConsoleError;
  });

  it('should render children normally if no error occurs', () => {
    render(
      <ErrorBoundary>
        <ProblemChild shouldThrow={false} />
      </ErrorBoundary>
    );
    expect(screen.getByText('Everything is fine')).toBeInTheDocument();
  });

  it('should catch error and render fallback UI', () => {
    render(
      <ErrorBoundary>
        <ProblemChild shouldThrow={true} />
      </ErrorBoundary>
    );
    
    // Check fallback UI
    expect(screen.getByText('Ứng dụng gặp lỗi không mong muốn')).toBeInTheDocument();
    expect(screen.getByText(/Đã xảy ra lỗi trong giao diện/)).toBeInTheDocument();
    
    // Check buttons
    expect(screen.getByRole('button', { name: /Tải lại trang/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Thử lại/i })).toBeInTheDocument();
    
    // The error itself is logged to the console (mocked)
    expect(console.error).toHaveBeenCalled();
  });

  it('should reset error state when "Thử lại" button is clicked', async () => {
    // Need a component that throws on first render, but not on second
    let shouldThrow = true;
    const DynamicChild = () => {
      if (shouldThrow) {
        throw new Error('Temporary Error');
      }
      return <div>Recovered!</div>;
    };

    render(
      <ErrorBoundary>
        <DynamicChild />
      </ErrorBoundary>
    );

    // It should throw on first render
    expect(screen.getByText('Ứng dụng gặp lỗi không mong muốn')).toBeInTheDocument();

    // Now fix the child
    shouldThrow = false;
    
    const user = userEvent.setup();
    // Click 'Thử lại'
    await user.click(screen.getByRole('button', { name: /Thử lại/i }));

    // It should recover
    expect(screen.getByText('Recovered!')).toBeInTheDocument();
  });
});
