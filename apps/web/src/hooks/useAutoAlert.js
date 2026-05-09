import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * useAutoAlert v2 — dual-mode hook
 *
 * ── Side-effect mode (Products.js, Categories.js, Stocktaking.js) ──
 *   const [msg, setMsg] = useState({ type: '', text: '' });
 *   useAutoAlert(msg, setMsg);     // auto-dismiss 'success' sau delay ms
 *
 * ── Factory mode (StockTransfer.js, ExportOrders.js) ──────────────
 *   const [alert, setAlert] = useAutoAlert();
 *   setAlert('success', 'Thành công');   // auto-dismiss sau delay ms
 *   setAlert('error',   'Lỗi gì đó');   // không auto-dismiss
 *   // render: {alert && <AlertMessage type={alert.type} message={alert.message} />}
 */
function useAutoAlert(msg, setMsg, delay = 4000) {
  const isFactory = msg === undefined; // factory mode khi không truyền tham số

  // Factory mode state
  const [factoryState, setFactoryState] = useState(null);
  const timerRef = useRef(null);

  const factorySetter = useCallback((type, message) => {
    clearTimeout(timerRef.current);
    setFactoryState({ type, message });
    if (type === 'success') {
      timerRef.current = setTimeout(() => setFactoryState(null), delay);
    }
  }, [delay]);

  // Side-effect mode
  useEffect(() => {
    if (isFactory) return;
    if (msg?.type === 'success' && msg?.text) {
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setMsg({ type: '', text: '' }), delay);
    }
    return () => clearTimeout(timerRef.current);
  }, [msg, setMsg, delay, isFactory]);

  if (isFactory) return [factoryState, factorySetter];
  // side-effect mode: không return gì
}

export default useAutoAlert;
