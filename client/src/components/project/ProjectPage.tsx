import React, { useEffect, useState } from 'react';
import { useProjectStore } from '../../stores/projectStore.js';
import { useProcessingStore } from '../../stores/processingStore.js';
import { useShortsStore } from '../../stores/shortsStore.js';
import { UploadZone } from '../upload/UploadZone.js';
import { VideoInfo } from '../upload/VideoInfo.js';
import { VideoPreview } from './VideoPreview.js';
import { Timeline } from './Timeline.js';
import { HighlightList } from './HighlightList.js';
import { ProcessingStatus } from './ProcessingStatus.js';
import { TranscriptViewer } from './TranscriptViewer.js';
import { CopyrightAdvisory } from './CopyrightAdvisory.js';
import { ShortEditor } from '../shorts/ShortEditor.js';
import { ShortsReviewMode } from '../shorts/ShortsReviewMode.js';
import { LongFormStudio } from '../longForm/LongFormStudio.js';
import '../../styles/longForm.css';
import { Button } from '../common/Button.js';
import { Spinner } from '../common/Spinner.js';
import { PIPELINE_STAGE_LABELS } from '@shared/constants.js';
import { api } from '../../services/api.js';

export const ProjectPage: React.FC = () => {
  const { currentProject, activeTab, setActiveTab } = useProjectStore();
  const {
    startProcessing,
    isProcessing,
    currentStage,
    progress,
    stageProgress,
    stageDetail,
    listenToUpdates,
    checkStatus,
  } = useProcessingStore();
  const {
    highlights,
    shorts,
    transcript,
    copyright,
    activeShort,
    activeReviewMode,
    loadHighlights,
    loadShorts,
    loadTranscript,
    loadCopyright,
    setActiveShort,
    setActiveReviewMode,
    setCurrentHighlightIndex,
    generateAllShorts,
    downloadAllShorts,
    isBatchExporting,
    batchExportProgress,
    listenToShortsUpdates,
  } = useShortsStore();

  const [currentTime, setCurrentTime] = useState(0);
  const [seekTime, setSeekTime] = useState<number | null>(null);
  const [videoMode, setVideoMode] = useState<'shorts' | 'longform'>('shorts');
  const matchedProjectShortIds = new Set<string>();
  const completedMomentsShorts = highlights.filter((h) => {
    const match = shorts.find(
      (s) =>
        !matchedProjectShortIds.has(s.id) &&
        (s.highlightId === h.id ||
          (Math.abs(s.startTime - h.startTime) < 2 && Math.abs(s.endTime - h.endTime) < 2)) &&
        s.status === 'completed' &&
        s.filePath
    );
    if (match) {
      matchedProjectShortIds.add(match.id);
      return true;
    }
    return false;
  });

  useEffect(() => {
    if (!currentProject) return;

    checkStatus(currentProject.id);
    loadHighlights(currentProject.id);
    loadShorts(currentProject.id);
    loadTranscript(currentProject.id);
    loadCopyright(currentProject.id);

    const cleanupWs = listenToUpdates(currentProject.id);
    const cleanupShortsWs = listenToShortsUpdates(currentProject.id);
    return () => {
      cleanupWs();
      cleanupShortsWs();
    };
  }, [currentProject?.id]);

  if (!currentProject) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0' }}>
        <Spinner size="lg" label="Loading project studio..." />
      </div>
    );
  }

  // If user is in full Shorts Review Mode
  if (activeReviewMode && currentProject.video) {
    return (
      <ShortsReviewMode
        video={currentProject.video}
        onExit={() => setActiveReviewMode(false)}
      />
    );
  }

  const handleStartProcessing = async (preferredFramingMode: 'blur_fill' | 'action' = 'blur_fill') => {
    await startProcessing(currentProject.id, preferredFramingMode);
    setActiveTab('processing');
  };

  const handleSeek = (time: number) => {
    setCurrentTime(time);
    setSeekTime(time);
  };

  // If a short is currently being edited
  if (activeShort) {
    return (
      <ShortEditor
        short={activeShort}
        video={currentProject.video}
        onBack={() => setActiveShort(null)}
      />
    );
  }


  return (
    <div className="project-page-container">
      {/* Upload Stage */}
      {!currentProject.video ? (
        <div className="project-upload-section">
          <h2 style={{ marginBottom: '8px' }}>Upload Video for Analysis</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '24px' }}>
            Upload a 20–30 minute video. The pipeline will automatically transcribe and detect the best 30-second clips.
          </p>
          <UploadZone projectId={currentProject.id} />
        </div>
      ) : (
        <>
          {/* Mode Switcher Banner */}
          <div className="video-mode-switcher-container">
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ fontSize: '0.76rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-tertiary)', letterSpacing: '1px' }}>
                Video Mode
              </span>
              <div className="video-mode-pills">
                <button
                  type="button"
                  className={`video-mode-btn ${videoMode === 'shorts' ? 'active' : ''}`}
                  onClick={() => setVideoMode('shorts')}
                >
                  ⚡ Shorts Studio (9:16)
                </button>
                <button
                  type="button"
                  className={`video-mode-btn ${videoMode === 'longform' ? 'active longform-mode' : ''}`}
                  onClick={() => setVideoMode('longform')}
                >
                  🎬 Long-Form Compilation (16:9)
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                {videoMode === 'shorts'
                  ? '⚡ AI vertical 9:16 highlight creator'
                  : '🎬 Coherent 16:9 long-form narrative digest'}
              </span>
            </div>
          </div>

          {videoMode === 'longform' ? (
            <LongFormStudio
              project={currentProject}
              video={currentProject.video}
              onSwitchToShorts={() => setVideoMode('shorts')}
            />
          ) : (
            <>
              {/* Video Metadata & Controls Banner */}
              <VideoInfo
                video={currentProject.video}
                onStartProcessing={handleStartProcessing}
                isProcessing={isProcessing}
              />

          {/* Main Studio Viewport */}
          <div className="studio-grid">
            <div className="studio-video-column">
              <VideoPreview
                video={currentProject.video}
                currentTime={currentTime}
                onTimeUpdate={setCurrentTime}
                seekTime={seekTime}
              />

              <div style={{ marginTop: '12px' }}>
                <Timeline
                  duration={currentProject.video.duration || 0}
                  currentTime={currentTime}
                  highlights={highlights}
                  onSeek={handleSeek}
                />
              </div>
            </div>

            <div className="studio-tabs-column">
              <div className="studio-tabs-header">
                <button
                  className={`tab-btn ${activeTab === 'highlights' ? 'active' : ''}`}
                  onClick={() => setActiveTab('highlights')}
                >
                  ⚡ Best Moments ({highlights.length})
                </button>
                <button
                  className={`tab-btn ${activeTab === 'shorts' ? 'active' : ''}`}
                  onClick={() => setActiveTab('shorts')}
                >
                  📱 Generated Shorts ({completedMomentsShorts.length > 0 ? `${completedMomentsShorts.length} Ready` : Math.min(highlights.length, shorts.length)})
                </button>
                <button
                  className={`tab-btn ${activeTab === 'transcript' ? 'active' : ''}`}
                  onClick={() => setActiveTab('transcript')}
                >
                  📝 Transcript
                </button>
                <button
                  className={`tab-btn ${activeTab === 'processing' ? 'active' : ''}`}
                  onClick={() => setActiveTab('processing')}
                >
                  ⚙️ Pipeline {isProcessing ? `(${progress}%)` : ''}
                </button>
                <button
                  className={`tab-btn ${activeTab === 'copyright' ? 'active' : ''}`}
                  onClick={() => setActiveTab('copyright')}
                >
                  🛡️ Rights
                </button>
                {highlights.length > 0 && (
                  <button
                    className="tab-btn"
                    style={{
                      background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.25), rgba(236, 72, 153, 0.2))',
                      borderColor: '#6366F1',
                      color: '#A5B4FC',
                      fontWeight: 700,
                      marginLeft: 'auto',
                    }}
                    onClick={() => setActiveReviewMode(true)}
                  >
                    🔥 Review Shorts Mode (9:16) →
                  </button>
                )}
              </div>

              {/* Compact Live Progress Ticker when browsing other tabs while pipeline is running */}
              {isProcessing && activeTab !== 'processing' && (
                <div
                  onClick={() => setActiveTab('processing')}
                  style={{
                    background: 'linear-gradient(90deg, rgba(99, 102, 241, 0.15), rgba(236, 72, 153, 0.1))',
                    border: '1px solid rgba(99, 102, 241, 0.4)',
                    borderRadius: '8px',
                    padding: '8px 14px',
                    marginBottom: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    cursor: 'pointer',
                    fontSize: '0.85rem',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                    <span className="pulse-indicator" style={{ width: '8px', height: '8px', flexShrink: 0 }} />
                    <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      <strong>{PIPELINE_STAGE_LABELS[currentStage || ''] || currentStage}</strong>: {stageProgress}%
                      {stageDetail && <span style={{ color: '#a5b4fc', marginLeft: '6px' }}>({stageDetail})</span>}
                    </span>
                  </div>
                  <span style={{ color: '#c7d2fe', fontWeight: 600, flexShrink: 0, marginLeft: '12px' }}>
                    Overall: {progress}% →
                  </span>
                </div>
              )}

              <div className="studio-tab-content">
                {activeTab === 'highlights' && (
                  <HighlightList
                    highlights={highlights}
                    onSeek={handleSeek}
                  />
                )}

                {activeTab === 'shorts' && (() => {
                  const completedShorts = shorts.filter((s) => s.status === 'completed');
                  const renderingShorts = shorts.filter((s) => s.status === 'rendering');

                  return (
                    <div>
                      {/* Top Action Header */}
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          flexWrap: 'wrap',
                          gap: '12px',
                          marginBottom: '16px',
                          padding: '14px 18px',
                          background: 'rgba(255, 255, 255, 0.03)',
                          borderRadius: '10px',
                          border: '1px solid var(--border-color)',
                        }}
                      >
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700 }}>
                              Generated Shorts ({shorts.length})
                            </h3>
                            <span
                              style={{
                                fontSize: '0.75rem',
                                padding: '2px 8px',
                                borderRadius: '10px',
                                background: completedShorts.length > 0 ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255, 255, 255, 0.08)',
                                color: completedShorts.length > 0 ? '#34D399' : 'var(--text-secondary)',
                                fontWeight: 600,
                              }}
                            >
                              {completedShorts.length} Ready
                            </span>
                            {renderingShorts.length > 0 && (
                              <span
                                style={{
                                  fontSize: '0.75rem',
                                  padding: '2px 8px',
                                  borderRadius: '10px',
                                  background: 'rgba(99, 102, 241, 0.2)',
                                  color: '#A5B4FC',
                                  fontWeight: 600,
                                }}
                              >
                                ⚡ {renderingShorts.length} Rendering
                              </span>
                            )}
                          </div>
                          <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                            {highlights.length} highlight moments available in this project
                          </p>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                          {completedShorts.length > 0 && (
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => downloadAllShorts(currentProject.id)}
                              style={{
                                borderColor: '#10B981',
                                color: '#34D399',
                                background: 'rgba(16, 185, 129, 0.1)',
                                fontWeight: 600,
                              }}
                            >
                              📦 Download All ({completedShorts.length}) ZIP
                            </Button>
                          )}
                          {highlights.length > 0 && (
                            <Button
                              variant="primary"
                              size="sm"
                              loading={isBatchExporting}
                              onClick={() =>
                                generateAllShorts(currentProject.id, {
                                  captionsEnabled: true,
                                  reframeMode: 'center',
                                })
                              }
                              style={{
                                background: 'linear-gradient(135deg, #6366F1 0%, #EC4899 100%)',
                                fontWeight: 700,
                              }}
                            >
                              {isBatchExporting
                                ? `Exporting (${completedShorts.length}/${highlights.length})...`
                                : `⚡ Export All (${highlights.length}) Shorts`}
                            </Button>
                          )}
                        </div>
                      </div>

                      {/* Live Batch Rendering Progress Bar */}
                      {isBatchExporting && (
                        <div
                          style={{
                            background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.12), rgba(236, 72, 153, 0.08))',
                            border: '1px solid rgba(99, 102, 241, 0.35)',
                            borderRadius: '8px',
                            padding: '12px 16px',
                            marginBottom: '16px',
                          }}
                        >
                          <div
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              marginBottom: '6px',
                              fontSize: '0.8rem',
                            }}
                          >
                            <span style={{ color: '#C7D2FE', fontWeight: 600 }}>
                              ⚡ Batch Rendering Shorts: Vertical 9:16 Reframe & Captions
                            </span>
                            <span style={{ color: '#A5B4FC' }}>
                              {completedShorts.length} of {highlights.length} completed
                            </span>
                          </div>
                          <div
                            style={{
                              height: '6px',
                              background: 'rgba(255, 255, 255, 0.1)',
                              borderRadius: '3px',
                              overflow: 'hidden',
                            }}
                          >
                            <div
                              style={{
                                height: '100%',
                                width: `${Math.max(
                                  5,
                                  Math.round((completedShorts.length / highlights.length) * 100)
                                )}%`,
                                background: 'linear-gradient(90deg, #6366F1, #EC4899)',
                                transition: 'width 0.4s ease',
                              }}
                            />
                          </div>
                        </div>
                      )}

                      {/* Shorts Grid or Empty State */}
                      {shorts.length === 0 ? (
                        <div className="empty-state" style={{ padding: '40px 0' }}>
                          <div className="empty-state-icon">📱</div>
                          <h3>No Shorts generated yet</h3>
                          <p
                            style={{
                              maxWidth: '440px',
                              margin: '0 auto 20px',
                              color: 'var(--text-secondary)',
                            }}
                          >
                            {highlights.length > 0
                              ? `You have ${highlights.length} detected highlight moments ready to be converted into 9:16 vertical shorts.`
                              : 'Go to the Best Moments tab and click "Generate Short" on any candidate.'}
                          </p>
                          {highlights.length > 0 && (
                            <Button
                              variant="primary"
                              size="md"
                              loading={isBatchExporting}
                              onClick={() =>
                                generateAllShorts(currentProject.id, {
                                  captionsEnabled: true,
                                  reframeMode: 'center',
                                })
                              }
                              style={{
                                background: 'linear-gradient(135deg, #6366F1 0%, #EC4899 100%)',
                                fontWeight: 700,
                                boxShadow: '0 4px 16px rgba(99, 102, 241, 0.4)',
                              }}
                            >
                              ⚡ Export All {highlights.length} Shorts at Once
                            </Button>
                          )}
                        </div>
                      ) : (
                        <div className="shorts-grid-list">
                          {shorts.map((sh, idx) => {
                            const isRendering = sh.status === 'rendering';
                            const isCompleted = sh.status === 'completed';
                            const prog = sh.renderProgress || 10;

                            return (
                              <div
                                key={sh.id}
                                className="card short-mini-card"
                                style={{
                                  position: 'relative',
                                  border: isRendering
                                    ? '1px solid rgba(99, 102, 241, 0.5)'
                                    : isCompleted
                                    ? '1px solid rgba(16, 185, 129, 0.3)'
                                    : undefined,
                                }}
                                onClick={() => setActiveShort(sh)}
                              >
                                <div className="short-mini-header">
                                  <span className="short-mini-num">Short #{idx + 1}</span>
                                  <span className="short-mini-dur">
                                    {Math.round(sh.duration)}s (9:16)
                                  </span>
                                </div>

                                <div
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    margin: '4px 0 10px',
                                  }}
                                >
                                  <span
                                    style={{
                                      fontSize: '0.72rem',
                                      padding: '2px 6px',
                                      borderRadius: '6px',
                                      background: isCompleted
                                        ? 'rgba(16, 185, 129, 0.2)'
                                        : isRendering
                                        ? 'rgba(99, 102, 241, 0.2)'
                                        : 'rgba(239, 68, 68, 0.2)',
                                      color: isCompleted
                                        ? '#34D399'
                                        : isRendering
                                        ? '#A5B4FC'
                                        : '#F87171',
                                      fontWeight: 600,
                                    }}
                                  >
                                    {isCompleted
                                      ? '✓ Ready'
                                      : isRendering
                                      ? `⚡ Rendering ${prog}%`
                                      : '✕ Failed'}
                                  </span>
                                  <span
                                    style={{
                                      fontSize: '0.72rem',
                                      color: 'var(--text-tertiary)',
                                    }}
                                  >
                                    {sh.captionsEnabled ? '💬 Captions ON' : '💬 No Captions'}
                                  </span>
                                </div>

                                {isRendering && (
                                  <div style={{ marginBottom: '10px' }}>
                                    <div
                                      style={{
                                        height: '4px',
                                        background: 'rgba(255, 255, 255, 0.1)',
                                        borderRadius: '2px',
                                        overflow: 'hidden',
                                      }}
                                    >
                                      <div
                                        style={{
                                          height: '100%',
                                          width: `${prog}%`,
                                          background:
                                            'linear-gradient(90deg, #6366F1, #EC4899)',
                                          transition: 'width 0.3s ease',
                                        }}
                                      />
                                    </div>
                                    <span
                                      style={{
                                        fontSize: '0.68rem',
                                        color: '#A5B4FC',
                                        display: 'block',
                                        marginTop: '4px',
                                      }}
                                    >
                                      {prog <= 20
                                        ? 'Extracting clip...'
                                        : prog <= 50
                                        ? 'Vertical reframe (9:16)...'
                                        : prog <= 75
                                        ? 'Burning captions...'
                                        : 'Finalizing encode...'}
                                    </span>
                                  </div>
                                )}

                                <div
                                  style={{
                                    display: 'flex',
                                    gap: '8px',
                                    marginTop: 'auto',
                                  }}
                                >
                                  <Button
                                    variant="secondary"
                                    size="sm"
                                    style={{ flex: 1 }}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setActiveShort(sh);
                                    }}
                                  >
                                    Editor →
                                  </Button>
                                  {isCompleted && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      title="Download MP4"
                                      style={{
                                        color: '#34D399',
                                        borderColor: 'rgba(16, 185, 129, 0.4)',
                                        padding: '4px 8px',
                                      }}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        window.open(api.getDownloadUrl(sh.id), '_blank');
                                      }}
                                    >
                                      ⬇️ MP4
                                    </Button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })()}

                {activeTab === 'transcript' && (
                  <TranscriptViewer
                    transcript={transcript}
                    onSeek={handleSeek}
                    currentTime={currentTime}
                  />
                )}

                {activeTab === 'processing' && (
                  <ProcessingStatus projectId={currentProject.id} />
                )}

                {activeTab === 'copyright' && (
                  <CopyrightAdvisory copyright={copyright} />
                )}
              </div>
            </div>
          </div>
            </>
          )}
        </>
      )}
    </div>
  );
};
