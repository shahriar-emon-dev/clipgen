// ============================================================
// LongFormStudio — AI Long-Form Compilation Studio Component
// Dual-purpose editor workspace for 16:9 narrative compilations
// ============================================================

import React, { useEffect, useState, useRef } from 'react';
import type { Video, Project } from '@shared/types.js';
import { useLongFormStore } from '../../stores/longFormStore.js';
import { Button } from '../common/Button.js';
import { Spinner } from '../common/Spinner.js';
import { TARGET_DURATION_RANGES, SAFE_SCALE_PRESETS, TRANSITION_PRESETS } from '@shared/constants.js';
import { api } from '../../services/api.js';

interface LongFormStudioProps {
  project: Project;
  video: Video;
  onSwitchToShorts: () => void;
}

export const LongFormStudio: React.FC<LongFormStudioProps> = ({
  project,
  video,
  onSwitchToShorts,
}) => {
  const {
    compilation,
    settings,
    timeline,
    isLoading,
    isRendering,
    renderProgress,
    renderStage,
    renderDetail,
    selectedSegmentId,
    qualityReport,
    error,
    loadCompilation,
    generateTimeline,
    updateSettings,
    toggleSegment,
    reorderSegments,
    trimSegment,
    renderCompilation,
    downloadCompilation,
    setSelectedSegmentId,
    listenToLongFormUpdates,
  } = useLongFormStore();

  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [activePlayerMode, setActivePlayerMode] = useState<'timeline' | 'master'>('timeline');
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);

  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    loadCompilation(project.id);
    const cleanupWs = listenToLongFormUpdates(project.id);
    return () => cleanupWs();
  }, [project.id]);

  useEffect(() => {
    if (compilation?.status === 'completed' && compilation.filePath) {
      setActivePlayerMode('master');
    }
  }, [compilation?.status, compilation?.filePath]);

  // Handle segment selection in timeline preview
  const handleSelectSegment = (segmentId: string) => {
    setSelectedSegmentId(segmentId);
    const seg = timeline.find(s => s.id === segmentId);
    if (seg && videoRef.current && activePlayerMode === 'timeline') {
      videoRef.current.currentTime = seg.sourceStart;
      videoRef.current.play().catch(() => {});
      setIsPlaying(true);
    }
  };

  // Video time update tracker
  const handleTimeUpdate = () => {
    if (!videoRef.current) return;
    const time = videoRef.current.currentTime;
    setCurrentTime(time);

    // In timeline preview mode, keep playback within enabled segments
    if (activePlayerMode === 'timeline' && timeline.length > 0) {
      const activeSeg = timeline.find(s => s.id === selectedSegmentId);
      if (activeSeg && time >= activeSeg.sourceEnd) {
        // Move to next enabled segment
        const enabled = timeline.filter(s => s.isEnabled !== false);
        const currentIndex = enabled.findIndex(s => s.id === activeSeg.id);
        if (currentIndex !== -1 && currentIndex + 1 < enabled.length) {
          const nextSeg = enabled[currentIndex + 1];
          setSelectedSegmentId(nextSeg.id);
          videoRef.current.currentTime = nextSeg.sourceStart;
        } else {
          videoRef.current.pause();
          setIsPlaying(false);
        }
      }
    }
  };

  const activeSegment = timeline.find(s => s.id === selectedSegmentId) || timeline[0];
  const enabledSegments = timeline.filter(s => s.isEnabled !== false);
  const totalEstimatedDuration = enabledSegments.reduce((acc, s) => acc + s.duration, 0);

  const formatSec = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const isMasterReady = compilation?.status === 'completed' && Boolean(compilation.filePath);

  return (
    <div className="longform-studio">
      {/* ── Long-Form Control Bar ── */}
      <div className="lf-control-bar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap', minWidth: 0 }}>
          <div>
            <span style={{ fontSize: '0.74rem', color: 'var(--text-tertiary)', display: 'block', marginBottom: '4px', textTransform: 'uppercase', fontWeight: 700 }}>
              Target Duration
            </span>
            <div className="lf-target-durations">
              {(['3-5', '5-7', '7-10'] as const).map(dur => (
                <button
                  key={dur}
                  type="button"
                  className={`lf-duration-pill ${settings.targetDuration === dur ? 'active' : ''}`}
                  onClick={() => {
                    updateSettings({ targetDuration: dur });
                    generateTimeline(project.id, { targetDuration: dur });
                  }}
                >
                  {TARGET_DURATION_RANGES[dur].label}
                </button>
              ))}
              <button
                type="button"
                className={`lf-duration-pill ${settings.targetDuration === 'custom' ? 'active' : ''}`}
                onClick={() => {
                  const input = prompt('Enter target duration in minutes (e.g. 6.5):', '6.0');
                  if (input) {
                    const secs = Math.round(parseFloat(input) * 60);
                    if (!isNaN(secs) && secs > 30) {
                      updateSettings({ targetDuration: 'custom', customDurationSeconds: secs });
                      generateTimeline(project.id, { targetDuration: 'custom', customDurationSeconds: secs });
                    }
                  }
                }}
              >
                Custom {settings.targetDuration === 'custom' && settings.customDurationSeconds ? `(${Math.round(settings.customDurationSeconds / 60)}m)` : ''}
              </button>
            </div>
          </div>

          <div style={{ paddingLeft: '12px', borderLeft: '1px solid var(--border)' }}>
            <span style={{ fontSize: '0.74rem', color: 'var(--text-tertiary)', display: 'block', marginBottom: '4px', textTransform: 'uppercase', fontWeight: 700 }}>
              Timeline Length
            </span>
            <span style={{ fontSize: '0.92rem', fontWeight: 700, color: '#f0f0f5' }}>
              ⏱️ {formatSec(totalEstimatedDuration)} <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 400 }}>({enabledSegments.length} clips)</span>
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {/* Quality Indicator Badge */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 10px',
              borderRadius: '6px',
              background: 'rgba(16, 185, 129, 0.1)',
              border: '1px solid rgba(16, 185, 129, 0.25)',
              fontSize: '0.75rem',
              color: '#34d399',
              fontWeight: 600,
            }}
            title="Source resolution and framerate are preserved in the 16:9 master output without downscaling."
          >
            <span>✓ Source Quality Preserved</span>
            <span style={{ opacity: 0.7, fontSize: '0.7rem' }}>
              ({video.width || 1920}×{video.height || 1080} • {video.fps || 30}fps)
            </span>
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowSettingsModal(true)}
            style={{ fontSize: '0.82rem', padding: '6px 12px' }}
          >
            ⚙️ Edit Settings
          </Button>

          <Button
            variant="secondary"
            size="md"
            loading={isLoading}
            onClick={() => generateTimeline(project.id)}
            title="Re-run AI narrative analysis and segment selection"
          >
            ✨ Regenerate Timeline
          </Button>

          {isMasterReady && (
            <Button
              variant="secondary"
              size="md"
              onClick={downloadCompilation}
              style={{
                borderColor: 'rgba(16, 185, 129, 0.4)',
                color: '#34d399',
                fontWeight: 700,
              }}
            >
              ⬇️ Download Master ({video.height || 1080}p)
            </Button>
          )}

          <Button
            variant="primary"
            size="md"
            disabled={timeline.length === 0 || isRendering}
            loading={isRendering}
            onClick={renderCompilation}
            style={{
              background: 'linear-gradient(135deg, #7c3aed 0%, #2563eb 100%)',
              fontWeight: 700,
              boxShadow: '0 4px 14px rgba(37, 99, 235, 0.4)',
            }}
          >
            {isRendering ? 'Rendering 16:9 Master...' : '🎬 Render 16:9 Master'}
          </Button>
        </div>
      </div>

      {/* ── Live Render Progress Banner ── */}
      {isRendering && (
        <div
          style={{
            background: 'linear-gradient(90deg, rgba(124, 58, 237, 0.2), rgba(37, 99, 235, 0.2))',
            border: '1px solid rgba(124, 58, 237, 0.5)',
            borderRadius: '10px',
            padding: '16px 20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span className="pulse-indicator" style={{ width: '10px', height: '10px', background: '#38bdf8' }} />
              <strong style={{ fontSize: '0.95rem', color: '#e0f2fe' }}>
                {renderStage.replace(/_/g, ' ').toUpperCase()}: {renderDetail || 'Rendering compilation...'}
              </strong>
            </div>
            <strong style={{ color: '#38bdf8', fontSize: '1.05rem' }}>{renderProgress}%</strong>
          </div>

          <div style={{ width: '100%', height: '8px', background: 'rgba(0, 0, 0, 0.4)', borderRadius: '4px', overflow: 'hidden' }}>
            <div
              style={{
                width: `${renderProgress}%`,
                height: '100%',
                background: 'linear-gradient(90deg, #7c3aed, #38bdf8)',
                transition: 'width 0.3s ease',
              }}
            />
          </div>
        </div>
      )}

      {/* ── Error Alert Banner ── */}
      {error && !isRendering && (
        <div
          style={{
            background: 'rgba(239, 68, 68, 0.12)',
            border: '1px solid rgba(239, 68, 68, 0.35)',
            borderRadius: '10px',
            padding: '12px 18px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#fca5a5', fontSize: '0.86rem' }}>
            <span>⚠️</span>
            <span><strong>Render Notice:</strong> {error}</span>
          </div>
          <button
            type="button"
            onClick={() => useLongFormStore.setState({ error: null })}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#f87171',
              cursor: 'pointer',
              fontSize: '0.82rem',
              fontWeight: 600,
            }}
          >
            ✕ Dismiss
          </button>
        </div>
      )}

      {/* ── Main Workspace ── */}
      <div className="lf-workspace-grid">
        {/* Left Column: Player & Visual Timeline Track */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="lf-player-card">
            {/* Player Mode Switcher */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <button
                  type="button"
                  style={{
                    padding: '4px 10px',
                    borderRadius: '6px',
                    border: '1px solid var(--border)',
                    background: activePlayerMode === 'timeline' ? 'var(--accent)' : 'transparent',
                    color: activePlayerMode === 'timeline' ? '#fff' : 'var(--text-secondary)',
                    fontSize: '0.78rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                  onClick={() => setActivePlayerMode('timeline')}
                >
                  🎞️ Timeline Preview
                </button>
                {isMasterReady && (
                  <button
                    type="button"
                    style={{
                      padding: '4px 10px',
                      borderRadius: '6px',
                      border: '1px solid var(--border)',
                      background: activePlayerMode === 'master' ? '#10b981' : 'transparent',
                      color: activePlayerMode === 'master' ? '#fff' : 'var(--text-secondary)',
                      fontSize: '0.78rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                    onClick={() => setActivePlayerMode('master')}
                  >
                    ✨ Rendered Master (1080p)
                  </button>
                )}
              </div>

              <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                {activePlayerMode === 'master' ? 'Playing final rendered MP4' : `Previewing Clip: ${activeSegment?.title || 'None'}`}
              </span>
            </div>

            {/* 16:9 Video Canvas */}
            <div className="lf-video-wrapper">
              <div className="lf-player-overlay-badge">
                <span>16:9</span>
                <span>•</span>
                <span>{activePlayerMode === 'master' ? 'Rendered MP4' : 'Smart 16:9 Framing'}</span>
              </div>

              <video
                ref={videoRef}
                className="lf-video-element"
                src={
                  activePlayerMode === 'master' && compilation?.id
                    ? api.getLongFormStreamUrl(compilation.id)
                    : `/api/files/${project.id}/${video.filename}`
                }
                controls
                onTimeUpdate={handleTimeUpdate}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              <span>Timecode: {formatSec(currentTime)}</span>
              <span>Aspect Ratio: 1920×1080 (16:9 Landscape)</span>
            </div>
          </div>

          {/* Visual Timeline Track */}
          <div className="lf-timeline-track-card">
            <div className="lf-timeline-track-header">
              <strong style={{ color: '#f0f0f5' }}>Coherent Timeline Sequence ({enabledSegments.length} Segments)</strong>
              <span>Target: {TARGET_DURATION_RANGES[settings.targetDuration]?.label || '5–7 min'}</span>
            </div>

            <div className="lf-track-segments-container">
              {timeline.map((seg, idx) => {
                const isSelected = seg.id === selectedSegmentId;
                const roleClass = `role-${seg.storyRole || 'buildup'}`;
                return (
                  <React.Fragment key={seg.id}>
                    <div
                      className={`lf-track-block ${roleClass} ${isSelected ? 'active' : ''} ${seg.isEnabled === false ? 'disabled' : ''}`}
                      onClick={() => handleSelectSegment(seg.id)}
                      title={`${seg.title} (${seg.duration}s)\nRole: ${seg.storyRole}\n${seg.summary}`}
                    >
                      <span style={{ fontSize: '0.66rem', opacity: 0.8 }}>#{idx + 1}</span>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%' }}>
                        {seg.title}
                      </span>
                      <span style={{ fontSize: '0.62rem', opacity: 0.85 }}>{Math.round(seg.duration)}s</span>
                    </div>

                    {idx < timeline.length - 1 && (
                      <span className="lf-track-transition-indicator" title={`Transition: ${settings.transitionType}`}>
                        ⧓
                      </span>
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          </div>

          {/* Quality Gate Verification Card */}
          {qualityReport && (
            <div className="lf-quality-card">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <strong style={{ color: '#34d399', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  🛡️ Long-Form Quality Gate Passed ({qualityReport.checks.filter(c => c.status === 'pass' || c.status === 'auto_fixed').length}/{qualityReport.checks.length} checks)
                </strong>
                <span style={{ fontSize: '0.74rem', color: '#a7f3d0' }}>
                  Target: {qualityReport.targetDuration}s • Actual: {qualityReport.actualDuration}s
                </span>
              </div>

              <div className="lf-quality-grid">
                {qualityReport.checks.map(chk => (
                  <div key={chk.id} className="lf-quality-item">
                    <span>{chk.status === 'pass' ? '✅' : chk.status === 'auto_fixed' ? '🔧' : '⚠️'}</span>
                    <span><strong>{chk.name}:</strong> {chk.details}</span>
                  </div>
                ))}
              </div>

              {qualityReport.autoFixesApplied.length > 0 && (
                <div style={{ marginTop: '6px', fontSize: '0.74rem', color: '#6ee7b7' }}>
                  <strong>Auto-Remediations Applied:</strong>
                  <ul style={{ margin: '4px 0 0', paddingLeft: '16px' }}>
                    {qualityReport.autoFixesApplied.map((fix, idx) => (
                      <li key={idx}>{fix}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Column: Segment Manager / Story Editor */}
        <div className="lf-segments-panel">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700 }}>
              Narrative Segments ({timeline.length})
            </h3>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
              Order & Story Arc
            </span>
          </div>

          {timeline.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 10px', color: 'var(--text-secondary)' }}>
              <p>No timeline generated yet.</p>
              <Button
                variant="primary"
                size="md"
                onClick={() => generateTimeline(project.id)}
                loading={isLoading}
              >
                ✨ Generate AI Timeline
              </Button>
            </div>
          ) : (
            timeline.map((seg, idx) => {
              const isSelected = seg.id === selectedSegmentId;
              const isFirst = idx === 0;
              const isLast = idx === timeline.length - 1;

              return (
                <div
                  key={seg.id}
                  className={`lf-segment-card ${isSelected ? 'selected' : ''} ${seg.isEnabled === false ? 'disabled' : ''}`}
                  onClick={() => handleSelectSegment(seg.id)}
                >
                  {/* Reorder Column */}
                  <div className="lf-seg-index-col">
                    <button
                      type="button"
                      className="lf-seg-reorder-btn"
                      disabled={isFirst}
                      onClick={(e) => {
                        e.stopPropagation();
                        reorderSegments(idx, idx - 1);
                      }}
                      title="Move earlier"
                    >
                      ▲
                    </button>
                    <span className="lf-seg-index-num">{idx + 1}</span>
                    <button
                      type="button"
                      className="lf-seg-reorder-btn"
                      disabled={isLast}
                      onClick={(e) => {
                        e.stopPropagation();
                        reorderSegments(idx, idx + 1);
                      }}
                      title="Move later"
                    >
                      ▼
                    </button>
                  </div>

                  {/* Body */}
                  <div className="lf-seg-body">
                    <div className="lf-seg-header">
                      <h4 className="lf-seg-title">{seg.title}</h4>
                      <div className="lf-seg-meta-tags">
                        <span
                          className="lf-role-tag"
                          style={{
                            background:
                              seg.storyRole === 'hook' ? 'rgba(124, 58, 237, 0.25)' :
                              seg.storyRole === 'climax' ? 'rgba(234, 88, 12, 0.25)' :
                              seg.storyRole === 'resolution' ? 'rgba(16, 185, 129, 0.25)' :
                              'rgba(37, 99, 235, 0.25)',
                            color:
                              seg.storyRole === 'hook' ? '#c084fc' :
                              seg.storyRole === 'climax' ? '#fb923c' :
                              seg.storyRole === 'resolution' ? '#34d399' :
                              '#60a5fa',
                          }}
                        >
                          {seg.storyRole || 'Buildup'}
                        </span>
                        <span style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                          {formatSec(seg.duration)}
                        </span>
                      </div>
                    </div>

                    <p className="lf-seg-summary">{seg.summary}</p>

                    {/* Fine Trim Controls */}
                    <div className="lf-seg-trim-controls">
                      <span>Source: {formatSec(seg.sourceStart)} – {formatSec(seg.sourceEnd)}</span>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <button
                          type="button"
                          style={{
                            fontSize: '0.7rem',
                            padding: '2px 6px',
                            background: 'rgba(255, 255, 255, 0.05)',
                            border: '1px solid var(--border)',
                            borderRadius: '4px',
                            color: 'var(--text-secondary)',
                            cursor: 'pointer',
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            const newStart = Math.max(0, seg.sourceStart - 0.5);
                            trimSegment(seg.id, newStart, seg.sourceEnd);
                          }}
                          title="Expand start by 0.5s"
                        >
                          -0.5s In
                        </button>
                        <button
                          type="button"
                          style={{
                            fontSize: '0.7rem',
                            padding: '2px 6px',
                            background: 'rgba(255, 255, 255, 0.05)',
                            border: '1px solid var(--border)',
                            borderRadius: '4px',
                            color: 'var(--text-secondary)',
                            cursor: 'pointer',
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            const newEnd = seg.sourceEnd + 0.5;
                            trimSegment(seg.id, seg.sourceStart, newEnd);
                          }}
                          title="Extend end by 0.5s"
                        >
                          +0.5s Out
                        </button>

                        <button
                          type="button"
                          style={{
                            fontSize: '0.72rem',
                            padding: '2px 8px',
                            background: seg.isEnabled === false ? 'rgba(239, 68, 68, 0.2)' : 'rgba(16, 185, 129, 0.15)',
                            border: `1px solid ${seg.isEnabled === false ? '#ef4444' : '#10b981'}`,
                            borderRadius: '4px',
                            color: seg.isEnabled === false ? '#f87171' : '#34d399',
                            cursor: 'pointer',
                            fontWeight: 600,
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleSegment(seg.id);
                          }}
                        >
                          {seg.isEnabled === false ? 'Disabled' : 'Active'}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ── Settings Modal / Drawer ── */}
      {showSettingsModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.7)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '20px',
          }}
          onClick={() => setShowSettingsModal(false)}
        >
          <div
            className="lf-settings-drawer"
            style={{ maxWidth: '580px', width: '100%', maxHeight: '90vh', overflowY: 'auto' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: '12px' }}>
              <h3 style={{ margin: 0, fontSize: '1.15rem' }}>Long-Form Compilation Settings</h3>
              <button
                type="button"
                style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '1.2rem' }}
                onClick={() => setShowSettingsModal(false)}
              >
                ✕
              </button>
            </div>

            {/* Safe Edge Cleanup */}
            <div className="lf-setting-row">
              <div className="lf-setting-label-row">
                <span className="lf-setting-title">🛡️ Safe Edge Cleanup</span>
                <input
                  type="checkbox"
                  checked={settings.safeEdgeCleanup}
                  onChange={(e) => updateSettings({ safeEdgeCleanup: e.target.checked })}
                  style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                />
              </div>
              <p className="lf-setting-desc">
                For footage you own or are authorized to edit. Uses controlled scaling (100%–128%) to remove unwanted edge areas such as borders, software UI, or permitted logos.
              </p>

              {settings.safeEdgeCleanup && (
                <div style={{ marginTop: '8px', background: 'rgba(0, 0, 0, 0.3)', padding: '10px', borderRadius: '6px' }}>
                  <label style={{ fontSize: '0.78rem', color: '#e2e8f0', display: 'block', marginBottom: '6px' }}>
                    Maximum Scale Cap:
                  </label>
                  <select
                    value={settings.maxScaleFactor}
                    onChange={(e) => updateSettings({ maxScaleFactor: parseFloat(e.target.value) as any })}
                    style={{
                      width: '100%',
                      padding: '8px',
                      background: 'var(--bg-tertiary)',
                      border: '1px solid var(--border)',
                      borderRadius: '6px',
                      color: '#f0f0f5',
                    }}
                  >
                    {SAFE_SCALE_PRESETS.map(p => (
                      <option key={p.value} value={p.value}>
                        {p.label} — {p.description}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Transitions */}
            <div className="lf-setting-row">
              <div className="lf-setting-label-row">
                <span className="lf-setting-title">🎬 Transitions</span>
              </div>
              <p className="lf-setting-desc">
                Transition effect blended between consecutive timeline segments.
              </p>
              <select
                value={settings.transitionType}
                onChange={(e) => updateSettings({ transitionType: e.target.value as any })}
                style={{
                  width: '100%',
                  padding: '8px',
                  background: 'var(--bg-tertiary)',
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                  color: '#f0f0f5',
                  marginTop: '6px',
                }}
              >
                {TRANSITION_PRESETS.map(t => (
                  <option key={t.id} value={t.id}>
                    {t.label} ({t.description})
                  </option>
                ))}
              </select>
            </div>

            {/* Audio Normalization */}
            <div className="lf-setting-row">
              <div className="lf-setting-label-row">
                <span className="lf-setting-title">🔊 Audio Enhancement & Normalization</span>
                <input
                  type="checkbox"
                  checked={settings.audioEnhancement}
                  onChange={(e) => updateSettings({ audioEnhancement: e.target.checked, normalizeLoudness: e.target.checked })}
                  style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                />
              </div>
              <p className="lf-setting-desc">
                Applies EBU R128 (-16 LUFS) broadcast volume leveling, voice clarity equalization, and transition anti-click crossfading.
              </p>
            </div>

            {/* Intro / Outro */}
            <div className="lf-setting-row">
              <div className="lf-setting-label-row">
                <span className="lf-setting-title">🎬 Cinematic Intro / Outro</span>
                <input
                  type="checkbox"
                  checked={settings.includeIntro || settings.includeOutro}
                  onChange={(e) => updateSettings({ includeIntro: e.target.checked, includeOutro: e.target.checked })}
                  style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                />
              </div>
              <p className="lf-setting-desc">
                Adds a gentle fade-in at the beginning and cinematic fade-out at the conclusion.
              </p>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '10px' }}>
              <Button
                variant="primary"
                size="md"
                onClick={() => setShowSettingsModal(false)}
              >
                Done
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
