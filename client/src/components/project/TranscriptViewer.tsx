import React, { useState } from 'react';
import type { Transcript, TranscriptSegment } from '@shared/types.js';

interface TranscriptViewerProps {
  transcript: Transcript | null;
  onSeek: (time: number) => void;
  currentTime: number;
}

export const TranscriptViewer: React.FC<TranscriptViewerProps> = ({
  transcript,
  onSeek,
  currentTime,
}) => {
  const [search, setSearch] = useState('');

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  if (!transcript || transcript.segments.length === 0) {
    return (
      <div className="empty-state" style={{ padding: '40px 0' }}>
        <div className="empty-state-icon">📝</div>
        <h3>No transcript available</h3>
        <p>Run the processing pipeline to generate a timestamped transcript with Whisper.</p>
      </div>
    );
  }

  const filteredSegments = transcript.segments.filter((s: TranscriptSegment) =>
    s.text.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="card transcript-card">
      <div className="transcript-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <h3>Timestamped Transcript</h3>
          <span style={{ fontSize: '0.75rem', background: 'var(--bg-tertiary)', padding: '2px 8px', borderRadius: 'var(--radius-full)', color: 'var(--text-secondary)' }}>
            {transcript.segments.length} segments • {transcript.language?.toUpperCase() || 'EN'}
          </span>
        </div>

        <input
          type="text"
          className="input"
          placeholder="Search transcript..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ maxWidth: '240px', padding: '4px 10px', fontSize: '0.8rem' }}
        />
      </div>

      <div className="transcript-body">
        {filteredSegments.map((seg: TranscriptSegment) => {
          const isActive = currentTime >= seg.startTime && currentTime <= seg.endTime;

          return (
            <div
              key={seg.id}
              className={`transcript-segment-row ${isActive ? 'active' : ''}`}
              onClick={() => onSeek(seg.startTime)}
            >
              <span className="segment-timestamp">{formatTime(seg.startTime)}</span>
              <span className="segment-text">{seg.text}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
