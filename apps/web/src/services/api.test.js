import { describe, it, expect, beforeEach, vi } from 'vitest';
import api from './api';

// Mock getCsrfToken since it relies on actual network
vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    default: actual.default,
  };
});

describe('API Service Interceptors', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should add Idempotency-Key to mutating requests (POST)', async () => {
    // We can test the request interceptor directly by looking at the handlers
    const interceptor = api.interceptors.request.handlers[0].fulfilled;
    const config = { method: 'post', headers: {} };
    
    // We mock crypto.randomUUID to return a fixed string
    const originalCrypto = global.crypto;
    global.crypto = { randomUUID: () => 'mock-uuid-123' };
    
    const newConfig = await interceptor(config);
    expect(newConfig.headers['Idempotency-Key']).toBe('mock-uuid-123');
    
    // Restore crypto
    global.crypto = originalCrypto;
  });

  it('should NOT add Idempotency-Key to non-mutating requests (GET)', async () => {
    const interceptor = api.interceptors.request.handlers[0].fulfilled;
    const config = { method: 'get', headers: {} };
    
    const newConfig = await interceptor(config);
    expect(newConfig.headers['Idempotency-Key']).toBeUndefined();
  });
});
