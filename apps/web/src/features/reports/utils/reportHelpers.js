/* ── reportHelpers.js ─────────────────────────────────────────── */

/**
 * Định dạng tiền tệ VND rút gọn (tỷ, triệu, k).
 * @param {number} v Giá trị số
 * @returns {string} Chuỗi định dạng
 */
export const formatVND = (v) => {
  if (!v) return '0đ';
  if (v >= 1_000_000_000) return (v / 1_000_000_000).toFixed(1).replace('.0', '') + ' tỷ';
  if (v >= 1_000_000)     return (v / 1_000_000).toFixed(1).replace('.0', '') + ' tr';
  if (v >= 1_000)         return Math.round(v / 1_000) + 'k';
  return v + 'đ';
};

/**
 * Trả về ngày hiện tại định dạng YYYY-MM-DD.
 */
export const today = () => new Date().toISOString().slice(0, 10);

/**
 * Download blob dữ liệu dưới dạng CSV.
 */
export const downloadBlob = (blob, filename) => {
  const url = URL.createObjectURL(new Blob([blob], { type: 'text/csv;charset=utf-8;' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};
