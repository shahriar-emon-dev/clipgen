import React from 'react';

interface ClipNavigationProps {
  currentIndex: number;
  totalClips: number;
  onPrev: () => void;
  onNext: () => void;
  onOpenDrawer?: () => void;
}

export const ClipNavigation: React.FC<ClipNavigationProps> = ({
  currentIndex,
  totalClips,
  onPrev,
  onNext,
  onOpenDrawer,
}) => {
  return (
    <div className="clip-navigation-bar">
      <button
        className="nav-arrow-btn prev"
        onClick={onPrev}
        disabled={totalClips <= 1}
        title="Previous Short (Arrow Up / Scroll Up)"
      >
        <span className="arrow-icon">▲</span>
        <span className="arrow-text">Prev</span>
      </button>

      <div className="clip-position-pill" onClick={onOpenDrawer} title="Click to view all detected clips">
        <span className="pill-prefix">SHORT</span>
        <span className="pill-counts">
          <strong>{totalClips > 0 ? currentIndex + 1 : 0}</strong> / {totalClips}
        </span>
        <span className="pill-drawer-icon">☰</span>
      </div>

      <button
        className="nav-arrow-btn next"
        onClick={onNext}
        disabled={totalClips <= 1}
        title="Next Short (Arrow Down / Scroll Down)"
      >
        <span className="arrow-text">Next</span>
        <span className="arrow-icon">▼</span>
      </button>
    </div>
  );
};
