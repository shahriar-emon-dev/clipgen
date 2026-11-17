import React, { useRef, useState, useEffect, useCallback } from 'react';
import type { Video, Transcript, CaptionStyle, ReframeMode } from '@shared/types.js';
import { CaptionOverlay } from './CaptionOverlay.js';

interface VideoReviewPlayerProps {
  video: Video;
  transcript: Transcript | null;
  startTime: number;
  endTime: number;
  currentTime: number;
  onTimeUpdate: (time: number) => void;
  onSeek: (time: number) => void;
  captionsEnabled: boolean;
  captionStyle: CaptionStyle;
  reframeMode: ReframeMode;
  cropOffsetX?: number;
  onNextClip?: () => void;
  onPrevClip?: () => void;
}

export const VideoReviewPlayer: React.FC<VideoReviewPlayerProps> = ({
  video,
  transcript,
  startTime,
  endTime,
  currentTime,
  onTimeUpdate,
  onSeek,
  captionsEnabled,
  captionStyle,
  reframeMode,
  cropOffsetX,
  onNextClip,
  onPrevClip,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const bgVideoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [showControls, setShowControls] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [panOffset, setPanOffset] = useState(0); // Optional manual pan offset (-50% to +50%)
  const hideControlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const videoUrl = `/api/files/${video.projectId}/${video.filename}`;

  // Keep video time synchronized within [startTime, endTime] bounds
  useEffect(() => {
    if (videoRef.current) {
      if (videoRef.current.currentTime < startTime || videoRef.current.currentTime > endTime) {
        videoRef.current.currentTime = startTime;
        onTimeUpdate(startTime);
      }
    }
    if (bgVideoRef.current) {
      if (bgVideoRef.current.currentTime < startTime || bgVideoRef.current.currentTime > endTime) {
        bgVideoRef.current.currentTime = startTime;
      }
    }
  }, [startTime, endTime]);

  // Handle external seek
  useEffect(() => {
    if (videoRef.current && Math.abs(videoRef.current.currentTime - currentTime) > 0.3) {
      videoRef.current.currentTime = currentTime;
    }
    if (bgVideoRef.current && Math.abs(bgVideoRef.current.currentTime - currentTime) > 0.3) {
      bgVideoRef.current.currentTime = currentTime;
    }
  }, [currentTime]);

  // Auto-hide controls activity timer
  const resetControlsTimer = useCallback(() => {
    setShowControls(true);
    if (hideControlsTimeoutRef.current) {
      clearTimeout(hideControlsTimeoutRef.current);
    }
    if (isPlaying) {
      hideControlsTimeoutRef.current = setTimeout(() => {
        setShowControls(false);
      }, 2500);
    }
  }, [isPlaying]);

  useEffect(() => {
    resetControlsTimer();
    return () => {
      if (hideControlsTimeoutRef.current) clearTimeout(hideControlsTimeoutRef.current);
    };
  }, [resetControlsTimer, isPlaying]);

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
      bgVideoRef.current?.pause();
      setIsPlaying(false);
    } else {
      // If at end of clip, restart from clip start
      if (videoRef.current.currentTime >= endTime - 0.2) {
        videoRef.current.currentTime = startTime;
        if (bgVideoRef.current) bgVideoRef.current.currentTime = startTime;
      }
      videoRef.current.play().catch(console.warn);
      bgVideoRef.current?.play().catch(console.warn);
      setIsPlaying(true);
    }
    resetControlsTimer();
  };

  const toggleMute = () => {
    if (!videoRef.current) return;
    const nextMuted = !isMuted;
    videoRef.current.muted = nextMuted;
    setIsMuted(nextMuted);
    resetControlsTimer();
  };

  const handleVolumeChange = (newVol: number) => {
    if (!videoRef.current) return;
    videoRef.current.volume = newVol;
    setVolume(newVol);
    setIsMuted(newVol === 0);
    resetControlsTimer();
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(console.warn);
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(console.warn);
    }
  };

  const handleTimeUpdate = () => {
    if (!videoRef.current) return;
    const t = videoRef.current.currentTime;

    // Loop clip seamlessly
    if (t >= endTime) {
      videoRef.current.currentTime = startTime;
      if (bgVideoRef.current) bgVideoRef.current.currentTime = startTime;
      onTimeUpdate(startTime);
    } else if (t < startTime) {
      videoRef.current.currentTime = startTime;
      if (bgVideoRef.current) bgVideoRef.current.currentTime = startTime;
      onTimeUpdate(startTime);
    } else {
      if (bgVideoRef.current && Math.abs(bgVideoRef.current.currentTime - t) > 0.25) {
        bgVideoRef.current.currentTime = t;
      }
      onTimeUpdate(t);
    }
  };

  // 9:16 Crop styling calculation based on smartFraming cropOffsetX or reframeMode
  let cropTransform = 'translate(-50%, -50%)';
  if (reframeMode === 'speaker' || reframeMode === 'face') {
    cropTransform = `translate(calc(-50% + ${panOffset}px), -50%) scale(1.02)`;
  } else if (reframeMode === 'blur_fill') {
    cropTransform = 'translate(-50%, -50%)';
  }

  // Exact focal alignment calculated by OpenCV computer vision
  const objectPos = cropOffsetX !== undefined
    ? `${(cropOffsetX * 100).toFixed(1)}% 50%`
    : '50% 50%';

  const clipDuration = Math.max(0.1, endTime - startTime);
  const clipProgress = Math.max(0, Math.min(100, ((currentTime - startTime) / clipDuration) * 100));

  return (
    <div
      ref={containerRef}
      className={`video-review-player-viewport ${isFullscreen ? 'fullscreen-mode' : ''}`}
      onMouseMove={resetControlsTimer}
      onClick={resetControlsTimer}
    >
      {/* 9:16 Vertical Phone Preview Frame */}
      <div className="vertical-aspect-box">
        {/* Lossless 16:9 blurred background fill for sports & wide plays */}
        {reframeMode === 'blur_fill' && (
          <video
            ref={bgVideoRef}
            src={videoUrl}
            className="vertical-source-video"
            playsInline
            muted
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              filter: 'blur(22px) brightness(0.65)',
              transform: 'scale(1.25) translate(-50%, -50%)',
              zIndex: 1,
              pointerEvents: 'none',
            }}
          />
        )}

        <video
          ref={videoRef}
          src={videoUrl}
          className="vertical-source-video"
          playsInline
          autoPlay
          muted={isMuted}
          onTimeUpdate={handleTimeUpdate}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onClick={togglePlay}
          style={{
            position: 'relative',
            zIndex: 2,
            transform: cropTransform,
            objectFit: reframeMode === 'blur_fill' ? 'contain' : 'cover',
            objectPosition: reframeMode === 'blur_fill' ? '50% 50%' : objectPos,
          }}
        />

        {/* Dynamic Synced Subtitles / Captions Overlay */}
        <CaptionOverlay
          transcript={transcript}
          currentTime={currentTime}
          startTime={startTime}
          endTime={endTime}
          captionStyle={captionStyle}
          enabled={captionsEnabled}
        />

        {/* Ambient Top & Bottom Gradients for UI clarity */}
        <div className={`player-ambient-gradient top ${showControls ? 'visible' : ''}`} />
        <div className={`player-ambient-gradient bottom ${showControls ? 'visible' : ''}`} />

        {/* Big Center Play/Pause Ripple Indicator on Tap/Click */}
        {!isPlaying && (
          <div className="center-playback-indicator" onClick={togglePlay}>
            <div className="playback-icon-circle">▶</div>
          </div>
        )}

        {/* Top Header Quick Controls */}
        <div className={`player-overlay-top ${showControls ? 'visible' : ''}`}>
          <div className="reframe-badge">
            <span className="aspect-label">9:16</span>
            <span className="reframe-label">
              {reframeMode === 'blur_fill'
                ? '🖼️ Lossless 16:9 Blur-Fill'
                : reframeMode === 'action'
                ? (cropOffsetX !== undefined && Math.abs(cropOffsetX - 0.5) > 0.05
                    ? `🎯 Smart Action (${cropOffsetX > 0.5 ? 'Right' : 'Left'} +${Math.round(Math.abs(cropOffsetX - 0.5) * 200)}%)`
                    : '🎯 Smart Action')
                : reframeMode === 'face'
                ? '👤 Face Focus'
                : '📐 Center Crop'}
            </span>
          </div>

          <div className="top-actions-row">
            <button
              className="quick-icon-btn"
              onClick={toggleMute}
              title={isMuted ? 'Unmute (M)' : 'Mute (M)'}
            >
              {isMuted ? '🔇' : '🔊'}
            </button>
            <button
              className="quick-icon-btn"
              onClick={toggleFullscreen}
              title="Fullscreen (F)"
            >
              {isFullscreen ? '⤦' : '⤢'}
            </button>
          </div>
        </div>

        {/* Side Floating Quick Nav Buttons (Mobile / Tablet) */}
        {onPrevClip && (
          <button
            className={`floating-side-nav prev ${showControls ? 'visible' : ''}`}
            onClick={(e) => { e.stopPropagation(); onPrevClip(); }}
            title="Previous Short (↑)"
          >
            ‹
          </button>
        )}
        {onNextClip && (
          <button
            className={`floating-side-nav next ${showControls ? 'visible' : ''}`}
            onClick={(e) => { e.stopPropagation(); onNextClip(); }}
            title="Next Short (↓)"
          >
            ›
          </button>
        )}

        {/* Bottom Mini Progress Bar */}
        <div className="player-mini-progress-bar">
          <div
            className="player-mini-progress-fill"
            style={{ width: `${clipProgress}%` }}
          />
        </div>
      </div>
    </div>
  );
};
