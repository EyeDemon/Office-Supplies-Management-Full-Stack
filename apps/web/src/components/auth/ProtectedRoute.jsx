import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext.jsx';
import LoadingSpinner from '../common/LoadingSpinner';

/**
 * ProtectedRoute v24.2
 * Props:
 *   requireAdmin             — chỉ cho ADMIN
 *   requireManagerOrAdmin    — cho ADMIN + MANAGER
 *   requireWarehouseOrAdmin  — cho ADMIN + MANAGER + WAREHOUSE (N1 FIX)
 */
const ProtectedRoute = ({
  children,
  requireAdmin = false,
  requireManagerOrAdmin = false,
  requireWarehouseOrAdmin = false,
}) => {
  const { user, loading, isAdmin, isManagerOrAdmin, isWarehouseOrAdmin } = useAuth();
  const location = useLocation();
  if (loading) return <LoadingSpinner fullPage />;
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  if (requireAdmin && !isAdmin) return <Navigate to="/dashboard" replace />;
  if (requireManagerOrAdmin && !isManagerOrAdmin) return <Navigate to="/dashboard" replace />;
  // N1 FIX: WAREHOUSE role được phép vào trang nghiệp vụ kho
  if (requireWarehouseOrAdmin && !isWarehouseOrAdmin) return <Navigate to="/dashboard" replace />;
  return children;
};
export default ProtectedRoute;