import React from 'react';

interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  label?: string;
}

export const Spinner: React.FC<SpinnerProps> = ({ size = 'md', label }) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
      <div className={`spinner spinner-${size}`} />
      {label && <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>{label}</span>}
    </div>
  );
};
