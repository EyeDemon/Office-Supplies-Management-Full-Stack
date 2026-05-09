import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import EmptyState from './EmptyState';

describe('EmptyState Component', () => {
  it('should render default icon and message', () => {
    render(<EmptyState message="No data found" />);
    expect(screen.getByText('No data found')).toBeInTheDocument();
    // Default icon is '📭'
    expect(screen.getByText('📭')).toBeInTheDocument();
  });

  it('should render mapped icon', () => {
    render(<EmptyState icon="inventory" message="No inventory" />);
    // mapped icon for inventory is '📦'
    expect(screen.getByText('📦')).toBeInTheDocument();
  });

  it('should render custom emoji if not mapped', () => {
    render(<EmptyState icon="🔥" message="Hot!" />);
    expect(screen.getByText('🔥')).toBeInTheDocument();
  });

  it('should render sub-text', () => {
    render(<EmptyState message="Main" sub="Sub description" />);
    expect(screen.getByText('Sub description')).toBeInTheDocument();
  });

  it('should render CTA button and handle clicks', async () => {
    const onCtaMock = vi.fn();
    render(<EmptyState message="Empty" cta="Create New" onCta={onCtaMock} />);
    
    const button = screen.getByRole('button', { name: 'Create New' });
    expect(button).toBeInTheDocument();
    expect(button).toHaveClass('btn-primary');

    const user = userEvent.setup();
    await user.click(button);

    expect(onCtaMock).toHaveBeenCalledTimes(1);
  });
});
