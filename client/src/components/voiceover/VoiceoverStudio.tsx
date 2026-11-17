import React, { useEffect, useRef, useState } from 'react';
import { useVoiceoverStore } from '../../stores/voiceoverStore.js';
import { ClipAlternativesModal } from './ClipAlternativesModal.js';
import { QualityReportModal } from './QualityReportModal.js';
import { Button } from '../common/Button.js';
import { Spinner } from '../common/Spinner.js';
import { api } from '../../services/api.js';
import type {
  VoiceoverMatchingMode,
  VoiceoverOutputAspectRatio,
} from '@shared/types.js';

export const VoiceoverStudio: React.FC = () => {
  const {
    project,
    activeProjectId,
    isLoading,
    isAnalyzingVoice,
    isAnalyzingFootage,
    isGeneratingTimeline,
    isRendering,
    renderProgress,
    renderStage,
    renderDetail,
    matchingMode,
    outputAspectRatio,
    captionsEnabled,
    selectedShotId,
    currentTime,
    isPlaying,
    uploadVoiceover,
    uploadFootage,
    startVoiceoverAnalysis,
    startFootageAnalysis,
    generateTimeline,
    regenerateTimeline,
    openAlternativesModal,
    toggleShotLock,
    setMatchingMode,
    setOutputAspectRatio,
    setCaptionsEnabled,
    startRender,
    setCurrentTime,
    setIsPlaying,
    setSelectedShotId,
    setQualityReportModalOpen,
    listenToProgress,
    loadProject,
    createProject,
  } = useVoiceoverStore();

  const [activeTab, setActiveTab] = useState<'setup' | 'timeline'>('setup');
  const audioInputRef = useRef<HTMLInputElement>(null);
  const footageInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  // Initialize or load voiceover project
  useEffect(() => {
    if (!activeProjectId) {
      // Auto-load latest project or create one
      api.getVoiceoverProjects().then((projects) => {
        if (projects.length > 0) {
          loadProject(projects[0].projectId);
        } else {
          createProject();
        }
      }).catch(() => {
        createProject();
      });
    }
  }, [activeProjectId]);

  // Listen to WebSocket progress updates
  useEffect(() => {
    if (activeProjectId) {
      const unsub = listenToProgress(activeProjectId);
      return () => unsub();
    }
  }, [activeProjectId]);

  // Switch to timeline view once generated
  useEffect(() => {
    if (project?.timeline && activeTab === 'setup') {
      setActiveTab('timeline');
    }
  }, [project?.timeline]);

  // Audio / Video playhead sync
  const handleTimeUpdate = (time: number) => {
    setCurrentTime(time);
  };

  const handleAudioUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      uploadVoiceover(file);
    }
  };

  const handleFootageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      uploadFootage(files);
    }
  };

  const hasVoiceover = !!project?.voiceover;
  const hasTranscription = !!project?.transcription;
  const hasFootage = (project?.footageIndex || []).length > 0;
  const isFootageIndexed = hasFootage && project?.footageIndex.some(c => c.analysisStatus === 'analyzed');
  const hasTimeline = !!project?.timeline;

  return (
    <div className="vo-studio-container">
      {/* ── Top Header Control Bar ── */}
      <div className="vo-header-bar">
        <div className="vo-header-left">
          <div className="vo-title-badge">
            <span style={{ fontSize: '1.2rem' }}>🎙️</span>
            <span>Voiceover → AI Visual Director</span>
          </div>

          <div style={{ display: 'flex', gap: '4px' }}>
            <Button
              variant={activeTab === 'setup' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setActiveTab('setup')}
            >
              Assets & Setup
            </Button>
            <Button
              variant={activeTab === 'timeline' ? 'secondary' : 'ghost'}
              size="sm"
              disabled={!hasTimeline}
              onClick={() => setActiveTab('timeline')}
            >
              Timeline & Director
            </Button>
          </div>
        </div>

        <div className="vo-header-controls">
          {/* Aspect Ratio */}
          <div className="vo-select-group">
            <span>Aspect:</span>
            <select
              className="vo-select"
              value={outputAspectRatio}
              onChange={(e) => setOutputAspectRatio(e.target.value as VoiceoverOutputAspectRatio)}
            >
              <option value="16:9">16:9 Landscape (YouTube)</option>
              <option value="9:16">9:16 Vertical (Shorts/Reels)</option>
              <option value="1:1">1:1 Square (Social)</option>
            </select>
          </div>

          {/* Matching Mode */}
          <div className="vo-select-group">
            <span>Director Style:</span>
            <select
              className="vo-select"
              value={matchingMode}
              onChange={(e) => setMatchingMode(e.target.value as VoiceoverMatchingMode)}
            >
              <option value="balanced">Balanced Production</option>
              <option value="maximum_semantic">Strict Semantic</option>
              <option value="cinematic">Cinematic B-Roll</option>
              <option value="fast_pacing">Fast Social Pacing</option>
              <option value="minimal_cuts">Minimal Cuts (Holds)</option>
              <option value="maximum_variety">Maximum Library Variety</option>
            </select>
          </div>

          {/* Subtitles Toggle */}
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={captionsEnabled}
              onChange={(e) => setCaptionsEnabled(e.target.checked)}
            />
            <span>Captions</span>
          </label>

          {/* Quality Gate Pill */}
          {project?.qualityReport && (
            <div
              className={`vo-quality-pill ${project.qualityReport.passed ? 'pass' : 'warn'}`}
              onClick={() => setQualityReportModalOpen(true)}
              title="Click to view 12-point Quality Gate report"
            >
              <span>{project.qualityReport.passed ? '✓' : '⚠'}</span>
              <span>{project.qualityReport.productionReadinessScore}/100 Quality</span>
            </div>
          )}

          {/* Render Action */}
          {hasTimeline && (
            <Button
              variant="primary"
              size="sm"
              loading={isRendering}
              onClick={startRender}
            >
              {isRendering ? 'Rendering Master...' : '⚡ Render Master Video'}
            </Button>
          )}

          {project?.status === 'completed' && project.renderedVideoUrl && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                window.open(api.getVoiceoverDownloadUrl(project.projectId), '_blank');
              }}
            >
              📥 Download Video
            </Button>
          )}
        </div>
      </div>

      {/* ── Active Progress Indicator Banner ── */}
      {(isAnalyzingVoice || isAnalyzingFootage || isGeneratingTimeline || isRendering) && (
        <div style={{ background: 'rgba(99, 102, 241, 0.1)', borderBottom: '1px solid rgba(99, 102, 241, 0.2)', padding: '8px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.82rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Spinner size="sm" />
            <span>{renderDetail || renderStage || 'Processing AI pipeline...'}</span>
          </div>
          <span style={{ fontWeight: 700, color: 'var(--accent-light)' }}>{renderProgress}%</span>
        </div>
      )}

      {/* ── Main Content Workspaces ── */}
      <div className="vo-main-workspace">
        {activeTab === 'setup' ? (
          <div className="vo-setup-grid">
            {/* Left Card: Voiceover Audio Asset */}
            <div className="vo-card">
              <div className="vo-card-header">
                <div className="vo-card-title">
                  <span>🎙️</span>
                  <span>Master Voiceover Audio</span>
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
                  className="vo-upload-dropzone"
                  onClick={() => audioInputRef.current?.click()}
                >
                  <div style={{ fontSize: '2rem', marginBottom: '8px' }}>🎵</div>
                  <div style={{ fontWeight: 600, marginBottom: '4px' }}>
                    Upload Voiceover Audio File
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>
                    Supports MP3, WAV, M4A, AAC, FLAC (5–60+ minutes)
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ padding: '12px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)' }}>
                    <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '4px' }}>
                      {project?.voiceover?.originalFilename}
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                      Duration: {Math.round(project?.voiceover?.duration || 0)}s • Format: {project?.voiceover?.format?.toUpperCase()}
                    </div>
                  </div>

                  {!hasTranscription ? (
                    <Button
                      variant="primary"
                      loading={isAnalyzingVoice}
                      onClick={startVoiceoverAnalysis}
                    >
                      Transcribe & Analyze Narration Intelligence
                    </Button>
                  ) : (
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                        <span>Narration Intelligence Active</span>
                        <span>{project?.transcription?.segments.length} segments analyzed</span>
                      </div>
                      <div style={{ maxHeight: '160px', overflowY: 'auto', background: 'var(--bg-tertiary)', padding: '10px', borderRadius: 'var(--radius-sm)', fontSize: '0.8rem', lineHeight: '1.5' }}>
                        {project?.transcription?.fullText}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <input
                ref={audioInputRef}
                type="file"
                accept="audio/*,video/mp4"
                style={{ display: 'none' }}
                onChange={handleAudioUpload}
              />
            </div>

            {/* Right Card: Video Footage Asset Library */}
            <div className="vo-card">
              <div className="vo-card-header">
                <div className="vo-card-title">
                  <span>🎬</span>
                  <span>Footage Library ({project?.footageIndex?.length || 0} clips)</span>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => footageInputRef.current?.click()}
                >
                  + Add Clips
                </Button>
              </div>

              {!hasFootage ? (
                <div
                  className="vo-upload-dropzone"
                  onClick={() => footageInputRef.current?.click()}
                >
                  <div style={{ fontSize: '2rem', marginBottom: '8px' }}>📂</div>
                  <div style={{ fontWeight: 600, marginBottom: '4px' }}>
                    Upload Source Video Clips
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>
                    Drop 10–200+ clips (MP4, MOV, WEBM, MKV). Raw source quality preserved!
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div className="vo-footage-list">
                    {project?.footageIndex.map((clip) => (
                      <div key={clip.clipId} className="vo-footage-item">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                          <span style={{ fontSize: '1rem' }}>🎥</span>
                          <span className="truncate" style={{ maxWidth: '200px', fontWeight: 500 }}>
                            {clip.originalFilename}
                          </span>
                        </div>

                        <div className="vo-footage-meta">
                          {clip.width && clip.height && (
                            <span className="vo-res-tag">
                              {clip.width >= 3840 ? '4K' : clip.width >= 2560 ? '1440p' : '1080p'}
                            </span>
                          )}
                          <span>{clip.duration ? `${clip.duration.toFixed(1)}s` : ''}</span>
                        </div>
                      </div>
                    ))}
                  </div>

                  {!isFootageIndexed ? (
                    <Button
                      variant="primary"
                      loading={isAnalyzingFootage}
                      onClick={startFootageAnalysis}
                    >
                      Run Multi-Level Computer Vision Indexing
                    </Button>
                  ) : (
                    <div style={{ fontSize: '0.8rem', color: '#10b981', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span>✓</span>
                      <span>Footage assets indexed across 5 vision layers</span>
                    </div>
                  )}
                </div>
              )}

              <input
                ref={footageInputRef}
                type="file"
                multiple
                accept="video/*"
                style={{ display: 'none' }}
                onChange={handleFootageUpload}
              />
            </div>

            {/* Bottom Orchestrator Bar */}
            <div style={{ gridColumn: '1 / -1', textAlign: 'center', paddingTop: '10px' }}>
              <Button
                variant="primary"
                size="lg"
                disabled={!hasVoiceover || !hasFootage || isGeneratingTimeline}
                loading={isGeneratingTimeline}
                onClick={generateTimeline}
                style={{ padding: '14px 36px', fontSize: '1rem', fontWeight: 700 }}
              >
                ✨ AI Visual Director: Generate Synchronized Timeline
              </Button>
            </div>
          </div>
        ) : (
          /* ── Timeline & Visual Director Workspace ── */
          <div className="vo-timeline-workspace">
            {/* Player Preview Stage */}
            <div className="vo-preview-stage">
              {project?.renderedVideoUrl ? (
                <video
                  ref={videoRef}
                  src={api.getVoiceoverStreamUrl(project.projectId)}
                  controls
                  className="vo-video-player"
                  onTimeUpdate={(e) => handleTimeUpdate(e.currentTarget.currentTime)}
                />
              ) : project?.voiceover?.filePath ? (
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '3rem', marginBottom: '12px' }}>🎬</div>
                  <div style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '6px' }}>
                    AI Visual Director Timeline Synchronized
                  </div>
                  <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                    Click "Render Master Video" to produce the pristine high-fidelity MP4 directly from source files.
                  </div>
                  <Button variant="primary" loading={isRendering} onClick={startRender}>
                    ⚡ Render Master Video
                  </Button>
                </div>
              ) : null}
            </div>

            {/* Multi-Track Editorial Timeline */}
            <div className="vo-timeline-panel">
              <div className="vo-timeline-toolbar">
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ fontWeight: 600 }}>Visual Track ({project?.timeline?.segments.flatMap(s => s.shots).length || 0} shots)</span>
                  <span style={{ color: 'var(--text-tertiary)' }}>
                    Total Duration: {Math.round(project?.timeline?.duration || 0)}s
                  </span>
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                  <Button
                    variant="ghost"
                    size="sm"
                    loading={isGeneratingTimeline}
                    onClick={regenerateTimeline}
                    title="Regenerates unlocked shots while preserving locked (🔒) shots"
                  >
                    🔄 Regenerate Unlocked Shots
                  </Button>
                </div>
              </div>

              {/* Shot Blocks Track */}
              <div className="vo-tracks-scroll">
                <div className="vo-track">
                  {project?.timeline?.segments.flatMap((seg) => seg.shots).map((shot) => {
                    const isSelected = selectedShotId === shot.shotId;
                    return (
                      <div
                        key={shot.shotId}
                        className={`vo-shot-block ${isSelected ? 'selected' : ''}`}
                        style={{ width: `${Math.max(90, shot.duration * 24)}px` }}
                        onClick={() => setSelectedShotId(shot.shotId)}
                      >
                        {shot.thumbnailUrl && (
                          <img src={shot.thumbnailUrl} alt="" className="vo-shot-thumb" />
                        )}

                        <div className="vo-shot-header">
                          <span
                            className={`vo-score-badge ${shot.isLowConfidence ? 'low' : ''}`}
                            title={shot.reasons.join('\n')}
                          >
                            {Math.round(shot.matchScore)}%
                          </span>

                          <button
                            className="vo-lock-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleShotLock(shot.shotId);
                            }}
                            title={shot.isLocked ? 'Locked (will not change on regenerate)' : 'Unlocked'}
                          >
                            {shot.isLocked ? '🔒' : '🔓'}
                          </button>
                        </div>

                        <div className="vo-shot-footer">
                          <span className="truncate" style={{ maxWidth: '80px' }}>
                            {shot.clipFilename}
                          </span>
                          <span>{shot.duration.toFixed(1)}s</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Selected Shot Inspector Footer */}
              {selectedShotId && (
                <div style={{ padding: '8px 16px', background: 'var(--bg-tertiary)', borderTop: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                  {(() => {
                    const shot = project?.timeline?.segments.flatMap(s => s.shots).find(sh => sh.shotId === selectedShotId);
                    if (!shot) return null;
                    return (
                      <>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                          <span><strong>Shot:</strong> {shot.clipFilename}</span>
                          <span><strong>Why this clip:</strong> {shot.reasons.slice(0, 2).join(' • ')}</span>
                          <span><strong>Confidence:</strong> {Math.round(shot.matchScore)}%</span>
                        </div>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => openAlternativesModal(shot.shotId)}
                          >
                            🔍 Find Better Clip
                          </Button>
                        </div>
                      </>
                    );
                  })()}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      <ClipAlternativesModal />
      <QualityReportModal />
    </div>
  );
};
