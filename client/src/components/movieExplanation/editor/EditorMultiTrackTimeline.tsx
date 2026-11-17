import React, { useRef, useState, useEffect } from 'react';
import { useMovieExplanationStore } from '../../../stores/movieExplanationStore.js';
import { Button } from '../../common/Button.js';
import type { MovieTimelineShot, TimelineTextOverlay, TimelineCaptionItem } from '@shared/types.js';

export const EditorMultiTrackTimeline: React.FC = () => {
  const {
    project,
    selectedShotId,
    selectedTextOverlayId,
    selectedCaptionId,
    currentTime,
    timelineZoom,
    isPlaying,
    inPoint,
    outPoint,
    setSelectedShotId,
    setSelectedTextOverlayId,
    setSelectedCaptionId,
    seekTo,
    togglePlay,
    splitShotAtPlayhead,
    duplicateShot,
    deleteShot,
    trimShot,
    reorderShots,
    setTimelineZoom,
    setInPoint,
    setOutPoint,
    clearInOutPoints,
    toggleShotLock,
    undo,
    redo,
    pastTimelines,
    futureTimelines,
  } = useMovieExplanationStore();

  const timelineRef = useRef<HTMLDivElement>(null);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [draggedShotId, setDraggedShotId] = useState<string | null>(null);
  const [dragOverShotId, setDragOverShotId] = useState<string | null>(null);

  const timeline = project?.timeline;
  const shots = timeline?.shots || [];
  const textOverlays = timeline?.textOverlays || [];
  const captions = timeline?.captions || [];
  const totalDuration = timeline?.duration || (shots.length > 0 ? shots[shots.length - 1].timelineEnd : 60);

  // Pixel scale: zoom level represents px per second. Default 40 px/s, min 15 px/s, max 150 px/s
  const pxPerSec = Math.max(15, Math.min(150, (timelineZoom || 1.0) * 40));
  const timelineWidthPx = Math.max(800, Math.round(totalDuration * pxPerSec));

  const selectedShot = shots.find((s) => s.shotId === selectedShotId) || shots[0];

  // Auto-scroll timeline to follow playhead when playing
  useEffect(() => {
    if (isPlaying && timelineRef.current) {
      const playheadX = currentTime * pxPerSec;
      const scrollLeft = timelineRef.current.scrollLeft;
      const visibleWidth = timelineRef.current.clientWidth;

      if (playheadX > scrollLeft + visibleWidth - 100 || playheadX < scrollLeft) {
        timelineRef.current.scrollLeft = Math.max(0, playheadX - 100);
      }
    }
  }, [currentTime, isPlaying, pxPerSec]);

  // Scrubbing handler
  const handleTimelineMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!timelineRef.current) return;
    const rect = timelineRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left + timelineRef.current.scrollLeft;
    const clickedTime = Math.max(0, Math.min(totalDuration, clickX / pxPerSec));
    seekTo(clickedTime);
    setIsScrubbing(true);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isScrubbing || !timelineRef.current) return;
      const rect = timelineRef.current.getBoundingClientRect();
      const clickX = e.clientX - rect.left + timelineRef.current.scrollLeft;
      const clickedTime = Math.max(0, Math.min(totalDuration, clickX / pxPerSec));
      seekTo(clickedTime);
    };

    const handleMouseUp = () => {
      if (isScrubbing) setIsScrubbing(false);
    };

    if (isScrubbing) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isScrubbing, pxPerSec, totalDuration, seekTo]);

  // Drag and drop reordering
  const handleDragStart = (e: React.DragEvent, shotId: string) => {
    e.dataTransfer.setData('text/plain', shotId);
    setDraggedShotId(shotId);
  };

  const handleDragOver = (e: React.DragEvent, shotId: string) => {
    e.preventDefault();
    if (dragOverShotId !== shotId) {
      setDragOverShotId(shotId);
    }
  };

  const handleDrop = (e: React.DragEvent, targetShotId: string) => {
    e.preventDefault();
    const sourceId = e.dataTransfer.getData('text/plain') || draggedShotId;
    setDraggedShotId(null);
    setDragOverShotId(null);

    if (!sourceId || sourceId === targetShotId) return;

    const sourceIdx = shots.findIndex((s) => s.shotId === sourceId);
    const targetIdx = shots.findIndex((s) => s.shotId === targetShotId);
    if (sourceIdx < 0 || targetIdx < 0) return;

    const newOrder = [...shots.map((s) => s.shotId)];
    const [moved] = newOrder.splice(sourceIdx, 1);
    newOrder.splice(targetIdx, 0, moved);

    reorderShots(newOrder);
  };

  // Trimming handles for selected shot
  const handleTrimStart = (delta: number) => {
    if (!selectedShot) return;
    const newStart = Math.max(0, selectedShot.sourceStart + delta);
    if (newStart < selectedShot.sourceEnd - 0.2) {
      trimShot(selectedShot.shotId, newStart, selectedShot.sourceEnd);
    }
  };

  const handleTrimEnd = (delta: number) => {
    if (!selectedShot) return;
    const newEnd = Math.max(selectedShot.sourceStart + 0.2, selectedShot.sourceEnd + delta);
    trimShot(selectedShot.shotId, selectedShot.sourceStart, newEnd);
  };

  // Generate ruler tick marks
  const rulerTicks = [];
  const tickStepSec = pxPerSec > 60 ? 1 : pxPerSec > 30 ? 2 : 5;
  for (let t = 0; t <= totalDuration + 2; t += tickStepSec) {
    const leftPx = t * pxPerSec;
    const minutes = Math.floor(t / 60);
    const seconds = Math.floor(t % 60);
    const formatted = `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
    rulerTicks.push(
      <div key={t} className="mex-ruler-tick" style={{ left: `${leftPx}px` }}>
        <span className="mex-ruler-label">{formatted}</span>
        <div className="mex-ruler-mark" />
      </div>
    );
  }

  return (
    <div className="mex-multitrack-container">
      {/* ── Timeline Toolbar ── */}
      <div className="mex-timeline-toolbar">
        {/* Left tools: Split, Delete, Duplicate */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Button
            variant="secondary"
            size="sm"
            onClick={splitShotAtPlayhead}
            title="Split selected shot at playhead position (Ctrl+B / S)"
            disabled={!selectedShot}
          >
            ✂️ Split Shot
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => selectedShot && duplicateShot(selectedShot.shotId)}
            title="Duplicate selected shot"
            disabled={!selectedShot}
          >
            📋 Duplicate
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => selectedShot && deleteShot(selectedShot.shotId)}
            title="Delete selected shot"
            disabled={!selectedShot || shots.length <= 1}
          >
            🗑️ Delete
          </Button>

          <div className="mex-toolbar-sep" />

          {/* In / Out range tools */}
          <button
            className={`mex-chip-btn ${inPoint !== null ? 'active' : ''}`}
            onClick={() => setInPoint(currentTime)}
            title="Set In-Point [I]"
          >
            [ In: {inPoint !== null ? inPoint.toFixed(1) + 's' : '--'}
          </button>
          <button
            className={`mex-chip-btn ${outPoint !== null ? 'active' : ''}`}
            onClick={() => setOutPoint(currentTime)}
            title="Set Out-Point [O]"
          >
            Out: {outPoint !== null ? outPoint.toFixed(1) + 's' : '--'} ]
          </button>
          {(inPoint !== null || outPoint !== null) && (
            <button className="mex-chip-btn" onClick={clearInOutPoints} title="Clear In/Out loop range">
              ✕ Clear
            </button>
          )}

          <div className="mex-toolbar-sep" />

          {/* Trim fine-tune buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
            <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>Trim In:</span>
            <button className="mex-chip-btn" onClick={() => handleTrimStart(-0.25)} disabled={!selectedShot}>-0.25s</button>
            <button className="mex-chip-btn" onClick={() => handleTrimStart(0.25)} disabled={!selectedShot}>+0.25s</button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '3px', marginLeft: '6px' }}>
            <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>Trim Out:</span>
            <button className="mex-chip-btn" onClick={() => handleTrimEnd(-0.25)} disabled={!selectedShot}>-0.25s</button>
            <button className="mex-chip-btn" onClick={() => handleTrimEnd(0.25)} disabled={!selectedShot}>+0.25s</button>
          </div>
        </div>

        {/* Right tools: Undo/Redo, Zoom Slider */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ display: 'flex', gap: '4px' }}>
            <button
              className="mex-chip-btn"
              onClick={undo}
              disabled={pastTimelines.length === 0}
              title={`Undo (${pastTimelines.length} steps available)`}
            >
              ↶ Undo
            </button>
            <button
              className="mex-chip-btn"
              onClick={redo}
              disabled={futureTimelines.length === 0}
              title={`Redo (${futureTimelines.length} steps available)`}
            >
              ↷ Redo
            </button>
          </div>

          <div className="mex-toolbar-sep" />

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Zoom:</span>
            <button
              className="mex-chip-btn"
              onClick={() => setTimelineZoom(Math.max(0.4, (timelineZoom || 1.0) - 0.25))}
              title="Zoom Out (-)"
            >
              🔍-
            </button>
            <input
              type="range"
              min="0.4"
              max="3.0"
              step="0.1"
              value={timelineZoom || 1.0}
              onChange={(e) => setTimelineZoom(parseFloat(e.target.value))}
              style={{ width: '80px', height: '4px', cursor: 'pointer' }}
            />
            <button
              className="mex-chip-btn"
              onClick={() => setTimelineZoom(Math.min(3.0, (timelineZoom || 1.0) + 0.25))}
              title="Zoom In (+)"
            >
              🔍+
            </button>
          </div>
        </div>
      </div>

      {/* ── Main Multi-Track Area ── */}
      <div className="mex-timeline-workspace-split">
        {/* Track Headers (Left fixed side) */}
        <div className="mex-track-headers">
          <div className="mex-track-header ruler-corner">Tracks</div>
          <div className="mex-track-header">📝 Text Overlay</div>
          <div className="mex-track-header">💬 Captions</div>
          <div className="mex-track-header main-video-th">
            <span>🎬 Main Video</span>
            <span className="mex-th-sub">&le; 3.0s strict</span>
          </div>
          <div className="mex-track-header">🎙️ Voiceover</div>
        </div>

        {/* Scrollable Tracks Canvas (Right side) */}
        <div
          ref={timelineRef}
          className="mex-timeline-scrollable"
          onMouseDown={handleTimelineMouseDown}
        >
          <div className="mex-tracks-canvas" style={{ width: `${timelineWidthPx}px` }}>
            {/* 1. Timecode Ruler */}
            <div className="mex-ruler-track">{rulerTicks}</div>

            {/* In/Out region highlight overlay */}
            {inPoint !== null && outPoint !== null && outPoint > inPoint && (
              <div
                className="mex-inout-region"
                style={{
                  left: `${inPoint * pxPerSec}px`,
                  width: `${(outPoint - inPoint) * pxPerSec}px`,
                }}
              />
            )}

            {/* Red Playhead line */}
            <div
              className="mex-playhead-line"
              style={{ left: `${currentTime * pxPerSec}px` }}
            >
              <div className="mex-playhead-handle" />
            </div>

            {/* 2. Text Overlays Track */}
            <div className="mex-track-lane text-lane">
              {textOverlays.map((txt) => {
                const start = txt.startTime ?? txt.timelineStart ?? 0;
                const dur = txt.duration ?? Math.max(0.5, (txt.timelineEnd ?? 0) - start);
                const leftPx = start * pxPerSec;
                const widthPx = Math.max(40, dur * pxPerSec);
                const isSelected = selectedTextOverlayId === txt.id;
                return (
                  <div
                    key={txt.id}
                    className={`mex-lane-block text-block ${isSelected ? 'selected' : ''}`}
                    style={{ left: `${leftPx}px`, width: `${widthPx}px` }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedTextOverlayId(txt.id);
                    }}
                  >
                    <span className="truncate">📝 {txt.text}</span>
                  </div>
                );
              })}
            </div>

            {/* 3. Captions Track */}
            <div className="mex-track-lane captions-lane">
              {captions.map((cap) => {
                const leftPx = cap.startTime * pxPerSec;
                const widthPx = Math.max(30, (cap.endTime - cap.startTime) * pxPerSec);
                const isSelected = selectedCaptionId === cap.id;
                return (
                  <div
                    key={cap.id}
                    className={`mex-lane-block caption-block ${isSelected ? 'selected' : ''}`}
                    style={{ left: `${leftPx}px`, width: `${widthPx}px` }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedCaptionId(cap.id);
                      seekTo(cap.startTime);
                    }}
                  >
                    <span className="truncate">💬 {cap.text}</span>
                  </div>
                );
              })}
            </div>

            {/* 4. Main Video Shots Track (STRICT <= 3.0s visual clips!) */}
            <div className="mex-track-lane video-lane">
              {shots.map((shot, idx) => {
                const leftPx = shot.timelineStart * pxPerSec;
                const widthPx = Math.max(50, shot.duration * pxPerSec);
                const isSelected = selectedShotId === shot.shotId;
                const isDragging = draggedShotId === shot.shotId;
                const isDragTarget = dragOverShotId === shot.shotId;
                const isStrictPass = shot.duration <= 3.05;

                return (
                  <div
                    key={shot.shotId}
                    draggable
                    onDragStart={(e) => handleDragStart(e, shot.shotId)}
                    onDragOver={(e) => handleDragOver(e, shot.shotId)}
                    onDrop={(e) => handleDrop(e, shot.shotId)}
                    className={`mex-video-clip ${isSelected ? 'selected' : ''} ${
                      isDragging ? 'dragging' : ''
                    } ${isDragTarget ? 'drag-over' : ''}`}
                    style={{ left: `${leftPx}px`, width: `${widthPx}px` }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedShotId(shot.shotId);
                    }}
                  >
                    {/* Top Clip Info */}
                    <div className="mex-vclip-top">
                      <span className="mex-vclip-index">#{idx + 1}</span>
                      {shot.isLocked && (
                        <button
                          className="mex-vclip-lock"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleShotLock(shot.shotId);
                          }}
                          title="Locked against AI re-matching. Click to unlock."
                        >
                          🔒
                        </button>
                      )}
                    </div>

                    {/* Thumbnail */}
                    {shot.thumbnailUrl ? (
                      <img src={shot.thumbnailUrl} alt="" className="mex-vclip-thumb" />
                    ) : (
                      <div className="mex-vclip-thumb-empty">🎬</div>
                    )}

                    {/* Bottom Metadata Badges */}
                    <div className="mex-vclip-bot">
                      <span className="truncate mex-vclip-title">
                        {shot.sceneId}
                      </span>
                      <span
                        className={`mex-vclip-duration-badge ${
                          isStrictPass ? 'pass' : 'warn'
                        }`}
                        title={
                          isStrictPass
                            ? 'Adheres to 3.0s short clip pacing'
                            : 'Exceeds 3.0s limit'
                        }
                      >
                        {shot.duration.toFixed(1)}s
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* 5. Master Voiceover Audio Track */}
            <div className="mex-track-lane voiceover-lane">
              <div
                className="mex-vo-block"
                style={{
                  left: 0,
                  width: `${totalDuration * pxPerSec}px`,
                }}
              >
                <div className="mex-vo-wave-line" />
                <span className="mex-vo-label">
                  🎙️ Master Narration Voiceover Stream ({Math.floor(totalDuration / 60)}m {Math.floor(totalDuration % 60)}s)
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
