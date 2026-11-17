import React from 'react';
import type { HighlightCandidate } from '@shared/types.js';

interface ClipListDrawerProps {
  highlights: HighlightCandidate[];
  currentIndex: number;
  onSelectIndex: (index: number) => void;
  isOpen: boolean;
  onClose: () => void;
  isMobile?: boolean;
}

export const ClipListDrawer: React.FC<ClipListDrawerProps> = ({
  highlights,
  currentIndex,
  onSelectIndex,
  isOpen,
  onClose,
  isMobile = false,
}) => {
  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const getDominantTrait = (h: HighlightCandidate) => {
    const scores = [
      { name: 'Strong Hook', score: h.scoreHook },
      { name: 'High Value', score: h.scoreInformation },
      { name: 'Emotional Peak', score: h.scoreEmotion },
      { name: 'Story Twist', score: h.scoreSurprise },
      { name: 'High Energy', score: h.scoreAudio },
    ];
    scores.sort((a, b) => b.score - a.score);
    return scores[0]?.name || 'Top Moment';
  };

  return (
    <>
      {/* Backdrop for Mobile Bottom Sheet or Drawer */}
      {isOpen && (
        <div className="drawer-backdrop" onClick={onClose} />
      )}

      <div className={`clip-drawer-container ${isOpen ? 'open' : 'closed'} ${isMobile ? 'bottom-sheet' : 'sidebar'}`}>
        <div className="drawer-header">
          <div className="drawer-title-group">
            <span className="drawer-icon">📱</span>
            <h3 className="drawer-title">BEST SHORTS ({highlights.length})</h3>
          </div>
          <button className="drawer-close-btn" onClick={onClose} title="Close drawer">✕</button>
        </div>

        <div className="drawer-list-scrollable">
          {highlights.length === 0 ? (
            <div className="drawer-empty-state">
              <p>No clips detected yet</p>
            </div>
          ) : (
            highlights.map((h, idx) => {
              const isActive = idx === currentIndex;
              const duration = Math.max(0, h.endTime - h.startTime);
              const trait = getDominantTrait(h);

              return (
                <div
                  key={h.id}
                  className={`drawer-clip-card ${isActive ? 'active' : ''}`}
                  onClick={() => {
                    onSelectIndex(idx);
                    if (isMobile) onClose();
                  }}
                >
                  <div className="card-left-badge">
                    <span className="clip-rank-num">#{idx + 1}</span>
                    <div className="clip-score-circle">
                      <span className="score-val">{Math.round(h.scoreTotal)}</span>
                    </div>
                  </div>

                  <div className="card-middle-info">
                    <div className="card-title-row">
                      <span className="card-trait-tag" style={{ fontWeight: 700, maxWidth: '170px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {h.title || trait}
                      </span>
                      <span className="card-duration">{duration.toFixed(0)}s</span>
                    </div>
                    <span className="card-timestamps">
                      ⏱ {formatTime(h.startTime)} → {formatTime(h.endTime)}
                    </span>
                    <p className="card-transcript-snippet">
                      "{h.transcriptText ? h.transcriptText.slice(0, 75) + (h.transcriptText.length > 75 ? '...' : '') : 'Engaging dialogue segment'}"
                    </p>
                  </div>

                  {isActive && (
                    <div className="active-playing-indicator">
                      <span className="playing-dot" />
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </>
  );
};
