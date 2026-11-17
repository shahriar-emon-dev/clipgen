import React from 'react';

interface ProgressBarProps {
  progress: number;
  height?: number;
  label?: string;
  showPercent?: boolean;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({
  progress,
  height = 6,
  label,
  showPercent = false,
}) => {
  const clamped = Math.max(0, Math.min(100, progress));

  return (
    <div style={{ width: '100%' }}>
      {(label || showPercent) && (
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
          {label && <span>{label}</span>}
          {showPercent && <span>{clamped}%</span>}
        </div>
      )}
      <div className="progress-bar" style={{ height: `${height}px` }}>
        <div className="progress-bar-fill" style={{ width: `${clamped}%` }} />
      </div>
    </div>
  );
};
