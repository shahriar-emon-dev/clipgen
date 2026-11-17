import React from 'react';
import type { Transcript, CaptionStyle } from '@shared/types.js';

interface CaptionOverlayProps {
  transcript: Transcript | null;
  currentTime: number; // Video's absolute current time in seconds
  startTime: number;
  endTime: number;
  captionStyle: CaptionStyle;
  enabled: boolean;
}

export const CaptionOverlay: React.FC<CaptionOverlayProps> = ({
  transcript,
  currentTime,
  startTime,
  endTime,
  captionStyle,
  enabled,
}) => {
  if (!enabled || !transcript || !transcript.segments) {
    return null;
  }

  // Find active segment at currentTime
  const activeSegment = transcript.segments.find(
    (seg) => currentTime >= seg.startTime && currentTime <= seg.endTime
  );

  if (!activeSegment) {
    return null;
  }

  // Check if word-level timestamps are available
  const words = activeSegment.wordTimestamps && activeSegment.wordTimestamps.length > 0
    ? activeSegment.wordTimestamps
    : activeSegment.text.split(' ').map((word, idx, arr) => {
        const segDur = activeSegment.endTime - activeSegment.startTime;
        const wDur = segDur / arr.length;
        return {
          word,
          start: activeSegment.startTime + idx * wDur,
          end: activeSegment.startTime + (idx + 1) * wDur,
        };
      });

  // Position class
  const positionClass = `caption-pos-${captionStyle.position || 'bottom'}`;

  // Word chunking based on maxWordsPerLine
  const maxWords = captionStyle.maxWordsPerLine || 3;
  // Find current active word index
  const activeWordIdx = words.findIndex(
    (w) => currentTime >= w.start && currentTime <= w.end
  );

  // Group into chunks around active word
  const currentChunkStart = activeWordIdx >= 0
    ? Math.floor(activeWordIdx / maxWords) * maxWords
    : 0;
  const chunkWords = words.slice(currentChunkStart, currentChunkStart + maxWords);

  const displayText = chunkWords.map(w => w.word).join(' ');
  const processedText = captionStyle.uppercase ? displayText.toUpperCase() : displayText;

  return (
    <div className={`caption-overlay-container ${positionClass}`}>
      <div
        className="caption-box"
        style={{
          fontSize: `${captionStyle.fontSize || 28}px`,
          fontFamily: captionStyle.fontFamily || 'Outfit, sans-serif',
          color: captionStyle.fontColor || '#FFFFFF',
          backgroundColor: captionStyle.backgroundOpacity > 0
            ? `rgba(0, 0, 0, ${captionStyle.backgroundOpacity})`
            : 'transparent',
          WebkitTextStroke: `${captionStyle.outlineWidth || 2}px ${captionStyle.outlineColor || '#000000'}`,
          textShadow: '0 2px 8px rgba(0,0,0,0.8), 0 0 12px rgba(0,0,0,0.5)',
        }}
      >
        <span className="caption-text-animated">
          {chunkWords.map((w, idx) => {
            const isWordActive = currentTime >= w.start && currentTime <= w.end;
            const wordStr = captionStyle.uppercase ? w.word.toUpperCase() : w.word;
            return (
              <span
                key={idx}
                className={`caption-word ${isWordActive ? 'word-active' : ''}`}
                style={{
                  color: isWordActive ? '#FFE600' : captionStyle.fontColor || '#FFFFFF',
                  transform: isWordActive ? 'scale(1.08)' : 'scale(1)',
                  display: 'inline-block',
                  margin: '0 3px',
                  transition: 'transform 0.1s ease, color 0.1s ease',
                }}
              >
                {wordStr}
              </span>
            );
          })}
        </span>
      </div>
    </div>
  );
};
