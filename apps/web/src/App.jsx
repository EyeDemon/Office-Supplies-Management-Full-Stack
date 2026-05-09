// App.jsx — v4 (Migration: dùng app/routes.jsx → features/ (Clean Architecture FE))
//
// v4 changes:
//   - Xóa 29 direct imports từ ./pages/
//   - Import tất cả lazy components từ ./app/routes.jsx (feature-based)
//   - Dashboard, UserProfile, NotFound vẫn trong pages/ (chưa có features/ tương ứng)
//
// v3 giữ lại:
//   React.lazy + Suspense skeleton (UX-03)
//   !user logic để chọn layout (không AUTH_PATHS.some())
//   Graceful redirect / → /dashboard khi đã login

import React, { Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext.jsx';
import ProtectedRoute  from './components/auth/ProtectedRoute.jsx';
import Sidebar         from './components/common/Sidebar.jsx';
import TopBar          from './components/common/TopBar.jsx';
import ErrorBoundary   from './components/common/ErrorBoundary.jsx';
import { SkeletonRow } from './components/common/SkeletonRow.jsx';
import './App.css';

// ─── [UX-03] LAZY IMPORTS — từ app/routes.jsx (feature-based) ───────────────
import {
  // Auth
  Login, Register, ForgotPassword, ResetPassword,
  // Inventory
  ImportOrders, ExportOrders, StockTransfer, StockAdjustment, Stocktaking, StockLedger,
  // Products
  Products, Categories, UnitManagement, LotManagement,
  // Procurement
  Purchases, Requisitions, RequisitionApproval,
  // Suppliers
  Suppliers, Returns,
  // Warehouses
  Warehouses, WarehouseLocations, UserWarehouseAccess,
  // Reports
  Reports,
  InventoryIntelligence,
  // Admin
  UserManagement, Departments, AuditLog, Notifications,
  // Misc (còn trong pages/)
  Dashboard, UserProfile, NotFound, SystemStatus,
} from './app/routes.jsx';

// ─── SUSPENSE FALLBACKS ───────────────────────────────────────────────────────
function PageSkeleton() {
  return (
    <div style={{ padding: '1.5rem' }}>
      <div style={{
        height: 24, width: 200, borderRadius: 6, marginBottom: '1.25rem',
        background: 'linear-gradient(90deg,#e8e8e8 25%,#f4f4f4 50%,#e8e8e8 75%)',
        backgroundSize: '200px 100%',
        animation: 'skeleton-shimmer 1.5s ease-in-out infinite',
      }} />
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <tbody>{[1,2,3,4,5].map(i => <SkeletonRow key={i} cols={5} />)}</tbody>
      </table>
    </div>
  );
}

function AuthSpinner() {
  return (
    <div className="loading-page">
      <div className="spinner-border" role="status">
        <span className="visually-hidden">Loading...</span>
      </div>
    </div>
  );
}

// ─── APP SHELL ────────────────────────────────────────────────────────────────
const AppShell = () => {
  const { user, loading } = useAuth();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = React.useState(false);

  React.useEffect(() => { setSidebarOpen(false); }, [location.pathname]);

  if (loading) {
    return (
      <div className="loading-page">
        <div className="spinner-border" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <ErrorBoundary>
        <Suspense fallback={<AuthSpinner />}>
          <Routes>
            <Route path="/login"           element={<Login />} />
            <Route path="/register"        element={<Register />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password"  element={<ResetPassword />} />
            <Route path="*"                element={<Login />} />
          </Routes>
        </Suspense>
      </ErrorBoundary>
    );
  }

  return (
    <div className="app-wrapper">
      <div className={`sidebar-overlay ${sidebarOpen ? 'mobile-open' : ''}`} onClick={() => setSidebarOpen(false)} />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="app-main">
        <TopBar path={location.pathname} onMenuClick={() => setSidebarOpen(o => !o)} />
        <div className="app-content">
          <ErrorBoundary>
            <Suspense fallback={<PageSkeleton />}>
              <Routes>
                <Route path="/"      element={<Navigate to="/dashboard" replace />} />
                <Route path="/login" element={<Navigate to="/dashboard" replace />} />

                <Route path="/dashboard"   element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
                <Route path="/profile"     element={<ProtectedRoute><UserProfile /></ProtectedRoute>} />
                <Route path="/users"       element={<ProtectedRoute requireAdmin><UserManagement /></ProtectedRoute>} />
                <Route path="/departments" element={<ProtectedRoute requireAdmin><Departments /></ProtectedRoute>} />
                <Route path="/products"    element={<ProtectedRoute><Products /></ProtectedRoute>} />
                <Route path="/categories"  element={<ProtectedRoute><Categories /></ProtectedRoute>} />
                <Route path="/reports"     element={<ProtectedRoute requireWarehouseOrAdmin><Reports /></ProtectedRoute>} />
                <Route path="/suppliers"   element={<ProtectedRoute requireManagerOrAdmin><Suppliers /></ProtectedRoute>} />
                <Route path="/orders"      element={<ProtectedRoute requireWarehouseOrAdmin><ImportOrders /></ProtectedRoute>} />
                <Route path="/requisitions"         element={<ProtectedRoute><Requisitions /></ProtectedRoute>} />
                <Route path="/requisition-approval" element={<ProtectedRoute requireManagerOrAdmin><RequisitionApproval /></ProtectedRoute>} />
                <Route path="/stocktaking"          element={<ProtectedRoute requireWarehouseOrAdmin><Stocktaking /></ProtectedRoute>} />
                <Route path="/export-orders"        element={<ProtectedRoute requireWarehouseOrAdmin><ExportOrders /></ProtectedRoute>} />
                <Route path="/transfers"            element={<ProtectedRoute requireWarehouseOrAdmin><StockTransfer /></ProtectedRoute>} />
                <Route path="/purchases"            element={<ProtectedRoute requireWarehouseOrAdmin><Purchases /></ProtectedRoute>} />
                <Route path="/returns"              element={<ProtectedRoute requireWarehouseOrAdmin><Returns /></ProtectedRoute>} />
                <Route path="/stock-adjustment"     element={<ProtectedRoute requireAdmin><StockAdjustment /></ProtectedRoute>} />
                <Route path="/warehouses"           element={<ProtectedRoute requireWarehouseOrAdmin><Warehouses /></ProtectedRoute>} />
                <Route path="/audit"                element={<ProtectedRoute requireAdmin><AuditLog /></ProtectedRoute>} />
                <Route path="/notifications"        element={<ProtectedRoute><Notifications /></ProtectedRoute>} />
                <Route path="/lots"                 element={<ProtectedRoute><LotManagement /></ProtectedRoute>} />
                <Route path="/units"                element={<ProtectedRoute requireWarehouseOrAdmin><UnitManagement /></ProtectedRoute>} />
                <Route path="/warehouse-locations"    element={<ProtectedRoute requireWarehouseOrAdmin><WarehouseLocations /></ProtectedRoute>} />
                <Route path="/user-warehouse-access" element={<ProtectedRoute requireAdmin><UserWarehouseAccess /></ProtectedRoute>} />
                <Route path="/stock-ledger"          element={<ProtectedRoute requireWarehouseOrAdmin><StockLedger /></ProtectedRoute>} />
                <Route path="/inventory-intelligence" element={<ProtectedRoute requireWarehouseOrAdmin><InventoryIntelligence /></ProtectedRoute>} />
                <Route path="/system-status"         element={<ProtectedRoute requireAdmin><SystemStatus /></ProtectedRoute>} />
                <Route path="*"                     element={<NotFound />} />
              </Routes>
            </Suspense>
          </ErrorBoundary>
        </div>
      </div>
    </div>
  );
};

import { ToastProvider } from './contexts/ToastContext.jsx';

function App() {
  return (
    <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AuthProvider>
        <ToastProvider>
          <AppShell />
        </ToastProvider>
      </AuthProvider>
    </Router>
  );
}

export default App;
