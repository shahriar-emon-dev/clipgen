import React, { useState, useEffect } from 'react';
import type { HighlightCandidate, Short, ReframeMode } from '@shared/types.js';
import { api } from '../../services/api.js';
import { useShortsStore } from '../../stores/shortsStore.js';

interface ExportShortModalProps {
  isOpen: boolean;
  onClose: () => void;
  highlight: HighlightCandidate | null;
  captionsEnabled: boolean;
  reframeMode: ReframeMode;
  onGenerateSuccess?: (short: Short) => void;
}

export const ExportShortModal: React.FC<ExportShortModalProps> = ({
  isOpen,
  onClose,
  highlight,
  captionsEnabled: defaultCaptions,
  reframeMode: defaultReframe,
  onGenerateSuccess,
}) => {
  const { generateAllShorts, highlights, isBatchExporting } = useShortsStore();
  const [captionsOn, setCaptionsOn] = useState(defaultCaptions);
  const [reframe, setReframe] = useState<ReframeMode>(defaultReframe);
  const [isRendering, setIsRendering] = useState(false);
  const [renderProgress, setRenderProgress] = useState(0);
  const [renderedShort, setRenderedShort] = useState<Short | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    setCaptionsOn(defaultCaptions);
    setReframe(defaultReframe);
    setRenderProgress(0);
    setRenderedShort(null);
    setErrorMessage(null);
    setIsRendering(false);
  }, [isOpen, defaultCaptions, defaultReframe, highlight?.id]);

  if (!isOpen || !highlight) return null;

  const duration = Math.max(0, highlight.endTime - highlight.startTime);

  const handleStartExport = async () => {
    setIsRendering(true);
    setRenderProgress(10);
    setErrorMessage(null);

    try {
      // Trigger short generation
      const short = await api.generateShort(highlight.id, {
        captionsEnabled: captionsOn,
        reframeMode: reframe,
      });

      // Poll or simulate progressive updates for smooth feedback
      let currentProgress = 25;
      setRenderProgress(currentProgress);

      const pollInterval = setInterval(async () => {
        try {
          const check = await api.getShort(short.id);
          if (check.status === 'completed') {
            clearInterval(pollInterval);
            setRenderProgress(100);
            setIsRendering(false);
            setRenderedShort(check);
            if (onGenerateSuccess) onGenerateSuccess(check);
          } else if (check.status === 'failed') {
            clearInterval(pollInterval);
            setIsRendering(false);
            setErrorMessage(check.error || 'Rendering encountered an error');
          } else {
            currentProgress = Math.min(95, currentProgress + 15);
            setRenderProgress(check.renderProgress || currentProgress);
          }
        } catch {
          // If polling fails temporarily, increment smooth progress
          currentProgress = Math.min(90, currentProgress + 10);
          setRenderProgress(currentProgress);
        }
      }, 1200);

    } catch (err: any) {
      setIsRendering(false);
      setErrorMessage(err.message || 'Export failed to start');
    }
  };

  const handleDownload = () => {
    if (renderedShort) {
      window.open(api.getDownloadUrl(renderedShort.id), '_blank');
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content export-modal-card">
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '1.4rem' }}>🎬</span>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700 }}>
                {renderedShort ? '✨ Short Ready for Export' : 'Export 9:16 Vertical Short'}
              </h3>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                {highlight.title || `Moment (${duration.toFixed(0)}s)`}
              </span>
            </div>
          </div>
          <button className="modal-close-btn" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          {errorMessage && (
            <div className="error-banner" style={{ marginBottom: '16px' }}>
              ⚠️ {errorMessage}
            </div>
          )}

          {!isRendering && !renderedShort && (
            <div className="export-spec-list">
              <div className="spec-row">
                <span className="spec-label">Resolution</span>
                <span className="spec-value">1080 × 1920 (Vertical 9:16)</span>
              </div>
              <div className="spec-row">
                <span className="spec-label">Frame Rate</span>
                <span className="spec-value">30 FPS (Standard H.264)</span>
              </div>
              <div className="spec-row">
                <span className="spec-label">Format</span>
                <span className="spec-value">MP4 (Optimized for Reels/Shorts/TikTok)</span>
              </div>
              <div className="spec-row">
                <span className="spec-label">Duration</span>
                <span className="spec-value">{duration.toFixed(1)}s (15–30s optimal)</span>
              </div>

              <div className="spec-form-options">
                <label className="switch-label">
                  <input
                    type="checkbox"
                    checked={captionsOn}
                    onChange={(e) => setCaptionsOn(e.target.checked)}
                  />
                  <span className="switch-slider" />
                  <span className="switch-text">Burn Synchronized Captions</span>
                </label>

                <div style={{ marginTop: '14px' }}>
                  <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
                    Framing Mode
                  </label>
                  <select
                    className="input"
                    value={reframe}
                    onChange={(e) => setReframe(e.target.value as ReframeMode)}
                  >
                    <option value="blur_fill">🖼️ Lossless Blur (100% full frame, zero crop — Recommended)</option>
                    <option value="action">🎯 Smart Reframe (AI motion tracking + auto-fallback to blur)</option>
                    <option value="face">👤 Speaker / Face Focus</option>
                    <option value="center">📐 Center Crop (Fixed)</option>
                  </select>
                </div>

                {highlights.length > 1 && (
                  <div
                    style={{
                      marginTop: '16px',
                      padding: '12px 14px',
                      background: 'rgba(99, 102, 241, 0.1)',
                      borderRadius: '8px',
                      border: '1px solid rgba(99, 102, 241, 0.25)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '12px',
                    }}
                  >
                    <div>
                      <span
                        style={{
                          fontSize: '0.82rem',
                          fontWeight: 600,
                          color: '#C7D2FE',
                          display: 'block',
                        }}
                      >
                        ⚡ Batch Export All Moments?
                      </span>
                      <span style={{ fontSize: '0.75rem', color: '#94A3B8' }}>
                        Convert all {highlights.length} detected highlights at once.
                      </span>
                    </div>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      style={{
                        borderColor: '#8B5CF6',
                        color: '#DDD6FE',
                        background: 'rgba(139, 92, 246, 0.2)',
                        whiteSpace: 'nowrap',
                        fontWeight: 600,
                      }}
                      disabled={isBatchExporting}
                      onClick={async () => {
                        onClose();
                        await generateAllShorts(highlight.projectId, {
                          captionsEnabled: captionsOn,
                          reframeMode: reframe,
                        });
                      }}
                    >
                      {isBatchExporting ? 'Exporting...' : `Export All (${highlights.length})`}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {isRendering && (
            <div className="rendering-progress-box">
              <div className="spinner spinner-lg" style={{ margin: '0 auto 16px' }} />
              <h4 style={{ margin: '0 0 8px', fontSize: '1.1rem' }}>Rendering Short...</h4>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '16px' }}>
                Applying 9:16 vertical reframe, video encoding, and audio-synced captions.
              </p>
              <div className="progress-bar-track">
                <div
                  className="progress-bar-fill"
                  style={{ width: `${renderProgress}%` }}
                />
              </div>
              <span className="progress-percent-label">{renderProgress}% Complete</span>
            </div>
          )}

          {renderedShort && (
            <div className="export-complete-box">
              <div className="success-icon-badge">✓</div>
              <h4 style={{ margin: '0 0 6px', fontSize: '1.1rem', color: '#10B981' }}>
                Rendering Complete!
              </h4>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                Your high-definition 1080×1920 vertical Short is ready to download and publish.
              </p>

              <div className="download-actions-grid">
                <button className="btn btn-primary btn-lg" onClick={handleDownload}>
                  ⬇ Download MP4 Video
                </button>
                <button
                  className="btn btn-secondary btn-md"
                  onClick={() => {
                    setRenderedShort(null);
                    setIsRendering(false);
                    setRenderProgress(0);
                  }}
                >
                  ↺ Export Again with Different Settings
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="modal-footer">
          {!isRendering && !renderedShort ? (
            <>
              <button className="btn btn-ghost" onClick={onClose}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={handleStartExport}>
                🚀 EXPORT (1080 × 1920)
              </button>
            </>
          ) : (
            <button className="btn btn-ghost" onClick={onClose}>
              {renderedShort ? 'Close' : 'Cancel'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
