import React from 'react';
import type { HighlightCandidate } from '@shared/types.js';
import { useShortsStore } from '../../stores/shortsStore.js';
import { Button } from '../common/Button.js';

interface HighlightListProps {
  highlights: HighlightCandidate[];
  onSeek: (time: number) => void;
}

export const HighlightList: React.FC<HighlightListProps> = ({ highlights, onSeek }) => {
  const {
    shorts,
    generateShort,
    generateAllShorts,
    downloadAllShorts,
    downloadShort,
    exportHighlightAsIs,
    downloadHighlightAsIs,
    exportAllHighlightsAsIs,
    downloadAllHighlightsAsIs,
    isBatchExporting,
    isBatchExportingAsIs,
    isDownloadingZip,
    asIsExportingId,
    exportedAsIsIds,
    generatingShortId,
    selectHighlight,
    selectedHighlight,
    setCurrentHighlightIndex,
    setActiveReviewMode,
    autoFrameHighlight,
    updateHighlightCandidate,
  } = useShortsStore();

  const [autoFramingId, setAutoFramingId] = React.useState<string | null>(null);
  const [batchFramingMode, setBatchFramingMode] = React.useState<'blur_fill' | 'action'>('blur_fill');
  const [updatingFramingId, setUpdatingFramingId] = React.useState<string | null>(null);

  const handleSetCandidateFraming = async (h: HighlightCandidate, mode: 'blur_fill' | 'action', e: React.MouseEvent) => {
    e.stopPropagation();
    setUpdatingFramingId(h.id);
    try {
      await updateHighlightCandidate(h.id, { framingMode: mode });
    } catch (err) {
      console.error('Failed to update candidate framing:', err);
    } finally {
      setUpdatingFramingId(null);
    }
  };

  const handleAutoFrame = async (h: HighlightCandidate, e: React.MouseEvent) => {
    e.stopPropagation();
    setAutoFramingId(h.id);
    try {
      await autoFrameHighlight(h.id);
    } catch (err) {
      console.error('Auto framing failed:', err);
    } finally {
      setAutoFramingId(null);
    }
  };

  const projectId = highlights[0]?.projectId || '';

  // Completed 9:16 shorts specifically matching this project's active highlights (strict 1-to-1 unique)
  const matchedShortIdsForCount = new Set<string>();
  const completedMomentsShorts = highlights.filter((h) => {
    const match = shorts.find(
      (s) =>
        !matchedShortIdsForCount.has(s.id) &&
        (s.highlightId === h.id ||
          (Math.abs(s.startTime - h.startTime) < 2 && Math.abs(s.endTime - h.endTime) < 2)) &&
        s.status === 'completed' &&
        s.filePath
    );
    if (match) {
      matchedShortIdsForCount.add(match.id);
      return true;
    }
    return false;
  });

  const readyShortsCount = completedMomentsShorts.length;
  const renderingShort = shorts.find((s) => s.status === 'rendering');
  const isAnyRendering = isBatchExporting || !!renderingShort;
  const currentMomentProgress = renderingShort?.renderProgress || 0;
  const overallPercent = highlights.length > 0
    ? Math.min(100, Math.round(((readyShortsCount + (isAnyRendering && readyShortsCount < highlights.length ? currentMomentProgress / 100 : 0)) / highlights.length) * 100))
    : 0;

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const handleOpenReview = (index: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentHighlightIndex(index);
    setActiveReviewMode(true);
  };

  const handleGenerate = async (highlight: HighlightCandidate, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const mode = (highlight.framingMode as any) || batchFramingMode || 'blur_fill';
      await generateShort(highlight.id, {
        captionsEnabled: true,
        reframeMode: mode,
      });
    } catch (err) {
      // Handled in store
    }
  };

  const handleExportAllShorts = async () => {
    if (!projectId) return;
    try {
      await generateAllShorts(projectId, {
        captionsEnabled: true,
        reframeMode: batchFramingMode,
      });
    } catch (err) {
      // Handled in store
    }
  };

  const handleDownloadAsIs = async (h: HighlightCandidate, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await downloadHighlightAsIs(h.id);
    } catch (err: any) {
      console.error('Failed to download moment as-is:', err);
    }
  };

  const handleExportAllAsIs = async () => {
    if (!projectId) return;
    try {
      await downloadAllHighlightsAsIs(projectId);
    } catch (err: any) {
      console.error('Batch as-is download failed:', err);
    }
  };

  if (highlights.length === 0) {
    return (
      <div className="empty-state" style={{ padding: '40px 0' }}>
        <div className="empty-state-icon">✨</div>
        <h3>No highlights yet</h3>
        <p>Run the AI video processing pipeline to extract the top engaging moments.</p>
      </div>
    );
  }

  return (
    <div className="highlights-container">
      {/* Batch Export & Download Hub specifically for the active moments */}
      <div
        className="card batch-export-card"
        style={{
          background: 'linear-gradient(135deg, rgba(20, 20, 45, 0.85) 0%, rgba(45, 20, 65, 0.65) 100%)',
          border: '1px solid rgba(139, 92, 246, 0.45)',
          boxShadow: '0 8px 24px rgba(0, 0, 0, 0.35)',
          padding: '18px 20px',
          marginBottom: '16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '1.3rem' }}>⚡</span>
            <h4 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: '#FFFFFF' }}>
              Export & Download Hub
            </h4>
            <span
              style={{
                background: 'rgba(99, 102, 241, 0.25)',
                color: '#C7D2FE',
                fontSize: '0.78rem',
                fontWeight: 700,
                padding: '2px 10px',
                borderRadius: '12px',
                border: '1px solid rgba(99, 102, 241, 0.4)',
              }}
            >
              {highlights.length} Best Moments Ready
            </span>
          </div>
          <span style={{ fontSize: '0.8rem', color: '#94A3B8' }}>
            All exports are specifically scoped to these {highlights.length} moments
          </span>
        </div>

        {/* Dual Export Options: As-Is (16:9) vs 9:16 Vertical Shorts */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: '14px',
          }}
        >
          {/* Option 1: As-Is Original Highlights (Fast / Stream Cut) */}
          <div
            style={{
              background: 'rgba(255, 255, 255, 0.04)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '8px',
              padding: '14px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              gap: '12px',
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                <span style={{ fontSize: '1rem' }}>🎬</span>
                <strong style={{ fontSize: '0.95rem', color: '#FFFFFF' }}>As-Is Highlights (Original 16:9)</strong>
                <span
                  style={{
                    background: 'rgba(16, 185, 129, 0.2)',
                    color: '#34D399',
                    fontSize: '0.68rem',
                    fontWeight: 700,
                    padding: '1px 6px',
                    borderRadius: '4px',
                  }}
                >
                  ⚡ Instant Cut
                </span>
              </div>
              <p style={{ margin: 0, fontSize: '0.8rem', color: '#94A3B8', lineHeight: 1.4 }}>
                Lossless original aspect ratio and resolution. No vertical cropping or re-encoding overhead.
              </p>
            </div>

            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleExportAllAsIs}
                loading={isBatchExportingAsIs || isDownloadingZip === 'asis'}
                style={{
                  background: 'rgba(16, 185, 129, 0.15)',
                  borderColor: '#10B981',
                  color: '#34D399',
                  fontWeight: 700,
                  flex: 1,
                  minWidth: '130px',
                }}
                title="Cut and download all active best moments as-is in a ZIP file"
              >
                {isDownloadingZip === 'asis'
                  ? '⏳ Packaging ZIP...'
                  : `📦 Download All As-Is (${highlights.length}) ZIP`}
              </Button>
            </div>
          </div>

          {/* Option 2: 9:16 Vertical Shorts (Auto-Framed with Captions) */}
          <div
            style={{
              background: 'rgba(99, 102, 241, 0.08)',
              border: '1px solid rgba(99, 102, 241, 0.25)',
              borderRadius: '8px',
              padding: '14px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              gap: '12px',
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                <span style={{ fontSize: '1rem' }}>📱</span>
                <strong style={{ fontSize: '0.95rem', color: '#FFFFFF' }}>Vertical Shorts (9:16)</strong>
                <span
                  style={{
                    background: 'rgba(99, 102, 241, 0.2)',
                    color: '#A5B4FC',
                    fontSize: '0.68rem',
                    fontWeight: 700,
                    padding: '1px 6px',
                    borderRadius: '4px',
                  }}
                >
                  ✨ Auto-Framed
                </span>
              </div>
              <p style={{ margin: 0, fontSize: '0.8rem', color: '#94A3B8', lineHeight: 1.4 }}>
                Framing mode applied to vertical exports. Lossless Blur preserves 100% of the original pitch/action.
              </p>

              {/* Batch Framing Mode Selector */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '8px' }}>
                <button
                  type="button"
                  onClick={() => setBatchFramingMode('blur_fill')}
                  style={{
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    padding: '4px 8px',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    border: '1px solid',
                    borderColor: batchFramingMode === 'blur_fill' ? '#10B981' : 'rgba(255, 255, 255, 0.15)',
                    background: batchFramingMode === 'blur_fill' ? 'rgba(16, 185, 129, 0.25)' : 'rgba(0, 0, 0, 0.25)',
                    color: batchFramingMode === 'blur_fill' ? '#34D399' : '#94A3B8',
                    transition: 'all 0.15s ease',
                  }}
                  title="Lossless Blur: Preserve 100% original frame. Zero player or ball cut off (Recommended)"
                >
                  🖼️ Lossless Blur (Safe)
                </button>
                <button
                  type="button"
                  onClick={() => setBatchFramingMode('action')}
                  style={{
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    padding: '4px 8px',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    border: '1px solid',
                    borderColor: batchFramingMode === 'action' ? '#818CF8' : 'rgba(255, 255, 255, 0.15)',
                    background: batchFramingMode === 'action' ? 'rgba(99, 102, 241, 0.25)' : 'rgba(0, 0, 0, 0.25)',
                    color: batchFramingMode === 'action' ? '#C7D2FE' : '#94A3B8',
                    transition: 'all 0.15s ease',
                  }}
                  title="Smart Reframe: Auto-tracks player/ball motion (with auto-fallback to Lossless Blur)"
                >
                  🎯 Smart Reframe
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {readyShortsCount > 0 && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => downloadAllShorts(projectId)}
                  loading={isDownloadingZip === 'shorts'}
                  style={{
                    borderColor: '#10B981',
                    color: '#34D399',
                    background: 'rgba(16, 185, 129, 0.15)',
                    fontWeight: 700,
                  }}
                  title="Download already rendered vertical shorts"
                >
                  {isDownloadingZip === 'shorts'
                    ? '⏳ Packaging ZIP...'
                    : `📦 Download Ready (${readyShortsCount}/${highlights.length}) ZIP`}
                </Button>
              )}

              <Button
                variant="primary"
                size="sm"
                loading={isAnyRendering}
                disabled={readyShortsCount >= highlights.length && !isAnyRendering}
                onClick={handleExportAllShorts}
                style={{
                  background:
                    readyShortsCount >= highlights.length
                      ? 'rgba(255, 255, 255, 0.1)'
                      : 'linear-gradient(135deg, #6366F1 0%, #EC4899 100%)',
                  fontWeight: 700,
                  flex: 1,
                  minWidth: '140px',
                }}
              >
                {isAnyRendering
                  ? `Rendering (${readyShortsCount}/${highlights.length})...`
                  : readyShortsCount >= highlights.length
                  ? `✓ All ${highlights.length} Rendered`
                  : `⚡ Render All 9:16 Shorts (${batchFramingMode === 'blur_fill' ? 'Lossless Blur' : 'Smart Reframe'})`}
              </Button>
            </div>

            {/* Real-time Batch Progress Bar inside Vertical Shorts box */}
            {isAnyRendering && (
              <div
                style={{
                  marginTop: '12px',
                  padding: '10px 14px',
                  background: 'rgba(99, 102, 241, 0.12)',
                  border: '1px solid rgba(99, 102, 241, 0.25)',
                  borderRadius: '8px',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '8px',
                    fontSize: '0.78rem',
                    color: '#C7D2FE',
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>⏳</span>
                    <span>
                      Fast encoding queue: moment {Math.min(highlights.length, readyShortsCount + 1)} of {highlights.length} rendering... ({readyShortsCount} completed)
                    </span>
                  </span>
                  <span style={{ fontWeight: 700, color: '#A5B4FC' }}>
                    {overallPercent}%
                  </span>
                </div>
                <div
                  style={{
                    height: '8px',
                    background: 'rgba(255, 255, 255, 0.12)',
                    borderRadius: '4px',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      height: '100%',
                      width: `${Math.max(5, overallPercent)}%`,
                      background: 'linear-gradient(90deg, #6366F1, #EC4899)',
                      borderRadius: '4px',
                      transition: 'width 0.4s ease',
                      boxShadow: '0 0 10px rgba(236, 72, 153, 0.5)',
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Review Mode Banner */}
      <div
        className="card"
        style={{
          background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.12), rgba(236, 72, 153, 0.08))',
          borderColor: 'rgba(99, 102, 241, 0.3)',
          padding: '14px 18px',
          marginBottom: '16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
            <span style={{ fontSize: '1.1rem' }}>📱</span>
            <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: '#FFFFFF' }}>
              Reels-Style Shorts Review Mode
            </h4>
          </div>
          <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
            Swipe through all {highlights.length} detected moments with 9:16 vertical preview, audio waveforms, and animated captions.
          </p>
        </div>

        <Button
          variant="primary"
          size="sm"
          onClick={() => {
            setCurrentHighlightIndex(0);
            setActiveReviewMode(true);
          }}
          style={{
            background: 'linear-gradient(135deg, #6366F1, #EC4899)',
            boxShadow: '0 4px 14px rgba(99, 102, 241, 0.4)',
            fontWeight: 700,
          }}
        >
          🚀 Open Review Mode →
        </Button>
      </div>

      {/* Highlights List Cards */}
      <div className="highlights-list">
        {highlights.map((h, index) => {
          const isSelected = selectedHighlight?.id === h.id;
          const matchingShort = shorts.find(
            (s) =>
              s.highlightId === h.id ||
              (Math.abs(s.startTime - h.startTime) < 2 && Math.abs(s.endTime - h.endTime) < 2)
          );
          const isShortCompleted = matchingShort?.status === 'completed' && matchingShort.filePath;
          const isShortRendering = matchingShort?.status === 'rendering' || generatingShortId === h.id;

          const framingModeLabel =
            h.framingMode === 'blur_fill'
              ? '🖼️ Lossless Blur-Fill'
              : h.framingMode === 'action'
              ? '🎯 Smart Action'
              : h.framingMode === 'face'
              ? '👤 Face Focus'
              : '📐 Center Crop';

          return (
            <div
              key={h.id}
              className={`highlight-card ${isSelected ? 'selected' : ''}`}
              onClick={() => {
                selectHighlight(h);
                onSeek(h.startTime);
              }}
            >
              {/* Top Row: Score Badge, Rank, Confidence, Duration & Applied Auto-Frame */}
              <div className="highlight-card-top-row">
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div className="highlight-score-badge">
                    <span className="score-num">{Math.round(h.scoreTotal)}</span>
                    <span className="score-label">SCORE</span>
                  </div>

                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span className="highlight-rank">#{index + 1} Best Moment</span>
                      {h.confidence && (
                        <span
                          style={{
                            fontSize: '0.7rem',
                            fontWeight: 700,
                            padding: '1px 6px',
                            borderRadius: '4px',
                            background:
                              h.confidence === 'High'
                                ? 'rgba(16, 185, 129, 0.2)'
                                : 'rgba(245, 158, 11, 0.2)',
                            color: h.confidence === 'High' ? '#34D399' : '#FBBF24',
                            border: `1px solid ${
                              h.confidence === 'High'
                                ? 'rgba(16, 185, 129, 0.4)'
                                : 'rgba(245, 158, 11, 0.4)'
                            }`,
                          }}
                        >
                          {h.confidence} Confidence
                        </span>
                      )}
                    </div>
                    <span className="highlight-time">
                      ⏱️ {formatTime(h.startTime)} → {formatTime(h.endTime)} ({Math.round(h.duration)}s)
                    </span>
                  </div>
                </div>

                {/* Interactive Framing Mode Selector & Badge */}
                <div
                  style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <span
                    style={{
                      fontSize: '0.74rem',
                      fontWeight: 700,
                      padding: '3px 8px',
                      borderRadius: '5px',
                      background:
                        h.framingMode === 'blur_fill'
                          ? 'rgba(16, 185, 129, 0.18)'
                          : 'rgba(99, 102, 241, 0.18)',
                      color: h.framingMode === 'blur_fill' ? '#34D399' : '#A5B4FC',
                      border: `1px solid ${
                        h.framingMode === 'blur_fill'
                          ? 'rgba(16, 185, 129, 0.35)'
                          : 'rgba(99, 102, 241, 0.35)'
                      }`,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                    title="Current framing mode for this moment"
                  >
                    <span>{h.framingMode === 'blur_fill' ? '🖼️ Lossless Blur' : '🎯 Smart Reframe'}</span>
                  </span>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <button
                      type="button"
                      onClick={(e) => handleSetCandidateFraming(h, 'blur_fill', e)}
                      disabled={updatingFramingId === h.id}
                      style={{
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        padding: '3px 8px',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        border: '1px solid',
                        borderColor: h.framingMode === 'blur_fill' ? '#10B981' : 'rgba(255, 255, 255, 0.15)',
                        background: h.framingMode === 'blur_fill' ? 'rgba(16, 185, 129, 0.25)' : 'rgba(255, 255, 255, 0.04)',
                        color: h.framingMode === 'blur_fill' ? '#34D399' : '#94A3B8',
                        transition: 'all 0.15s ease',
                      }}
                      title="Lossless Blur: 100% full original frame preserved with zero cropping (Recommended for sports)"
                    >
                      Lossless Blur
                    </button>
                    <button
                      type="button"
                      onClick={(e) => handleSetCandidateFraming(h, 'action', e)}
                      disabled={updatingFramingId === h.id}
                      style={{
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        padding: '3px 8px',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        border: '1px solid',
                        borderColor: h.framingMode === 'action' ? '#818CF8' : 'rgba(255, 255, 255, 0.15)',
                        background: h.framingMode === 'action' ? 'rgba(99, 102, 241, 0.25)' : 'rgba(255, 255, 255, 0.04)',
                        color: h.framingMode === 'action' ? '#C7D2FE' : '#94A3B8',
                        transition: 'all 0.15s ease',
                      }}
                      title="Smart Reframe: Dynamic motion tracking with auto-fallback to Lossless Blur"
                    >
                      Smart Reframe
                    </button>
                  </div>
                </div>
              </div>

              {/* Middle Section: Title, Quote, Insights & Signals (Full Width) */}
              <div className="highlight-content">
                <h4 style={{ margin: '4px 0', fontSize: '1.02rem', fontWeight: 700, color: '#FFFFFF' }}>
                  {h.title || `Best Moment #${index + 1}`}
                </h4>

                <p className="highlight-quote">"{h.transcriptText}"</p>

                {/* Why Selected Reason Tags */}
                {h.whySelected && h.whySelected.length > 0 ? (
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', margin: '6px 0' }}>
                    {h.whySelected.map((reason, ri) => (
                      <span
                        key={ri}
                        style={{
                          fontSize: '0.72rem',
                          background: 'rgba(99, 102, 241, 0.12)',
                          color: '#C7D2FE',
                          padding: '2px 8px',
                          borderRadius: '4px',
                          border: '1px solid rgba(99, 102, 241, 0.25)',
                        }}
                      >
                        {reason}
                      </span>
                    ))}
                  </div>
                ) : h.aiReason ? (
                  <div className="highlight-ai-insight">
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--accent-light)' }}>
                      INSIGHT:
                    </span>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginLeft: '6px' }}>
                      {h.aiReason}
                    </span>
                  </div>
                ) : null}

                <div className="highlight-signals-row" style={{ marginTop: '6px' }}>
                  <span className="signal-pill">🪝 Hook {h.scoreHook}%</span>
                  <span className="signal-pill">❤️ Emotion {h.scoreEmotion}%</span>
                  <span className="signal-pill">💡 Value {h.scoreInformation}%</span>
                  <span className="signal-pill">😲 Surprise {h.scoreSurprise}%</span>
                  <span className="signal-pill">📖 Story {h.scoreStory}%</span>
                </div>
              </div>

              {/* Bottom Action Bar: Review, Auto-Frame, As-Is Download, 9:16 Render/Download */}
              <div className="highlight-actions-bar">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={(e) => handleOpenReview(index, e)}
                  title="Open this clip in 9:16 Shorts Review Mode"
                >
                  📱 Review 9:16
                </Button>

                <Button
                  variant="secondary"
                  size="sm"
                  onClick={(e) => handleAutoFrame(h, e)}
                  loading={autoFramingId === h.id}
                  title="Re-run OpenCV motion detection to re-optimize framing"
                  style={{
                    background: 'rgba(99, 102, 241, 0.1)',
                    borderColor: 'rgba(99, 102, 241, 0.3)',
                    color: '#C7D2FE',
                  }}
                >
                  ✨ Auto-Frame
                </Button>

                {/* Instant As-Is Download (Original Aspect Ratio) */}
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={(e) => handleDownloadAsIs(h, e)}
                  style={{
                    background: 'rgba(16, 185, 129, 0.12)',
                    borderColor: 'rgba(16, 185, 129, 0.4)',
                    color: '#34D399',
                    fontWeight: 700,
                  }}
                  title="Direct instant cut in original 16:9 / source format (< 1s)"
                >
                  🎬 Download As-Is (16:9)
                </Button>

                {/* 9:16 Vertical Short Render / Download */}
                {isShortCompleted ? (
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      downloadShort(matchingShort!.id);
                    }}
                    style={{
                      background: 'rgba(16, 185, 129, 0.2)',
                      borderColor: '#10B981',
                      color: '#34D399',
                      fontWeight: 700,
                    }}
                    title="Download rendered 9:16 vertical Short MP4"
                  >
                    ⬇️ Download 9:16 Short
                  </Button>
                ) : isShortRendering ? (
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                    <Button
                      variant="primary"
                      size="sm"
                      loading={generatingShortId === h.id}
                      disabled={generatingShortId === h.id}
                    >
                      ⚡ Rendering ({matchingShort?.renderProgress || 20}%)
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={(e) => handleGenerate(h, e)}
                      title="If stuck from a previous session, click here to re-render with the new fast engine"
                      style={{
                        padding: '4px 8px',
                        fontSize: '0.74rem',
                        borderColor: 'rgba(239, 68, 68, 0.4)',
                        color: '#F87171',
                      }}
                    >
                      ↺ Restart
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={(e) => handleGenerate(h, e)}
                    title={`Render this moment into a 9:16 vertical video with ${h.framingMode === 'blur_fill' ? 'Lossless Blur (100% full frame)' : 'Smart Reframe'}`}
                  >
                    ⚡ Render 9:16 ({h.framingMode === 'blur_fill' ? 'Lossless Blur' : 'Smart Reframe'})
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
