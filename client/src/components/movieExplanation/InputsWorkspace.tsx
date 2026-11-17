// ============================================================
// Movie Explanation — Inputs Workspace Component
// Handles uploading of 45-min Episode, Script, and Voiceover
// Shows validation, duration comparison, and mismatch warnings.
// ============================================================

import React, { useRef } from 'react';
import { useMovieExplanationStore } from '../../stores/movieExplanationStore.js';
import { Button } from '../common/Button.js';
import { Spinner } from '../common/Spinner.js';

export const InputsWorkspace: React.FC = () => {
  const {
    project,
    isUploadingVideo,
    isUploadingAudio,
    isUploadingScript,
    isUploadingOriginalTranscript,
    isIndexing,
    isAligning,
    isGenerating,
    error,
    setError,
    setActiveTab,
    renderDetail,
    renderStage,
    renderProgress,
    uploadVideo,
    uploadVoiceover,
    uploadScript,
    uploadOriginalTranscript,
    startIndexing,
    startAligning,
    generateTimeline,
    runFullProductionPipeline,
    createProject,
    deleteProject,
  } = useMovieExplanationStore();

  const videoInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const scriptInputRef = useRef<HTMLInputElement>(null);
  const originalTranscriptInputRef = useRef<HTMLInputElement>(null);

  const originalVideo = project?.originalVideo;
  const voiceover = project?.voiceoverAudio;
  const script = project?.script;
  const episodeIndex = project?.episodeIndex;

  const hasVideo = !!originalVideo;
  const hasVoiceover = !!voiceover;
  const hasScript = !!script && (script.segments?.length > 0 || !!script.rawText);
  const isIndexed = !!episodeIndex &&
    Array.isArray(episodeIndex.scenes) &&
    episodeIndex.scenes.length > 0 &&
    (!originalVideo || !episodeIndex.originalVideoPath || episodeIndex.originalVideoPath === originalVideo.filePath);
  const isAligned = !!script?.isAlignedToVoiceover;
  const canGenerate = isIndexed && isAligned;
  const hasTimeline = !!project?.timeline && Array.isArray(project.timeline.shots) && project.timeline.shots.length > 0;

  const handleVideoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadVideo(file);
  };

  const handleAudioUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadVoiceover(file);
  };

  const handleScriptUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadScript(file);
  };

  const handleOriginalTranscriptUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadOriginalTranscript(file);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* ── Active Project Header Banner ── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'var(--bg-secondary, #13151f)',
          border: '1px solid var(--border-subtle, rgba(255,255,255,0.08))',
          borderRadius: '10px',
          padding: '12px 20px',
          maxWidth: '1300px',
          width: '100%',
          margin: '0 auto',
          gap: '12px',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '8px',
              background: 'rgba(99, 102, 241, 0.15)',
              border: '1px solid rgba(99, 102, 241, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.2rem',
            }}
          >
            🎬
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: '0.96rem', color: '#fff' }}>
              Project: {project?.projectName || project?.name || 'Current Project'}
            </div>
            <div style={{ fontSize: '0.78rem', color: '#94a3b8' }}>
              Status:{' '}
              <span
                style={{
                  color: project?.status === 'completed' ? '#34d399' : '#a5b4fc',
                  fontWeight: 600,
                  textTransform: 'capitalize',
                }}
              >
                {project?.status?.replace(/_/g, ' ') || 'Setup & Inputs'}
              </span>
              {project?.status === 'completed' && ' • Master video ready for download'}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => createProject()}
            title="Create and switch to a fresh empty project"
          >
            + Start New Project
          </Button>

          {project && (
            <Button
              variant="danger"
              size="sm"
              onClick={() => {
                if (
                  window.confirm(
                    `Permanently delete project "${
                      project.projectName || project.name || project.projectId
                    }" and remove all source files from disk?`
                  )
                ) {
                  deleteProject(project.projectId);
                }
              }}
              title="Permanently delete this project and wipe source video from disk"
            >
              🗑️ Delete Project
            </Button>
          )}
        </div>
      </div>

      {/* ── 3 Column Inputs Grid ── */}
      <div className="mex-inputs-grid">
        {/* Input A: Original Movie / Episode Video */}
        <div className="mex-card">
          <div className="mex-card-header">
            <div className="mex-card-title">
              <span>🎬</span>
              <span>Input A: Original Episode / Movie</span>
            </div>
            {hasVideo && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => videoInputRef.current?.click()}
              >
                Replace Video
              </Button>
            )}
          </div>

          {!hasVideo ? (
            <div
              className="mex-dropzone"
              onClick={() => videoInputRef.current?.click()}
            >
              <div style={{ fontSize: '2.5rem', marginBottom: '8px' }}>🎥</div>
              <div style={{ fontWeight: 600, marginBottom: '4px' }}>
                Upload Full-Length Episode / Movie
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-tertiary, #94a3b8)' }}>
                Supports 45–90+ min video (MP4, MKV, MOV, WEBM)
              </div>
              {isUploadingVideo && <Spinner size="sm" label="Reading metadata..." />}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div className="mex-meta-box">
                <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '4px' }}>
                  {originalVideo.originalFilename}
                </div>
                <div>Duration: <strong>{Math.floor(originalVideo.duration / 60)}m {Math.floor(originalVideo.duration % 60)}s</strong></div>
                <div>Resolution: <strong>{originalVideo.width}x{originalVideo.height} @ {originalVideo.fps} fps</strong></div>
                <div>Codec: <strong>{originalVideo.codec?.toUpperCase()}</strong> • Audio: <strong>{originalVideo.audioCodec?.toUpperCase()}</strong></div>
                <div>Size: <strong>{(originalVideo.fileSize / (1024 * 1024)).toFixed(1)} MB</strong></div>
              </div>

              {!isIndexed ? (
                <Button
                  variant="primary"
                  loading={isIndexing}
                  disabled={isIndexing}
                  onClick={startIndexing}
                >
                  {isIndexing
                    ? 'Analyzing Episode Intelligence & Building Story Map...'
                    : 'Analyze Episode Intelligence & Build Story Map'}
                </Button>
              ) : (
                <div style={{ color: '#10b981', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span>✓</span>
                  <span>Episode Intelligence Indexed ({episodeIndex.scenes.length} scenes, Story Map active)</span>
                </div>
              )}

              {/* Optional Original Movie Dialogue Subtitles */}
              <div style={{ marginTop: '8px', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#94a3b8' }}>
                    📝 Original Movie Subtitles / Transcript:
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => originalTranscriptInputRef.current?.click()}
                  >
                    {project?.originalTranscript ? 'Replace Dialogue' : '+ Add SRT/VTT/TXT'}
                  </Button>
                </div>
                {project?.originalTranscript ? (
                  <div style={{ fontSize: '0.78rem', color: '#38bdf8' }}>
                    ✓ Loaded: {project.originalTranscript.originalFilename || project.originalTranscript.filename} ({project.originalTranscript.dialogueCount || project.originalTranscript.segments?.length} dialogue lines)
                  </div>
                ) : (
                  <div style={{ fontSize: '0.74rem', color: '#64748b' }}>
                    Optional: Upload SRT/VTT/TurboScribe TXT to anchor scenes with original movie dialogue.
                  </div>
                )}
                {isUploadingOriginalTranscript && <Spinner size="sm" label="Parsing dialogue lines..." />}
              </div>
            </div>
          )}

          <input
            ref={videoInputRef}
            type="file"
            accept="video/*"
            style={{ display: 'none' }}
            onChange={handleVideoUpload}
          />
          <input
            ref={originalTranscriptInputRef}
            type="file"
            accept=".txt,.srt,.vtt,text/plain"
            style={{ display: 'none' }}
            onChange={handleOriginalTranscriptUpload}
          />
        </div>

        {/* Input B: Explanation Narration Script */}
        <div className="mex-card">
          <div className="mex-card-header">
            <div className="mex-card-title">
              <span>📜</span>
              <span>Input B: Explanation Narration Script (Voiceover Text)</span>
            </div>
            {hasScript && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => scriptInputRef.current?.click()}
              >
                Replace Script
              </Button>
            )}
          </div>

          {!hasScript ? (
            <div
              className="mex-dropzone"
              onClick={() => scriptInputRef.current?.click()}
            >
              <div style={{ fontSize: '2.5rem', marginBottom: '8px' }}>📄</div>
              <div style={{ fontWeight: 600, marginBottom: '4px' }}>
                Upload Voiceover Narration Script (Bangla / English)
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-tertiary, #94a3b8)' }}>
                The script read by the voiceover narrator (TXT or plain text)
              </div>
              {isUploadingScript && <Spinner size="sm" label="Parsing script..." />}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div className="mex-meta-box">
                <div style={{ fontWeight: 600, fontSize: '0.88rem', marginBottom: '4px' }}>
                  Authoritative Narrative Script ({script.format.toUpperCase()})
                </div>
                <div>Segments: <strong>{script.segments.length} narration thoughts</strong></div>
                <div>Alignment Confidence: <strong>{Math.round(script.alignmentConfidence * 100)}%</strong></div>
                <div style={{ maxHeight: '100px', overflowY: 'auto', background: 'rgba(0,0,0,0.3)', padding: '6px', borderRadius: '4px', marginTop: '6px', fontSize: '0.76rem', color: '#cbd5e1' }}>
                  {script.rawText.slice(0, 300)}...
                </div>
              </div>

              {script.mismatchWarning && (
                <div className="mex-warning-box">
                  <span>⚠</span>
                  <span>{script.mismatchWarning}</span>
                </div>
              )}

              {hasVoiceover && !isAligned && (
                <Button
                  variant="primary"
                  loading={isAligning}
                  onClick={startAligning}
                >
                  Align Script to Voiceover Timing
                </Button>
              )}
            </div>
          )}

          <input
            ref={scriptInputRef}
            type="file"
            accept=".txt,.srt,.vtt,text/plain"
            style={{ display: 'none' }}
            onChange={handleScriptUpload}
          />
        </div>

        {/* Input C: Explanation Voiceover Audio */}
        <div className="mex-card">
          <div className="mex-card-header">
            <div className="mex-card-title">
              <span>🎙️</span>
              <span>Input C: Master Voiceover Audio</span>
            </div>
            {hasVoiceover && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => audioInputRef.current?.click()}
              >
                Replace Audio
              </Button>
            )}
          </div>

          {!hasVoiceover ? (
            <div
              className="mex-dropzone"
              onClick={() => audioInputRef.current?.click()}
            >
              <div style={{ fontSize: '2.5rem', marginBottom: '8px' }}>🎵</div>
              <div style={{ fontWeight: 600, marginBottom: '4px' }}>
                Upload Final Explanation Voiceover
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-tertiary, #94a3b8)' }}>
                Master timing track (WAV, MP3, M4A, AAC)
              </div>
              {isUploadingAudio && <Spinner size="sm" label="Reading audio..." />}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div className="mex-meta-box">
                <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '4px' }}>
                  {voiceover.originalFilename}
                </div>
                <div>Master Duration: <strong>{Math.floor(voiceover.duration / 60)}m {Math.floor(voiceover.duration % 60)}s</strong></div>
                <div>Format: <strong>{voiceover.format.toUpperCase()}</strong></div>
              </div>

              <div style={{ color: '#10b981', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>✓</span>
                <span>Voiceover is authoritative master timeline clock</span>
              </div>
            </div>
          )}

          <input
            ref={audioInputRef}
            type="file"
            accept="audio/*"
            style={{ display: 'none' }}
            onChange={handleAudioUpload}
          />
        </div>
      </div>

      {/* ── Error Notification Banner ── */}
      {error && (
        <div
          style={{
            maxWidth: '1300px',
            width: '100%',
            margin: '0 auto',
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.35)',
            borderRadius: '10px',
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
              <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>Action Encountered an Issue</div>
              <div style={{ fontSize: '0.8rem', color: '#fecaca' }}>{error}</div>
            </div>
          </div>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setError(null)}
            style={{ color: '#f87171' }}
          >
            ✕ Dismiss
          </button>
        </div>
      )}

      {/* ── Active Generation Progress Box ── */}
      {isGenerating && (
        <div
          style={{
            maxWidth: '1300px',
            width: '100%',
            margin: '0 auto',
            background: 'rgba(99, 102, 241, 0.1)',
            border: '1px solid rgba(99, 102, 241, 0.35)',
            borderRadius: '10px',
            padding: '14px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Spinner size="md" />
            <div>
              <div style={{ fontWeight: 700, fontSize: '0.92rem', color: '#fff' }}>
                Synthesizing Story-Aware AI Explanation Timeline...
              </div>
              <div style={{ fontSize: '0.78rem', color: '#94a3b8' }}>
                Matching 101 scenes to narrative thoughts with strict &lt;= 3.0s pacing, copyright transforms, and audio bed.
              </div>
            </div>
          </div>
          <span style={{ fontWeight: 800, color: '#c084fc', fontSize: '1.1rem' }}>
            {renderProgress || 25}%
          </span>
        </div>
      )}

      {/* ── Orchestrator Action Bar ── */}
      <div style={{ textAlign: 'center', paddingTop: '16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap', justifyContent: 'center' }}>
          {hasVideo && hasVoiceover && (
            <Button
              variant="primary"
              size="lg"
              disabled={isGenerating}
              loading={isGenerating}
              onClick={() => runFullProductionPipeline({ autoRender: false })}
              style={{
                padding: '16px 36px',
                fontSize: '1rem',
                fontWeight: 700,
                background: 'linear-gradient(135deg, #8b5cf6 0%, #3b82f6 100%)',
                border: 'none',
              }}
              title="Automatically index movie, align voiceover, run AI Director, and evaluate broadcast QC in 1 click"
            >
              🎬 1-Click Master Production Studio
            </Button>
          )}

          {hasTimeline && (
            <Button
              variant="secondary"
              size="lg"
              onClick={() => setActiveTab('timeline')}
              style={{ padding: '16px 36px', fontSize: '1rem', fontWeight: 700 }}
              title="Open the generated timeline in the CapCut-style multi-track editor"
            >
              🎞️ Open AI Director Timeline (Rev {project?.timelineRevision || 1}) →
            </Button>
          )}

          <Button
            variant="primary"
            size="lg"
            disabled={!canGenerate || isGenerating}
            loading={isGenerating}
            onClick={generateTimeline}
            style={{ padding: '16px 48px', fontSize: '1.05rem', fontWeight: 700 }}
          >
            {hasTimeline
              ? '🔄 Re-Generate Story-Aware AI Timeline'
              : '✨ Generate Story-Aware AI Explanation Timeline'}
          </Button>
        </div>

        {!canGenerate && (
          <div
            style={{
              marginTop: '4px',
              fontSize: '0.82rem',
              color: 'var(--text-tertiary, #94a3b8)',
              background: 'rgba(0,0,0,0.25)',
              padding: '8px 16px',
              borderRadius: '6px',
              display: 'inline-flex',
              gap: '16px',
              alignItems: 'center',
            }}
          >
            <span>Prerequisites:</span>
            <span style={{ color: hasVideo ? '#34d399' : '#f87171' }}>
              {hasVideo ? '✓ Episode Video' : '✗ Episode Video'}
            </span>
            <span style={{ color: isIndexed ? '#34d399' : '#f87171' }}>
              {isIndexed ? '✓ Intelligence Indexed' : '✗ Indexed'}
            </span>
            <span style={{ color: hasScript ? '#34d399' : '#f87171' }}>
              {hasScript ? '✓ Transcript' : '✗ Transcript'}
            </span>
            <span style={{ color: isAligned ? '#34d399' : '#f87171' }}>
              {isAligned ? '✓ Timing Aligned' : '✗ Timing Aligned'}
            </span>
            <span style={{ color: hasVoiceover ? '#34d399' : '#f87171' }}>
              {hasVoiceover ? '✓ Master Voiceover' : '✗ Voiceover'}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
