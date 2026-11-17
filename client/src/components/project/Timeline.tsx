import React, { useRef } from 'react';
import type { HighlightCandidate } from '@shared/types.js';

interface TimelineProps {
  duration: number;
  currentTime: number;
  highlights: HighlightCandidate[];
  onSeek: (time: number) => void;
}

export const Timeline: React.FC<TimelineProps> = ({
  duration,
  currentTime,
  highlights,
  onSeek,
}) => {
  const barRef = useRef<HTMLDivElement>(null);

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!barRef.current || duration <= 0) return;
    const rect = barRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const pct = Math.max(0, Math.min(1, clickX / rect.width));
    onSeek(pct * duration);
  };

  const playheadPct = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="card timeline-card">
      <div className="timeline-header">
        <span className="timeline-title">📍 Highlight Markers & Timeline</span>
        <span className="timeline-help">Click anywhere to seek video</span>
      </div>

      <div className="timeline-track" ref={barRef} onClick={handleClick}>
        {/* Playhead */}
        <div className="timeline-playhead" style={{ left: `${playheadPct}%` }} />

        {/* Highlight Markers */}
        {duration > 0 &&
          highlights.map((h, i) => {
            const startPct = (h.startTime / duration) * 100;
            const widthPct = Math.max(1, ((h.endTime - h.startTime) / duration) * 100);

            return (
              <div
                key={h.id}
                className="timeline-highlight-block"
                style={{
                  left: `${startPct}%`,
                  width: `${widthPct}%`,
                }}
                title={`#${i + 1} (${Math.round(h.scoreTotal)} pts)`}
                onClick={(e) => {
                  e.stopPropagation();
                  onSeek(h.startTime);
                }}
              >
                <span className="highlight-marker-label">#{i + 1}</span>
              </div>
            );
          })}
      </div>
    </div>
  );
};
