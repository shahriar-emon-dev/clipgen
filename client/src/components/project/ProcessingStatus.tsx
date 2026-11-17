import React, { useState, useEffect } from 'react';
import { useProcessingStore } from '../../stores/processingStore.js';
import { PIPELINE_STAGES, PIPELINE_STAGE_LABELS } from '@shared/constants.js';
import { ProgressBar } from '../common/ProgressBar.js';
import { Button } from '../common/Button.js';

interface ProcessingStatusProps {
  projectId: string;
}

export const ProcessingStatus: React.FC<ProcessingStatusProps> = ({ projectId }) => {
  const {
    currentStage,
    progress,
    stageProgress,
    stageDetail,
    message,
    stagesCompleted,
    isProcessing,
    cancelProcessing,
    error,
  } = useProcessingStore();

  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;
    if (isProcessing) {
      interval = setInterval(() => {
        setElapsedSeconds(prev => prev + 1);
      }, 1000);
    } else {
      setElapsedSeconds(0);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isProcessing]);

  const formatElapsed = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const getStageStatus = (stageName: string) => {
    if (stagesCompleted.includes(stageName as any)) return 'completed';
    if (currentStage === stageName) return 'active';
    return 'pending';
  };

  const activeLabel = currentStage ? (PIPELINE_STAGE_LABELS[currentStage] || currentStage) : '';

  return (
    <div className="card processing-card">
      <div className="processing-header">
        <div>
          <h3>AI Video Processing Pipeline</h3>
          <p className="processing-message">
            {message || (isProcessing ? 'Analyzing video segments and scoring highlights...' : 'Ready to start analysis')}
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {isProcessing && (
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
              ⏱️ Elapsed: {formatElapsed(elapsedSeconds)}
            </span>
          )}
          {isProcessing && (
            <Button variant="ghost" size="sm" onClick={() => cancelProcessing(projectId)}>
              Cancel
            </Button>
          )}
        </div>
      </div>

      {/* Overall Master Pipeline Progress */}
      <div className="processing-progress-section">
        <ProgressBar
          progress={progress}
          height={10}
          showPercent
          label={`Overall Pipeline Progress (${stagesCompleted.length} of ${PIPELINE_STAGES.length - 1} stages complete)`}
        />
      </div>

      {/* Active Segment Live Hero Banner */}
      {isProcessing && currentStage && currentStage !== 'completed' && (
        <div className="active-segment-banner">
          <div className="active-segment-top">
            <div className="active-segment-title-group">
              <span className="pulse-indicator" />
              <span className="active-segment-name">Active Stage: {activeLabel}</span>
            </div>
            <span className="active-segment-pill">
              Segment Progress: {stageProgress}%
            </span>
          </div>

          {stageDetail && (
            <div className="active-segment-detail">
              ⚡ {stageDetail}
            </div>
          )}

          <div className="active-segment-progress-track">
            <div
              className="active-segment-progress-fill"
              style={{ width: `${Math.max(2, stageProgress)}%` }}
            />
          </div>
        </div>
      )}

      {error && (
        <div className="processing-error">
          <span>❌ Error: {error}</span>
        </div>
      )}

      {/* Grid of All Processing Stages */}
      <div className="pipeline-stages-list">
        {PIPELINE_STAGES.filter(s => s !== 'completed').map((stage) => {
          const status = getStageStatus(stage);
          const isActive = status === 'active';
          const isDone = status === 'completed';

          return (
            <div key={stage} className={`pipeline-stage-item ${status}`}>
              <div className="stage-header-row">
                <div className="stage-icon">
                  {isDone && '✓'}
                  {isActive && <span className="stage-spinner" />}
                  {status === 'pending' && <span className="stage-dot" />}
                </div>
                <div className="stage-info">
                  <div className="stage-title-wrap">
                    <span className="stage-name">{PIPELINE_STAGE_LABELS[stage] || stage}</span>
                    {isActive && (
                      <span className="stage-badge">{stageProgress}%</span>
                    )}
                  </div>
                  <span className="stage-desc">
                    {isDone && 'Complete'}
                    {isActive && (stageDetail ? 'In progress' : 'Processing now...')}
                    {status === 'pending' && 'Queued'}
                  </span>
                </div>
              </div>

              {/* Real-time detail note directly in the card */}
              {isActive && stageDetail && (
                <div className="stage-detail-live">
                  ↳ {stageDetail}
                </div>
              )}

              {/* Mini progress bar inside active stage card */}
              {isActive && (
                <div className="stage-mini-progress">
                  <div className="stage-mini-track">
                    <div
                      className="stage-mini-fill"
                      style={{ width: `${Math.max(2, stageProgress)}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
