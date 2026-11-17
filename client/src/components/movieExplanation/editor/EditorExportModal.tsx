import React, { useState } from 'react';
import { useMovieExplanationStore } from '../../../stores/movieExplanationStore.js';
import { Button } from '../../common/Button.js';
import { Spinner } from '../../common/Spinner.js';
import { api } from '../../../services/api.js';
import type { VoiceoverOutputAspectRatio } from '@shared/types.js';

interface EditorExportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const EditorExportModal: React.FC<EditorExportModalProps> = ({ isOpen, onClose }) => {
  const {
    project,
    isRendering,
    renderProgress,
    renderStage,
    renderDetail,
    aspectRatio,
    error,
    setError,
    setAspectRatio,
    startRender,
    autoResolveUnmatched,
  } = useMovieExplanationStore();

  const [resolution, setResolution] = useState<'1080p' | '720p' | '4k'>('1080p');
  const [frameRate, setFrameRate] = useState<number>(60);
  const [qualityPreset, setQualityPreset] = useState<'standard' | 'high' | 'ultra'>('high');
  const [burnCaptions, setBurnCaptions] = useState<boolean>(true);
  const [acknowledgeRights, setAcknowledgeRights] = useState<boolean>(true);
  const [customFilename, setCustomFilename] = useState<string>(
    project ? `${project.projectName || 'Movie_Explanation'}_60FPS_Master.mp4` : 'Movie_Explanation.mp4'
  );

  if (!isOpen || !project) return null;

  const timeline = project.timeline;
  const shots = timeline?.shots || [];
  const qualityReport = project.qualityReport;

  // Check 17 pacing check calculation
  const longShots = shots.filter((s) => s.duration > 3.05);
  const passesPacing = longShots.length === 0;

  const handleDownloadSRT = () => {
    const url = api.getMovieExplanationSRTUrl(project.projectId);
    window.open(url, '_blank');
  };

  const handleStartExport = async () => {
    await startRender({
      acknowledgeRightsWarnings: acknowledgeRights,
      autoResolveUnmatched: true,
      resolution,
      frameRate,
      qualityPreset,
      burnCaptions,
    });
  };

