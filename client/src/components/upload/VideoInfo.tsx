import React from 'react';
import type { Video } from '@shared/types.js';
import { Button } from '../common/Button.js';

interface VideoInfoProps {
  video: Video;
  onStartProcessing: (preferredFramingMode: 'blur_fill' | 'action') => void;
  isProcessing: boolean;
}

export const VideoInfo: React.FC<VideoInfoProps> = ({
  video,
  onStartProcessing,
  isProcessing,
}) => {
  const [framingMode, setFramingMode] = React.useState<'blur_fill' | 'action'>('blur_fill');

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}m ${secs}s`;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="card video-info-card">
      <div className="video-info-header">
        <div className="video-meta-preview">
          {video.thumbnailUrl ? (
            <img src={video.thumbnailUrl} alt="Thumbnail" className="video-thumb" />
          ) : (
            <div className="video-thumb-placeholder">🎬</div>
          )}
        </div>

        <div className="video-meta-details">
          <h3 className="truncate">{video.originalFilename}</h3>
          
          <div className="video-meta-tags">
            <span className="meta-tag">⏱️ {formatDuration(video.duration)}</span>
            <span className="meta-tag">📐 {video.width}×{video.height}</span>
            <span className="meta-tag">⚡ {Math.round(video.fps)} FPS</span>
            <span className="meta-tag">💾 {formatFileSize(video.fileSize)}</span>
            <span className="meta-tag">🎞️ {video.codec.toUpperCase()}</span>
            <span className="meta-tag">
              🔊 {(video.audioTracks ?? 0) > 0 ? `${(video.audioCodec || 'AAC').toUpperCase()} (${video.audioTracks} ch)` : 'No Audio'}
            </span>
          </div>

          {/* 9:16 Framing Mode Preference Selector */}
          <div style={{ marginTop: '16px', background: 'rgba(0, 0, 0, 0.25)', padding: '12px 14px', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#E2E8F0' }}>
                Preferred 9:16 Framing Mode:
              </span>
              <span style={{ fontSize: '0.74rem', color: '#94A3B8' }}>
                {framingMode === 'blur_fill' ? '✓ 100% full frame preserved' : '✓ Dynamic AI tracking with auto-fallback'}
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '8px' }}>
              <button
                type="button"
                onClick={() => setFramingMode('blur_fill')}
                style={{
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: `1px solid ${framingMode === 'blur_fill' ? '#10B981' : 'rgba(255, 255, 255, 0.12)'}`,
                  background: framingMode === 'blur_fill' ? 'rgba(16, 185, 129, 0.18)' : 'rgba(255, 255, 255, 0.03)',
                  color: framingMode === 'blur_fill' ? '#34D399' : '#94A3B8',
                  textAlign: 'left',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '2px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '1rem' }}>🖼️</span>
                  <strong style={{ fontSize: '0.86rem', color: framingMode === 'blur_fill' ? '#FFFFFF' : '#CBD5E1' }}>
                    Lossless Blur
                  </strong>
                  <span style={{ fontSize: '0.66rem', padding: '1px 5px', borderRadius: '3px', background: 'rgba(16, 185, 129, 0.3)', color: '#A7F3D0', fontWeight: 700 }}>
                    Recommended
                  </span>
                </div>
                <span style={{ fontSize: '0.72rem', color: '#94A3B8', lineHeight: 1.3 }}>
                  Never crops source. Keeps full player, ball & goal action sharp in foreground.
                </span>
              </button>

              <button
                type="button"
                onClick={() => setFramingMode('action')}
                style={{
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: `1px solid ${framingMode === 'action' ? '#8B5CF6' : 'rgba(255, 255, 255, 0.12)'}`,
                  background: framingMode === 'action' ? 'rgba(139, 92, 246, 0.18)' : 'rgba(255, 255, 255, 0.03)',
                  color: framingMode === 'action' ? '#C084FC' : '#94A3B8',
                  textAlign: 'left',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '2px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '1rem' }}>🎯</span>
                  <strong style={{ fontSize: '0.86rem', color: framingMode === 'action' ? '#FFFFFF' : '#CBD5E1' }}>
                    Smart Reframe
                  </strong>
                  <span style={{ fontSize: '0.66rem', padding: '1px 5px', borderRadius: '3px', background: 'rgba(139, 92, 246, 0.3)', color: '#DDD6FE', fontWeight: 700 }}>
                    AI Motion
                  </span>
                </div>
                <span style={{ fontSize: '0.72rem', color: '#94A3B8', lineHeight: 1.3 }}>
                  Tracks player motion. Automatically falls back to Lossless Blur if action is wide.
                </span>
              </button>
            </div>
          </div>

          <div style={{ marginTop: '16px' }}>
            <Button
              variant="primary"
              size="lg"
              onClick={() => onStartProcessing(framingMode)}
              loading={isProcessing}
              disabled={isProcessing}
            >
              {isProcessing ? 'AI Processing Video...' : '🚀 Start AI Analysis & Highlight Extraction'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
