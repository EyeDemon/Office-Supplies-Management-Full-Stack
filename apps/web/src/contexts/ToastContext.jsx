import React, { createContext, useContext, useState, useCallback } from 'react';
import { Toast, ToastContainer } from 'react-bootstrap';

const ToastContext = createContext(null);

export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);

  const showToast = useCallback((message, variant = 'primary', title = 'Thông báo') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, variant, title }]);
  }, []);

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <ToastContainer position="top-end" className="p-3" style={{ zIndex: 9999 }}>
        {toasts.map(toast => (
          <Toast 
            key={toast.id} 
            onClose={() => removeToast(toast.id)} 
            show={true} 
            delay={5000} 
            autohide 
            bg={toast.variant === 'error' ? 'danger' : toast.variant}
            className={['danger', 'success', 'warning'].includes(toast.variant) ? 'text-white' : ''}
          >
            <Toast.Header closeButton={true}>
              <strong className="me-auto">{toast.title}</strong>
            </Toast.Header>
            <Toast.Body>{toast.message}</Toast.Body>
          </Toast>
        ))}
      </ToastContainer>
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used within ToastProvider');
  return context;
};
