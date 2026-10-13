import React from 'react';
import useToastStore from '../store/toastStore.js';

const typeStyles = {
  success: 'bg-teal text-white',
  error: 'bg-crimson text-white',
  warning: 'bg-amber-500 text-white',
  info: 'bg-espresso text-white',
};

const typeIcons = {
  success: '✓',
  error: '✕',
  warning: '⚠',
  info: 'ℹ',
};

export default function ToastContainer() {
  const { toasts, removeToast } = useToastStore();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`
            pointer-events-auto flex items-center gap-3 px-5 py-3 rounded-card shadow-lifted
            font-sans text-sm font-medium max-w-xs
            ${typeStyles[toast.type] || typeStyles.info}
            ${toast.exiting ? 'animate-slide-out' : 'animate-slide-in'}
          `}
          onClick={() => removeToast(toast.id)}
          role="alert"
        >
          <span className="text-lg flex-shrink-0">{typeIcons[toast.type]}</span>
          <span>{toast.message}</span>
        </div>
      ))}
    </div>
  );
}
