import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthProvider, useAuth } from './AuthContext';
import { authAPI } from '../services/api';

// Mock authAPI
vi.mock('../services/api', () => ({
  authAPI: {
    me: vi.fn(),
    logout: vi.fn(),
  },
  setCsrfToken: vi.fn(),
  clearCsrfToken: vi.fn(),
}));

const TestComponent = () => {
  const { user, loading, displayHint } = useAuth();
  
  if (loading) return <div>Loading...</div>;
  
  return (
    <div>
      <div data-testid="user-role">{user ? user.role : 'GUEST'}</div>
      <div data-testid="display-name">{displayHint ? displayHint.fullName : 'No Hint'}</div>
    </div>
  );
};

describe('AuthContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
  });

  it('should start with loading state and resolve to GUEST if no display hint', async () => {
    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );

    // Because there is no localStorage DISPLAY_KEY, it should resolve immediately
    expect(screen.getByTestId('user-role')).toHaveTextContent('GUEST');
    expect(screen.getByTestId('display-name')).toHaveTextContent('No Hint');
  });

  it('should call authAPI.me() if display hint exists', async () => {
    // Setup local storage
    localStorage.setItem('qlvpp_display', JSON.stringify({ username: 'admin', fullName: 'Admin User' }));
    
    // Mock successful response
    authAPI.me.mockResolvedValueOnce({
      data: { user: { id: 1, username: 'admin', role: 'ADMIN', fullName: 'Admin User' } }
    });

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );

    expect(screen.getByText('Loading...')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByTestId('user-role')).toHaveTextContent('ADMIN');
      expect(screen.getByTestId('display-name')).toHaveTextContent('Admin User');
    });

    expect(authAPI.me).toHaveBeenCalledTimes(1);
  });
});