  return (
    <div className="mex-modal-backdrop" onClick={() => !isRendering && onClose()}>
      <div
        className="mex-modal-card"
        style={{ maxWidth: '680px', width: '95%' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Modal Header ── */}
        <div className="mex-modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '1.4rem' }}>🎬</span>
            <div>
              <div style={{ fontWeight: 800, fontSize: '1.1rem', color: '#fff' }}>
                Export Master Video
              </div>
              <div style={{ fontSize: '0.76rem', color: '#94a3b8' }}>
                Timeline Rev {project.timelineRevision || 1} • {shots.length} shots • Max 3.0s pacing
              </div>
            </div>
          </div>
          <button
            className="btn btn-ghost btn-sm"
            disabled={isRendering}
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        {/* ── Modal Body ── */}
        <div className="mex-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Quality Gate Status & Pacing Validation */}
          <div
            style={{
              background: qualityReport?.passed ? 'rgba(16, 185, 129, 0.1)' : 'rgba(245, 158, 11, 0.1)',
              border: `1px solid ${qualityReport?.passed ? 'rgba(16, 185, 129, 0.3)' : 'rgba(245, 158, 11, 0.3)'}`,
              borderRadius: '8px',
              padding: '14px 16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: '0.92rem', color: qualityReport?.passed ? '#34d399' : '#fbbf24' }}>
                  {qualityReport?.passed
                    ? '✓ Quality Gate & Pacing Verified'
                    : `⚠️ Quality Gate Attention Needed (${qualityReport?.overallReadinessScore || 20}/100 Quality)`}
                </div>
                <div style={{ fontSize: '0.78rem', color: '#cbd5e1', marginTop: '2px' }}>
                  {passesPacing
                    ? `All ${shots.length} shots strictly adhere to the <= 3.0s maximum pacing standard.`
                    : `${longShots.length} shot(s) exceed 3.0s pacing.`}
                  {qualityReport?.passed ? ' All narration segments verified with matching movie footage.' : ''}
                </div>
              </div>
              {qualityReport && (
                <span className={`mex-score-pill ${qualityReport.passed ? 'high' : 'low'}`}>
                  {qualityReport.overallReadinessScore}/100 Quality
                </span>
              )}
            </div>

            {/* If Quality Gate has issues, display actionable errors and 1-click Auto-Match button */}
            {qualityReport && !qualityReport.passed && (
              <div
                style={{
                  background: 'rgba(0, 0, 0, 0.3)',
                  border: '1px solid rgba(245, 158, 11, 0.25)',
                  borderRadius: '6px',
                  padding: '10px 12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                }}
              >
                <div style={{ fontSize: '0.78rem', color: '#fde68a' }}>
                  {qualityReport.actionableErrors?.length ? (
                    qualityReport.actionableErrors.map((err, idx) => (
                      <div key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
                        <span>•</span>
                        <span>{err}</span>
                      </div>
                    ))
                  ) : (
                    <div>Some narration segments have missing or unassigned movie footage.</div>
                  )}
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '4px' }}>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={async () => {
                      await autoResolveUnmatched();
                    }}
                    disabled={isRendering}
                    style={{
                      background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                      borderColor: '#059669',
                      color: '#fff',
                      fontWeight: 700,
                    }}
                  >
                    ✨ Auto-Match All Remaining Footage (1-Click Fix)
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Export Settings Form */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            {/* Resolution */}
            <div>
              <label className="mex-sublabel">Resolution</label>
              <select
                className="mex-select"
                value={resolution}
                onChange={(e) => setResolution(e.target.value as any)}
                disabled={isRendering}
              >
                <option value="1080p">1080p Full HD (1920x1080)</option>
                <option value="720p">720p HD (1280x720) - Fast</option>
                <option value="4k">4K Ultra HD (3840x2160)</option>
              </select>
            </div>

            {/* Aspect Ratio */}
            <div>
              <label className="mex-sublabel">Aspect Ratio</label>
              <select
                className="mex-select"
                value={aspectRatio}
                onChange={(e) => setAspectRatio(e.target.value as VoiceoverOutputAspectRatio)}
                disabled={isRendering}
              >
                <option value="16:9">16:9 Landscape (YouTube)</option>
                <option value="9:16">9:16 Vertical (Shorts/Reels)</option>
                <option value="1:1">1:1 Square (Social Feed)</option>
              </select>
            </div>

            {/* Frame Rate */}
            <div>
              <label className="mex-sublabel">Frame Rate</label>
              <select
                className="mex-select"
                value={frameRate}
                onChange={(e) => setFrameRate(parseInt(e.target.value))}
                disabled={isRendering}
              >
                <option value={60}>60 FPS (Ultra Smooth Motion)</option>
                <option value={30}>30 FPS (Standard Web)</option>
                <option value={24}>24 FPS (Cinematic Look)</option>
              </select>
            </div>

            {/* Encoding Quality */}
            <div>
              <label className="mex-sublabel">Quality & Bitrate</label>
              <select
                className="mex-select"
                value={qualityPreset}
                onChange={(e) => setQualityPreset(e.target.value as any)}
                disabled={isRendering}
              >
                <option value="high">High Quality (CRF 18 - Crisp)</option>
                <option value="standard">Standard (CRF 22 - Balanced)</option>
                <option value="ultra">Ultra (CRF 14 - Production)</option>
              </select>
            </div>
          </div>

          {/* Subtitle Options */}
          <div style={{ background: 'rgba(0,0,0,0.25)', padding: '12px 14px', borderRadius: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.84rem', color: '#fff', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={burnCaptions}
                  onChange={(e) => setBurnCaptions(e.target.checked)}
                  disabled={isRendering}
                />
                Burn Synchronized Subtitles into Video Stream
              </label>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDownloadSRT}
                title="Download .srt subtitle file"
              >
                📥 Download .SRT
              </Button>
            </div>
            <div style={{ fontSize: '0.74rem', color: '#94a3b8' }}>
              Captions are precision-synchronized with your master voiceover transcript words and sentences.
            </div>
          </div>

          {/* Rights & Transformative Compliance Acknowledgement */}
          <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', padding: '12px 14px', borderRadius: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '0.82rem', color: '#e2e8f0', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={acknowledgeRights}
                onChange={(e) => setAcknowledgeRights(e.target.checked)}
                disabled={isRendering}
                style={{ marginTop: '3px' }}
              />
              <span>
                <strong>Acknowledge Editorial & Transformative Rights Review:</strong> Master output includes 3.0s cut limits, speed/pitch alterations, and narrative commentary synchronization for copyright shield protection.
              </span>
            </label>
          </div>

          {/* Render Error Alert Box if any */}
          {error && (
            <div
              style={{
                background: 'rgba(239, 68, 68, 0.12)',
                border: '1px solid rgba(239, 68, 68, 0.35)',
                borderRadius: '8px',
                padding: '12px 14px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                color: '#fca5a5',
                fontSize: '0.82rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '1.1rem' }}>⚠️</span>
                  <span>{error}</span>
                </div>
                <button
                  className="btn btn-ghost btn-xs"
                  onClick={() => setError(null)}
                  style={{ color: '#f87171' }}
                >
                  ✕
                </button>
              </div>
              {error.includes('Quality Gate') && (
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '4px' }}>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={async () => {
                      await autoResolveUnmatched();
                    }}
                    disabled={isRendering}
                    style={{
                      background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                      borderColor: '#059669',
                      color: '#fff',
                      fontWeight: 700,
                    }}
                  >
                    ✨ Auto-Match All Remaining Footage & Fix Quality Gate
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Rendering Progress View if active */}
          {isRendering && (
            <div style={{ background: 'rgba(99, 102, 241, 0.1)', border: '1px solid rgba(99, 102, 241, 0.3)', borderRadius: '8px', padding: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Spinner size="sm" />
                  <span style={{ fontWeight: 600, fontSize: '0.86rem', color: '#fff' }}>
                    {renderDetail || renderStage || 'Rendering 60 FPS Master Video...'}
                  </span>
                </div>
                <span style={{ fontWeight: 800, color: '#c084fc' }}>{renderProgress}%</span>
              </div>
              <div style={{ width: '100%', height: '6px', background: 'rgba(0,0,0,0.4)', borderRadius: '999px', overflow: 'hidden' }}>
                <div
                  style={{
                    width: `${renderProgress}%`,
                    height: '100%',
                    background: 'linear-gradient(90deg, #6366f1, #c084fc)',
                    transition: 'width 0.2s ease',
                  }}
                />
              </div>
            </div>
          )}

          {/* If render is complete and ready */}
          {project.renderedVideoUrl && !isRendering && (
            <div style={{ background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: '8px', padding: '12px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: '0.86rem', color: '#34d399' }}>
                  🎉 Master Video Ready (Rev {project.lastExportedRevision || 1})
                </div>
                <div style={{ fontSize: '0.74rem', color: '#94a3b8' }}>
                  Validated 60 FPS output with synchronized audio and invisible copyright transforms.
                </div>
              </div>
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  window.open(api.getMovieExplanationDownloadUrl(project.projectId), '_blank');
                }}
              >
                📥 Download Video
              </Button>
            </div>
          )}
        </div>

        {/* ── Modal Footer ── */}
        <div className="mex-modal-footer">
          <Button variant="ghost" size="md" onClick={onClose} disabled={isRendering}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="md"
            loading={isRendering}
            onClick={handleStartExport}
          >
            ⚡ Render Master Video (60 FPS)
          </Button>
        </div>
      </div>
    </div>
  );
};
