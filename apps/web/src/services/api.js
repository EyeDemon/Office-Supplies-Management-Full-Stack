import axios from 'axios';
import * as apiTypes from '@contracts/api-types';
import { AUTH_DISPLAY_KEY } from '../shared/constants';
const { ErrorCode } = apiTypes;

const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

// BE-03: CSRF Token cache — lấy 1 lần sau login, dùng cho tất cả mutations
let _csrfToken = null;
async function getCsrfToken() {
  if (_csrfToken) return _csrfToken;
  try {
    const res = await axios.get('/api/csrf-token', { withCredentials: true });
    _csrfToken = res.data?.token || null;
  } catch { _csrfToken = null; }
  return _csrfToken;
}
// Expose để AuthContext gọi sau login (token đã có từ login response)
export function setCsrfToken(token) { _csrfToken = token; }
export function clearCsrfToken() { _csrfToken = null; }

// [FIX-BUG3] Gắn Idempotency-Key cho mọi mutating method (POST, PUT, PATCH, DELETE)
// Spec VIII.7: Backend yêu cầu Idempotency-Key cho tất cả POST/PUT/PATCH/DELETE
api.interceptors.request.use(async (config) => {
  const method = config.method?.toLowerCase();
  const isMutating = ['post', 'put', 'patch', 'delete'].includes(method);

  if (isMutating) {
    // Tạo unique key cho từng request
    config.headers['Idempotency-Key'] = (
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    // BE-03: Gắn CSRF token
    const token = await getCsrfToken();
    if (token) config.headers['X-CSRF-Token'] = token;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const { config, response } = error;
    const status = response?.status;

    if (status === 401 || status === 423) {
      clearCsrfToken();
      localStorage.removeItem(AUTH_DISPLAY_KEY);
      sessionStorage.removeItem('session_verified');
      if (window.location.pathname !== '/login') window.location.href = '/login';
      return Promise.reject(error);
    }

    // BE-03: CSRF invalid → refresh token và retry once
    const isCsrfError = status === 403 && (
      [ErrorCode.CSRF_INVALID, ErrorCode.CSRF_MISSING].includes(response?.data?.code) ||
      [ErrorCode.CSRF_INVALID, ErrorCode.CSRF_MISSING].includes(response?.data?.errors?.[0]?.code)
    );

    if (isCsrfError) {
      console.warn(`[API] CSRF Error detected: ${response?.data?.code || response?.data?.errors?.[0]?.code}. Retry: ${!config._csrfRetry}`);
      if (!config._csrfRetry) {
        config._csrfRetry = true;
        _csrfToken = null; // bust cache

        // Force a fresh token fetch from the backend
        try {
          const newToken = await getCsrfToken();
          if (newToken) {
            console.log('[API] CSRF Token refreshed. Retrying request...');
            config.headers['X-CSRF-Token'] = newToken;
            return api(config);
          }
        } catch (refreshErr) {
          console.error('[API] Failed to refresh CSRF token', refreshErr);
        }
      }
    }

    return Promise.reject(error);
  }
);

export const authAPI = {
  login: (username, password) => api.post('/auth/login', { username, password }),
  logout: () => api.post('/auth/logout'),
  me: () => api.get('/auth/me'),
  register: (data) => api.post('/auth/register', data),
  changePassword: (currentPassword, newPassword) =>
    api.post('/auth/change-password', { currentPassword, newPassword }),
  forgotPassword: (email) => api.post('/auth/forgot-password', { email }),
  resetPassword: (token, newPassword, confirmPassword) =>
    api.post('/auth/reset-password', { token, newPassword, confirmPassword }),
  verifyResetToken: (token) => api.get(`/auth/verify-reset-token?token=${encodeURIComponent(token)}`),
};

export const userAPI = {
  getAllUsers: ({ page = 0, size = 20, search = '', role = '', department = '' } = {}) => {
    const p = new URLSearchParams({ page, size });
    if (search) p.append('search', search);
    if (role) p.append('role', role);
    if (department) p.append('department', department);
    return api.get(`/users?${p}`);
  },
  getUserById: (id) => api.get(`/users/${id}`),
  createUser: (data) => api.post('/users', data),
  updateUser: (id, data) => api.put(`/users/${id}`, data),
  deleteUser: (id) => api.delete(`/users/${id}`),
  getDeletedUsers: () => api.get('/users/deleted'),
  restoreUser: (id) => api.post(`/users/${id}/restore`),
  getDepartments: () => api.get('/users/departments'),
};

export const categoryAPI = {
  getAll: (params = {}) => {
    const p = new URLSearchParams();
    if (params.search) p.append('search', params.search);
    return api.get(`/categories?${p}`);
  },
  getById: (id) => api.get(`/categories/${id}`),
  create: (data) => api.post('/categories', data),
  update: (id, data) => api.put(`/categories/${id}`, data),
  delete: (id) => api.delete(`/categories/${id}`),
  exportCsv: (params = {}) => {
    const p = new URLSearchParams();
    if (params.search) p.append('search', params.search);
    return api.get(`/categories/export?${p}`, { responseType: 'blob' });
  },
};

export const productAPI = {
  getAll: ({ page = 0, size = 20, search = '', categoryId = '', lowStock = false } = {}) => {
    const p = new URLSearchParams({ page, size });
    if (search) p.append('search', search);
    if (categoryId) p.append('categoryId', categoryId);
    if (lowStock) p.append('lowStock', 'true');
    return api.get(`/products?${p}`);
  },
  getById: (id) => api.get(`/products/${id}`),
  create: (data) => api.post('/products', data),
  update: (id, data) => api.put(`/products/${id}`, data),
  delete: (id) => api.delete(`/products/${id}`),
  stockIn: (id, data) => api.post(`/products/${id}/stock-in`, data),
  stockOut: (id, data) => api.post(`/products/${id}/stock-out`, data),
  stockAdjust: (id, data) => api.post(`/products/${id}/stock-adjust`, data),
  getTransactions: (id, page = 0, size = 20) =>
    api.get(`/products/${id}/transactions?page=${page}&size=${size}`),
  getRecentTx: (limit = 20) => api.get(`/products/transactions/recent?limit=${limit}`),
  exportCsv: () => api.get('/products/export', { responseType: 'blob' }),
  getStats: () => api.get('/products/stats'),
  // GAP-5: product restore
  getDeleted: () => api.get('/products/deleted'),
  restore: (id) => api.post(`/products/${id}/restore`),
  // Spec XV: Import Excel/CSV
  importExcel: (file) => {
    const form = new FormData();
    form.append('file', file);
    return api.post('/products/import', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
};

export const departmentAPI = {
  getAll: () => api.get('/departments'),
  create: (data) => api.post('/departments', data),
  update: (id, data) => api.put(`/departments/${id}`, data),
  delete: (id) => api.delete(`/departments/${id}`),
  getQuotas: (id) => api.get(`/departments/${id}/quota`),
  setQuota: (id, data) => api.post(`/departments/${id}/quota`, data),
};

export const dashboardAPI = {
  getStats: () => api.get('/dashboard/stats'),
  getWeekly: () => api.get('/dashboard/weekly'),
};

export const supplierAPI = {
  getAll: (params = {}) => {
    const p = new URLSearchParams();
    if (params.search) p.append('search', params.search);
    if (params.active !== undefined) p.append('active', params.active);
    if (params.page !== undefined) p.append('page', params.page);
    if (params.size !== undefined) p.append('size', params.size);
    return api.get(`/suppliers?${p}`);
  },
  getAllList: () => api.get('/suppliers/all'),
  getById: (id) => api.get(`/suppliers/${id}`),
  create: (data) => api.post('/suppliers', data),
  update: (id, data) => api.put(`/suppliers/${id}`, data),
  delete: (id) => api.delete(`/suppliers/${id}`),
  exportCsv: (params = {}) => {
    const p = new URLSearchParams();
    if (params.search) p.append('search', params.search);
    if (params.active !== undefined) p.append('active', params.active);
    return api.get(`/suppliers/export?${p}`, { responseType: 'blob' });
  },
  importExcel: (file) => {
    const form = new FormData();
    form.append('file', file);
    return api.post('/suppliers/import', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  downloadTemplate: () =>
    api.get('/suppliers/import-template', { responseType: 'blob' }),
};

export const orderAPI = {
  getAll: (params = {}) => {
    const p = new URLSearchParams();
    if (params.status) p.append('status', params.status);
    if (params.supplierId) p.append('supplierId', params.supplierId);
    if (params.dateFrom) p.append('dateFrom', params.dateFrom);
    if (params.dateTo) p.append('dateTo', params.dateTo);
    if (params.page !== undefined) p.append('page', params.page);
    if (params.size !== undefined) p.append('size', params.size);
    return api.get(`/orders?${p}`);
  },
  getById: (id) => api.get(`/orders/${id}`),
  create: (data) => api.post('/orders', data),
  update: (id, data) => api.put(`/orders/${id}`, data),
  // Flow: DRAFT → PENDING → APPROVED → COMPLETED
  submit: (id) => api.post(`/orders/${id}/submit`),   // DRAFT → PENDING
  approve: (id) => api.post(`/orders/${id}/approve`),  // PENDING → APPROVED
  reject: (id, data) => api.post(`/orders/${id}/reject`, data || {}), // PENDING → CANCELLED
  complete: (id) => api.post(`/orders/${id}/complete`), // APPROVED → COMPLETED (nhập kho)
  confirm: (id) => api.post(`/orders/${id}/confirm`),  // Legacy fast-track (backward-compat)
  cancel: (id) => api.post(`/orders/${id}/cancel`),
  exportCsv: (params = {}) => {
    const p = new URLSearchParams();
    if (params.status) p.append('status', params.status);
    if (params.supplierId) p.append('supplierId', params.supplierId);
    if (params.dateFrom) p.append('dateFrom', params.dateFrom);
    if (params.dateTo) p.append('dateTo', params.dateTo);
    return api.get(`/orders/export?${p}`, { responseType: 'blob' });
  },
};

// ── Thông báo ─────────────────────────────────────────────────────
export const notificationAPI = {
  getAll: (all = false) => api.get(`/notifications?all=${all}`),
  markRead: (id) => api.put(`/notifications/${id}/read`),
  markAllRead: () => api.put('/notifications/read-all'),
  sync: () => api.post('/notifications/sync'),
  /** F3: Xoá thông báo đã đọc cũ hơn N ngày — ngăn bảng phình vô hạn */
  clearRead: (days = 30) => api.delete(`/notifications/clear-read?days=${days}`),
};

// ── Phiếu yêu cầu cấp phát ───────────────────────────────────────
export const requisitionAPI = {
  getAll: (params = {}) => {
    const p = new URLSearchParams();
    if (params.status) p.append('status', params.status);
    if (params.dateFrom) p.append('dateFrom', params.dateFrom);
    if (params.dateTo) p.append('dateTo', params.dateTo);
    if (params.requesterId) p.append('requesterId', params.requesterId);
    if (params.warehouseId) p.append('warehouseId', params.warehouseId);  // BUG-API-REQ-01 FIX
    if (params.page !== undefined) p.append('page', params.page);
    if (params.size !== undefined) p.append('size', params.size);
    return api.get(`/requisitions?${p}`);
  },
  getById: (id) => api.get(`/requisitions/${id}`),
  create: (data) => api.post('/requisitions', data),
  cancel: (id) => api.post(`/requisitions/${id}/cancel`),
  approve: (id, data) => api.post(`/requisitions/${id}/approve`, data || {}),
  reject: (id, data) => api.post(`/requisitions/${id}/reject`, data || {}),
  // [FE-02] Bulk actions — Manager duyệt/từ chối nhiều phiếu 1 click
  bulkApprove: (ids) => api.post('/requisitions/bulk-approve', { ids }),
  bulkReject: (ids, reason) => api.post('/requisitions/bulk-reject', { ids, reason }),
  warehouseConfirm: (id, data) => api.post(`/requisitions/${id}/warehouse-confirm`, data || {}),
  exportCsv: (params = {}) => {
    const p = new URLSearchParams();
    if (params.status) p.append('status', params.status);
    if (params.dateFrom) p.append('dateFrom', params.dateFrom);
    if (params.dateTo) p.append('dateTo', params.dateTo);
    return api.get(`/requisitions/export?${p}`, { responseType: 'blob' });
  },
};

// ── Audit log ─────────────────────────────────────────────────────
export const auditAPI = {
  getLogins: (params = {}) => {
    const p = new URLSearchParams();
    if (params.username) p.append('username', params.username);
    if (params.success !== undefined) p.append('success', params.success);
    if (params.dateFrom) p.append('dateFrom', params.dateFrom);
    if (params.dateTo) p.append('dateTo', params.dateTo);
    if (params.page !== undefined) p.append('page', params.page);
    if (params.size !== undefined) p.append('size', params.size);
    return api.get(`/audit/logins?${p}`);
  },
  getSuspicious: () => api.get('/audit/logins/suspicious'),
  /** F1: Xuất toàn bộ audit log ra CSV (áp dụng filter hiện tại) */
  exportCsv: (params = {}) => {
    const p = new URLSearchParams();
    if (params.username) p.append('username', params.username);
    if (params.success !== undefined && params.success !== '') p.append('success', params.success);
    if (params.dateFrom) p.append('dateFrom', params.dateFrom);
    if (params.dateTo) p.append('dateTo', params.dateTo);
    return api.get(`/audit/logins/export?${p}`, { responseType: 'blob' });
  },
};

// ── General Audit Log (Spec XIV) ──────────────────────────────────
export const generalAuditAPI = {
  getAll: (params = {}) => {
    const p = new URLSearchParams();
    if (params.entityType) p.append('entityType', params.entityType);
    if (params.entityId) p.append('entityId', params.entityId);
    if (params.action) p.append('action', params.action);
    if (params.changedBy) p.append('changedBy', params.changedBy);
    if (params.dateFrom) p.append('dateFrom', params.dateFrom);
    if (params.dateTo) p.append('dateTo', params.dateTo);
    if (params.page !== undefined) p.append('page', params.page);
    if (params.size !== undefined) p.append('size', params.size);
    return api.get(`/audit/general?${p}`);
  },
  getByEntity: (type, id) => api.get(`/audit/general/entity/${type}/${id}`),
  exportCsv: (params = {}) => {
    const p = new URLSearchParams();
    if (params.entityType) p.append('entityType', params.entityType);
    if (params.action) p.append('action', params.action);
    if (params.dateFrom) p.append('dateFrom', params.dateFrom);
    if (params.dateTo) p.append('dateTo', params.dateTo);
    return api.get(`/audit/general/export?${p}`, { responseType: 'blob' });
  },
};

// ── Reports ───────────────────────────────────────────────────────
export const reportsAPI = {
  getStockActivity: (params = {}) => {
    const p = new URLSearchParams();
    if (params.days) p.append('days', params.days);
    if (params.dateFrom) p.append('dateFrom', params.dateFrom);
    if (params.dateTo) p.append('dateTo', params.dateTo);
    if (params.department) p.append('department', params.department);
    return api.get(`/reports/stock-activity?${p}`);
  },
  // FIX #3: truyền dateFrom/dateTo để lọc động thay vì dùng view tĩnh
  getByCategory: (params = {}) => {
    const p = new URLSearchParams();
    if (params.dateFrom) p.append('dateFrom', params.dateFrom);
    if (params.dateTo) p.append('dateTo', params.dateTo);
    const qs = p.toString();
    return api.get(`/reports/by-category${qs ? '?' + qs : ''}`);
  },
  getTopProducts: (params = {}) => {
    const p = new URLSearchParams();
    if (params.type) p.append('type', params.type);
    if (params.days) p.append('days', params.days);
    if (params.limit) p.append('limit', params.limit);
    return api.get(`/reports/top-products?${p}`);
  },
  /** Tab 1 — Hoạt động kho (hỗ trợ lọc phòng ban) */
  exportCsv: (params = {}) => {
    const p = new URLSearchParams();
    if (params.days) p.append('days', params.days);
    if (params.dateFrom) p.append('dateFrom', params.dateFrom);
    if (params.dateTo) p.append('dateTo', params.dateTo);
    if (params.department) p.append('department', params.department);
    return api.get(`/reports/stock-activity/export?${p}`, { responseType: 'blob' });
  },
  /** F2: Tab 2 — Theo danh mục (FIX #3: truyền date range) */
  exportByCategory: (params = {}) => {
    const p = new URLSearchParams();
    if (params.dateFrom) p.append('dateFrom', params.dateFrom);
    if (params.dateTo) p.append('dateTo', params.dateTo);
    const qs = p.toString();
    return api.get(`/reports/by-category/export${qs ? '?' + qs : ''}`, { responseType: 'blob' });
  },
  /** F2: Tab 3 — Top sản phẩm (truyền filter hiện tại) */
  exportTopProducts: (params = {}) => {
    const p = new URLSearchParams();
    if (params.type) p.append('type', params.type);
    if (params.days) p.append('days', params.days);
    if (params.limit) p.append('limit', params.limit);
    return api.get(`/reports/top-products/export?${p}`, { responseType: 'blob' });
  },
  // BUG-9: Burn Rate
  getBurnRate: (params = {}) => {
    const p = new URLSearchParams();
    if (params.days) p.append('days', params.days);
    if (params.categoryId) p.append('categoryId', params.categoryId);
    return api.get(`/reports/burn-rate?${p}`);
  },
  exportBurnRate: (params = {}) => {
    const p = new URLSearchParams();
    if (params.days) p.append('days', params.days);
    return api.get(`/reports/burn-rate/export?${p}`, { responseType: 'blob' });
  },
  // BUG-9: Dead Stock
  getDeadStock: (params = {}) => {
    const p = new URLSearchParams();
    if (params.days) p.append('days', params.days);
    if (params.categoryId) p.append('categoryId', params.categoryId);
    return api.get(`/reports/dead-stock?${p}`);
  },
  exportDeadStock: (params = {}) => {
    const p = new URLSearchParams();
    if (params.days) p.append('days', params.days);
    return api.get(`/reports/dead-stock/export?${p}`, { responseType: 'blob' });
  },
  // GAP-09: Báo cáo chi phí nhập/xuất theo danh mục hoặc phòng ban
  getFinancial: (params = {}) => {
    const p = new URLSearchParams();
    if (params.dateFrom) p.append('dateFrom', params.dateFrom);
    if (params.dateTo) p.append('dateTo', params.dateTo);
    if (params.grouping) p.append('grouping', params.grouping); // 'category' | 'department'
    return api.get(`/reports/financial?${p}`);
  },
  // GAP-05: Lịch sử tồn kho từ stock_snapshot_daily
  getStockHistory: (params = {}) => {
    const p = new URLSearchParams();
    if (params.dateFrom) p.append('dateFrom', params.dateFrom);
    if (params.dateTo) p.append('dateTo', params.dateTo);
    if (params.productId) p.append('productId', params.productId);
    if (params.warehouseId) p.append('warehouseId', params.warehouseId);
    return api.get(`/reports/stock-history?${p}`);
  },
  // FEAT-GAP-10: 3 core ERP reports (Clean Architecture endpoints)
  /** Báo cáo Nhập-Xuất-Tồn theo kỳ (bắt buộc dateFrom + dateTo) */
  getInOutBalance: (params = {}) => {
    const p = new URLSearchParams();
    if (params.dateFrom) p.append('dateFrom', params.dateFrom);
    if (params.dateTo) p.append('dateTo', params.dateTo);
    if (params.warehouseId) p.append('warehouseId', params.warehouseId);
    if (params.productId) p.append('productId', params.productId);
    return api.get(`/reports/in-out-balance?${p}`);
  },
  /** Giá trị vốn kho hiện tại (qty × avg_cost) */
  getInventoryValue: (params = {}) => {
    const p = new URLSearchParams();
    if (params.warehouseId) p.append('warehouseId', params.warehouseId);
    return api.get(`/reports/inventory-value?${p}`);
  },
  /** Báo cáo tiêu hao (hàng xuất kho) theo kỳ (bắt buộc dateFrom + dateTo) */
  getConsumption: (params = {}) => {
    const p = new URLSearchParams();
    if (params.dateFrom) p.append('dateFrom', params.dateFrom);
    if (params.dateTo) p.append('dateTo', params.dateTo);
    if (params.warehouseId) p.append('warehouseId', params.warehouseId);
    return api.get(`/reports/consumption?${p}`);
  },
  exportStockHistory: (params = {}) => {
    const p = new URLSearchParams();
    if (params.dateFrom) p.append('dateFrom', params.dateFrom);
    if (params.dateTo) p.append('dateTo', params.dateTo);
    if (params.productId) p.append('productId', params.productId);
    if (params.warehouseId) p.append('warehouseId', params.warehouseId);
    return api.get(`/reports/stock-history/export?${p}`, { responseType: 'blob' });
  },

  // FEAT-GAP-11: Dashboard summary (snapshot-based overview)
  getDashboardSummary: (params = {}) => {
    const p = new URLSearchParams();
    if (params.date) p.append('date', params.date);
    return api.get(`/reports/dashboard-summary${p.toString() ? '?' + p : ''}`);
  },

  // FEAT-GAP-11: Stock trend for a single product+warehouse over time
  getStockTrend: (params = {}) => {
    const p = new URLSearchParams();
    if (params.warehouseId) p.append('warehouseId', params.warehouseId);
    if (params.productId) p.append('productId', params.productId);
    if (params.dateFrom) p.append('dateFrom', params.dateFrom);
    if (params.dateTo) p.append('dateTo', params.dateTo);
    return api.get(`/reports/stock-trend?${p}`);
  },

  // FEAT-GAP-11: Flat ledger export (JSON default, CSV via Accept header)
  getLedgerExport: (params = {}) => {
    const p = new URLSearchParams();
    if (params.dateFrom) p.append('dateFrom', params.dateFrom);
    if (params.dateTo) p.append('dateTo', params.dateTo);
    if (params.warehouseId) p.append('warehouseId', params.warehouseId);
    if (params.productId) p.append('productId', params.productId);
    return api.get(`/reports/ledger-export?${p}`, {
      responseType: params.csv ? 'blob' : 'json',
      headers: params.csv ? { Accept: 'text/csv' } : {},
    });
  },
};

// ── Kiểm kê kho ───────────────────────────────────────────────────
export const stocktakingAPI = {
  getAll: (params = {}) => {
    const p = new URLSearchParams();
    if (params.page) p.append('page', params.page);
    if (params.limit) p.append('limit', params.limit);
    if (params.status) p.append('status', params.status);
    return api.get(`/stocktaking?${p}`);
  },
  getById: (id) => api.get(`/stocktaking/${id}`),
  create: (data) => api.post('/stocktaking', data),
  updateItems: (id, items) => api.put(`/stocktaking/${id}/items`, { items }), // Fixed: backend expects { items: [] }
  startCounting: (id) => api.put(`/stocktaking/${id}/start-counting`),
  complete: (id) => api.post(`/stocktaking/${id}/complete`),
  cancel: (id) => api.delete(`/stocktaking/${id}/cancel`),
};

// ── Phiếu xuất kho ───────────────────────────────────────────────
export const exportOrderAPI = {
  getAll: (params = {}) => {
    const p = new URLSearchParams();
    if (params.page !== undefined) p.append('page', params.page);
    if (params.limit !== undefined) p.append('limit', params.limit);
    if (params.size !== undefined) p.append('limit', params.size);   // alias
    if (params.status) p.append('status', params.status);
    if (params.search) p.append('search', params.search);
    if (params.warehouseId) p.append('warehouseId', params.warehouseId);
    if (params.dateFrom) p.append('dateFrom', params.dateFrom);
    if (params.dateTo) p.append('dateTo', params.dateTo);
    return api.get(`/export-orders?${p}`);
  },
  getById: (id) => api.get(`/export-orders/${id}`),
  create: (data) => api.post('/export-orders', data),
  update: (id, data) => api.put(`/export-orders/${id}`, data),
  // Workflow: DRAFT -> PENDING -> APPROVED -> COMPLETED (Spec III, XVI)
  submit: (id) => api.post(`/export-orders/${id}/submit`),
  approve: (id) => api.post(`/export-orders/${id}/approve`),
  reject: (id, data) => api.post(`/export-orders/${id}/reject`, data || {}),
  // [FE-07] complete hỗ trợ partial fulfillment: data = { fulfilledItems: [{itemId, quantityFulfilled}] }
  complete: (id, data) => api.post(`/export-orders/${id}/complete`, data || {}),
  cancel: (id, data) => api.post(`/export-orders/${id}/cancel`, data || {}),
  exportCsv: (params = {}) => {
    const p = new URLSearchParams();
    if (params.status) p.append('status', params.status);
    if (params.from) p.append('from', params.from);
    if (params.to) p.append('to', params.to);
    return api.get(`/export-orders/export/csv?${p}`, { responseType: 'blob' });
  },
};

// ── Điều chuyển kho ───────────────────────────────────────────────
export const transferAPI = {
  getAll: (params = {}) => {
    const p = new URLSearchParams();
    if (params.page) p.append('page', params.page);
    if (params.limit) p.append('limit', params.limit);
    if (params.status) p.append('status', params.status);
    if (params.search) p.append('search', params.search);
    return api.get(`/transfers?${p}`);
  },
  getById: (id) => api.get(`/transfers/${id}`),
  create: (data) => api.post('/transfers', data),
  update: (id, data) => api.put(`/transfers/${id}`, data),
  submit: (id) => api.post(`/transfers/${id}/submit`),
  approve: (id) => api.post(`/transfers/${id}/approve`),
  reject: (id, data) => api.post(`/transfers/${id}/reject`, data || {}),
  // C2 FIX: Phase 1 — APPROVED → IN_TRANSIT (xuất kho nguồn)
  dispatch: (id) => api.post(`/transfers/${id}/dispatch`),
  // Phase 2 — IN_TRANSIT → COMPLETED (nhập kho đích)
  complete: (id) => api.post(`/transfers/${id}/complete`),
  cancel: (id) => api.post(`/transfers/${id}/cancel`, {}),
  exportCsv: (params = {}) => {
    const p = new URLSearchParams();
    if (params.status) p.append('status', params.status);
    return api.get(`/transfers/export/csv?${p}`, { responseType: 'blob' });
  },
};

// ── Quản lý mua hàng (PR/PO) ──────────────────────────────────────
export const purchaseAPI = {
  // PR
  getAllPR: (params = {}) => {
    const p = new URLSearchParams();
    if (params.page) p.append('page', params.page);
    if (params.size) p.append('size', params.size);
    if (params.limit) p.append('size', params.limit); // compat
    if (params.status) p.append('status', params.status);
    if (params.priority) p.append('priority', params.priority);
    return api.get(`/purchases/requests?${p}`);
  },
  getPRById: (id) => api.get(`/purchases/requests/${id}`),
  getSuggest: () => api.get('/purchases/requests/suggest'),
  createPR: (data) => api.post('/purchases/requests', data),
  approvePR: (id) => api.post(`/purchases/requests/${id}/approve`),
  rejectPR: (id, data) => api.post(`/purchases/requests/${id}/reject`, data || {}),
  cancelPR: (id) => api.post(`/purchases/requests/${id}/cancel`, {}),
  bulkApprovePR: (ids) => api.post('/purchases/requests/bulk-approve', { ids }),
  // PO
  getAllPO: (params = {}) => {
    const p = new URLSearchParams();
    if (params.page) p.append('page', params.page);
    if (params.size) p.append('size', params.size);
    if (params.limit) p.append('size', params.limit); // compat
    if (params.status) p.append('status', params.status);
    if (params.supplierId) p.append('supplierId', params.supplierId);
    return api.get(`/purchases/orders?${p}`);
  },
  getPOById: (id) => api.get(`/purchases/orders/${id}`),
  createPO: (data) => api.post('/purchases/orders', data),
  confirmPO: (id) => api.post(`/purchases/orders/${id}/confirm`),
  bulkApprovePO: (ids) => api.post('/purchases/orders/bulk-confirm', { ids }),
  // [BUG-PO-WH-01 FIX] truyền warehouseId khi PO chưa có kho đích
  receivePO: (id, warehouseId) => api.post(`/purchases/orders/${id}/receive`, warehouseId ? { warehouseId } : {}),
  cancelPO: (id) => api.post(`/purchases/orders/${id}/cancel`, {}),
  exportPOCsv: (params = {}) => {
    const p = new URLSearchParams();
    if (params.status) p.append('status', params.status);
    return api.get(`/purchases/orders/export/csv?${p}`, { responseType: 'blob' });
  },
  // BUG 5 — Auto PR
  checkAutoPR: () => api.get('/purchases/auto-pr/check'),
  generateAutoPR: (data) => api.post('/purchases/auto-pr/generate', data || {}),
  // BUG 6 — Price History
  getPriceHistory: (params = {}) => {
    const p = new URLSearchParams();
    if (params.productId) p.append('productId', params.productId);
    if (params.supplierId) p.append('supplierId', params.supplierId);
    if (params.page) p.append('page', params.page);
    if (params.size) p.append('size', params.size);
    if (params.limit) p.append('size', params.limit); // compat
    return api.get(`/purchases/price-history?${p}`);
  },
  getPriceHistoryByProduct: (productId) => api.get(`/purchases/price-history/product/${productId}`),
  addPriceHistory: (data) => api.post('/purchases/price-history', data),
};

// ── Trả hàng ─────────────────────────────────────────────────────
export const returnAPI = {
  getAll: (params = {}) => {
    const p = new URLSearchParams();
    if (params.page) p.append('page', params.page);
    if (params.limit) p.append('limit', params.limit);
    if (params.status) p.append('status', params.status);
    if (params.type) p.append('type', params.type);
    if (params.search) p.append('search', params.search);
    return api.get(`/returns?${p}`);
  },
  getById: (id) => api.get(`/returns/${id}`),
  create: (data) => api.post('/returns', data),
  update: (id, data) => api.put(`/returns/${id}`, data),
  complete: (id) => api.post(`/returns/${id}/complete`),
  cancel: (id) => api.delete(`/returns/${id}/cancel`),
  exportCsv: (params = {}) => {
    const p = new URLSearchParams();
    if (params.status) p.append('status', params.status);
    if (params.type) p.append('type', params.type);
    return api.get(`/returns/export/csv?${p}`, { responseType: 'blob' });
  },
};

// ── Kho & Vị trí (Spec I.1) ───────────────────────────────────────
export const warehouseAPI = {
  getAll: (params = {}) => {
    const p = new URLSearchParams();
    if (params.page !== undefined) p.append('page', params.page);
    if (params.size !== undefined) p.append('size', params.size);
    if (params.search) p.append('search', params.search);
    if (params.active !== undefined) p.append('active', params.active);
    return api.get(`/warehouses?${p}`);
  },
  getAllList: () => api.get('/warehouses/all'),
  getById: (id) => api.get(`/warehouses/${id}`),
  create: (data) => api.post('/warehouses', data),
  update: (id, data) => api.put(`/warehouses/${id}`, data),
  delete: (id) => api.delete(`/warehouses/${id}`),
  toggle: (id) => api.patch(`/warehouses/${id}/toggle`),
  // Bug #5: tồn kho theo từng kho
  getStock: (id, params = {}) => {
    const p = new URLSearchParams();
    if (params.page !== undefined) p.append('page', params.page);
    if (params.size !== undefined) p.append('size', params.size);
    if (params.search) p.append('search', params.search);
    if (params.categoryId) p.append('categoryId', params.categoryId);
    if (params.lowStock) p.append('lowStock', params.lowStock);
    return api.get(`/warehouses/${id}/stock?${p}`);
  },
};

// ── Lịch sử điều chỉnh tồn kho (Spec VII) ───────────────────────
export const adjustmentAPI = {
  getAll: (params = {}) => {
    const p = new URLSearchParams();
    if (params.page !== undefined) p.append('page', params.page);
    if (params.size !== undefined) p.append('size', params.size);
    if (params.productId) p.append('productId', params.productId);
    if (params.changedBy) p.append('changedBy', params.changedBy);
    if (params.dateFrom) p.append('dateFrom', params.dateFrom);
    if (params.dateTo) p.append('dateTo', params.dateTo);
    if (params.search) p.append('search', params.search);
    return api.get(`/adjustments?${p}`);
  },
  exportCsv: (params = {}) => {
    const p = new URLSearchParams();
    if (params.productId) p.append('productId', params.productId);
    if (params.dateFrom) p.append('dateFrom', params.dateFrom);
    if (params.dateTo) p.append('dateTo', params.dateTo);
    if (params.search) p.append('search', params.search);
    return api.get(`/adjustments/export?${p}`, { responseType: 'blob' });
  },
  create: (data) => api.post('/adjustments', data),
  approve: (id) => api.post(`/adjustments/${id}/approve`),
  reject: (id, reason) => api.post(`/adjustments/${id}/reject`, { reason }),
};

// ── P2: Lot / Batch Tracking (BUG 3) ────────────────────────────
export const lotAPI = {
  getAll: (params = {}) => {
    const p = new URLSearchParams();
    if (params.page !== undefined) p.append('page', params.page);
    if (params.size !== undefined) p.append('size', params.size);
    if (params.search) p.append('search', params.search);
    if (params.productId) p.append('productId', params.productId);
    if (params.expiringSoon) p.append('expiringSoon', '1');
    if (params.expired) p.append('expired', '1');
    return api.get(`/lots?${p}`);
  },
  getByProduct: (productId) => api.get(`/lots/by-product/${productId}`),
  getById: (id) => api.get(`/lots/${id}`),
  getExpiring: (days = 30) => api.get(`/lots/expiring?days=${days}`),
  getExpired: () => api.get('/lots/expired'),
  create: (data) => api.post('/lots', data),
  update: (id, data) => api.put(`/lots/${id}`, data),
  delete: (id) => api.delete(`/lots/${id}`),
};

// ── P2: Units & Conversions (BUG 4) ─────────────────────────────
export const unitAPI = {
  getAll: (search = '') => api.get(`/units?search=${encodeURIComponent(search)}`),
  getById: (id) => api.get(`/units/${id}`),
  create: (data) => api.post('/units', data),
  update: (id, data) => api.put(`/units/${id}`, data),
  delete: (id) => api.delete(`/units/${id}`),
  getAllConversions: () => api.get('/units/conversions/all'),
  createConversion: (data) => api.post('/units/conversions', data),
  updateConversion: (id, data) => api.put(`/units/conversions/${id}`, data),
  deleteConversion: (id) => api.delete(`/units/conversions/${id}`),
  convert: (qty, fromId, toId) => api.post('/units/convert', { quantity: qty, fromUnitId: fromId, toUnitId: toId }),
};

// ── P2: User Warehouse RBAC (BUG 7) ─────────────────────────────
export const userWarehouseAPI = {
  getMyWarehouses: () => api.get('/user-warehouses/my'),
  getByUser: (userId) => api.get(`/user-warehouses/${userId}`),
  assign: (userId, warehouseId) => api.post(`/user-warehouses/${userId}`, { warehouseId }),
  bulkAssign: (userId, warehouseIds) => api.post(`/user-warehouses/${userId}/bulk`, { warehouseIds }),
  revoke: (userId, warehouseId) => api.delete(`/user-warehouses/${userId}/${warehouseId}`),
};

export default api;

// ── L-06 FIX: Warehouse Locations API ────────────────────────────
export const warehouseLocationAPI = {
  getAll: (warehouseId = null, activeOnly = true) =>
    api.get(`/warehouse-locations${warehouseId ? `?warehouseId=${warehouseId}` : ''}${activeOnly ? (warehouseId ? '&active=true' : '?active=true') : ''}`),
  getById: (id) => api.get(`/warehouse-locations/${id}`),
  create: (data) => api.post('/warehouse-locations', data),
  update: (id, data) => api.put(`/warehouse-locations/${id}`, data),
  deactivate: (id) => api.delete(`/warehouse-locations/${id}`),
};

// ── GAP-01 UI: Stock Ledger API ───────────────────────────────────
export const analyticsAPI = {
  getReplenishmentAnalysis: (params = {}) => {
    const p = new URLSearchParams();
    if (params.warehouseId) p.append('warehouseId', params.warehouseId);
    if (params.categoryId) p.append('categoryId', params.categoryId);
    return api.get(`/analytics/replenishment?${p}`);
  },
};

export const stockLedgerAPI = {
  getAll: (params = {}) => {
    const p = new URLSearchParams();
    if (params.page !== undefined) p.append('page', params.page);
    if (params.size !== undefined) p.append('size', params.size);
    if (params.warehouseId) p.append('warehouseId', params.warehouseId);
    if (params.productId) p.append('productId', params.productId);
    if (params.transactionType) p.append('transactionType', params.transactionType);
    if (params.referenceType) p.append('referenceType', params.referenceType);
    if (params.dateFrom) p.append('dateFrom', params.dateFrom);
    if (params.dateTo) p.append('dateTo', params.dateTo);
    if (params.search) p.append('search', params.search);
    return api.get(`/stock-ledger?${p}`);
  },
  getSummary: (params = {}) => {
    const p = new URLSearchParams();
    if (params.warehouseId) p.append('warehouseId', params.warehouseId);
    if (params.productId) p.append('productId', params.productId);
    if (params.dateFrom) p.append('dateFrom', params.dateFrom);
    if (params.dateTo) p.append('dateTo', params.dateTo);
    return api.get(`/stock-ledger/summary?${p}`);
  },
};