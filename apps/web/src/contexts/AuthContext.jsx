import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { authAPI, setCsrfToken, clearCsrfToken } from '../services/api';
import { AUTH_DISPLAY_KEY } from '../shared/constants';


const AuthContext = createContext(null);

/**
 * AuthContext v25
 * [FE-08] Security: localStorage chỉ lưu display info (username, fullName)
 *   - role, id, email KHÔNG lưu localStorage → XSS không đọc được sensitive data
 *   - Khi app khởi động: verify qua /auth/me trước khi render nội dung bảo vệ
 *   - Nếu session hết hạn → /auth/me thất bại → logout tự động
 */

const DISPLAY_KEY = AUTH_DISPLAY_KEY; // Only non-sensitive display info

const getDisplayHint = () => {
  try { return JSON.parse(localStorage.getItem(DISPLAY_KEY)); } catch { return null; }
};
const saveDisplayHint = (user) => {
  if (!user) { localStorage.removeItem(DISPLAY_KEY); return; }
  localStorage.setItem(DISPLAY_KEY, JSON.stringify({
    username: user.username,
    fullName: user.fullName,
  }));
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);          // Full user — từ server
  const [displayHint, setHint] = useState(getDisplayHint); // Display name — từ localStorage
  const [loading, setLoading] = useState(true);
  const lastVerifyRef = useRef(0);

  useEffect(() => {
    const verify = async () => {
      if (!getDisplayHint()) { setLoading(false); return; }

      const now = Date.now();
      const lastVerified = Number(sessionStorage.getItem('session_verified') || 0);
      const recentlyVerified = now - Math.max(lastVerified, lastVerifyRef.current) < 5000;
      if (recentlyVerified) { setLoading(false); return; }

      try {
        const res = await authAPI.me();
        const fresh = res.data?.user;
        if (!fresh) throw new Error('no user');

        const fullUser = {
          id: fresh.id,
          username: fresh.username,
          role: fresh.role,       // ← role luôn từ server
          fullName: fresh.fullName,
          email: fresh.email,
          phoneNumber: fresh.phoneNumber || null,
          department: fresh.department || null,
        };
        setUser(fullUser);
        setHint({ username: fullUser.username, fullName: fullUser.fullName });
        saveDisplayHint(fullUser);
        sessionStorage.setItem('session_verified', String(now));
        lastVerifyRef.current = now;
      } catch {
        saveDisplayHint(null);
        sessionStorage.removeItem('session_verified');
        setUser(null);
        setHint(null);
      } finally {
        setLoading(false);
      }
    };
    verify();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = useCallback((userData, csrfToken) => {
    if (csrfToken) setCsrfToken(csrfToken);
    setUser(userData);
    setHint({ username: userData.username, fullName: userData.fullName });
    saveDisplayHint(userData);
    const now = Date.now();
    sessionStorage.setItem('session_verified', String(now));
    lastVerifyRef.current = now;
  }, []);

  const logout = useCallback(async () => {
    try { await authAPI.logout(); } catch { }
    clearCsrfToken();
    saveDisplayHint(null);
    sessionStorage.removeItem('session_verified');
    setUser(null);
    setHint(null);
  }, []);

  const isAdmin = user?.role === 'ADMIN';
  const isManager = user?.role === 'MANAGER';
  const isWarehouse = user?.role === 'WAREHOUSE';
  const isManagerOrAdmin = isAdmin || isManager;
  const isWarehouseOrAdmin = isAdmin || isManager || isWarehouse;

  return (
    <AuthContext.Provider value={{
      user, displayHint,
      login, logout, loading,
      isAdmin, isManager, isWarehouse,
      isManagerOrAdmin, isWarehouseOrAdmin,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth phải dùng trong AuthProvider');
  return ctx;
};