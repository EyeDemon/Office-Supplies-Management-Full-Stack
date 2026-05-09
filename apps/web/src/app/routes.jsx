/**
 * routes.jsx — Centralized route definitions (feature-based)
 * All lazy imports point to features/ directory (Clean Architecture FE).
 * App.jsx can import routes from here for future migration.
 */
import React from 'react';

// ── Auth ──────────────────────────────────────────────────────────
export const Login            = React.lazy(() => import('../features/auth/pages/Login'));
export const Register         = React.lazy(() => import('../features/auth/pages/Register'));
export const ForgotPassword   = React.lazy(() => import('../features/auth/pages/ForgotPassword'));
export const ResetPassword    = React.lazy(() => import('../features/auth/pages/ResetPassword'));

// ── Inventory ────────────────────────────────────────────────────
export const ImportOrders     = React.lazy(() => import('../features/inventory/pages/ImportOrders'));
export const ExportOrders     = React.lazy(() => import('../features/inventory/pages/ExportOrders'));
export const StockTransfer    = React.lazy(() => import('../features/inventory/pages/StockTransfer'));
export const StockAdjustment  = React.lazy(() => import('../features/inventory/pages/StockAdjustment'));
export const Stocktaking      = React.lazy(() => import('../features/inventory/pages/Stocktaking'));
export const StockLedger      = React.lazy(() => import('../features/inventory/pages/StockLedger'));
export const InventoryIntelligence = React.lazy(() => import('../features/inventory/pages/InventoryIntelligence'));

// ── Products ─────────────────────────────────────────────────────
export const Products         = React.lazy(() => import('../features/products/pages/Products'));
export const Categories       = React.lazy(() => import('../features/products/pages/Categories'));
export const UnitManagement   = React.lazy(() => import('../features/products/pages/UnitManagement'));
export const LotManagement    = React.lazy(() => import('../features/products/pages/LotManagement'));

// ── Procurement ──────────────────────────────────────────────────
export const Purchases            = React.lazy(() => import('../features/procurement/pages/Purchases'));
export const Requisitions         = React.lazy(() => import('../features/procurement/pages/Requisitions'));
export const RequisitionApproval  = React.lazy(() => import('../features/procurement/pages/RequisitionApproval'));

// ── Suppliers ────────────────────────────────────────────────────
export const Suppliers        = React.lazy(() => import('../features/suppliers/pages/Suppliers'));
export const Returns          = React.lazy(() => import('../features/suppliers/pages/Returns'));

// ── Warehouses ───────────────────────────────────────────────────
export const Warehouses           = React.lazy(() => import('../features/warehouses/pages/Warehouses'));
export const WarehouseLocations   = React.lazy(() => import('../features/warehouses/pages/WarehouseLocations'));
export const UserWarehouseAccess  = React.lazy(() => import('../features/warehouses/pages/UserWarehouseAccess'));

// ── Reports ──────────────────────────────────────────────────────
export const Reports          = React.lazy(() => import('../features/reports/pages/Reports'));

// ── Admin ────────────────────────────────────────────────────────
export const UserManagement   = React.lazy(() => import('../features/admin/pages/UserManagement'));
export const Departments      = React.lazy(() => import('../features/admin/pages/Departments'));
export const AuditLog         = React.lazy(() => import('../features/admin/pages/AuditLog'));
export const Notifications    = React.lazy(() => import('../features/admin/pages/Notifications'));

// ── Misc ─────────────────────────────────────────────────────────
export const Dashboard        = React.lazy(() => import('../pages/Dashboard'));
export const UserProfile      = React.lazy(() => import('../pages/UserProfile'));
export const NotFound         = React.lazy(() => import('../pages/NotFound'));
export const SystemStatus     = React.lazy(() => import('../pages/Monitoring/SystemStatus'));
