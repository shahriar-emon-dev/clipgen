import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { Video, Transcript, HighlightCandidate } from '@shared/types.js';
import { useShortsStore } from '../../stores/shortsStore.js';
import { VideoReviewPlayer } from './VideoReviewPlayer.js';
import { WaveformTimeline } from './WaveformTimeline.js';
import { ClipNavigation } from './ClipNavigation.js';
import { ClipInfoPanel } from './ClipInfoPanel.js';
import { ClipListDrawer } from './ClipListDrawer.js';
import { CaptionCustomizer } from './CaptionCustomizer.js';
import { ExportShortModal } from './ExportShortModal.js';
import { Spinner } from '../common/Spinner.js';

interface ShortsReviewModeProps {
  video: Video;
  onExit: () => void;
}

export const ShortsReviewMode: React.FC<ShortsReviewModeProps> = ({ video, onExit }) => {
  const {
    highlights,
    currentHighlightIndex,
    shorts,
    transcript,
    copyright,
    waveform,
    waveformLoading,
    loadWaveform,
    loadHighlights,
    updateHighlightCandidate,
    deleteHighlightCandidate,
    setCurrentHighlightIndex,
    nextHighlight,
    previousHighlight,
    captionsEnabled,
    setCaptionsEnabled,
    captionStyle,
    setCaptionStyle,
    reframeMode,
    setReframeMode,
    isBatchExporting,
    downloadAllShorts,
    generateAllShorts,
    downloadShort,
    generateShort,
    generatingShortId,
    autoFrameHighlight,
  } = useShortsStore();

  const [currentTime, setCurrentTime] = useState(0);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isCaptionCustomizerOpen, setIsCaptionCustomizerOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isAutoFraming, setIsAutoFraming] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

  // Active Highlight
  const currentHighlight = highlights[currentHighlightIndex] || null;

  // Matching Short for the active candidate
  const matchingShort = shorts.find(
    (s) =>
      (s.highlightId && s.highlightId === currentHighlight?.id) ||
      (Math.abs(s.startTime - (currentHighlight?.startTime || 0)) < 1.0 &&
       Math.abs(s.endTime - (currentHighlight?.endTime || 0)) < 1.0)
  );
  const isCurrentShortCompleted = matchingShort?.status === 'completed' && Boolean(matchingShort.filePath);
  const isCurrentShortRendering = matchingShort?.status === 'rendering' || generatingShortId === currentHighlight?.id;

  // Local start and end times for instant feedback
  const [startTime, setStartTime] = useState(currentHighlight?.startTime || 0);
  const [endTime, setEndTime] = useState(currentHighlight?.endTime || 30);

  // Touch swipe handling for mobile
  const touchStartYRef = useRef<number | null>(null);
  const touchEndYRef = useRef<number | null>(null);
  const wheelTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Responsive window resize detection
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Load real waveform on mount
  useEffect(() => {
    if (video?.projectId && !waveform) {
      loadWaveform(video.projectId);
    }
  }, [video?.projectId, waveform, loadWaveform]);

  // Sync timestamps and framingMode when highlight changes
  useEffect(() => {
    if (currentHighlight) {
      setStartTime(currentHighlight.startTime);
      setEndTime(currentHighlight.endTime);
      setCurrentTime(currentHighlight.startTime);
      if (currentHighlight.framingMode) {
        setReframeMode(currentHighlight.framingMode as any);
      }
    }
  }, [currentHighlight?.id, currentHighlight?.startTime, currentHighlight?.endTime, setReframeMode]);

  // Handle framing mode change with persistent update to candidate
  const handleReframeChange = useCallback(
    (newMode: any) => {
      setReframeMode(newMode);
      if (currentHighlight) {
        updateHighlightCandidate(currentHighlight.id, {
          framingMode: newMode,
        });
      }
    },
    [currentHighlight, setReframeMode, updateHighlightCandidate]
  );

  // Handle boundary updates with auto-persistence
  const handleBoundaryChange = useCallback(
    (newStart: number, newEnd: number) => {
      setStartTime(newStart);
      setEndTime(newEnd);
      // If playhead falls outside new boundary, clamp it
      if (currentTime < newStart || currentTime > newEnd) {
        setCurrentTime(newStart);
      }
      // Save back to highlight candidate in store/backend
      if (currentHighlight) {
        updateHighlightCandidate(currentHighlight.id, {
          startTime: newStart,
          endTime: newEnd,
        });
      }
    },
    [currentHighlight, currentTime, updateHighlightCandidate]
  );

  const handleAutoFrame = async () => {
    if (!currentHighlight) return;
    setIsAutoFraming(true);
    try {
      const updated = await autoFrameHighlight(currentHighlight.id);
      if (updated?.framingMode) {
        setReframeMode(updated.framingMode);
      }
    } catch (err) {
      console.error('Auto framing failed:', err);
    } finally {
      setIsAutoFraming(false);
    }
  };

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger shortcuts if user is typing in an input
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }

      if (e.key === 'ArrowUp' || e.key === 'PageUp') {
        e.preventDefault();
        previousHighlight();
      } else if (e.key === 'ArrowDown' || e.key === 'PageDown') {
        e.preventDefault();
        nextHighlight();
      } else if (e.key === 'Escape') {
        if (isCaptionCustomizerOpen) setIsCaptionCustomizerOpen(false);
        else if (isDrawerOpen) setIsDrawerOpen(false);
        else if (isExportModalOpen) setIsExportModalOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [previousHighlight, nextHighlight, isCaptionCustomizerOpen, isDrawerOpen, isExportModalOpen]);

  // Mouse wheel clip switching (debounced)
  const handleWheel = (e: React.WheelEvent) => {
    if (isDrawerOpen || isCaptionCustomizerOpen || isExportModalOpen) return;
    if (Math.abs(e.deltaY) < 50) return;

    if (!wheelTimeoutRef.current) {
      if (e.deltaY > 0) {
        nextHighlight();
      } else {
        previousHighlight();
      }
      wheelTimeoutRef.current = setTimeout(() => {
        wheelTimeoutRef.current = null;
      }, 700);
    }
  };

  // Mobile Touch Swipe Handlers (Swipe Up for next, Swipe Down for prev)
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartYRef.current = e.touches[0].clientY;
    touchEndYRef.current = e.touches[0].clientY;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    touchEndYRef.current = e.touches[0].clientY;
  };

  const handleTouchEnd = () => {
    if (touchStartYRef.current === null || touchEndYRef.current === null) return;
    const diffY = touchStartYRef.current - touchEndYRef.current;
    const threshold = 60; // Minimum swipe distance

    if (diffY > threshold) {
      // Swiped Up -> Next Short
      nextHighlight();
    } else if (diffY < -threshold) {
      // Swiped Down -> Previous Short
      previousHighlight();
    }

    touchStartYRef.current = null;
    touchEndYRef.current = null;
  };

  // Toggle Keep / Select state
  const handleToggleKeep = () => {
    if (!currentHighlight) return;
    updateHighlightCandidate(currentHighlight.id, {
      isSelected: !currentHighlight.isSelected,
    });
  };

  // Reset to AI-recommended timestamps
  const handleResetBoundaries = () => {
    if (!currentHighlight) return;
    const rStart = currentHighlight.aiRecommendedStart > 0
      ? currentHighlight.aiRecommendedStart
      : currentHighlight.startTime;
    const rEnd = currentHighlight.aiRecommendedEnd > 0
      ? currentHighlight.aiRecommendedEnd
      : currentHighlight.endTime;
    handleBoundaryChange(rStart, rEnd);
  };

  // Delete / Remove candidate from review
  const handleDeleteClip = async () => {
    if (!currentHighlight) return;
    if (confirm('Remove this Short candidate from review? (Your original video remains safe).')) {
      await deleteHighlightCandidate(currentHighlight.id);
    }
  };

  if (highlights.length === 0) {
    return (
      <div className="shorts-review-empty-view">
        <div className="empty-content-box">
          <div className="empty-icon">✨</div>
          <h2>No Highlight Moments Found</h2>
          <p>Run the AI video processing pipeline on your video to detect and rank the best vertical Shorts moments.</p>
          <button className="btn btn-primary" onClick={onExit} style={{ marginTop: '16px' }}>
            ← Back to Project Studio
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="shorts-review-mode-root"
      onWheel={handleWheel}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Top Navbar */}
      <header className="review-top-navbar">
        <div className="navbar-left">
          <button className="back-studio-btn" onClick={onExit} title="Exit review mode">
            ← Exit Review
          </button>
          <span className="navbar-project-title">{video.originalFilename || 'Video Shorts Review'}</span>
        </div>

        <div className="navbar-center">
          <ClipNavigation
            currentIndex={currentHighlightIndex}
            totalClips={highlights.length}
            onPrev={previousHighlight}
            onNext={nextHighlight}
            onOpenDrawer={() => setIsDrawerOpen(true)}
          />
        </div>

        <div className="navbar-right">
          <button
            className={`navbar-action-btn ${captionsEnabled ? 'active' : ''}`}
            onClick={() => setIsCaptionCustomizerOpen(true)}
            title="Customize live animated captions"
          >
            💬 Captions
          </button>

          {/* Individual Direct Download Button for Active Short */}
          {isCurrentShortCompleted ? (
            <button
              className="navbar-action-btn"
              style={{
                borderColor: '#10B981',
                color: '#34D399',
                background: 'rgba(16, 185, 129, 0.18)',
                fontWeight: 700,
              }}
              onClick={() => {
                if (matchingShort) {
                  downloadShort(matchingShort.id);
                }
              }}
              title="Download only this Short's MP4 directly"
            >
              ⬇️ Download Short #{currentHighlightIndex + 1} MP4
            </button>
          ) : isCurrentShortRendering ? (
            <button
              className="navbar-action-btn"
              style={{
                borderColor: '#6366F1',
                color: '#A5B4FC',
                background: 'rgba(99, 102, 241, 0.2)',
                fontWeight: 600,
              }}
              disabled
            >
              ⚡ Rendering ({matchingShort?.renderProgress || 25}%)
            </button>
          ) : (
            <button
              className="navbar-action-btn"
              style={{
                borderColor: '#6366F1',
                color: '#A5B4FC',
                background: 'rgba(99, 102, 241, 0.15)',
                fontWeight: 600,
              }}
              onClick={async () => {
                if (!currentHighlight) return;
                try {
                  await generateShort(currentHighlight.id, {
                    captionsEnabled,
                    reframeMode,
                  });
                } catch (err) {}
              }}
              title="Render only this Short as a 9:16 vertical video"
            >
              ⚡ Render Short #{currentHighlightIndex + 1}
            </button>
          )}

          {shorts.filter((s) => s.status === 'completed' && s.filePath).length > 1 && (
            <button
              className="navbar-action-btn"
              style={{
                borderColor: 'rgba(255, 255, 255, 0.2)',
                color: '#CBD5E1',
                background: 'rgba(255, 255, 255, 0.05)',
                fontWeight: 600,
              }}
              onClick={() => downloadAllShorts(video.projectId)}
              title="Download all completed shorts as a single ZIP archive"
            >
              📦 Download All ZIP ({shorts.filter((s) => s.status === 'completed' && s.filePath).length})
            </button>
          )}

          <button
            className="navbar-action-btn"
            style={{
              background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.25), rgba(236, 72, 153, 0.25))',
              borderColor: '#8B5CF6',
              color: '#DDD6FE',
              fontWeight: 600,
            }}
            disabled={isBatchExporting}
            onClick={async () => {
              try {
                await generateAllShorts(video.projectId, { captionsEnabled, reframeMode });
              } catch (err) {}
            }}
            title="Export all detected highlight moments into 9:16 vertical shorts at once"
          >
            {isBatchExporting ? '⚡ Exporting All...' : `⚡ Export All (${highlights.length})`}
          </button>

          <button
            className="navbar-action-btn export-btn"
            onClick={() => setIsExportModalOpen(true)}
            title="Export this 9:16 vertical Short with custom settings"
          >
            🚀 Export Short
          </button>
        </div>
      </header>

      {/* Main Review Stage Layout */}
      <main className="review-stage-layout">
        {/* Left Column: Collapsible Clip Drawer / List */}
        <aside className={`review-left-drawer ${isDrawerOpen ? 'drawer-open' : ''}`}>
          <ClipListDrawer
            highlights={highlights}
            currentIndex={currentHighlightIndex}
            onSelectIndex={setCurrentHighlightIndex}
            isOpen={isDrawerOpen}
            onClose={() => setIsDrawerOpen(false)}
            isMobile={isMobile}
          />
        </aside>

        {/* Center Column: 9:16 Vertical Video Player */}
        <section className="review-center-stage">
          <VideoReviewPlayer
            video={video}
            transcript={transcript}
            startTime={startTime}
            endTime={endTime}
            currentTime={currentTime}
            onTimeUpdate={setCurrentTime}
            onSeek={setCurrentTime}
            captionsEnabled={captionsEnabled}
            captionStyle={captionStyle}
            reframeMode={reframeMode}
            cropOffsetX={currentHighlight?.cropOffsetX}
            onNextClip={nextHighlight}
            onPrevClip={previousHighlight}
          />
        </section>

        {/* Right Column: Clip Info & AI Insights Panel */}
        <aside className="review-right-panel">
          <ClipInfoPanel
            highlight={currentHighlight}
            rank={currentHighlightIndex + 1}
            copyright={copyright}
            reframeMode={reframeMode}
            onReframeChange={handleReframeChange}
            onToggleKeep={handleToggleKeep}
            onResetBoundaries={handleResetBoundaries}
            onDeleteClip={handleDeleteClip}
            onOpenCaptionCustomizer={() => setIsCaptionCustomizerOpen(true)}
            onExport={() => setIsExportModalOpen(true)}
            onAutoFrame={handleAutoFrame}
            isAutoFraming={isAutoFraming}
            isCompleted={isCurrentShortCompleted}
            renderProgress={matchingShort?.renderProgress || 0}
            isExporting={isCurrentShortRendering}
            onDownload={() => {
              if (matchingShort) {
                downloadShort(matchingShort.id);
              }
            }}
          />
        </aside>
      </main>

      {/* Bottom Section: Dynamic Waveform & Boundary Timeline Bar */}
      <footer className="review-bottom-timeline-bar">
        <WaveformTimeline
          waveform={waveform}
          videoDuration={video.duration || 100}
          startTime={startTime}
          endTime={endTime}
          currentTime={currentTime}
          onSeek={setCurrentTime}
          onBoundaryChange={handleBoundaryChange}
          minDuration={15.0}
          maxDuration={30.0}
        />
      </footer>

      {/* Floating Caption Customization Drawer / Modal */}
      {isCaptionCustomizerOpen && (
        <div className="caption-modal-backdrop" onClick={() => setIsCaptionCustomizerOpen(false)}>
          <div className="caption-customizer-modal-content" onClick={(e) => e.stopPropagation()}>
            <CaptionCustomizer
              captionStyle={captionStyle}
              onChange={setCaptionStyle}
              enabled={captionsEnabled}
              onToggleEnabled={setCaptionsEnabled}
              onClose={() => setIsCaptionCustomizerOpen(false)}
            />
          </div>
        </div>
      )}

      {/* Export Short Modal */}
      <ExportShortModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        highlight={currentHighlight}
        captionsEnabled={captionsEnabled}
        reframeMode={reframeMode}
      />
    </div>
  );
};
