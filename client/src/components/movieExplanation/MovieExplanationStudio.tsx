import React, { useEffect, useState } from 'react';
import { useMovieExplanationStore } from '../../stores/movieExplanationStore.js';
import { InputsWorkspace } from './InputsWorkspace.js';
import { EpisodeIntelligenceWorkspace } from './EpisodeIntelligenceWorkspace.js';
import { TimelineWorkspace } from './TimelineWorkspace.js';
import { ReviewPanel } from './ReviewPanel.js';
import { WhyThisSceneModal } from './WhyThisSceneModal.js';
import { SceneAlternativesModal } from './SceneAlternativesModal.js';
import { MovieQualityReportModal } from './MovieQualityReportModal.js';
import { Button } from '../common/Button.js';
import { Spinner } from '../common/Spinner.js';
import { ErrorBoundary } from '../common/ErrorBoundary.js';
import { api } from '../../services/api.js';
import type { VoiceoverOutputAspectRatio } from '@shared/types.js';

export const MovieExplanationStudio: React.FC = () => {
  const {
    projects,
    project,
    activeProjectId,
    activeTab,
    aspectRatio,
    isIndexing,
    isAligning,
    isGenerating,
    isRendering,
    renderProgress,
    renderStage,
    renderDetail,
    error,
    setError,
    analysisJob,
    cancelIndexing,
    setActiveTab,
    setAspectRatio,
    setIsQualityModalOpen,
    startRender,
    listenToProgress,
    loadProjects,
    loadProject,
    createProject,
    deleteProject,
    enforceScreenshotCadence,
    cancelRender,
  } = useMovieExplanationStore();

  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isNewProjectModalOpen, setIsNewProjectModalOpen] = useState(false);
  const [isReRenderModalOpen, setIsReRenderModalOpen] = useState(false);
  const [newProjectTitle, setNewProjectTitle] = useState('');
  const [isActionBusy, setIsActionBusy] = useState(false);

  const handleRenderClick = () => {
    if (project?.renderedVideoPath) {
      setIsReRenderModalOpen(true);
    } else {
      startRender();
    }
  };

  // Initialize and load project list
  useEffect(() => {
    loadProjects().then(() => {
      const state = useMovieExplanationStore.getState();
      if (!state.activeProjectId) {
        if (state.projects.length > 0) {
          loadProject(state.projects[0].projectId);
        } else {
          createProject();
        }
      }
    }).catch(() => {
      createProject();
    });
  }, []);

  // Connect WebSocket progress listener
  useEffect(() => {
    if (activeProjectId) {
      const unsub = listenToProgress(activeProjectId);
      return () => unsub();
    }
  }, [activeProjectId]);

  const hasTimeline = !!project?.timeline && project.timeline.shots?.length > 0;
  const isBusy = isIndexing || isAligning || isGenerating || isRendering;

  const handleCreateNewProject = async () => {
    try {
      setIsActionBusy(true);
      const name = newProjectTitle.trim() || `Movie Explanation ${new Date().toLocaleDateString()}`;
      await createProject(name);
      setIsNewProjectModalOpen(false);
      setNewProjectTitle('');
      setActiveTab('setup');
    } finally {
      setIsActionBusy(false);
    }
  };

  const handleDeleteProject = async () => {
    if (!project) return;
    try {
      setIsActionBusy(true);
      await deleteProject(project.projectId);
      setIsDeleteModalOpen(false);
      setActiveTab('setup');
    } finally {
      setIsActionBusy(false);
    }
  };

  return (
    <div className="mex-container">
      {/* ── Top Header Bar ── */}
      <div className="mex-header">
        <div className="mex-title-section">
          <div className="mex-badge">
            <span style={{ fontSize: '1rem' }}>🎬</span>
            <span>Movie & Series Explanation Studio</span>
          </div>

          {/* Project Selector Dropdown */}
          {projects.length > 0 && (
            <div className="mex-select-group" title="Switch active movie explanation project">
              <select
                className="mex-select mex-project-select"
                value={activeProjectId || ''}
                onChange={(e) => {
                  if (e.target.value) {
                    loadProject(e.target.value);
                  }
                }}
              >
                {projects.map((p) => (
                  <option key={p.projectId} value={p.projectId}>
                    {p.projectName || p.name || `Project ${p.projectId.slice(0, 8)}`} {p.status === 'completed' ? '✓ (Done)' : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="mex-nav-tabs">
            <button
              className={`mex-tab-btn ${activeTab === 'setup' ? 'active' : ''}`}
              onClick={() => setActiveTab('setup')}
            >
              <span>1. Project Inputs</span>
            </button>

            <button
              className={`mex-tab-btn ${activeTab === 'storyMap' ? 'active' : ''}`}
              onClick={() => setActiveTab('storyMap')}
            >
              <span>2. Story Map & Intelligence</span>
            </button>

            <button
              className={`mex-tab-btn ${activeTab === 'timeline' ? 'active' : ''}`}
              disabled={!hasTimeline}
              onClick={() => setActiveTab('timeline')}
            >
              <span>3. AI Director Timeline</span>
            </button>

            <button
              className={`mex-tab-btn ${activeTab === 'review' ? 'active' : ''}`}
              disabled={!hasTimeline}
              onClick={() => setActiveTab('review')}
            >
              <span>4. Review & Quality</span>
            </button>
          </div>
        </div>

        <div className="mex-header-actions">
          {/* Start New Project Action */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setNewProjectTitle('');
              setIsNewProjectModalOpen(true);
            }}
            title="Create a fresh movie explanation project"
          >
            + Start New Project
          </Button>

          {/* Delete Project Action */}
          {project && (
            <Button
              variant="danger"
              size="sm"
              onClick={() => setIsDeleteModalOpen(true)}
              title="Delete this project, source media, and rendered outputs to free disk space"
            >
              🗑️ Delete Project
            </Button>
          )}

          {/* Aspect Ratio Selector */}
          <div className="mex-select-group">
            <span>Aspect Ratio:</span>
            <select
              className="mex-select"
              value={aspectRatio}
              onChange={(e) => setAspectRatio(e.target.value as VoiceoverOutputAspectRatio)}
            >
              <option value="16:9">16:9 Landscape (YouTube)</option>
              <option value="9:16">9:16 Vertical (Shorts/Reels)</option>
              <option value="1:1">1:1 Square (Social)</option>
            </select>
          </div>

          {/* Quality Gate Pill */}
          {project?.qualityReport && (
            <div
              className={`mex-quality-pill ${project.qualityReport.passed ? 'pass' : 'warn'}`}
              onClick={() => setIsQualityModalOpen(true)}
              title="Click to view 16-point Quality Gate report"
            >
              <span>{project.qualityReport.passed ? '✓' : '⚠'}</span>
              <span>{project.qualityReport.overallReadinessScore}/100 Quality</span>
            </div>
          )}

          {/* Freshness Badge */}
          {hasTimeline && project?.exportStatus === 'outdated' && (
            <div
              style={{
                background: 'rgba(245, 158, 11, 0.15)',
                border: '1px solid rgba(245, 158, 11, 0.4)',
                borderRadius: '6px',
                padding: '4px 8px',
                fontSize: '0.74rem',
                color: '#fbbf24',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
              title="Timeline has been edited since last export. Re-render required to update video."
            >
              <span>⚠️</span>
              <span>Export Outdated (Rev {project.timelineRevision || 1})</span>
            </div>
          )}

          {hasTimeline && project?.exportStatus === 'up_to_date' && (
            <div
              style={{
                background: 'rgba(16, 185, 129, 0.15)',
                border: '1px solid rgba(16, 185, 129, 0.4)',
                borderRadius: '6px',
                padding: '4px 8px',
                fontSize: '0.74rem',
                color: '#34d399',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
              title="60 FPS export is strictly synchronized to current timeline revision."
            >
              <span>✓</span>
              <span>60 FPS Up to Date</span>
            </div>
          )}

          {/* Render Action */}
          {hasTimeline && (
            <Button
              variant="primary"
              size="sm"
              loading={isRendering}
              onClick={handleRenderClick}
            >
              {isRendering
                ? 'Rendering 60 FPS Video...'
                : project?.exportStatus === 'outdated'
                ? '⚡ Render Updated Video (60 FPS)'
                : '⚡ Render Master Video (60 FPS)'}
            </Button>
          )}

          {/* Download Action - Always available whenever a master render exists */}
          {Boolean(project?.renderedVideoPath) && (
            <Button
              variant={isRendering ? 'secondary' : project?.exportStatus === 'outdated' ? 'ghost' : 'secondary'}
              size="sm"
              onClick={() => {
                window.open(api.getMovieExplanationDownloadUrl(project!.projectId), '_blank');
              }}
              title={
                isRendering
                  ? 'Download previous completed render while the new render is processing'
                  : project?.exportStatus === 'outdated'
                  ? 'Download previous completed render (Revision before latest changes)'
                  : 'Download verified 60 FPS master video'
              }
            >
              {isRendering
                ? '📥 Download Existing Render'
                : project?.exportStatus === 'outdated'
                ? '📥 Download Existing Render (60 FPS)'
                : '📥 Download 60 FPS Video'}
            </Button>
          )}
        </div>
      </div>

      {/* ── Completed / Rendered Project Banner with Freshness Protection ── */}
      {Boolean(project?.renderedVideoPath) && !isRendering && (
        project?.exportStatus === 'outdated' ? (
          <div
            className="mex-completed-banner"
            style={{
              background: 'rgba(245, 158, 11, 0.08)',
              border: '1px solid rgba(245, 158, 11, 0.35)',
              borderLeft: '4px solid #f59e0b',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ fontSize: '1.4rem' }}>⚠️</span>
              <div>
                <div style={{ fontWeight: 700, color: '#fbbf24', fontSize: '0.95rem' }}>
                  Timeline Modified (Rev {project?.timelineRevision || 1}) — Master Export Outdated
                </div>
                <div style={{ fontSize: '0.78rem', color: '#94a3b8' }}>
                  You replaced or edited clips after rendering Revision {project?.lastExportedRevision || 0}. Re-render to export your latest edits at 60 FPS (unchanged segments are cached for fast delivery).
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Button
                variant="primary"
                size="sm"
                loading={isRendering}
                onClick={handleRenderClick}
              >
                ⚡ Render Updated Video (60 FPS)
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  window.open(api.getMovieExplanationDownloadUrl(project!.projectId), '_blank');
                }}
                title="Download older video before latest clip changes"
              >
                📥 Download Older Video (Rev {project?.lastExportedRevision || 0})
              </Button>
            </div>
          </div>
        ) : (
          <div className="mex-completed-banner">
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ fontSize: '1.4rem' }}>🎉</span>
              <div>
                <div style={{ fontWeight: 700, color: '#34d399', fontSize: '0.95rem' }}>
                  60 FPS Master Video Render Complete & Up to Date!
                </div>
                <div style={{ fontSize: '0.78rem', color: '#94a3b8' }}>
                  Project: <strong>{project.projectName || project.name || project.projectId}</strong> • 60 FPS HD Master with invisible copyright transforms & synchronized voiceover.
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  window.open(api.getMovieExplanationDownloadUrl(project.projectId), '_blank');
                }}
              >
                📥 Download 60 FPS Video
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setNewProjectTitle('');
                  setIsNewProjectModalOpen(true);
                }}
              >
                ✨ Start New Project
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={() => setIsDeleteModalOpen(true)}
              >
                🗑️ Delete Project & Free Disk Space
              </Button>
            </div>
          </div>
        )
      )}

      {/* ── Active Progress Indicator Banner with Stage Resumption ── */}
      {isBusy && (
        <div className="mex-progress-banner">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Spinner size="sm" />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <span style={{ fontWeight: 600 }}>{renderDetail || renderStage || 'Processing AI pipeline...'}</span>
              {analysisJob && analysisJob.completedStages && analysisJob.completedStages.length > 0 && (
                <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                  Checkpoints saved: {analysisJob.completedStages.join(' → ')}
                </span>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontWeight: 700, color: '#c084fc' }}>{renderProgress}%</span>
            {isIndexing && (
              <Button
                variant="ghost"
                size="sm"
                onClick={cancelIndexing}
                title="Cancel indexing and preserve saved checkpoints"
              >
                ✕ Cancel
              </Button>
            )}
            {isRendering && (
              <Button
                variant="danger"
                size="sm"
                onClick={cancelRender}
                title="Cancel ongoing render immediately and preserve existing video output"
              >
                ✕ Cancel Render
              </Button>
            )}
          </div>
        </div>
      )}

      {/* ── Studio Error Alert Banner ── */}
      {error && (
        <div
          style={{
            margin: '0 24px 16px 24px',
            background: 'rgba(239, 68, 68, 0.12)',
            border: '1px solid rgba(239, 68, 68, 0.35)',
            borderRadius: '8px',
            padding: '12px 18px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            color: '#fca5a5',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '1.3rem' }}>⚠️</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>Studio Operation Notice</div>
              <div style={{ fontSize: '0.82rem', color: '#fecaca' }}>{error}</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {error.toLowerCase().includes('cadence') && (
              <Button
                variant="primary"
                size="sm"
                onClick={async () => {
                  await enforceScreenshotCadence();
                  setError(null);
                }}
                style={{ fontSize: '0.78rem' }}
              >
                ⚡ Auto-Fix Screenshot Cadence
              </Button>
            )}
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setError(null)}
              style={{ color: '#f87171' }}
            >
              ✕ Dismiss
            </button>
          </div>
        </div>
      )}

      {/* ── Workspace Body ── */}
      <div className="mex-body">
        {activeTab === 'setup' && <InputsWorkspace />}
        {activeTab === 'storyMap' && <EpisodeIntelligenceWorkspace />}
        {activeTab === 'timeline' && (
          <ErrorBoundary fallbackTitle="AI Director Timeline Editor Error">
            <TimelineWorkspace />
          </ErrorBoundary>
        )}
        {activeTab === 'review' && <ReviewPanel />}
      </div>

      {/* ── Delete Project Confirmation Modal ── */}
      {isDeleteModalOpen && project && (
        <div className="mex-modal-backdrop" onClick={() => !isActionBusy && setIsDeleteModalOpen(false)}>
          <div className="mex-modal-card" style={{ maxWidth: '520px' }} onClick={(e) => e.stopPropagation()}>
            <div className="mex-modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '1.3rem' }}>🗑️</span>
                <span style={{ fontWeight: 800, fontSize: '1.05rem', color: '#f87171' }}>
                  Delete Project
                </span>
              </div>
              <button
                className="btn btn-ghost btn-sm"
                disabled={isActionBusy}
                onClick={() => setIsDeleteModalOpen(false)}
              >
                ✕
              </button>
            </div>

            <div className="mex-modal-body">
              <p style={{ margin: 0, fontSize: '0.92rem', color: '#f1f5f9', lineHeight: '1.5' }}>
                Are you sure you want to permanently delete project:
                <br />
                <strong style={{ color: '#c084fc', fontSize: '1rem' }}>
                  {project.projectName || project.name || project.projectId}
                </strong>
                ?
              </p>

              <div
                style={{
                  background: 'rgba(239, 68, 68, 0.08)',
                  border: '1px solid rgba(239, 68, 68, 0.25)',
                  borderRadius: '8px',
                  padding: '12px 14px',
                  fontSize: '0.82rem',
                  color: '#fca5a5',
                  lineHeight: '1.5',
                }}
              >
                <div style={{ fontWeight: 700, marginBottom: '6px' }}>
                  ⚠️ This will permanently remove all files from disk:
                </div>
                <ul style={{ margin: 0, paddingLeft: '18px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <li>Original Episode Video ({project.originalVideo?.originalFilename || 'Not uploaded'})</li>
                  <li>Master Voiceover Audio ({project.voiceoverAudio?.originalFilename || 'Not uploaded'})</li>
                  <li>Narration Script & Story Scene Index ({project.episodeIndex?.scenes?.length || 0} indexed scenes)</li>
                  {project.renderedVideoPath && (
                    <li style={{ color: '#fbbf24', fontWeight: 600 }}>Rendered Master Video Output</li>
                  )}
                </ul>
                <div style={{ marginTop: '8px', fontWeight: 600 }}>
                  This action frees up disk space and cannot be undone.
                </div>
              </div>
            </div>

            <div className="mex-modal-footer">
              <Button
                variant="ghost"
                size="sm"
                disabled={isActionBusy}
                onClick={() => setIsDeleteModalOpen(false)}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                size="sm"
                loading={isActionBusy}
                onClick={handleDeleteProject}
              >
                Yes, Permanently Delete Project
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Start New Project Modal ── */}
      {isNewProjectModalOpen && (
        <div className="mex-modal-backdrop" onClick={() => !isActionBusy && setIsNewProjectModalOpen(false)}>
          <div className="mex-modal-card" style={{ maxWidth: '520px' }} onClick={(e) => e.stopPropagation()}>
            <div className="mex-modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '1.3rem' }}>✨</span>
                <span style={{ fontWeight: 800, fontSize: '1.05rem', color: '#fff' }}>
                  Start New Movie Explanation Project
                </span>
              </div>
              <button
                className="btn btn-ghost btn-sm"
                disabled={isActionBusy}
                onClick={() => setIsNewProjectModalOpen(false)}
              >
                ✕
              </button>
            </div>

            <div className="mex-modal-body">
              <p style={{ margin: 0, fontSize: '0.86rem', color: '#94a3b8' }}>
                Enter a project name to start with a fresh workspace for an episode or movie.
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ fontSize: '0.82rem', fontWeight: 600, color: '#e2e8f0' }}>
                  Project Title:
                </label>
                <input
                  type="text"
                  className="input"
                  style={{
                    background: 'var(--bg-tertiary, #1e2230)',
                    border: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.15))',
                    color: '#fff',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    fontSize: '0.9rem',
                  }}
                  placeholder="e.g. The Mentalist S01E02, Inception Breakdown..."
                  value={newProjectTitle}
                  onChange={(e) => setNewProjectTitle(e.target.value)}
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleCreateNewProject();
                    }
                  }}
                />
              </div>
            </div>

            <div className="mex-modal-footer">
              <Button
                variant="ghost"
                size="sm"
                disabled={isActionBusy}
                onClick={() => setIsNewProjectModalOpen(false)}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                loading={isActionBusy}
                onClick={handleCreateNewProject}
              >
                Create & Start Project
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Re-Render Confirmation Safety Modal ── */}
      {isReRenderModalOpen && project && (
        <div className="mex-modal-backdrop" onClick={() => setIsReRenderModalOpen(false)}>
          <div className="mex-modal-card" style={{ maxWidth: '540px' }} onClick={(e) => e.stopPropagation()}>
            <div className="mex-modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '1.3rem' }}>⚡</span>
                <span style={{ fontWeight: 800, fontSize: '1.05rem', color: '#fbbf24' }}>
                  Re-Render Master Video Confirmation
                </span>
              </div>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => setIsReRenderModalOpen(false)}
              >
                ✕
              </button>
            </div>

            <div className="mex-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div
                style={{
                  background: 'rgba(245, 158, 11, 0.1)',
                  border: '1px solid rgba(245, 158, 11, 0.3)',
                  borderRadius: '8px',
                  padding: '12px 16px',
                  fontSize: '0.85rem',
                  color: '#fde68a',
                }}
              >
                <strong>Existing Master Video Available:</strong> A full 60 FPS master video has already been rendered for this project.
              </div>

              <p style={{ margin: 0, fontSize: '0.84rem', color: '#cbd5e1', lineHeight: '1.5' }}>
                Rendering a full movie explanation video at 60 FPS takes <strong>approximately 1 to 2 hours</strong>.
                You can download your existing completed video immediately without waiting, or start a new render if you have made clip changes.
              </p>
            </div>

            <div className="mex-modal-footer" style={{ display: 'flex', justifyContent: 'space-between', gap: '10px' }}>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsReRenderModalOpen(false)}
              >
                Cancel
              </Button>
              <div style={{ display: 'flex', gap: '8px' }}>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setIsReRenderModalOpen(false);
                    window.open(api.getMovieExplanationDownloadUrl(project.projectId), '_blank');
                  }}
                  title="Download the currently rendered 60 FPS master video immediately"
                >
                  📥 Download Existing Video
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    setIsReRenderModalOpen(false);
                    startRender();
                  }}
                  title="Begin a fresh 1-2 hour 60 FPS render pass"
                >
                  ⚡ Start New Render
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Modals ── */}
      <WhyThisSceneModal />
      <SceneAlternativesModal />
      <MovieQualityReportModal />
    </div>
  );
};
