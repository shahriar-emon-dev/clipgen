import React from 'react';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'accent' | 'success' | 'warning' | 'error' | 'info';
}

export const Badge: React.FC<BadgeProps> = ({ children, variant = 'accent' }) => {
  return <span className={`badge badge-${variant}`}>{children}</span>;
};
