// ============================================================
// Movie Explanation — AI-Powered Video Editing Studio
// CapCut-inspired professional NLE with multi-track timeline,
// live pre-render playback monitor, contextual inspector,
// media library, strict <=3.0s shot pacing, and master export.
// ============================================================

import React, { useState, useEffect } from 'react';
import { useMovieExplanationStore } from '../../stores/movieExplanationStore.js';
import { Button } from '../common/Button.js';
import { ErrorBoundary } from '../common/ErrorBoundary.js';
import { EditorPreviewMonitor } from './editor/EditorPreviewMonitor.js';
import { EditorInspectorPanel } from './editor/EditorInspectorPanel.js';
import { EditorLeftLibrary } from './editor/EditorLeftLibrary.js';
import { EditorMultiTrackTimeline } from './editor/EditorMultiTrackTimeline.js';
import { EditorExportModal } from './editor/EditorExportModal.js';
import { WhyThisSceneModal } from './WhyThisSceneModal.js';
import { SceneAlternativesModal } from './SceneAlternativesModal.js';

export const TimelineWorkspace: React.FC = () => {
  const {
    project,
    selectedShotId,
    isGenerating,
    isRendering,
    regenerateTimeline,
    setIsQualityModalOpen,
    undo,
    redo,
    pastTimelines,
    futureTimelines,
    splitShotAtPlayhead,
  } = useMovieExplanationStore();

  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [editorLayoutMode, setEditorLayoutMode] = useState<'editor' | 'overview'>('editor');
  const [isLeftCollapsed, setIsLeftCollapsed] = useState(false);
  const [isRightCollapsed, setIsRightCollapsed] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [timelineHeightPreset, setTimelineHeightPreset] = useState<'compact' | 'normal' | 'tall'>('normal');

  const timeline = project?.timeline;
  const shots = timeline?.shots || [];
  const selectedShot = shots.find((s) => s.shotId === selectedShotId) || shots[0];

  const timelineHeightPx = timelineHeightPreset === 'compact' ? 210 : timelineHeightPreset === 'tall' ? 340 : 260;

  // Global keyboard shortcuts for editing
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept if user is typing in an input or textarea
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          redo();
        } else {
          undo();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        e.preventDefault();
        redo();
      } else if (e.key === 's' || e.key === 'b') {
        // Split shot at playhead shortcut
        e.preventDefault();
        if (typeof splitShotAtPlayhead === 'function') {
          splitShotAtPlayhead();
        }
      } else if (e.key === '[') {
        e.preventDefault();
        setIsLeftCollapsed((prev) => !prev);
      } else if (e.key === ']') {
        e.preventDefault();
        setIsRightCollapsed((prev) => !prev);
      } else if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        setIsFullscreen((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo, splitShotAtPlayhead]);

  if (!timeline || shots.length === 0) {
    return (
      <div className="mex-empty-workspace">
        <div style={{ fontSize: '3.5rem', marginBottom: '14px' }}>🎬</div>
        <h2 style={{ color: '#fff', fontWeight: 800 }}>No AI Director Timeline Generated Yet</h2>
        <p style={{ fontSize: '0.92rem', marginTop: '8px', color: '#94a3b8', maxWidth: '480px', lineHeight: '1.5' }}>
          Head to the <strong>Inputs</strong> tab, provide your source movie/series and narration audio, and generate your story-aware visual timeline.
        </p>
      </div>
    );
  }

  return (
    <div className={`mex-editor-root ${isFullscreen ? 'is-fullscreen' : ''}`}>
      {/* ── Top Editor Header Bar ── */}
      <div className="mex-editor-topbar">
        {/* Left: Project title & pacing standard badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            className={`mex-chip-btn ${isLeftCollapsed ? 'active' : ''}`}
            onClick={() => setIsLeftCollapsed(!isLeftCollapsed)}
            title={isLeftCollapsed ? 'Expand Media Library (Press [)' : 'Collapse Media Library (Press [)'}
            style={{ fontSize: '0.78rem', padding: '4px 8px' }}
          >
            {isLeftCollapsed ? '📂 Library ▶' : '◀ Library'}
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '1.1rem' }}>🎞️</span>
            <span style={{ fontWeight: 800, fontSize: '0.95rem', color: '#fff' }}>
              {project?.projectName || 'Movie Explanation'}
            </span>
          </div>

          <span className="mex-badge-strict" title="Creative pacing constraint enforced: every individual shot <= 3.0s">
            ⚡ 3.0s Auto-Clip Pacing
          </span>

          <span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>
            {shots.length} shots • {Math.floor(timeline.duration / 60)}m {Math.floor(timeline.duration % 60)}s
          </span>

          {project.timelineRevision && (
            <span className="mex-revision-pill" title="Timeline revision counter (ensures exports are always fresh)">
              Rev {project.timelineRevision}
            </span>
          )}
        </div>

        {/* Center: View Switcher (Full Editor vs Story Overview) */}
        <div className="mex-view-switcher">
          <button
            className={`mex-switcher-btn ${editorLayoutMode === 'editor' ? 'active' : ''}`}
            onClick={() => setEditorLayoutMode('editor')}
          >
            🎛️ Video Editor
          </button>
          <button
            className={`mex-switcher-btn ${editorLayoutMode === 'overview' ? 'active' : ''}`}
            onClick={() => setEditorLayoutMode('overview')}
          >
            📋 Story Blocks
          </button>
        </div>

        {/* Right: Timeline Height Presets, Quality & Export */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {/* Timeline Height Selector */}
          <div style={{ display: 'flex', alignItems: 'center', background: 'rgba(0,0,0,0.3)', borderRadius: '6px', padding: '2px' }}>
            <button
              className={`mex-switcher-btn ${timelineHeightPreset === 'compact' ? 'active' : ''}`}
              onClick={() => setTimelineHeightPreset('compact')}
              title="Compact timeline height (210px)"
              style={{ fontSize: '0.68rem', padding: '2px 6px' }}
            >
              210px
            </button>
            <button
              className={`mex-switcher-btn ${timelineHeightPreset === 'normal' ? 'active' : ''}`}
              onClick={() => setTimelineHeightPreset('normal')}
              title="Standard timeline height (260px)"
              style={{ fontSize: '0.68rem', padding: '2px 6px' }}
            >
              260px
            </button>
            <button
              className={`mex-switcher-btn ${timelineHeightPreset === 'tall' ? 'active' : ''}`}
              onClick={() => setTimelineHeightPreset('tall')}
              title="Tall timeline height (340px)"
              style={{ fontSize: '0.68rem', padding: '2px 6px' }}
            >
              340px
            </button>
          </div>

          {project?.qualityReport && (
            <button
              className={`mex-quality-btn ${project.qualityReport.passed ? 'pass' : 'warn'}`}
              onClick={() => setIsQualityModalOpen(true)}
              title="17-point pre-render quality gate evaluation"
            >
              <span>{project.qualityReport.passed ? '✓' : '⚠️'}</span>
              <span>{project.qualityReport.overallReadinessScore}/100</span>
            </button>
          )}

          <Button
            variant="ghost"
            size="sm"
            loading={isGenerating}
            onClick={regenerateTimeline}
            title="Regenerates unlocked shots while preserving locked (🔒) shots"
          >
            🔄 AI Re-Match
          </Button>

          <Button
            variant="primary"
            size="sm"
            onClick={() => setIsExportModalOpen(true)}
            loading={isRendering}
            title="Export master video at 60 FPS with synchronized narration"
          >
            ⚡ Export Video
          </Button>

          <button
            className={`mex-chip-btn ${isRightCollapsed ? 'active' : ''}`}
            onClick={() => setIsRightCollapsed(!isRightCollapsed)}
            title={isRightCollapsed ? 'Expand Inspector Panel (Press ])' : 'Collapse Inspector Panel (Press ])'}
            style={{ fontSize: '0.78rem', padding: '4px 8px' }}
          >
            {isRightCollapsed ? '◀ Inspector' : 'Inspector ▶'}
          </button>

          <button
            className={`mex-chip-btn ${isFullscreen ? 'active' : ''}`}
            onClick={() => setIsFullscreen(!isFullscreen)}
            title="Toggle CapCut / Filmora full-screen editor workspace (Press F)"
            style={{ fontSize: '0.78rem', padding: '4px 9px', fontWeight: 700, color: isFullscreen ? '#38bdf8' : '#e2e8f0' }}
          >
            {isFullscreen ? '🗗 Standard' : '⛶ Fullscreen'}
          </button>
        </div>
      </div>

      {/* ── Main Editor Stage ── */}
      {editorLayoutMode === 'editor' ? (
        <div className="mex-editor-main-layout">
          {/* Top Half: 3-column stage (Library - Preview Monitor - Inspector) */}
          <div
            className="mex-editor-stage-columns"
            style={{
              gridTemplateColumns: `${isLeftCollapsed ? '44px' : '290px'} 1fr ${isRightCollapsed ? '44px' : '340px'}`,
            }}
          >
            {/* Left Library */}
            {isLeftCollapsed ? (
              <div
                className="mex-col-collapsed"
                onClick={() => setIsLeftCollapsed(false)}
                title="Click to expand Media Library"
              >
                <span style={{ fontSize: '1.1rem' }}>📂</span>
                <span className="mex-collapsed-text">MEDIA LIBRARY</span>
              </div>
            ) : (
              <div className="mex-col-library">
                <ErrorBoundary fallbackTitle="Media Library Error">
                  <EditorLeftLibrary />
                </ErrorBoundary>
              </div>
            )}

            {/* Center Live Pre-Render Preview Monitor */}
            <div className="mex-col-monitor">
              <ErrorBoundary fallbackTitle="Preview Monitor Error">
                <EditorPreviewMonitor />
              </ErrorBoundary>
            </div>

            {/* Right Contextual Inspector */}
            {isRightCollapsed ? (
              <div
                className="mex-col-collapsed"
                onClick={() => setIsRightCollapsed(false)}
                title="Click to expand Inspector"
                style={{ borderRight: 'none', borderLeft: '1px solid rgba(255, 255, 255, 0.07)' }}
              >
                <span style={{ fontSize: '1.1rem' }}>⚙️</span>
                <span className="mex-collapsed-text">INSPECTOR</span>
              </div>
            ) : (
              <div className="mex-col-inspector">
                <ErrorBoundary fallbackTitle="Inspector Panel Error">
                  <EditorInspectorPanel />
                </ErrorBoundary>
              </div>
            )}
          </div>

          {/* Bottom Half: Multi-Track Timeline */}
          <div
            className="mex-editor-bottom-timeline"
            style={{ height: `${timelineHeightPx}px`, minHeight: `${timelineHeightPx}px` }}
          >
            <ErrorBoundary fallbackTitle="Multi-Track Timeline Error">
              <EditorMultiTrackTimeline />
            </ErrorBoundary>
          </div>
        </div>
      ) : (
        /* Overview Mode: classic high-level block view */
        <div className="mex-overview-layout">
          <div className="mex-overview-monitor-wrap">
            <ErrorBoundary fallbackTitle="Preview Monitor Error">
              <EditorPreviewMonitor />
            </ErrorBoundary>
          </div>
          <div className="mex-overview-timeline-wrap">
            <ErrorBoundary fallbackTitle="Multi-Track Timeline Error">
              <EditorMultiTrackTimeline />
            </ErrorBoundary>
          </div>
        </div>
      )}

      {/* ── Modals ── */}
      <EditorExportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
      />
      <WhyThisSceneModal />
      <SceneAlternativesModal />
    </div>
  );
};
