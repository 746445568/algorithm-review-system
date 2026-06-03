import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

const ToastContext = createContext(null);

let toastId = 0;

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

const ICONS = {
  success: '✓',
  error: '✕',
  info: 'ℹ',
  warning: '⚠',
};

function ToastItem({ toast, onRemove }) {
  const [exiting, setExiting] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => {
    timerRef.current = setTimeout(() => {
      setExiting(true);
    }, 3000);
    return () => clearTimeout(timerRef.current);
  }, []);

  const handleClose = useCallback(() => {
    clearTimeout(timerRef.current);
    setExiting(true);
  }, []);

  const handleAnimationEnd = useCallback(() => {
    if (exiting) onRemove(toast.id);
  }, [exiting, onRemove, toast.id]);

  return (
    <div
      className={`toast-item toast-${toast.type} ${exiting ? 'toast-exit' : 'toast-enter'}`}
      onAnimationEnd={handleAnimationEnd}
      role="alert"
    >
      <span className="toast-icon">{ICONS[toast.type] || ICONS.info}</span>
      <span className="toast-message">{toast.message}</span>
      <button className="toast-close" onClick={handleClose} aria-label="关闭">×</button>
    </div>
  );
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const showToast = useCallback((message, type = 'info') => {
    const id = ++toastId;
    setToasts(prev => [...prev, { id, message, type }]);
  }, []);

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="toast-container" aria-live="polite">
        {toasts.map(t => (
          <ToastItem key={t.id} toast={t} onRemove={removeToast} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}
