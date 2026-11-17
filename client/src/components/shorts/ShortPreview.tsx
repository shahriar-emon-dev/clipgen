import React, { useRef, useState, useEffect } from 'react';
import type { Short } from '@shared/types.js';

interface ShortPreviewProps {
  short: Short;
  sourceVideoUrl?: string;
  cropOffsetX?: number;
}

export const ShortPreview: React.FC<ShortPreviewProps> = ({ short, sourceVideoUrl, cropOffsetX }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const bgVideoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const isCompletedRender = short.status === 'completed' && Boolean(short.filePath);
  const renderUrl = short.filePath
    ? `/api/files/renders/${short.projectId}/${short.filePath.split(/[\\/]/).pop()}`
    : '';

  const activeSrc = isCompletedRender ? renderUrl : (sourceVideoUrl || '');

  // Clamp time loop for draft preview of source video
  useEffect(() => {
    if (isCompletedRender || !videoRef.current) return;

    const handleTimeUpdate = () => {
      if (!videoRef.current) return;
      if (videoRef.current.currentTime < short.startTime || videoRef.current.currentTime >= short.endTime) {
        videoRef.current.currentTime = short.startTime;
      }
      if (bgVideoRef.current && Math.abs(bgVideoRef.current.currentTime - videoRef.current.currentTime) > 0.3) {
        bgVideoRef.current.currentTime = videoRef.current.currentTime;
      }
    };

    const v = videoRef.current;
    v.addEventListener('timeupdate', handleTimeUpdate);
    return () => v.removeEventListener('timeupdate', handleTimeUpdate);
  }, [isCompletedRender, short.startTime, short.endTime]);

  const togglePlay = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
        bgVideoRef.current?.pause();
      } else {
        videoRef.current.play();
        bgVideoRef.current?.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const isBlurFill = !isCompletedRender && short.reframeMode === 'blur_fill';

  // Compute CSS focal positioning for live preview
  let objectPos = '50% 50%';
  if (!isCompletedRender && cropOffsetX !== undefined) {
    objectPos = `${(cropOffsetX * 100).toFixed(1)}% 50%`;
  }

  return (
    <div className="short-preview-container">
      <div className="vertical-phone-frame">
        {/* Floating live status pill when rendering */}
        {short.status === 'rendering' && (
          <div
            style={{
              position: 'absolute',
              top: '12px',
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 20,
              background: 'rgba(15, 23, 42, 0.9)',
              backdropFilter: 'blur(8px)',
              border: '1px solid rgba(99, 102, 241, 0.5)',
              borderRadius: '20px',
              padding: '6px 14px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              boxShadow: '0 4px 16px rgba(0,0,0,0.6)',
              fontSize: '0.75rem',
              fontWeight: 700,
              color: '#FFFFFF',
              whiteSpace: 'nowrap',
            }}
          >
            <div className="spinner spinner-sm" style={{ width: '12px', height: '12px', borderWidth: '2px' }} />
            <span>Rendering 9:16 ({short.renderProgress || 15}%)</span>
          </div>
        )}

        {/* Live Lossless Blurred Fill Background (only in draft mode) */}
        {isBlurFill && activeSrc && (
          <video
            ref={bgVideoRef}
            src={activeSrc}
            className="phone-video"
            playsInline
            muted
            loop
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              filter: 'blur(22px) brightness(0.65)',
              transform: 'scale(1.25)',
              zIndex: 1,
            }}
          />
        )}

        {/* Main Video Element */}
        {activeSrc ? (
          <video
            ref={videoRef}
            src={activeSrc}
            className="phone-video"
            playsInline
            loop={isCompletedRender}
            muted={!isCompletedRender}
            onClick={togglePlay}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            style={{
              position: 'relative',
              zIndex: 2,
              objectFit: isBlurFill ? 'contain' : 'cover',
              objectPosition: isBlurFill ? 'center center' : objectPos,
            }}
          />
        ) : (
          <div className="phone-empty-state" style={{ zIndex: 2 }}>
            <span style={{ fontSize: '1.8rem' }}>🎬</span>
            <span>No video preview available</span>
          </div>
        )}

        {/* Mode & Framing Tag Overlay */}
        <div
          style={{
            position: 'absolute',
            bottom: '12px',
            left: '12px',
            zIndex: 10,
            background: 'rgba(0, 0, 0, 0.65)',
            backdropFilter: 'blur(4px)',
            borderRadius: '6px',
            padding: '2px 8px',
            fontSize: '0.7rem',
            color: '#CBD5E1',
            fontWeight: 600,
            border: '1px solid rgba(255, 255, 255, 0.1)',
          }}
        >
          {isCompletedRender
            ? (short.reframeMode === 'blur_fill' ? '✓ Rendered (100% Lossless Blur)' : '✓ Rendered (Cropped 9:16)')
            : short.reframeMode === 'blur_fill'
            ? '🖼️ Lossless Blur (100% Full Sharpness)'
            : short.reframeMode === 'action'
            ? '🎯 Smart Action (2.7x Digital Zoom)'
            : short.reframeMode === 'face'
            ? '👤 Speaker Focus (Cropped)'
            : '📐 Center Crop (2.7x Digital Zoom)'}
        </div>

        {/* Play/Pause Button */}
        {activeSrc && (
          <button
            className="phone-play-btn"
            onClick={togglePlay}
            style={{ zIndex: 15 }}
          >
            {isPlaying ? '⏸' : '▶'}
          </button>
        )}
      </div>
    </div>
  );
};
