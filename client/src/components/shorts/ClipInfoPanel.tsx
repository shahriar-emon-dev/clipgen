import React, { useState } from 'react';
import type { HighlightCandidate, CopyrightCheck, ReframeMode } from '@shared/types.js';

interface ClipInfoPanelProps {
  highlight: HighlightCandidate | null;
  rank: number;
  copyright: CopyrightCheck | null;
  reframeMode: ReframeMode;
  onReframeChange: (mode: ReframeMode) => void;
  onToggleKeep: () => void;
  onResetBoundaries: () => void;
  onDeleteClip: () => void;
  onOpenCaptionCustomizer: () => void;
  onExport: () => void;
  onAutoFrame?: () => void;
  isAutoFraming?: boolean;
  isExporting?: boolean;
  isCompleted?: boolean;
  renderProgress?: number;
  onDownload?: () => void;
}

export const ClipInfoPanel: React.FC<ClipInfoPanelProps> = ({
  highlight,
  rank,
  copyright,
  reframeMode,
  onReframeChange,
  onToggleKeep,
  onResetBoundaries,
  onDeleteClip,
  onOpenCaptionCustomizer,
  onExport,
  onAutoFrame,
  isAutoFraming = false,
  isExporting = false,
  isCompleted = false,
  renderProgress = 0,
  onDownload,
}) => {
  const [isCollapsed, setIsCollapsed] = useState(false);

  if (!highlight) {
    return (
      <div className="clip-info-panel empty">
        <p>No clip selected</p>
      </div>
    );
  }

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const duration = Math.max(0, highlight.endTime - highlight.startTime);

  // Parse why selected reasons (use dynamic whySelected from backend first)
  const reasons: string[] = (highlight.whySelected && highlight.whySelected.length > 0)
    ? highlight.whySelected
    : [];
  if (reasons.length === 0) {
    if (highlight.scoreHook >= 60) reasons.push('Strong hook & opening attention');
    if (highlight.scoreEmotion >= 60) reasons.push('High emotional engagement');
    if (highlight.scoreInformation >= 60) reasons.push('High value & information density');
    if (highlight.scoreStory >= 60) reasons.push('Clear narrative & complete thought');
    if (highlight.scoreSurprise >= 60) reasons.push('Surprise / twist element');
    if (highlight.scoreAudio >= 60) reasons.push('High speech energy & zero dead air');
  }
  if (reasons.length === 0) {
    reasons.push('Balanced speech rhythm and audience retention signals');
  }

  const copyrightRisk = copyright?.riskLevel || 'low';

  return (
    <div className={`clip-info-panel-container ${isCollapsed ? 'collapsed' : ''}`}>
      {/* Panel Top Header */}
      <div className="panel-top-bar" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
          <div className="moment-rank-badge" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span className="rank-star">⚡</span>
            <span className="rank-title">BEST MOMENT #{rank}</span>
            {highlight.confidence && (
              <span
                style={{
                  fontSize: '0.68rem',
                  fontWeight: 700,
                  padding: '2px 6px',
                  borderRadius: '4px',
                  background: highlight.confidence === 'High' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(245, 158, 11, 0.2)',
                  color: highlight.confidence === 'High' ? '#34D399' : '#FBBF24',
                  border: `1px solid ${highlight.confidence === 'High' ? 'rgba(16, 185, 129, 0.4)' : 'rgba(245, 158, 11, 0.4)'}`,
                }}
              >
                {highlight.confidence}
              </span>
            )}
          </div>

          <button
            className="collapse-toggle-btn"
            onClick={() => setIsCollapsed(!isCollapsed)}
            title={isCollapsed ? 'Expand panel' : 'Collapse panel'}
          >
            {isCollapsed ? '▼ Show Details' : '▲ Hide'}
          </button>
        </div>

        <h4 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: '#FFFFFF', lineHeight: 1.3 }}>
          {highlight.title || `Best Moment #${rank}`}
        </h4>
      </div>

      {!isCollapsed && (
        <div className="panel-body-scrollable">
          {/* Score Main Display */}
          <div className="score-hero-card">
            <div className="score-main-value">
              <span className="score-number">{Math.round(highlight.scoreTotal)}</span>
              <span className="score-max">/100</span>
            </div>
            <div className="score-meta">
              <span className="score-title">Viral Short Score</span>
              <div className="score-stars">
                {'★'.repeat(Math.min(5, Math.max(1, Math.round(highlight.scoreTotal / 20))))}
              </div>
            </div>
          </div>

          {/* Time & Duration Stats */}
          <div className="info-stats-grid">
            <div className="stat-box">
              <span className="stat-label">Original Range</span>
              <span className="stat-val">{formatTime(highlight.startTime)} → {formatTime(highlight.endTime)}</span>
            </div>
            <div className="stat-box">
              <span className="stat-label">Duration</span>
              <span className="stat-val highlight">{duration.toFixed(1)}s</span>
            </div>
          </div>

          {/* Why Selected Breakdown */}
          <div className="why-selected-box">
            <h5 className="section-title">WHY SELECTED:</h5>
            <ul className="reasons-list">
              {reasons.map((r, idx) => (
                <li key={idx} className="reason-item">
                  <span className="check-icon">✓</span>
                  <span>{r}</span>
                </li>
              ))}
            </ul>
            {highlight.aiReason && (
              <p className="ai-insight-quote">
                "{highlight.aiReason}"
              </p>
            )}
          </div>

          {/* Signal Scores Breakdown Chips */}
          <div className="signals-chips-wrap">
            <span className="signal-chip">🪝 Hook: {highlight.scoreHook}%</span>
            <span className="signal-chip">❤️ Emotion: {highlight.scoreEmotion}%</span>
            <span className="signal-chip">💡 Value: {highlight.scoreInformation}%</span>
            <span className="signal-chip">📖 Story: {highlight.scoreStory}%</span>
            <span className="signal-chip">🔊 Audio: {highlight.scoreAudio}%</span>
          </div>

          {/* Visual Composition / Smart Framing Info */}
          {highlight.visualComposition && (
            <div
              style={{
                marginTop: '10px',
                padding: '8px 10px',
                borderRadius: '8px',
                background: 'rgba(255, 255, 255, 0.04)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                fontSize: '0.75rem',
                color: 'var(--text-secondary)',
                display: 'flex',
                justifyContent: 'space-between',
              }}
            >
              <span>🎥 Action Tracking: <strong>{highlight.visualComposition.motionQuality}%</strong></span>
              <span>📐 9:16 Framing: <strong>{highlight.visualComposition.framing}%</strong></span>
            </div>
          )}

          {/* Reframing Mode Selector */}
          <div className="reframing-selector-box">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <label className="reframing-label" style={{ margin: 0 }}>9:16 Smart Reframing</label>
              {onAutoFrame && (
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={onAutoFrame}
                  disabled={isAutoFraming}
                  style={{
                    fontSize: '0.72rem',
                    padding: '2px 8px',
                    height: 'auto',
                    background: 'rgba(99, 102, 241, 0.2)',
                    borderColor: '#818CF8',
                    color: '#C7D2FE',
                  }}
                  title="Auto-calculate best framing via OpenCV"
                >
                  {isAutoFraming ? 'Analyzing...' : '✨ Auto Frame'}
                </button>
              )}
            </div>

            <div className="reframing-options" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
              <button
                className={`reframe-opt-btn ${reframeMode === 'blur_fill' ? 'active' : ''}`}
                onClick={() => onReframeChange('blur_fill')}
                style={{
                  gridColumn: '1 / -1',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 12px',
                  fontWeight: 700,
                  fontSize: '0.84rem',
                }}
                title="Preserve 100% original frame with blurred background. Zero player, ball, or goal cut off."
              >
                <span>🖼️ Lossless Blur (Safe Frame)</span>
                <span style={{ fontSize: '0.66rem', padding: '2px 6px', borderRadius: '4px', background: 'rgba(16, 185, 129, 0.2)', color: '#34D399', fontWeight: 700 }}>
                  Recommended
                </span>
              </button>
              <button
                className={`reframe-opt-btn ${reframeMode === 'action' ? 'active' : ''}`}
                onClick={() => onReframeChange('action')}
                title="Continuous tracking of ball, player movement, and dynamic action (auto-fallback to blur if wide)"
              >
                🎯 Smart Reframe
              </button>
              <button
                className={`reframe-opt-btn ${reframeMode === 'face' ? 'active' : ''}`}
                onClick={() => onReframeChange('face')}
                title="Focus centered on speaker / human faces"
              >
                👤 Face Focus
              </button>
              <button
                className={`reframe-opt-btn ${reframeMode === 'center' ? 'active' : ''}`}
                onClick={() => onReframeChange('center')}
                style={{ gridColumn: '1 / -1', opacity: 0.7, fontSize: '0.74rem', padding: '4px 8px' }}
                title="Fixed center crop"
              >
                📐 Center Crop (Legacy)
              </button>
            </div>

            {reframeMode === 'blur_fill' && (
              <div style={{ marginTop: '8px', padding: '6px 10px', borderRadius: '6px', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.25)', fontSize: '0.72rem', color: '#6EE7B7', lineHeight: 1.4 }}>
                ✓ <strong>100% full frame preserved.</strong> Entire field, ball, goal, and players remain visible without cropping.
              </div>
            )}
            {reframeMode === 'action' && (
              <div style={{ marginTop: '8px', padding: '6px 10px', borderRadius: '6px', background: 'rgba(99, 102, 241, 0.1)', border: '1px solid rgba(99, 102, 241, 0.25)', fontSize: '0.72rem', color: '#C7D2FE', lineHeight: 1.4 }}>
                ✓ <strong>Smart motion reframing.</strong> Auto-tracks action; if play is too wide, safely falls back to Lossless Blur.
              </div>
            )}
          </div>

          {/* Copyright Risk Advisory Status */}
          <div className={`copyright-status-card risk-${copyrightRisk}`}>
            <div className="copyright-status-header">
              <span className="copyright-icon">🛡️</span>
              <span className="copyright-title">
                Copyright Risk: {copyrightRisk.toUpperCase()}
              </span>
            </div>
            <p className="copyright-desc">
              {copyrightRisk === 'low'
                ? 'Standard original content indicators detected. Ensure broadcast rights before publishing.'
                : 'Potential third-party audio/visual content noted. Verify usage permissions.'}
            </p>
          </div>
        </div>
      )}

      {/* Review Actions Footer */}
      <div className="panel-actions-footer">
        <div className="actions-primary-row">
          <button
            className={`action-btn keep-btn ${highlight.isSelected ? 'selected' : ''}`}
            onClick={onToggleKeep}
            title="Mark this Short as approved / selected"
          >
            {highlight.isSelected ? '★ Kept' : '☆ Keep'}
          </button>

          <button
            className="action-btn customize-btn"
            onClick={onOpenCaptionCustomizer}
            title="Customize live animated captions"
          >
            💬 Captions
          </button>

          <button
            className="action-btn reset-btn"
            onClick={onResetBoundaries}
            title="Reset start and end to AI recommended timestamps"
          >
            ↺ Reset
          </button>

          <button
            className="action-btn delete-btn"
            onClick={onDeleteClip}
            title="Remove this candidate from review (does NOT delete source video)"
          >
            🗑
          </button>
        </div>

        {/* Individual Download or Render Button */}
        {isCompleted ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '10px' }}>
            <button
              className="action-btn download-hero-btn"
              onClick={onDownload}
              style={{
                background: 'linear-gradient(135deg, #10B981, #059669)',
                color: '#FFFFFF',
                fontWeight: 700,
                padding: '12px',
                borderRadius: '10px',
                border: 'none',
                cursor: 'pointer',
                fontSize: '0.95rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                boxShadow: '0 4px 14px rgba(16, 185, 129, 0.35)',
              }}
            >
              ⬇️ Download Short #{rank} MP4
            </button>
            <button
              className="action-btn"
              onClick={onExport}
              style={{
                background: 'transparent',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                color: 'var(--text-secondary)',
                fontSize: '0.78rem',
                padding: '6px',
                cursor: 'pointer',
                borderRadius: '6px',
              }}
            >
              ↺ Re-render / Customize
            </button>
          </div>
        ) : isExporting ? (
          <button
            className="action-btn export-hero-btn"
            disabled
            style={{ opacity: 0.8, cursor: 'not-allowed' }}
          >
            ⚡ Rendering ({renderProgress || 25}%)...
          </button>
        ) : (
          <button
            className="action-btn export-hero-btn"
            onClick={onExport}
          >
            ⚡ Render Short #{rank} (1080×1920)
          </button>
        )}
      </div>
    </div>
  );
};
