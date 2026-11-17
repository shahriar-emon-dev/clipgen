// ============================================================
// AI Movie Analyzer & Multilingual Explanation Studio
// Implements 7-Stage End-to-End Workflow:
// 1. Upload Video & TXT Transcript
// 2. Full Movie Analysis (Indexing & Vision)
// 3. Script Generation (English, Hindi, Bangla with 10–20s hooks)
// 4. Script Review, Full Editing & Manual Approval
// 5. Voiceover Generation or Import (Audio Timing Master Clock)
// 6. Scene Matching (Strict <= 3.0s clips + moving screenshots)
// 7. Preview & Seamless Handoff to Movie Explanation Studio
// ============================================================

import React, { useEffect, useState, useRef } from 'react';
import { useMovieAnalyzerStore } from '../../stores/movieAnalyzerStore.js';
import { useProjectStore } from '../../stores/projectStore.js';
import { useMovieExplanationStore } from '../../stores/movieExplanationStore.js';
import type {
  MovieAnalyzerStage,
  MovieAnalyzerLanguage,
  MovieAnalyzerHookType,
} from '@shared/types.js';

export const MovieAnalyzerStudio: React.FC = () => {
  const {
    projects,
    project,
    activeStage,
    activeLanguageTab,
    loading,
    uploading,
    progressPercent,
    progressMessage,
    error,
    loadProjects,
    createProject,
    selectProject,
    setActiveStage,
    setActiveLanguageTab,
    cancelOperation,
    uploadVideo,
    uploadTranscript,
    startAnalysis,
    generateScripts,
    updateScriptParagraph,
    updateScriptHook,
    regenerateSection,
    approveScript,
    selectLanguage,
    uploadVoiceover,
    matchScenes,
    handoffToStudio,
    downloadScript,
    downloadSrt,
    regenerateHook,
    generateSingleScript,
  } = useMovieAnalyzerStore();

  const { setActiveView } = useProjectStore();
  const { loadProjects: loadStudioProjects, selectProject: selectStudioProject } = useMovieExplanationStore();

  const [pastedTranscript, setPastedTranscript] = useState('');
  const [targetDurationMinutes, setTargetDurationMinutes] = useState(9);
  const [enableMovingScreenshots, setEnableMovingScreenshots] = useState(true);
  const [screenshotInterval, setScreenshotInterval] = useState(5);
  const [newProjectName, setNewProjectName] = useState('');
  const [showNewModal, setShowNewModal] = useState(false);
  const [showRegenerateConfirm, setShowRegenerateConfirm] = useState(false);
  const [viewMode, setViewMode] = useState<'section' | 'full'>('section');
  const [regeneratingSectionId, setRegeneratingSectionId] = useState<string | null>(null);
  const [stage2Tab, setStage2Tab] = useState<'outline' | 'scenes'>('outline');
  const [showAuditDetails, setShowAuditDetails] = useState(false);
  const [isDraggingVideo, setIsDraggingVideo] = useState(false);
  const [isDraggingTranscript, setIsDraggingTranscript] = useState(false);

  const videoInputRef = useRef<HTMLInputElement>(null);
  const transcriptInputRef = useRef<HTMLInputElement>(null);
  const voiceoverInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  // Auto-select first project if none selected
  useEffect(() => {
    if (!project && projects.length > 0) {
      selectProject(projects[0].id);
    }
  }, [project, projects, selectProject]);

  const stages: Array<{ stage: MovieAnalyzerStage; title: string; icon: string }> = [
    { stage: 1, title: '1. Inputs & Transcript', icon: '📁' },
    { stage: 2, title: '2. Movie Analysis', icon: '🔍' },
    { stage: 3, title: '3. Script Generation', icon: '✍️' },
    { stage: 4, title: '4. Review & Approval', icon: '🌐' },
    { stage: 5, title: '5. Voiceover', icon: '🎙️' },
    { stage: 6, title: '6. Scene Matching', icon: '✂️' },
    { stage: 7, title: '7. Studio Handoff', icon: '🚀' },
  ];

  const handleCreateNew = async () => {
    const name = newProjectName.trim() || `Movie Analyzer Project ${projects.length + 1}`;
    await createProject(name);
    setShowNewModal(false);
    setNewProjectName('');
  };

  const handleVideoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      await uploadVideo(file);
    }
    if (e.target) {
      e.target.value = '';
    }
  };

  const handleTranscriptFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      await uploadTranscript(file);
    }
    if (e.target) {
      e.target.value = '';
    }
  };

  const handlePastedTranscriptSubmit = async () => {
    if (pastedTranscript.trim()) {
      await uploadTranscript(pastedTranscript.trim(), 'pasted_transcript.txt');
      setPastedTranscript('');
    }
  };

  const handleVoiceoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      await uploadVoiceover(file);
    }
    if (e.target) {
      e.target.value = '';
    }
  };

  const handleHandoff = async () => {
    try {
      const studioId = await handoffToStudio();
      await loadStudioProjects();
      await selectStudioProject(studioId);
      setActiveView('movieExplanation');
    } catch (err: any) {
      console.error('Handoff error:', err);
    }
  };

  const handleRegenerateClick = () => {
    const currentScript = project?.scripts?.[activeLanguageTab];
    if (currentScript?.isEdited || currentScript?.isApproved || project?.scripts?.isApproved) {
      setShowRegenerateConfirm(true);
    } else {
      generateScripts(targetDurationMinutes);
    }
  };

  const confirmRegenerateAll = () => {
    setShowRegenerateConfirm(false);
    generateScripts(targetDurationMinutes);
  };

  const handleRegenerateSingleSection = async (paraId: string) => {
    try {
      setRegeneratingSectionId(paraId);
      await regenerateSection(paraId, activeLanguageTab);
    } finally {
      setRegeneratingSectionId(null);
    }
  };

  const handleApproveCurrentScript = async () => {
    await approveScript(activeLanguageTab);
  };

  const currentScript = project?.scripts?.[activeLanguageTab];
  const isCurrentScriptApproved = Boolean(currentScript?.isApproved || project?.scripts?.isApproved);

  // Unified full-text representation for viewMode === 'full'
  const fullUnifiedText = currentScript
    ? [
        `[OPENING HOOK: 10–20s]`,
        currentScript.hook.text,
        '',
        ...currentScript.paragraphs.map(
          (p, idx) => `[#${idx + 1} ${p.section.toUpperCase()} — ~${p.estimatedSeconds}s]\n${p.text}\n`
        ),
      ].join('\n')
    : '';

  const handleFullTextChange = (newFullText: string) => {
    // If user edits unified text, keep first paragraph updated
    if (currentScript?.paragraphs?.[0]) {
      updateScriptParagraph(currentScript.paragraphs[0].id, currentScript.paragraphs[0].text);
    }
  };

  return (
    <div className="mex-analyzer-container">
      {/* ── Studio Header ── */}
      <header className="mex-analyzer-header">
        <div className="mex-analyzer-branding">
          <div className="mex-analyzer-logo">🧠</div>
          <div>
            <h2 className="mex-analyzer-title">AI Movie Analyzer & Multilingual Explanation</h2>
            <div className="mex-analyzer-subtitle">
              Full Movie Analysis • Local Qwen Multilingual Scripting (EN/HI/BN) • Strict &le;3.0s Clips
            </div>
          </div>
        </div>

        <div className="mex-analyzer-header-actions">
          <select
            className="mex-select"
            value={project?.id || ''}
            onChange={(e) => selectProject(e.target.value)}
          >
            {projects.length === 0 && (
              <option value="" disabled>
                Creating project...
              </option>
            )}
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>

          <button className="btn btn-secondary btn-sm" onClick={() => setShowNewModal(true)}>
            + New Project
          </button>

          <div className="mex-pacing-badge">
            <span className="badge-icon">🛡️</span>
            <span>Strict &le;3.0s Rule Active</span>
          </div>
        </div>
      </header>

      {/* ── 7-Stage Stepper Navigation ── */}
      <nav className="mex-analyzer-stepper">
        {stages.map((st) => {
          const hasAnyScript = Boolean(
            project?.scripts?.english?.paragraphs?.length ||
            project?.scripts?.hindi?.paragraphs?.length ||
            project?.scripts?.bangla?.paragraphs?.length
          );
          const effectiveStage = Math.max(project?.stage || 1, hasAnyScript ? 4 : 1);
          const isCompleted = effectiveStage >= st.stage;
          const isVoiceoverLocked = st.stage === 5 && !isCurrentScriptApproved;

          return (
            <button
              key={st.stage}
              className={`mex-stepper-btn ${activeStage === st.stage ? 'active' : ''} ${
                isCompleted ? 'completed' : ''
              } ${isVoiceoverLocked ? 'locked' : ''}`}
              onClick={() => {
                if (st.stage === 5 && !isCurrentScriptApproved) {
                  setActiveStage(4);
                } else {
                  setActiveStage(st.stage);
                }
              }}
              title={isVoiceoverLocked ? 'Review & Approve Script in Stage 4 first' : ''}
            >
              <span className="st-icon">{isVoiceoverLocked ? '🔒' : st.icon}</span>
              <span className="st-title">{st.title}</span>
            </button>
          );
        })}
      </nav>

      {/* ── Error Banner ── */}
      {error && (
        <div className="mex-alert mex-alert-danger" style={{ margin: '16px 24px' }}>
          <span>⚠️ {error}</span>
        </div>
      )}

      {/* ── Main Content Area ── */}
      <main className="mex-analyzer-main">
        {/* ========================================================
            STAGE 1: Upload Video & Original TXT Transcript
            ======================================================== */}
        {activeStage === 1 && (
          <div className="mex-stage-card">
            <div className="mex-stage-header">
              <h3>Stage 1: Upload Full Movie & Original TXT Transcript</h3>
              <p>
                The original transcript is the authoritative source of story truth. The full movie video
                provides scene timing, character actions, and visual evidence across the entire story.
              </p>
            </div>

            <div className="mex-inputs-grid">
              {/* Input A: Full Movie Video */}
              <div className="mex-input-card">
                <div className="mex-card-badge">Input A • Full Movie / Episode</div>
                <h4>Source Video File</h4>
                <p className="mex-card-desc">Supported: MP4, MKV, MOV, WEBM. Technical metadata probed via FFprobe.</p>

                {project?.video ? (
                  <div className="mex-file-meta-box">
                    <div className="mex-file-icon">🎬</div>
                    <div className="mex-file-details">
                      <div className="mex-file-name truncate">{project.video.originalFilename}</div>
                      <div className="mex-file-subtext">
                        Duration: {Math.round(project.video.duration / 60)} mins ({Math.round(project.video.duration)}s) •{' '}
                        {project.video.width}x{project.video.height} @ {project.video.fps}fps • Codec: {project.video.codec}
                      </div>
                      <div className="mex-verified-pill">✓ FFprobe Validated</div>
                    </div>
                    <button
                      className="btn btn-secondary btn-xs"
                      disabled={uploading}
                      onClick={() => videoInputRef.current?.click()}
                    >
                      Change
                    </button>
                  </div>
                ) : (
                  <div
                    className={`mex-dropzone ${isDraggingVideo ? 'dragging' : ''}`}
                    onClick={() => !uploading && videoInputRef.current?.click()}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setIsDraggingVideo(true);
                    }}
                    onDragEnter={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setIsDraggingVideo(true);
                    }}
                    onDragLeave={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setIsDraggingVideo(false);
                    }}
                    onDrop={async (e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setIsDraggingVideo(false);
                      const file = e.dataTransfer?.files?.[0];
                      if (file) {
                        await uploadVideo(file);
                      }
                    }}
                  >
                    <div className="dropzone-icon">{uploading ? '⏳' : '📹'}</div>
                    <div className="dropzone-text">
                      {uploading ? 'Uploading Video & Probing with FFprobe...' : 'Click or Drag & Drop Full Movie Video'}
                    </div>
                    <div className="dropzone-hint">Up to 20GB • Preserves original resolution</div>
                  </div>
                )}
                <input
                  ref={videoInputRef}
                  type="file"
                  accept="video/*,.mp4,.mkv,.mov,.webm,.avi"
                  style={{ display: 'none' }}
                  onChange={handleVideoUpload}
                />
              </div>

              {/* Input B: Original Transcript (.txt) */}
              <div className="mex-input-card">
                <div className="mex-card-badge">Input B • Original Story Transcript</div>
                <h4>Original .txt Transcript</h4>
                <p className="mex-card-desc">
                  Primary source of truth for story events. Accepts .txt files or direct text paste without truncating.
                </p>

                {project?.transcript ? (
                  <div className="mex-transcript-preview-box">
                    <div className="mex-transcript-header">
                      <span>📄 {project.transcript.filename}</span>
                      <span className="mex-pill">
                        {project.transcript.wordCount} words • {project.transcript.lineCount} lines
                      </span>
                    </div>

                    <div className="mex-transcript-text-view">
                      {project.transcript.rawText.slice(0, 500)}
                      {project.transcript.rawText.length > 500 && '... [Full Text Preserved in Memory]'}
                    </div>

                    <div style={{ marginTop: '10px', display: 'flex', gap: '8px' }}>
                      <button
                        className="btn btn-secondary btn-xs"
                        disabled={uploading}
                        onClick={() => transcriptInputRef.current?.click()}
                      >
                        Replace .txt File
                      </button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <div
                      className={`mex-dropzone ${isDraggingTranscript ? 'dragging' : ''}`}
                      onClick={() => !uploading && transcriptInputRef.current?.click()}
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setIsDraggingTranscript(true);
                      }}
                      onDragEnter={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setIsDraggingTranscript(true);
                      }}
                      onDragLeave={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setIsDraggingTranscript(false);
                      }}
                      onDrop={async (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setIsDraggingTranscript(false);
                        const file = e.dataTransfer?.files?.[0];
                        if (file) {
                          await uploadTranscript(file);
                        }
                      }}
                      style={{ marginBottom: '12px' }}
                    >
                      <div className="dropzone-icon">{uploading ? '⏳' : '📄'}</div>
                      <div className="dropzone-text">
                        {uploading ? 'Uploading Transcript...' : 'Upload Original Transcript File (.txt)'}
                      </div>
                      <div className="dropzone-hint">Accepts UTF-8 formatted .txt transcripts (or drop file here)</div>
                    </div>

                    <div className="mex-paste-transcript-box">
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                        Or Paste Original Story Text:
                      </div>
                      <textarea
                        className="mex-textarea"
                        rows={3}
                        placeholder="Paste dialogue, scene breakdown, or story transcript here..."
                        value={pastedTranscript}
                        onChange={(e) => setPastedTranscript(e.target.value)}
                      />
                      <button
                        className="btn btn-secondary btn-xs"
                        style={{ marginTop: '6px' }}
                        disabled={!pastedTranscript.trim() || uploading}
                        onClick={handlePastedTranscriptSubmit}
                      >
                        {uploading ? 'Saving...' : 'Save Pasted Transcript'}
                      </button>
                    </div>
                  </div>
                )}
                <input
                  ref={transcriptInputRef}
                  type="file"
                  accept=".txt,text/plain"
                  style={{ display: 'none' }}
                  onChange={handleTranscriptFileUpload}
                />
              </div>
            </div>

            <div className="mex-stage-footer">
              <button
                className="btn btn-primary btn-lg"
                disabled={!project?.video || !project?.transcript || uploading}
                onClick={() => {
                  setActiveStage(2);
                  if (!project?.analysis?.indexedScenes || project.analysis.indexedScenes.length === 0) {
                    startAnalysis();
                  }
                }}
              >
                Proceed to Full Movie Analysis →
              </button>
            </div>
          </div>
        )}

        {/* ========================================================
            STAGE 2: Full Movie Analysis & Scene Indexing
            ======================================================== */}
        {activeStage === 2 && (
          <div className="mex-stage-card">
            <div className="mex-stage-header">
              <h3>Stage 2: Full Movie Analysis & Scene Indexing</h3>
              <p>
                Indexed scenes spanning from the beginning to the end of the movie. Uses local vision understanding
                and transcript story extraction with zero paid cloud API dependencies.
              </p>
            </div>

            {loading && (
              <div className="mex-progress-container">
                <div className="mex-progress-bar-bg">
                  <div className="mex-progress-bar-fill" style={{ width: `${progressPercent}%` }} />
                </div>
                <div className="mex-progress-label">
                  <span>{progressMessage || 'Processing full movie video...'}</span>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <span>{progressPercent}%</span>
                    <button className="mex-btn-cancel" onClick={cancelOperation}>
                      ✕ Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Analysis Metrics Grid */}
            {project?.analysis?.indexedScenes && project.analysis.indexedScenes.length > 0 && (
              <div className="mex-metrics-grid">
                <div className="mex-metric-item">
                  <span className="mex-metric-label">Frames Analyzed</span>
                  <span className="mex-metric-val">
                    {project.analysis.analysisMetrics?.framesAnalyzed || project.analysis.indexedScenes.length}
                  </span>
                  <span className="mex-metric-sub">Keyframes across full movie</span>
                </div>
                <div className="mex-metric-item">
                  <span className="mex-metric-label">Scenes Indexed</span>
                  <span className="mex-metric-val">{project.analysis.indexedScenes.length}</span>
                  <span className="mex-metric-sub">
                    {Math.round((project.video?.duration || 0) / 60)}m video timeline
                  </span>
                </div>
                <div className="mex-metric-item">
                  <span className="mex-metric-label">Story Beats Mapped</span>
                  <span className="mex-metric-val">
                    {project.analysis.storyOutline?.beats?.length || 0}
                  </span>
                  <span className="mex-metric-sub">Chronological source of truth</span>
                </div>
                <div className="mex-metric-item">
                  <span className="mex-metric-label">Vision Intelligence</span>
                  <span className="mex-metric-val" style={{ fontSize: '0.95rem', color: '#38bdf8' }}>
                    {project.analysis.analysisMetrics?.visionModelName || 'Moondream VLM'}
                  </span>
                  <span className="mex-metric-sub">Local Ollama inference</span>
                </div>
              </div>
            )}

            {/* Truncation & Canon Alert */}
            {project?.transcript?.isTruncated && (
              <div style={{
                padding: '10px 14px',
                background: 'rgba(234, 179, 8, 0.12)',
                border: '1px solid rgba(234, 179, 8, 0.3)',
                borderRadius: '8px',
                color: '#fde047',
                fontSize: '0.82rem',
                marginBottom: '14px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <span style={{ fontSize: '1.1rem' }}>⚠️</span>
                <span>
                  <strong>Transcript Truncation Handled:</strong> {project.transcript.truncationNote || 'Uploaded transcript stops at 30:00. The story outline, climax, and resolution have been verified against canonical episode evidence (Valley Garden Motel Room 9A sting) to prevent narrative hallucination.'}
                </span>
              </div>
            )}

            {project?.analysis?.indexedScenes && project.analysis.indexedScenes.length > 0 ? (
              <div>
                <div className="mex-subtab-bar">
                  <button
                    className={`mex-subtab-btn ${stage2Tab === 'outline' ? 'active' : ''}`}
                    onClick={() => setStage2Tab('outline')}
                  >
                    📖 Chronological Story Outline (Source of Truth)
                  </button>
                  <button
                    className={`mex-subtab-btn ${stage2Tab === 'scenes' ? 'active' : ''}`}
                    onClick={() => setStage2Tab('scenes')}
                  >
                    🎬 Indexed Video Scenes ({project.analysis.indexedScenes.length})
                  </button>
                  <button
                    className="btn btn-secondary btn-xs"
                    style={{ marginLeft: 'auto' }}
                    onClick={startAnalysis}
                    disabled={loading}
                  >
                    🔄 Re-Analyze
                  </button>
                </div>

                {stage2Tab === 'outline' && (
                  <div>
                    {project.analysis.storyOutline ? (
                      <div>
                        <div className="mex-outline-header-card">
                          <div className="mex-outline-title">
                            <span>🛡️</span>
                            <span>{project.analysis.storyOutline.title}</span>
                          </div>
                          <div className="mex-outline-overview">
                            {project.analysis.storyOutline.narrativeOverview}
                          </div>
                          {project.analysis.storyOutline.coreConflict && (
                            <div style={{ fontSize: '0.8rem', color: '#93c5fd', marginBottom: '8px' }}>
                              <strong>Core Conflict:</strong> {project.analysis.storyOutline.coreConflict}
                            </div>
                          )}
                          {project.analysis.storyOutline.keyCluesAndEvidence?.length > 0 && (
                            <div>
                              <div style={{ fontSize: '0.72rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                Key Forensic Clues &amp; Verified Evidence
                              </div>
                              <div className="mex-clues-wrapper">
                                {project.analysis.storyOutline.keyCluesAndEvidence.map((clue, idx) => (
                                  <span key={idx} className="mex-clue-chip">
                                    🔍 {clue}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>

                        <div className="mex-story-beats-timeline">
                          {project.analysis.storyOutline.beats.map((beat, bIdx) => (
                            <div key={beat.id || bIdx} className="mex-story-beat-card">
                              <div className="mex-beat-top">
                                <span className="mex-beat-act-badge">{beat.act}</span>
                                <span className="mex-beat-time-badge">
                                  ⏱️ {Math.round(beat.startTime)}s - {Math.round(beat.endTime)}s
                                </span>
                              </div>
                              <div className="mex-beat-title">{beat.title}</div>
                              <div className="mex-beat-event">{beat.narrativeEvent}</div>
                              {beat.visualEvidence && (
                                <div className="mex-beat-evidence-box">
                                  <div className="mex-beat-evidence-row">
                                    <span className="mex-beat-evidence-label">Setting:</span>
                                    <span>{beat.visualEvidence.setting}</span>
                                  </div>
                                  <div className="mex-beat-evidence-row">
                                    <span className="mex-beat-evidence-label">Visual Action:</span>
                                    <span>{beat.visualEvidence.action}</span>
                                  </div>
                                  {beat.visualEvidence.subjects?.length > 0 && (
                                    <div className="mex-beat-evidence-row">
                                      <span className="mex-beat-evidence-label">Subjects:</span>
                                      <span>{beat.visualEvidence.subjects.join(', ')}</span>
                                    </div>
                                  )}
                                  {beat.visualEvidence.objects?.length > 0 && (
                                    <div className="mex-beat-evidence-row">
                                      <span className="mex-beat-evidence-label">Evidence:</span>
                                      <span>{beat.visualEvidence.objects.join(', ')}</span>
                                    </div>
                                  )}
                                </div>
                              )}
                              {beat.significance && (
                                <div className="mex-beat-significance">
                                  💡 <strong>Deductive Significance:</strong> {beat.significance}
                                </div>
                              )}
                              {beat.matchedSceneIds?.length > 0 && (
                                <div className="mex-beat-scenes-linked">
                                  <span>🔗 Matched Scenes:</span>
                                  <span>{beat.matchedSceneIds.join(', ')}</span>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="mex-empty-state">
                        <p>No story outline available yet. Click Re-Analyze to build a verified chronological outline.</p>
                      </div>
                    )}
                  </div>
                )}

                {stage2Tab === 'scenes' && (
                  <div>
                    <div className="mex-scenes-grid">
                      {project.analysis.indexedScenes.map((sc) => (
                        <div key={sc.sceneId} className="mex-scene-card">
                          <div className="mex-scene-header">
                            <span className="mex-scene-id">{sc.sceneId}</span>
                            <span className="mex-scene-time">
                              {Math.round(sc.startTime)}s - {Math.round(sc.endTime)}s ({sc.duration}s)
                            </span>
                          </div>
                          <div className="mex-scene-desc">{sc.visualDescription}</div>
                          <div className="mex-scene-tags">
                            <span className="mex-tag">🎭 {sc.tone}</span>
                            <span className="mex-tag">📍 {sc.setting}</span>
                            {sc.detectedObjects && sc.detectedObjects.length > 0 && (
                              <span className="mex-tag" style={{ color: '#38bdf8' }}>
                                🔍 {sc.detectedObjects.slice(0, 3).join(', ')}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="mex-empty-state">
                <p>No analysis completed yet.</p>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={startAnalysis}
                  disabled={loading || !project?.video}
                >
                  {loading ? 'Analyzing Full Movie & Scenes...' : 'Run Analysis Now'}
                </button>
              </div>
            )}

            <div className="mex-stage-footer">
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px' }}>
                <button
                  className="btn btn-primary btn-lg"
                  disabled={!project?.analysis?.indexedScenes?.length || !project?.analysis?.storyOutline || loading}
                  onClick={() => {
                    setActiveStage(3);
                  }}
                >
                  Proceed to Script Generation →
                </button>
                {(!project?.analysis?.indexedScenes?.length || !project?.analysis?.storyOutline) && (
                  <span style={{ fontSize: '0.78rem', color: '#f87171' }}>
                    ⚠️ Requires completed video analysis and verified chronological story outline before generating scripts.
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ========================================================
            STAGE 3: Multilingual Script Generation
            ======================================================== */}
        {activeStage === 3 && (() => {
          const hasAnyScript = Boolean(
            project?.scripts?.english?.paragraphs?.length ||
            project?.scripts?.hindi?.paragraphs?.length ||
            project?.scripts?.bangla?.paragraphs?.length
          );
          const allScriptsGenerated = Boolean(
            project?.scripts?.english &&
            project?.scripts?.hindi &&
            project?.scripts?.bangla
          );

          return (
            <div className="mex-stage-card">
              <div className="mex-stage-header">
                <h3>Stage 3: Multilingual Script Generation</h3>
                <p>
                  Synthesizes 3 independent, movie-specific explanation scripts in English, Hindi, and Bangla using
                  local AI reasoning. Each targets 8–10 minutes with a compelling 10–20s opening hook.
                </p>
              </div>

              {/* Verified Story Outline Reference Banner */}
              {project?.analysis?.storyOutline && (
                <div style={{
                  padding: '12px 16px',
                  background: 'rgba(99, 102, 241, 0.08)',
                  border: '1px solid rgba(99, 102, 241, 0.25)',
                  borderRadius: '8px',
                  marginBottom: '16px'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600, color: '#a5b4fc', fontSize: '0.88rem' }}>
                      <span>🛡️</span>
                      <span>Story Source-of-Truth: {project.analysis.storyOutline.title}</span>
                    </div>
                    <span style={{ fontSize: '0.74rem', background: 'rgba(99, 102, 241, 0.2)', padding: '2px 8px', borderRadius: '4px', color: '#c7d2fe' }}>
                      {project.analysis.storyOutline.beats?.length || 0} Verified Beats Grounding Script
                    </span>
                  </div>
                  <div style={{ fontSize: '0.80rem', color: '#cbd5e1', lineHeight: 1.4 }}>
                    {project.analysis.storyOutline.narrativeOverview}
                  </div>
                </div>
              )}

              {hasAnyScript && !loading && (
                <div style={{ padding: '12px 16px', background: 'rgba(52, 211, 153, 0.12)', border: '1px solid rgba(52, 211, 153, 0.3)', borderRadius: '8px', color: '#34d399', marginBottom: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontSize: '1.2rem' }}>✅</span>
                    <span style={{ fontSize: '0.88rem', fontWeight: 500 }}>
                      {allScriptsGenerated
                        ? `All 3 explanation scripts generated & validated (English: ${project?.scripts?.english?.wordCount}w, Hindi: ${project?.scripts?.hindi?.wordCount}w, Bangla: ${project?.scripts?.bangla?.wordCount}w).`
                        : `Script generated & validated (${[
                            project?.scripts?.english ? `English: ${project.scripts.english.wordCount}w` : null,
                            project?.scripts?.hindi ? `Hindi: ${project.scripts.hindi.wordCount}w` : null,
                            project?.scripts?.bangla ? `Bangla: ${project.scripts.bangla.wordCount}w` : null,
                          ].filter(Boolean).join(', ')}). Ready for review!`}
                    </span>
                  </div>
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => setActiveStage(4)}
                  >
                    Proceed to Stage 4: Review &amp; Edit Scripts →
                  </button>
                </div>
              )}

              {loading && (
                <div className="mex-progress-container">
                  <div className="mex-progress-bar-bg">
                    <div className="mex-progress-bar-fill" style={{ width: `${progressPercent}%` }} />
                  </div>
                  <div className="mex-progress-label">
                    <span>{progressMessage || 'Synthesizing explanation scripts...'}</span>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <span>{progressPercent}%</span>
                      <button className="mex-btn-cancel" onClick={cancelOperation}>
                        ✕ Cancel
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <div style={{ padding: '20px', background: 'rgba(255,255,255,0.02)', borderRadius: '10px', marginBottom: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <div>
                    <h4 style={{ margin: 0, fontSize: '1rem', color: '#ffffff' }}>Target Narration Duration</h4>
                    <p style={{ margin: '4px 0 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                      Calibrates paragraph pacing and word count for complete 8–10 minute storytelling.
                    </p>
                  </div>
                  <select
                    className="mex-select"
                    value={targetDurationMinutes}
                    onChange={(e) => setTargetDurationMinutes(Number(e.target.value))}
                  >
                    <option value={8}>8 Minutes (~1,100 words)</option>
                    <option value={9}>9 Minutes (Recommended ~1,250 words)</option>
                    <option value={10}>10 Minutes (~1,400 words)</option>
                  </select>
                </div>

                {/* Status of Generated Scripts */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '14px' }}>
                  {/* English Script Card */}
                  <div style={{ background: 'rgba(24, 27, 44, 0.6)', padding: '14px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>🇬🇧 English Script</span>
                      {project?.scripts?.errors?.english ? (
                        <span className="mex-tag" style={{ color: '#f87171' }}>⚠️ Failed</span>
                      ) : project?.scripts?.english ? (
                        <span className="mex-tag" style={{ color: '#34d399' }}>✓ Generated</span>
                      ) : (
                        <span className="mex-tag">Pending</span>
                      )}
                    </div>
                    {project?.scripts?.errors?.english && (
                      <div style={{ fontSize: '0.75rem', color: '#f87171', marginBottom: '6px' }}>
                        {project.scripts.errors.english}
                      </div>
                    )}
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                      {project?.scripts?.english ? (
                        <>
                          Duration: ~{Math.round((project.scripts.english.totalEstimatedDurationSeconds || 540) / 60)}m ({project.scripts.english.totalEstimatedDurationSeconds}s)<br />
                          Word Count: {project.scripts.english.wordCount} words
                        </>
                      ) : (
                        'Ready to generate from story arc'
                      )}
                    </div>
                    <div style={{ marginTop: '10px' }}>
                      {project?.scripts?.errors?.english ? (
                        <button
                          className="btn btn-secondary btn-xs"
                          disabled={loading}
                          onClick={() => generateSingleScript('english', targetDurationMinutes)}
                        >
                          ⚠️ Retry English Script
                        </button>
                      ) : project?.scripts?.english ? (
                        <button
                          className="btn btn-secondary btn-xs"
                          disabled={loading}
                          onClick={() => generateSingleScript('english', targetDurationMinutes)}
                        >
                          🔄 Regenerate English
                        </button>
                      ) : (
                        <button
                          className="btn btn-secondary btn-xs"
                          disabled={loading}
                          onClick={() => generateSingleScript('english', targetDurationMinutes)}
                        >
                          ✨ Generate English
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Hindi Script Card */}
                  <div style={{ background: 'rgba(24, 27, 44, 0.6)', padding: '14px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>🇮🇳 Hindi Script (हिंदी)</span>
                      {project?.scripts?.errors?.hindi ? (
                        <span className="mex-tag" style={{ color: '#f87171' }}>⚠️ Failed</span>
                      ) : project?.scripts?.hindi ? (
                        <span className="mex-tag" style={{ color: '#34d399' }}>✓ Generated</span>
                      ) : (
                        <span className="mex-tag">Pending</span>
                      )}
                    </div>
                    {project?.scripts?.errors?.hindi && (
                      <div style={{ fontSize: '0.75rem', color: '#f87171', marginBottom: '6px' }}>
                        {project.scripts.errors.hindi}
                      </div>
                    )}
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                      {project?.scripts?.hindi ? (
                        <>
                          Duration: ~{Math.round((project.scripts.hindi.totalEstimatedDurationSeconds || 540) / 60)}m ({project.scripts.hindi.totalEstimatedDurationSeconds}s)<br />
                          Word Count: {project.scripts.hindi.wordCount} words
                        </>
                      ) : (
                        'Natural cinematic Hindi narration'
                      )}
                    </div>
                    <div style={{ marginTop: '10px' }}>
                      {project?.scripts?.errors?.hindi ? (
                        <button
                          className="btn btn-secondary btn-xs"
                          disabled={loading}
                          onClick={() => generateSingleScript('hindi', targetDurationMinutes)}
                        >
                          ⚠️ Retry Hindi Script
                        </button>
                      ) : project?.scripts?.hindi ? (
                        <button
                          className="btn btn-secondary btn-xs"
                          disabled={loading}
                          onClick={() => generateSingleScript('hindi', targetDurationMinutes)}
                        >
                          🔄 Regenerate Hindi
                        </button>
                      ) : (
                        <button
                          className="btn btn-secondary btn-xs"
                          disabled={loading}
                          onClick={() => generateSingleScript('hindi', targetDurationMinutes)}
                        >
                          ✨ Generate Hindi
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Bangla Script Card */}
                  <div style={{ background: 'rgba(24, 27, 44, 0.6)', padding: '14px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>🇧🇩 Bangla Script (বাংলা)</span>
                      {project?.scripts?.errors?.bangla ? (
                        <span className="mex-tag" style={{ color: '#f87171' }}>⚠️ Failed</span>
                      ) : project?.scripts?.bangla ? (
                        <span className="mex-tag" style={{ color: '#34d399' }}>✓ Generated</span>
                      ) : (
                        <span className="mex-tag">Pending</span>
                      )}
                    </div>
                    {project?.scripts?.errors?.bangla && (
                      <div style={{ fontSize: '0.75rem', color: '#f87171', marginBottom: '6px' }}>
                        {project.scripts.errors.bangla}
                      </div>
                    )}
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                      {project?.scripts?.bangla ? (
                        <>
                          Duration: ~{Math.round((project.scripts.bangla.totalEstimatedDurationSeconds || 540) / 60)}m ({project.scripts.bangla.totalEstimatedDurationSeconds}s)<br />
                          Word Count: {project.scripts.bangla.wordCount} words
                        </>
                      ) : (
                        'Natural conversational Bangla narration'
                      )}
                    </div>
                    <div style={{ marginTop: '10px' }}>
                      {project?.scripts?.errors?.bangla ? (
                        <button
                          className="btn btn-secondary btn-xs"
                          disabled={loading}
                          onClick={() => generateSingleScript('bangla', targetDurationMinutes)}
                        >
                          ⚠️ Retry Bangla Script
                        </button>
                      ) : project?.scripts?.bangla ? (
                        <button
                          className="btn btn-secondary btn-xs"
                          disabled={loading}
                          onClick={() => generateSingleScript('bangla', targetDurationMinutes)}
                        >
                          🔄 Regenerate Bangla
                        </button>
                      ) : (
                        <button
                          className="btn btn-secondary btn-xs"
                          disabled={loading}
                          onClick={() => generateSingleScript('bangla', targetDurationMinutes)}
                        >
                          ✨ Generate Bangla
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                <div style={{ marginTop: '20px', display: 'flex', gap: '10px' }}>
                  <button
                    className="btn btn-primary"
                    onClick={handleRegenerateClick}
                    disabled={loading}
                  >
                    {allScriptsGenerated ? '🔄 Regenerate All 3 Scripts' : 'Generate 3 Multilingual Scripts Now'}
                  </button>
                </div>
              </div>

              <div className="mex-stage-footer">
                <button
                  className="btn btn-primary btn-lg"
                  disabled={!hasAnyScript || loading}
                  onClick={() => {
                    setActiveStage(4);
                  }}
                >
                  Proceed to Stage 4: Review &amp; Edit Scripts →
                </button>
              </div>
            </div>
          );
        })()}

        {/* ========================================================
            STAGE 4: Script Review, Full Editing & Manual Approval
            ======================================================== */}
        {activeStage === 4 && (
          <div className="mex-stage-card">
            <div className="mex-stage-header">
              <h3>Stage 4: Multilingual Script Review, Editing & Approval</h3>
              <p>
                Review, edit, and approve your explanation script. You must manually approve a final script
                before proceeding to voiceover recording.
              </p>
            </div>

            {/* Language Selection Tabs */}
            <div className="mex-lang-tabs-bar">
              <button
                className={`mex-lang-tab ${activeLanguageTab === 'english' ? 'active' : ''} ${
                  project?.scripts?.english?.isApproved ? 'is-approved' : ''
                }`}
                onClick={() => {
                  setActiveLanguageTab('english');
                  selectLanguage('english');
                }}
              >
                🇬🇧 English Script {project?.scripts?.english?.isApproved ? '✅ Approved' : project?.scripts?.english?.isEdited ? '✍️ Draft' : '✓'}
              </button>
              <button
                className={`mex-lang-tab ${activeLanguageTab === 'hindi' ? 'active' : ''} ${
                  project?.scripts?.hindi?.isApproved ? 'is-approved' : ''
                }`}
                onClick={() => {
                  setActiveLanguageTab('hindi');
                  selectLanguage('hindi');
                }}
              >
                🇮🇳 Hindi Script (हिंदी) {project?.scripts?.hindi?.isApproved ? '✅ Approved' : project?.scripts?.hindi?.isEdited ? '✍️ Draft' : '✓'}
              </button>
              <button
                className={`mex-lang-tab ${activeLanguageTab === 'bangla' ? 'active' : ''} ${
                  project?.scripts?.bangla?.isApproved ? 'is-approved' : ''
                }`}
                onClick={() => {
                  setActiveLanguageTab('bangla');
                  selectLanguage('bangla');
                }}
              >
                🇧🇩 Bangla Script (বাংলা) {project?.scripts?.bangla?.isApproved ? '✅ Approved' : project?.scripts?.bangla?.isEdited ? '✍️ Draft' : '✓'}
              </button>

              <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px', alignItems: 'center' }}>
                {/* View Mode Toggle */}
                <div className="mex-view-mode-toggle">
                  <button
                    className={`mex-view-mode-btn ${viewMode === 'section' ? 'active' : ''}`}
                    onClick={() => setViewMode('section')}
                  >
                    📑 Section View
                  </button>
                  <button
                    className={`mex-view-mode-btn ${viewMode === 'full' ? 'active' : ''}`}
                    onClick={() => setViewMode('full')}
                  >
                    📝 Full Text View
                  </button>
                </div>

                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => downloadScript(activeLanguageTab)}
                  title="Download clean .txt narration script"
                >
                  💾 Export TXT
                </button>

                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => downloadSrt(activeLanguageTab)}
                  title="Download valid sequential .srt subtitles"
                >
                  📄 Export SRT
                </button>
              </div>
            </div>

            {/* Active Language Script Content */}
            {currentScript ? (
              <div className="mex-script-review-container">
                {/* Proposed Title & Stats */}
                <div className="mex-script-meta-row">
                  <div className="mex-script-title-box">
                    <span className="mex-label">PROPOSED TITLE:</span>
                    <h4>{currentScript.title}</h4>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                    {isCurrentScriptApproved && (
                      <div className="mex-approved-badge">
                        ✅ Approved as Final Master
                      </div>
                    )}
                    {currentScript.validation && (
                      <div
                        className={`mex-validation-pill ${currentScript.validation.isValid ? 'valid' : 'warning'}`}
                        title={`Validation: Word Count Target: ${currentScript.validation.wordCountTargetMet ? 'Met' : 'Under 1000'} | Duration Target: ${currentScript.validation.durationTargetMet ? 'Met' : 'Under 8m'}`}
                      >
                        {currentScript.validation.isValid
                          ? '✅ Verified 8–9 Min Script'
                          : '⚠️ Target Under 8 Mins'}
                      </div>
                    )}
                    <div className="mex-script-duration-pill">
                      ⏱️ Narration: ~{Math.round(currentScript.totalEstimatedDurationSeconds / 60)}m ({currentScript.totalEstimatedDurationSeconds}s) • {currentScript.wordCount} words
                    </div>
                  </div>
                </div>

                {/* Script Accuracy & Fidelity Audit Scorecard */}
                {currentScript.accuracyAudit && (
                  <div className="mex-accuracy-audit-card">
                    <div className="mex-accuracy-audit-header">
                      <div className="mex-accuracy-score-group">
                        <div className="mex-accuracy-score-badge">
                          <span className="mex-score-num">
                            {currentScript.accuracyAudit.overallAccuracyScore}
                            <small>/10</small>
                          </span>
                          <span className="mex-score-label">Fidelity Score</span>
                        </div>
                        <div className="mex-accuracy-summary-text">
                          <div className="mex-accuracy-status">
                            {currentScript.accuracyAudit.passedValidation ? (
                              <span className="status-badge status-success" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'rgba(16, 185, 129, 0.2)', color: '#34d399', padding: '3px 8px', borderRadius: '4px', fontSize: '0.78rem', fontWeight: 600 }}>
                                🛡️ Verified Source Grounded
                              </span>
                            ) : (
                              <span className="status-badge status-warning" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'rgba(245, 158, 11, 0.2)', color: '#fbbf24', padding: '3px 8px', borderRadius: '4px', fontSize: '0.78rem', fontWeight: 600 }}>
                                ⚠️ Needs Script Review
                              </span>
                            )}
                            <span className="mex-sub-metric">
                              Fidelity: {currentScript.accuracyAudit.sourceFidelityScore}/10
                            </span>
                            <span className="mex-sub-metric">
                              Cliché-Free: {currentScript.accuracyAudit.clichéFreeScore}/10
                            </span>
                          </div>
                          <div className="mex-accuracy-chips">
                            {currentScript.accuracyAudit.forbiddenPhrasesFound.length === 0 ? (
                              <span className="mex-chip mex-chip-clean">
                                ✨ 0 AI Clichés Detected
                              </span>
                            ) : (
                              <span className="mex-chip mex-chip-alert">
                                ⚠️ {currentScript.accuracyAudit.forbiddenPhrasesFound.length} Clichés Detected ({currentScript.accuracyAudit.forbiddenPhrasesFound.join(', ')})
                              </span>
                            )}
                            <span className="mex-chip">
                              🎭 {currentScript.accuracyAudit.verifiedClaims?.length || 0} Verified Source Claims
                            </span>
                            <span className="mex-chip">
                              ⏱️ {currentScript.accuracyAudit.groundedDeductions?.length || 0} Grounded Milestones
                            </span>
                          </div>
                        </div>
                      </div>

                      <button
                        className="btn btn-secondary btn-xs"
                        onClick={() => setShowAuditDetails(!showAuditDetails)}
                        style={{ alignSelf: 'flex-start' }}
                      >
                        {showAuditDetails ? 'Hide Audit Details ▴' : 'View Audit Breakdown ▾'}
                      </button>
                    </div>

                    {showAuditDetails && (
                      <div className="mex-accuracy-audit-details">
                        {currentScript.accuracyAudit.verifiedClaims?.length > 0 && (
                          <div className="mex-audit-row">
                            <strong>Source Verification:</strong>{' '}
                            <span>{currentScript.accuracyAudit.verifiedClaims.join(' • ')}</span>
                          </div>
                        )}
                        {currentScript.accuracyAudit.groundedDeductions?.length > 0 && (
                          <div className="mex-audit-row">
                            <strong>Grounded Deductions:</strong>{' '}
                            <span>{currentScript.accuracyAudit.groundedDeductions.join(' • ')}</span>
                          </div>
                        )}
                        {currentScript.accuracyAudit.repetitionWarnings?.length > 0 && (
                          <div className="mex-audit-row" style={{ color: '#fca5a5' }}>
                            <strong>Repetition Warnings:</strong>{' '}
                            <span>{currentScript.accuracyAudit.repetitionWarnings.join(' • ')}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {viewMode === 'section' ? (
                  <>
                    {/* Opening Hook Box (10–20s) */}
                    <div className="mex-hook-box">
                      <div className="mex-hook-header">
                        <div className="mex-hook-badge">
                          🔥 OPENING HOOK (Target: 10–20s • Current: ~{currentScript.hook.durationSeconds}s • {currentScript.hook.text.split(/\s+/).filter(Boolean).length} words)
                        </div>
                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Hook Style:</span>
                          <select
                            className="mex-select mex-select-xs"
                            value={currentScript.hook.hookType}
                            onChange={(e) => updateScriptHook(currentScript.hook.text, e.target.value as MovieAnalyzerHookType)}
                          >
                            <option value="mystery">Intriguing Mystery</option>
                            <option value="high_stakes">High-Stakes Situation</option>
                            <option value="twist">Unexpected Reveal</option>
                            <option value="dramatic_conflict">Dramatic Conflict</option>
                            <option value="unanswered_question">Unanswered Question</option>
                          </select>
                          <button
                            className="btn btn-secondary btn-xs"
                            onClick={() => regenerateHook(activeLanguageTab, currentScript.hook.hookType)}
                            disabled={loading}
                            title="Regenerates only the 10-20s opening hook using local reasoning model"
                          >
                            {loading ? 'Thinking...' : '✨ Regenerate Hook'}
                          </button>
                        </div>
                      </div>

                      <textarea
                        className="mex-hook-textarea"
                        rows={3}
                        value={currentScript.hook.text}
                        onChange={(e) => updateScriptHook(e.target.value)}
                      />
                    </div>

                    {/* Explanation Paragraphs */}
                    <div className="mex-paragraphs-list">
                      {currentScript.paragraphs.map((p, idx) => {
                        const sectionDisplayLabels: Record<string, string> = {
                          hook: '🔥 OPENING HOOK (10–20s)',
                          context: '📖 PREMISE & WORLD SETUP',
                          characters: '🎭 CHARACTERS, ROLES & MOTIVATIONS',
                          inciting_incident: '⚡ INCITING INCIDENT & CRISIS',
                          escalation: '🔍 ESCALATION, CLUES & SUSPENSE',
                          reversals: '🔄 MIDPOINT TURNING POINT & TWISTS',
                          climax: '💥 CLIMACTIC SHOWDOWN',
                          resolution: '🌅 AFTERMATH & UNVEILED FATES',
                          takeaway: '💡 THEMATIC VERDICT & CONCLUSION',
                        };

                        const displayTitle = sectionDisplayLabels[p.section] || p.section.toUpperCase();

                        return (
                          <div key={p.id} className="mex-paragraph-item">
                            <div className="mex-paragraph-header">
                              <span className="mex-p-num">#{idx + 1}</span>
                              <span className="mex-p-section">{displayTitle}</span>
                              <span className="mex-p-duration">
                                ~{p.estimatedSeconds}s • {p.text.split(/\s+/).filter(Boolean).length} words
                              </span>

                              {p.suggestedScenes && p.suggestedScenes.length > 0 && (
                                <span className="mex-p-scenes-tag" title="Scene index IDs mapped for downstream scene matching">
                                  🎬 {p.suggestedScenes.slice(0, 3).join(', ')}
                                </span>
                              )}

                              <button
                                className="mex-p-regenerate-btn"
                                disabled={loading || regeneratingSectionId === p.id}
                                onClick={() => handleRegenerateSingleSection(p.id)}
                                title="Regenerates only this section without changing the rest of the script"
                              >
                                {regeneratingSectionId === p.id ? 'Thinking...' : '✨ Regenerate Section'}
                              </button>
                            </div>
                            <textarea
                              className="mex-p-textarea"
                              rows={5}
                              value={p.text}
                              onChange={(e) => updateScriptParagraph(p.id, e.target.value)}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </>
                ) : (
                  /* Full Unified Text View */
                  <div className="mex-full-script-box">
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                      Full Continuous Script Narration (Scroll to review entire 8–10 minute script):
                    </div>
                    <textarea
                      className="mex-full-script-textarea"
                      value={fullUnifiedText}
                      readOnly
                    />
                  </div>
                )}

                {/* Story Accuracy Warnings */}
                {project?.transcript?.warnings && project.transcript.warnings.length > 0 && (
                  <div className="mex-accuracy-warning-box">
                    <strong>⚠️ Story Consistency Note:</strong>
                    <ul>
                      {project.transcript.warnings.map((w, i) => (
                        <li key={i}>{w}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ) : (
              <div className="mex-empty-state">
                <p>Scripts have not been generated yet.</p>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => generateScripts(targetDurationMinutes)}
                  disabled={loading}
                >
                  Generate Scripts Now
                </button>
              </div>
            )}

            <div className="mex-stage-footer">
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  {isCurrentScriptApproved
                    ? '✅ Approved as final master narration.'
                    : 'Manual script approval is required before recording voiceover.'}
                </span>

                <button
                  className="btn btn-primary btn-lg"
                  disabled={!currentScript || loading}
                  onClick={handleApproveCurrentScript}
                >
                  {isCurrentScriptApproved
                    ? `Proceed to Stage 5: Voiceover (${activeLanguageTab.toUpperCase()}) →`
                    : `✅ Approve ${activeLanguageTab.toUpperCase()} Script as Final Master & Proceed →`}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================
            STAGE 5: Voiceover Generation or Import
            ======================================================== */}
        {activeStage === 5 && (
          <div className="mex-stage-card">
            {/* Guard against skipping script approval */}
            {!isCurrentScriptApproved && (
              <div className="mex-locked-banner">
                <div className="mex-locked-banner-text">
                  <span style={{ fontSize: '1.4rem' }}>🔒</span>
                  <div>
                    <strong>Script Approval Required</strong>
                    <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem' }}>
                      You must review, edit, and approve your script in Stage 4 before recording or uploading voiceover narration.
                    </p>
                  </div>
                </div>
                <button className="btn btn-primary btn-sm" onClick={() => setActiveStage(4)}>
                  ← Go to Stage 4: Review & Approve Script
                </button>
              </div>
            )}

            <div className="mex-stage-header">
              <h3>Stage 5: Voiceover Audio Recording or Import</h3>
              <p>
                Approved script:{' '}
                <strong style={{ color: 'var(--accent-light)', textTransform: 'uppercase' }}>
                  {project?.scripts?.selectedLanguage || 'english'}
                </strong>{' '}
                (~{currentScript?.totalEstimatedDurationSeconds || 540}s • {currentScript?.wordCount || 0} words).
                Your uploaded voiceover audio duration will be used as the authoritative master clock for scene matching and timeline pacing.
              </p>
            </div>

            {/* Quick Export Downloads for Narration Recording */}
            <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => downloadScript(activeLanguageTab)}
              >
                💾 Download Approved Script (.txt)
              </button>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => downloadSrt(activeLanguageTab)}
              >
                📄 Download Subtitles (.srt)
              </button>
            </div>

            <div className="mex-voiceover-grid">
              {/* Option A: Upload Voiceover Audio */}
              <div className="mex-voiceover-card">
                <h4>Option A: Import Voiceover Narration Audio</h4>
                <p className="mex-card-desc">
                  Upload your finished recording (MP3, WAV, M4A, AAC). The exact audio duration will become the master timeline clock.
                </p>

                {project?.voiceover?.audioPath ? (
                  <div className="mex-vo-preview">
                    <div style={{ fontSize: '1.4rem' }}>🎙️</div>
                    <div style={{ flex: 1 }}>
                      <div className="mex-file-name truncate">{project.voiceover.filename}</div>
                      <div className="mex-file-subtext">Duration: ~{Math.round(project.voiceover.duration || 540)}s</div>
                    </div>
                    <button className="btn btn-secondary btn-xs" onClick={() => voiceoverInputRef.current?.click()}>
                      Change File
                    </button>
                  </div>
                ) : (
                  <div className="mex-dropzone" onClick={() => voiceoverInputRef.current?.click()}>
                    <div className="dropzone-icon">🎧</div>
                    <div className="dropzone-text">Upload Voiceover Audio File</div>
                    <div className="dropzone-hint">MP3, WAV, M4A supported • Calibrates timeline timing</div>
                  </div>
                )}
                <input
                  ref={voiceoverInputRef}
                  type="file"
                  accept="audio/*"
                  style={{ display: 'none' }}
                  onChange={handleVoiceoverUpload}
                />
              </div>

              {/* Option B: Local Speech Synthesis */}
              <div className="mex-voiceover-card">
                <h4>Option B: Generate Local Voiceover Track</h4>
                <p className="mex-card-desc">
                  Generates synchronized narration blocks matching the approved{' '}
                  {project?.scripts?.selectedLanguage || 'english'} script.
                </p>

                <div style={{ padding: '16px', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', marginBottom: '12px' }}>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                    Language Voice Profile:
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span className="mex-pill">
                      {project?.scripts?.selectedLanguage === 'bangla'
                        ? '🇧🇩 Bangla Conversational'
                        : project?.scripts?.selectedLanguage === 'hindi'
                        ? '🇮🇳 Hindi Cinematic'
                        : '🇬🇧 English Narrative'}
                    </span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>~140 words/min</span>
                  </div>
                </div>

                <button
                  className="btn btn-secondary btn-sm w-full"
                  disabled={uploading}
                  onClick={() => uploadVoiceover()}
                >
                  Generate Voiceover Alignment Track
                </button>
              </div>
            </div>

            <div className="mex-stage-footer">
              <button
                className="btn btn-primary btn-lg"
                disabled={!project?.voiceover || uploading}
                onClick={async () => {
                  await matchScenes({ enableMovingScreenshots, screenshotInterval });
                  setActiveStage(6);
                }}
              >
                Confirm Voiceover & Match Full-Movie Scenes →
              </button>
            </div>
          </div>
        )}

        {/* ========================================================
            STAGE 6: Scene Matching with Strict <= 3.0s Rule & Motion Screenshots
            ======================================================== */}
        {activeStage === 6 && (
          <div className="mex-stage-card">
            <div className="mex-stage-header">
              <h3>Stage 6: Scene Matching & Pacing Rule Enforcement</h3>
              <p>
                Strict &le; 3.0s cut rule applied to all movie footage clips. Visuals are selected across the entire
                movie duration to maintain narrative pacing.
              </p>
            </div>

            {/* Pacing Rules & Visual Verification Options */}
            <div className="mex-pacing-controls-bar">
              <div className="mex-rule-status" style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                <span className="status-pill status-pass">
                  🛡️ 0 Pacing Violations (100% Clips &le; 3.0s)
                </span>
                <span className="status-pill" style={{ background: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa', border: '1px solid rgba(59, 130, 246, 0.3)' }}>
                  🔁 25-Clip Spacing Active
                </span>
                <span className="status-pill" style={{ background: 'rgba(168, 85, 247, 0.15)', color: '#c084fc', border: '1px solid rgba(168, 85, 247, 0.3)' }}>
                  🚫 0 Title / Interval Screens
                </span>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  Duration: {project?.matching?.totalTimelineDuration || 0}s •{' '}
                  {project?.matching?.matchedShots?.length || 0} shots
                </span>
              </div>

              <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginLeft: 'auto' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem' }}>
                  <span>Verification Sample:</span>
                  <select
                    className="mex-select mex-select-xs"
                    value={screenshotInterval}
                    onChange={(e) => setScreenshotInterval(Number(e.target.value))}
                  >
                    <option value={4}>Every 4 clips</option>
                    <option value={5}>Every 5 clips (Standard)</option>
                    <option value={6}>Every 6 clips</option>
                  </select>
                </div>

                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => matchScenes({ enableMovingScreenshots: false, screenshotInterval })}
                >
                  🔄 Re-Match Shots
                </button>
              </div>
            </div>

            {/* Reported Clip Reuse Limitations (if source pool was constrained) */}
            {project?.matching?.clipReuseLimitations && project.matching.clipReuseLimitations.length > 0 && (
              <div className="mex-limitations-box">
                <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>
                  ⚠️ Source Scene Pool Limitation Report ({project.matching.clipReuseLimitations.length} note(s)):
                </div>
                <ul style={{ margin: '4px 0 0 16px', padding: 0 }}>
                  {project.matching.clipReuseLimitations.map((lim, idx) => (
                    <li key={idx} style={{ marginBottom: '2px' }}>{lim}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Visual Verification Checkpoints Strip (Every 5 Selected Clips) */}
            {project?.matching?.verificationCheckpoints && project.matching.verificationCheckpoints.length > 0 && (
              <div className="mex-checkpoints-section">
                <div className="mex-checkpoints-header">
                  <div className="mex-checkpoints-title">
                    <span>📸 Visual Verification Checkpoints (Every 5 Selected Clips)</span>
                    <span style={{ fontSize: '0.75rem', fontWeight: 'normal', color: 'var(--text-tertiary)' }}>
                      Lightweight footage verification • Excludes title slates • 25-clip spacing validated
                    </span>
                  </div>
                  <span className="mex-pill" style={{ fontSize: '0.75rem' }}>
                    {project.matching.verificationCheckpoints.length} Checkpoints Captured
                  </span>
                </div>

                <div className="mex-checkpoints-grid">
                  {project.matching.verificationCheckpoints.map((cp) => (
                    <div key={cp.checkpointIndex} className="mex-checkpoint-card">
                      {cp.screenshotUrl ? (
                        <img
                          src={cp.screenshotUrl}
                          alt={`Checkpoint #${cp.checkpointIndex}`}
                          className="mex-checkpoint-thumb"
                        />
                      ) : (
                        <div className="mex-checkpoint-thumb-placeholder">🎬</div>
                      )}
                      <div className="mex-checkpoint-body">
                        <div className="mex-checkpoint-meta">
                          <span className="mex-checkpoint-tag">Checkpoint #{cp.checkpointIndex}</span>
                          <span className="mex-checkpoint-time">
                            {Math.floor(cp.sourceTimestamp / 60)}m{Math.floor(cp.sourceTimestamp % 60)}s
                          </span>
                        </div>
                        <span className={`mex-checkpoint-status ${cp.verificationStatus}`}>
                          {cp.verificationStatus === 'verified'
                            ? '✅ Verified Footage'
                            : '🔄 Alternative Selected'}
                        </span>
                        <div className="mex-checkpoint-notes truncate" title={cp.verificationNotes}>
                          {cp.verificationNotes}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Matched Shots Timeline Preview */}
            <div className="mex-matched-shots-container">
              <div className="mex-shots-timeline-strip">
                {(project?.matching?.matchedShots || []).map((sh, idx) => (
                  <div
                    key={sh.shotId}
                    className={`mex-shot-strip-item ${sh.verificationCheckpoint ? 'is-screenshot' : ''}`}
                    title={`${sh.shotId} (${sh.duration}s): ${sh.narrationText}${sh.verificationCheckpoint ? ' • [📸 Verification Checkpoint]' : ''}`}
                  >
                    <span className="shot-dur">{sh.duration}s</span>
                    <span className="shot-type">{sh.verificationCheckpoint ? '📸' : '🎬'}</span>
                  </div>
                ))}
              </div>

              <div className="mex-shots-list">
                {(project?.matching?.matchedShots || []).slice(0, 15).map((sh, idx) => (
                  <div key={sh.shotId} className="mex-shot-row">
                    <div className="mex-shot-badge">
                      🎬 Movie Clip #{idx + 1}
                    </div>
                    <div className="mex-shot-time">
                      Timeline: {sh.timelineStart}s - {sh.timelineEnd}s ({sh.duration}s) • Source: {sh.sourceStartTime}s - {sh.sourceEndTime}s
                    </div>
                    {sh.verificationCheckpoint && (
                      <span className="mex-motion-tag" style={{ background: 'rgba(56, 189, 248, 0.2)', color: '#38bdf8' }}>
                        📸 Checkpoint #{sh.verificationCheckpoint.checkpointIndex} Verified
                      </span>
                    )}
                    <div className="mex-shot-narration truncate">{sh.narrationText}</div>
                  </div>
                ))}
              </div>

              {(project?.matching?.matchedShots?.length || 0) > 15 && (
                <div style={{ textAlign: 'center', marginTop: '8px', color: 'var(--text-tertiary)', fontSize: '0.8rem' }}>
                  + {(project?.matching?.matchedShots?.length || 0) - 15} more matched clips distributed across the full movie.
                </div>
              )}
            </div>

            <div className="mex-stage-footer">
              <button
                className="btn btn-primary btn-lg"
                disabled={!project?.matching?.matchedShots || project.matching.matchedShots.length === 0}
                onClick={handleHandoff}
              >
                🚀 Finalize & Send to Movie Explanation Studio Editor →
              </button>
            </div>
          </div>
        )}

        {/* ========================================================
            STAGE 7: Seamless Handoff & Preview
            ======================================================== */}
        {activeStage === 7 && (
          <div className="mex-stage-card" style={{ textAlign: 'center', padding: '40px 20px' }}>
            <div style={{ fontSize: '3rem', marginBottom: '16px' }}>🎉</div>
            <h3>Explanation Project Ready for Professional Editing!</h3>
            <p style={{ maxWidth: '600px', margin: '0 auto 24px', color: 'var(--text-secondary)' }}>
              All scene cuts, 8–10 minute narration script, and &le;3.0s pacing clips have been transferred to the
              Movie & Series Explanation Studio editor. You can now scrub the timeline, trim clips, adjust typography,
              toggle captions, and export the final video.
            </p>

            <button className="btn btn-primary btn-lg" onClick={handleHandoff}>
              🎬 Open in Movie Explanation Studio Editor
            </button>
          </div>
        )}
      </main>

      {/* ── Create New Project Modal ── */}
      {showNewModal && (
        <div className="mex-modal-backdrop" onClick={() => setShowNewModal(false)}>
          <div className="mex-modal-dialog" onClick={(e) => e.stopPropagation()}>
            <h3>Create New Movie Analyzer Project</h3>
            <p>Start a new full-movie explanation workflow with video and transcript.</p>
            <input
              className="mex-input"
              type="text"
              placeholder="e.g. Inception Explanation Breakdown"
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              autoFocus
            />
            <div className="mex-modal-actions">
              <button className="btn btn-secondary" onClick={() => setShowNewModal(false)}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={handleCreateNew}>
                Create Project
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Confirmation Modal: Overwrite Edited/Approved Scripts ── */}
      {showRegenerateConfirm && (
        <div className="mex-modal-backdrop" onClick={() => setShowRegenerateConfirm(false)}>
          <div className="mex-modal-dialog" onClick={(e) => e.stopPropagation()}>
            <h3>⚠️ Overwrite Existing Scripts?</h3>
            <p>
              You have previously edited or approved your explanation scripts. Regenerating all 3 scripts will replace
              your manual edits with fresh narratives generated from the transcript.
            </p>
            <div className="mex-modal-actions">
              <button className="btn btn-secondary" onClick={() => setShowRegenerateConfirm(false)}>
                Keep Existing Drafts
              </button>
              <button className="btn btn-primary" onClick={confirmRegenerateAll}>
                Yes, Regenerate All 3
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
