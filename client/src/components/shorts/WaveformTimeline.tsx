import React, { useRef, useState, useEffect, useCallback } from 'react';
import type { AudioWaveformData } from '@shared/types.js';

interface WaveformTimelineProps {
  waveform: AudioWaveformData | null;
  videoDuration: number;
  startTime: number;
  endTime: number;
  currentTime: number;
  onSeek: (time: number) => void;
  onBoundaryChange: (newStart: number, newEnd: number) => void;
  minDuration?: number;
  maxDuration?: number;
  isZoomed?: boolean;
}

export const WaveformTimeline: React.FC<WaveformTimelineProps> = ({
  waveform,
  videoDuration,
  startTime,
  endTime,
  currentTime,
  onSeek,
  onBoundaryChange,
  minDuration = 15.0,
  maxDuration = 30.0,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDraggingPlayhead, setIsDraggingPlayhead] = useState(false);
  const [draggingHandle, setDraggingHandle] = useState<'start' | 'end' | null>(null);
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [hoverX, setHoverX] = useState(0);

  const duration = Math.max(1, videoDuration || 1);
  const clipDuration = Math.max(0, endTime - startTime);
  const clipProgress = Math.max(0, Math.min(1, clipDuration > 0 ? (currentTime - startTime) / clipDuration : 0));
  const clipRelativeTime = Math.max(0, Math.min(clipDuration, currentTime - startTime));

  // Time format helper (MM:SS)
  const formatTime = (secs: number) => {
    const safeSecs = Math.max(0, Math.floor(secs));
    const m = Math.floor(safeSecs / 60);
    const s = safeSecs % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  // Convert pixel position to time in video
  const getTimeFromPixel = useCallback(
    (clientX: number): number => {
      if (!containerRef.current) return 0;
      const rect = containerRef.current.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      return ratio * duration;
    },
    [duration]
  );

  // Mouse move and mouse up event listeners for dragging
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const targetTime = getTimeFromPixel(e.clientX);

      if (isDraggingPlayhead) {
        // Clamp seeking strictly within clip boundaries during review
        const clampedSeek = Math.max(startTime, Math.min(endTime, targetTime));
        onSeek(clampedSeek);
      } else if (draggingHandle === 'start') {
        // Adjust start boundary enforcing min/max duration
        const maxStart = endTime - minDuration;
        const minStart = Math.max(0, endTime - maxDuration);
        const newStart = Math.max(minStart, Math.min(maxStart, targetTime));
        onBoundaryChange(Math.round(newStart * 10) / 10, endTime);
      } else if (draggingHandle === 'end') {
        // Adjust end boundary enforcing min/max duration
        const minEnd = startTime + minDuration;
        const maxEnd = Math.min(duration, startTime + maxDuration);
        const newEnd = Math.max(minEnd, Math.min(maxEnd, targetTime));
        onBoundaryChange(startTime, Math.round(newEnd * 10) / 10);
      }
    };

    const handleMouseUp = () => {
      setIsDraggingPlayhead(false);
      setDraggingHandle(null);
    };

    if (isDraggingPlayhead || draggingHandle) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDraggingPlayhead, draggingHandle, getTimeFromPixel, startTime, endTime, duration, minDuration, maxDuration, onSeek, onBoundaryChange]);

  // Touch handlers for mobile
  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 0) return;
    const targetTime = getTimeFromPixel(e.touches[0].clientX);
    if (isDraggingPlayhead) {
      const clampedSeek = Math.max(startTime, Math.min(endTime, targetTime));
      onSeek(clampedSeek);
    } else if (draggingHandle === 'start') {
      const maxStart = endTime - minDuration;
      const minStart = Math.max(0, endTime - maxDuration);
      const newStart = Math.max(minStart, Math.min(maxStart, targetTime));
      onBoundaryChange(Math.round(newStart * 10) / 10, endTime);
    } else if (draggingHandle === 'end') {
      const minEnd = startTime + minDuration;
      const maxEnd = Math.min(duration, startTime + maxDuration);
      const newEnd = Math.max(minEnd, Math.min(maxEnd, targetTime));
      onBoundaryChange(startTime, Math.round(newEnd * 10) / 10);
    }
  };

  const handleContainerClick = (e: React.MouseEvent) => {
    // Only seek if not clicking handles directly
    const targetTime = getTimeFromPixel(e.clientX);
    const clampedSeek = Math.max(startTime, Math.min(endTime, targetTime));
    onSeek(clampedSeek);
  };

  // Generate waveform bars from actual audio peaks data
  const peaks = waveform?.peaks || [];
  const barCount = 160;
  const sampledBars: number[] = [];

  if (peaks.length > 0) {
    const step = peaks.length / barCount;
    for (let i = 0; i < barCount; i++) {
      const idx = Math.floor(i * step);
      sampledBars.push(peaks[idx] || 0.1);
    }
  } else {
    // Graceful baseline
    for (let i = 0; i < barCount; i++) {
      sampledBars.push(0.15 + 0.1 * Math.sin(i * 0.2));
    }
  }

  // Calculate percentages
  const startPercent = Math.max(0, Math.min(100, (startTime / duration) * 100));
  const endPercent = Math.max(0, Math.min(100, (endTime / duration) * 100));
  const playheadPercent = Math.max(0, Math.min(100, (currentTime / duration) * 100));

  return (
    <div className="waveform-timeline-card">
      {/* Time Readout Header */}
      <div className="timeline-header-row">
        <div className="timecode-badge main-timecode">
          <span className="time-primary">{formatTime(clipRelativeTime)}</span>
          <span className="time-divider">/</span>
          <span className="time-total">{formatTime(clipDuration)}</span>
        </div>

        <div className="timeline-hint">
          <span className="drag-hint-icon">↔</span>
          <span className="drag-hint-text">Drag handles to adjust 15–30s boundaries</span>
        </div>

        <div className="timecode-badge original-timecode">
          <span className="time-label">Original:</span>
          <span>{formatTime(startTime)} → {formatTime(endTime)}</span>
          <span className={`duration-pill ${clipDuration > maxDuration ? 'invalid' : 'valid'}`}>
            {clipDuration.toFixed(1)}s
          </span>
        </div>
      </div>

      {/* Interactive Waveform Canvas / SVG Container */}
      <div
        ref={containerRef}
        className="waveform-track-container"
        onClick={handleContainerClick}
        onTouchMove={handleTouchMove}
        onTouchEnd={() => { setIsDraggingPlayhead(false); setDraggingHandle(null); }}
        onMouseMove={(e) => {
          if (!containerRef.current) return;
          const rect = containerRef.current.getBoundingClientRect();
          setHoverX(e.clientX - rect.left);
          setHoverTime(getTimeFromPixel(e.clientX));
        }}
        onMouseLeave={() => setHoverTime(null)}
      >
        {/* Dimmed Background Overlay outside the selected clip */}
        <div
          className="waveform-dimmed-region left"
          style={{ width: `${startPercent}%` }}
        />
        <div
          className="waveform-dimmed-region right"
          style={{ left: `${endPercent}%`, width: `${100 - endPercent}%` }}
        />

        {/* Selected Clip Highlight Region */}
        <div
          className="waveform-selected-region"
          style={{
            left: `${startPercent}%`,
            width: `${endPercent - startPercent}%`,
          }}
        />

        {/* Audio Waveform Bars (Dynamic Peaks) */}
        <div className="waveform-bars-wrapper">
          {sampledBars.map((peak, idx) => {
            const barPosPercent = (idx / barCount) * 100;
            const isInClip = barPosPercent >= startPercent && barPosPercent <= endPercent;
            const isPlayed = barPosPercent <= playheadPercent && isInClip;
            const heightPx = Math.max(4, Math.round(peak * 48));

            return (
              <div
                key={idx}
                className={`waveform-bar ${isInClip ? 'in-clip' : 'out-clip'} ${isPlayed ? 'played' : ''}`}
                style={{
                  height: `${heightPx}px`,
                }}
              />
            );
          })}
        </div>

        {/* Left Boundary Handle (START) */}
        <div
          className="boundary-handle start-handle"
          style={{ left: `${startPercent}%` }}
          onMouseDown={(e) => {
            e.stopPropagation();
            setDraggingHandle('start');
          }}
          onTouchStart={(e) => {
            e.stopPropagation();
            setDraggingHandle('start');
          }}
        >
          <div className="handle-grabber" />
          <div className="handle-tag">START</div>
        </div>

        {/* Right Boundary Handle (END) */}
        <div
          className="boundary-handle end-handle"
          style={{ left: `${endPercent}%` }}
          onMouseDown={(e) => {
            e.stopPropagation();
            setDraggingHandle('end');
          }}
          onTouchStart={(e) => {
            e.stopPropagation();
            setDraggingHandle('end');
          }}
        >
          <div className="handle-grabber" />
          <div className="handle-tag">END</div>
        </div>

        {/* Dynamic Playhead Scrubber */}
        <div
          className="waveform-playhead"
          style={{ left: `${playheadPercent}%` }}
          onMouseDown={(e) => {
            e.stopPropagation();
            setIsDraggingPlayhead(true);
          }}
          onTouchStart={(e) => {
            e.stopPropagation();
            setIsDraggingPlayhead(true);
          }}
        >
          <div className="playhead-needle" />
          <div className="playhead-knob" />
        </div>

        {/* Hover Time Tooltip */}
        {hoverTime !== null && !isDraggingPlayhead && !draggingHandle && (
          <div
            className="waveform-hover-tooltip"
            style={{ left: `${hoverX}px` }}
          >
            {formatTime(hoverTime)}
          </div>
        )}
      </div>

      {/* Bottom Micro Time Ruler */}
      <div className="timeline-ruler">
        <span className="ruler-mark">00:00</span>
        <span className="ruler-mark">{formatTime(duration * 0.25)}</span>
        <span className="ruler-mark">{formatTime(duration * 0.5)}</span>
        <span className="ruler-mark">{formatTime(duration * 0.75)}</span>
        <span className="ruler-mark">{formatTime(duration)}</span>
      </div>
    </div>
  );
};
