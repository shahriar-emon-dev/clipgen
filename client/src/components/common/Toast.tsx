import React from 'react';

interface ToastProps {
  message: string | null;
  type?: 'error' | 'success' | 'warning' | 'info';
  onClose: () => void;
}

export const Toast: React.FC<ToastProps> = ({ message, type = 'error', onClose }) => {
  if (!message) return null;

  return (
    <div className="toast-container">
      <div className={`toast toast-${type}`} onClick={onClose} role="alert">
        <span>{message}</span>
      </div>
    </div>
  );
};
