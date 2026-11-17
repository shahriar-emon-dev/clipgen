// ============================================================
// Movie Explanation — Review Panel Component
// Surfaces potential editing issues: opening 120s narration audit,
// transformative creative presentation controls, low-confidence matches,
// repeated footage, premature reveals, and project lifecycle.
// ============================================================

import React, { useEffect, useState } from 'react';
import { useMovieExplanationStore } from '../../stores/movieExplanationStore.js';
import { Button } from '../common/Button.js';
import { api } from '../../services/api.js';
import type { CreativePresetType, AssetRightsStatus, MovieScreenshotMotionEffect } from '@shared/types.js';

export const ReviewPanel: React.FC = () => {
  const {
    project,
    setSelectedShotId,
    openAlternativesModal,
    setActiveTab,
    createProject,
    deleteProject,
    startRender,
    cancelRender,
    isRendering,
    openingReport,
    isLoadingOpeningReport,
    isGeneratingOpeningPreview,
    fetchOpeningReport,
    generateOpeningPreview,
    updateSettings,
    rightsReview,
    isLoadingRightsReview,
    fetchRightsReview,
    updateShotRights,
    acknowledgeRightsWarnings,
    scriptReview,
    isLoadingScriptReview,
    fetchScriptReview,
    updateScriptSegment,
    exportManifest,
    isLoadingManifest,
    fetchExportManifest,
    acceptShotMatch,
    acceptAllScreenshots,
    acceptAllMatches,
    convertUnmatchedToScreenshots,
    autoReviewAndApprove,
    convertShotToScreenshot,
    recheckSegment,
    revalidateTimeline,
    enforceScreenshotCadence,
    autoVaryRepeatedScenes,
    seekTo,
  } = useMovieExplanationStore();

  const timeline = project?.timeline;
  const shots = timeline?.shots || [];
  const scenes = project?.episodeIndex?.scenes || [];
  const currentSettings = project?.transformativeSettings || timeline?.transformativeSettings;

  // Local state for transformative preset controls
  const [selectedPreset, setSelectedPreset] = useState<CreativePresetType>(
    currentSettings?.preset || 'neutral'
  );
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(
    currentSettings?.playbackSpeed || 1.0
  );
  const [horizontalFlip, setHorizontalFlip] = useState<boolean>(
    currentSettings?.horizontalFlip || false
  );
  const [voiceoverVol, setVoiceoverVol] = useState<number>(
    currentSettings?.audioMixing?.voiceoverVolume ?? 1.0
  );
  const [bgmVol, setBgmVol] = useState<number>(
    currentSettings?.audioMixing?.bgmVolume ?? 0.08
  );
  const [sourceMovieVol, setSourceMovieVol] = useState<number>(
    currentSettings?.audioMixing?.sourceMovieVolume ?? 0.0
  );
  const [isSavingSettings, setIsSavingSettings] = useState<boolean>(false);
  const [settingsSavedMessage, setSettingsSavedMessage] = useState<string | null>(null);

  // Local state for rights review and inline editing
  const [showAttributionBox, setShowAttributionBox] = useState<boolean>(false);
  const [editingRightsShotId, setEditingRightsShotId] = useState<string | null>(null);
  const [editingRightsStatus, setEditingRightsStatus] = useState<AssetRightsStatus>('owned');
  const [editingLicenseDetails, setEditingLicenseDetails] = useState<string>('');
  const [editingAttributionReqs, setEditingAttributionReqs] = useState<string>('');
  const [copyAttributionMessage, setCopyAttributionMessage] = useState<string | null>(null);
  const [isUpdatingShotRights, setIsUpdatingShotRights] = useState<boolean>(false);
  const [isAcknowledgingRights, setIsAcknowledgingRights] = useState<boolean>(false);

  // Local state for script review and inline segment editing
  const [editingSegmentId, setEditingSegmentId] = useState<string | null>(null);
  const [editingSegmentText, setEditingSegmentText] = useState<string>('');
  const [isUpdatingSegment, setIsUpdatingSegment] = useState<boolean>(false);
  const [showManifestBox, setShowManifestBox] = useState<boolean>(false);

  // Local state for timeline validation & storyboard review
  const [isValidatingTimeline, setIsValidatingTimeline] = useState<boolean>(false);
  const [recheckingSegmentId, setRecheckingSegmentId] = useState<string | null>(null);
  const [acceptingShotId, setAcceptingShotId] = useState<string | null>(null);
  const [convertingShotId, setConvertingShotId] = useState<string | null>(null);
  const [isAcceptingAllScreenshots, setIsAcceptingAllScreenshots] = useState<boolean>(false);
  const [isAcceptingAllMatches, setIsAcceptingAllMatches] = useState<boolean>(false);
  const [isConvertingUnmatched, setIsConvertingUnmatched] = useState<boolean>(false);
  const [isAutoReviewing, setIsAutoReviewing] = useState<boolean>(false);
  const [bulkActionSuccessMsg, setBulkActionSuccessMsg] = useState<string | null>(null);
  const [storyboardFilter, setStoryboardFilter] = useState<'all' | 'flagged' | 'low_confidence' | 'screenshots'>('all');
  const [expandedAlternativesSegmentId, setExpandedAlternativesSegmentId] = useState<string | null>(null);
  const [validationSuccessMsg, setValidationSuccessMsg] = useState<string | null>(null);

  const handleRevalidateTimeline = async () => {
    setIsValidatingTimeline(true);
    try {
      await revalidateTimeline();
      setValidationSuccessMsg('✓ Timeline revalidated successfully.');
      setTimeout(() => setValidationSuccessMsg(null), 3000);
    } finally {
      setIsValidatingTimeline(false);
    }
  };

  const handleAcceptAllScreenshots = async () => {
    setIsAcceptingAllScreenshots(true);
    setBulkActionSuccessMsg(null);
    try {
      await acceptAllScreenshots();
      setBulkActionSuccessMsg('✓ All screenshots accepted & approved!');
      setTimeout(() => setBulkActionSuccessMsg(null), 4000);
    } catch (err: any) {
      alert(`Failed to accept all screenshots: ${err?.message || 'Unknown error'}`);
    } finally {
      setIsAcceptingAllScreenshots(false);
    }
  };

  const handleAcceptAllMatches = async () => {
    setIsAcceptingAllMatches(true);
    setBulkActionSuccessMsg(null);
    try {
      await acceptAllMatches();
      setBulkActionSuccessMsg('✓ All clips accepted & approved!');
      setTimeout(() => setBulkActionSuccessMsg(null), 4000);
    } catch (err: any) {
      alert(`Failed to accept all matches: ${err?.message || 'Unknown error'}`);
    } finally {
      setIsAcceptingAllMatches(false);
    }
  };

  const handleConvertUnmatchedToScreenshots = async () => {
    setIsConvertingUnmatched(true);
    setBulkActionSuccessMsg(null);
    try {
      await convertUnmatchedToScreenshots();
      setBulkActionSuccessMsg('🖼️ Converted all unmatched beats into moving screenshots!');
      setTimeout(() => setBulkActionSuccessMsg(null), 4000);
    } catch (err: any) {
      alert(`Failed to convert unmatched beats: ${err?.message || 'Unknown error'}`);
    } finally {
      setIsConvertingUnmatched(false);
    }
  };

  const handleAutoReviewAndApprove = async () => {
    setIsAutoReviewing(true);
    setBulkActionSuccessMsg(null);
    try {
      await autoReviewAndApprove();
      setBulkActionSuccessMsg('⚡ Auto-reviewed & approved: Quality Score updated to 100%!');
      setTimeout(() => setBulkActionSuccessMsg(null), 5000);
    } catch (err: any) {
      alert(`Auto-review failed: ${err?.message || 'Unknown error'}`);
    } finally {
      setIsAutoReviewing(false);
    }
  };

  const handleAcceptMatch = async (shotId: string) => {
    setAcceptingShotId(shotId);
    try {
      await acceptShotMatch(shotId);
    } finally {
      setAcceptingShotId(null);
    }
  };

  const handleConvertToScreenshot = async (shotId: string, motion: MovieScreenshotMotionEffect = 'pan_left_to_right') => {
    setConvertingShotId(shotId);
    try {
      await convertShotToScreenshot(shotId, motion);
    } finally {
      setConvertingShotId(null);
    }
  };

  const handleRecheckSegment = async (segmentId: string) => {
    setRecheckingSegmentId(segmentId);
    try {
      await recheckSegment(segmentId);
    } finally {
      setRecheckingSegmentId(null);
    }
  };

  // Auto-fetch opening verification report when timeline is ready
  useEffect(() => {
    if (project?.projectId && timeline && !openingReport && !isLoadingOpeningReport) {
      fetchOpeningReport();
    }
  }, [project?.projectId, !!timeline]);

  // Auto-fetch rights clearance review when timeline is ready
  useEffect(() => {
    if (project?.projectId && timeline && !rightsReview && !isLoadingRightsReview) {
      fetchRightsReview();
    }
  }, [project?.projectId, !!timeline]);

  // Auto-fetch script review when script is ready
  useEffect(() => {
    if (project?.projectId && project?.script && !scriptReview && !isLoadingScriptReview) {
      fetchScriptReview();
    }
  }, [project?.projectId, !!project?.script]);

  // Sync settings state when project updates
  useEffect(() => {
    if (currentSettings) {
      setSelectedPreset(currentSettings.preset || 'neutral');
      setPlaybackSpeed(currentSettings.playbackSpeed || 1.0);
      setHorizontalFlip(currentSettings.horizontalFlip || false);
      if (currentSettings.audioMixing) {
        setVoiceoverVol(currentSettings.audioMixing.voiceoverVolume ?? 1.0);
        setBgmVol(currentSettings.audioMixing.bgmVolume ?? 0.08);
        setSourceMovieVol(currentSettings.audioMixing.sourceMovieVolume ?? 0.0);
      }
    }
  }, [currentSettings]);

  const handleSaveSettings = async () => {
    setIsSavingSettings(true);
    setSettingsSavedMessage(null);
    try {
      await updateSettings({
        preset: selectedPreset,
        enableFairUsePreset: selectedPreset !== 'neutral',
        playbackSpeed,
        horizontalFlip,
        audioMixing: {
          voiceoverVolume: voiceoverVol,
          bgmVolume: bgmVol,
          sourceMovieVolume: sourceMovieVol,
          enableAmbientCinematicBed: bgmVol > 0.01,
        },
      });
      setSettingsSavedMessage('✓ Creative settings updated. Re-render to export fresh video.');
      setTimeout(() => setSettingsSavedMessage(null), 4000);
    } catch {
      setSettingsSavedMessage('Failed to update settings.');
    } finally {
      setIsSavingSettings(false);
    }
  };

  const handleStartEditRights = (shot: any) => {
    setEditingRightsShotId(shot.shotId);
    setEditingRightsStatus(shot.rightsMetadata?.rightsStatus || 'unverified');
    setEditingLicenseDetails(shot.rightsMetadata?.licenseDetails || '');
    setEditingAttributionReqs(shot.rightsMetadata?.attributionRequirements || '');
  };

  const handleSaveRights = async () => {
    if (!editingRightsShotId) return;
    setIsUpdatingShotRights(true);
    try {
      await updateShotRights(editingRightsShotId, {
        rightsStatus: editingRightsStatus,
        licenseDetails: editingLicenseDetails,
        attributionRequirements: editingAttributionReqs,
      });
      setEditingRightsShotId(null);
    } finally {
      setIsUpdatingShotRights(false);
    }
  };

  const generateAttributionText = (): string => {
    const lines: string[] = ['=== Visual Media & Assets Attribution ==='];
    for (const s of shots) {
      if (s.rightsMetadata?.attributionRequirements || s.rightsMetadata?.licenseDetails) {
        const title = s.rightsMetadata.sourceFilename || s.replacementSource?.assetLabel || s.sceneId;
        const lic = s.rightsMetadata.licenseDetails ? ` [License: ${s.rightsMetadata.licenseDetails}]` : '';
        const attr = s.rightsMetadata.attributionRequirements ? ` • ${s.rightsMetadata.attributionRequirements}` : '';
        lines.push(`• Shot ${s.shotId} (${title}): ${s.rightsMetadata.rightsStatus.toUpperCase()}${lic}${attr}`);
      }
    }
    if (lines.length === 1) {
      lines.push('All visual assets have been verified with standard creator licensing.');
    }
    return lines.join('\n');
  };

  const handleCopyAttribution = () => {
    const text = generateAttributionText();
    navigator.clipboard.writeText(text);
    setCopyAttributionMessage('✓ Attribution copied to clipboard!');
    setTimeout(() => setCopyAttributionMessage(null), 3000);
  };

  const lowConfidenceShots = shots.filter((s) => s.isLowConfidence || s.matchScore < 48);

  // Check scene reuse counts
  const sceneUsage = new Map<string, number>();
  const sceneVisits = new Map<string, number>();
  let prevSceneId: string | null = null;
  for (const shot of shots) {
    if (!shot.sceneId || shot.sceneId === 'unmatched') continue;
    sceneUsage.set(shot.sceneId, (sceneUsage.get(shot.sceneId) || 0) + 1);
    if (shot.sceneId !== prevSceneId) {
      sceneVisits.set(shot.sceneId, (sceneVisits.get(shot.sceneId) || 0) + 1);
      prevSceneId = shot.sceneId;
    }
  }
  const repeatedScenes = Array.from(sceneUsage.entries())
    .filter(([sceneId, count]) => {
      const visits = sceneVisits.get(sceneId) || 0;
      return visits > 2 || (count > 3 && visits > 1);
    })
    .sort((a, b) => (sceneVisits.get(b[0]) || 0) - (sceneVisits.get(a[0]) || 0));

  // Check premature reveals (scenes with isClueOrReveal appearing in the first 25% of timeline)
  const prematureReveals = shots.filter((shot, idx) => {
    const sc = scenes.find((s) => s.sceneId === shot.sceneId);
    return sc?.isClueOrReveal && idx < Math.floor(shots.length * 0.25);
  });

  const screenshotCount = shots.filter((s) => (s.isScreenshot || s.presentationType === 'screenshot') && !s.isLocked).length;
  const totalScreenshots = shots.filter((s) => s.isScreenshot || s.presentationType === 'screenshot').length;
  const lockedCount = shots.filter((s) => s.isLocked).length;
  const unlockedCount = shots.filter((s) => !s.isLocked).length;
  const unmatchedCount = shots.filter((s) => s.isUnmatched || s.sceneId === 'unmatched' || s.matchScore === 0).length;

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div>
        <h2 style={{ fontSize: '1.3rem', fontWeight: 800, color: '#fff', marginBottom: '4px' }}>
          Editorial Review, Precision Matching & Verification
        </h2>
        <p style={{ fontSize: '0.86rem', color: '#94a3b8' }}>
          Audit opening 120s narration synchronization, configure creative presentation presets, and inspect flagged shots before final master render.
        </p>
      </div>

      {/* ── Centralized Timeline Validator Quality Gate Banner ── */}
      {project?.qualityReport && (
        <div
          className="mex-card"
          style={{
            border: `1px solid ${
              project.qualityReport.validationOutcome === 'BLOCKED'
                ? '#ef4444'
                : project.qualityReport.validationOutcome === 'REVIEW REQUIRED' || project.qualityReport.validationOutcome === 'REVIEW_REQUIRED'
                ? '#f59e0b'
                : '#10b981'
            }`,
            background:
              project.qualityReport.validationOutcome === 'BLOCKED'
                ? 'rgba(239,68,68,0.1)'
                : project.qualityReport.validationOutcome === 'REVIEW REQUIRED' || project.qualityReport.validationOutcome === 'REVIEW_REQUIRED'
                ? 'rgba(245,158,11,0.08)'
                : 'rgba(16,185,129,0.08)',
          }}
        >
          <div className="mex-card-header">
            <div className="mex-card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '1.2rem' }}>
                {project.qualityReport.validationOutcome === 'BLOCKED'
                  ? '🛑'
                  : project.qualityReport.validationOutcome === 'REVIEW REQUIRED' || project.qualityReport.validationOutcome === 'REVIEW_REQUIRED'
                  ? '⚠️'
                  : '✅'}
              </span>
              <span>Centralized Timeline Validator:</span>
              <span
                style={{
                  fontWeight: 800,
                  fontSize: '0.86rem',
                  padding: '3px 10px',
                  borderRadius: '6px',
                  background:
                    project.qualityReport.validationOutcome === 'BLOCKED'
                      ? '#ef4444'
                      : project.qualityReport.validationOutcome === 'REVIEW REQUIRED' || project.qualityReport.validationOutcome === 'REVIEW_REQUIRED'
                      ? '#f59e0b'
                      : '#10b981',
                  color: '#fff',
                }}
              >
                {project.qualityReport.validationOutcome || (project.qualityReport.passed ? 'PASS' : 'BLOCKED')}
              </span>
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              {validationSuccessMsg && (
                <span style={{ fontSize: '0.78rem', color: '#10b981' }}>{validationSuccessMsg}</span>
              )}
              {(project.qualityReport.screenshotCadenceViolationsCount || 0) > 0 && (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={async () => {
                    await enforceScreenshotCadence();
                  }}
                  title="Automatically inserts moving screenshots every 4-5 clips to satisfy YouTube pacing & quality rules"
                >
                  ⚡ Auto-Fix Cadence
                </Button>
              )}
              <Button
                variant="secondary"
                size="sm"
                loading={isValidatingTimeline}
                onClick={handleRevalidateTimeline}
              >
                🔄 Revalidate Timeline
              </Button>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '10px', margin: '12px 0' }}>
            <div style={{ background: 'rgba(0,0,0,0.3)', padding: '10px', borderRadius: '6px', textAlign: 'center' }}>
              <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>Readiness Score</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#38bdf8' }}>{project.qualityReport.overallReadinessScore}%</div>
            </div>
            <div style={{ background: 'rgba(0,0,0,0.3)', padding: '10px', borderRadius: '6px', textAlign: 'center' }}>
              <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>Duplicate Scenes</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 800, color: (project.qualityReport.duplicateScenesCount || 0) > 0 ? '#ef4444' : '#10b981' }}>
                {project.qualityReport.duplicateScenesCount || 0}
              </div>
            </div>
            <div style={{ background: 'rgba(0,0,0,0.3)', padding: '10px', borderRadius: '6px', textAlign: 'center' }}>
              <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>Near-Duplicate Footage</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 800, color: (project.qualityReport.nearDuplicateFootageCount || 0) > 0 ? '#f59e0b' : '#10b981' }}>
                {project.qualityReport.nearDuplicateFootageCount || 0}
              </div>
            </div>
            <div style={{ background: 'rgba(0,0,0,0.3)', padding: '10px', borderRadius: '6px', textAlign: 'center' }}>
              <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>Clip Duration &gt; 3.0s</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 800, color: (project.qualityReport.maxDurationViolationsCount || 0) > 0 ? '#ef4444' : '#10b981' }}>
                {project.qualityReport.maxDurationViolationsCount || 0}
              </div>
            </div>
            <div style={{ background: 'rgba(0,0,0,0.3)', padding: '10px', borderRadius: '6px', textAlign: 'center' }}>
              <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>Cadence Violations</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 800, color: (project.qualityReport.screenshotCadenceViolationsCount || 0) > 0 ? '#ef4444' : '#10b981' }}>
                {project.qualityReport.screenshotCadenceViolationsCount || 0}
              </div>
            </div>
          </div>

          {/* Blocked Reasons list */}
          {project.qualityReport.blockedReasons && project.qualityReport.blockedReasons.length > 0 && (
            <div style={{ marginTop: '10px', background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '6px', padding: '10px' }}>
              <div style={{ fontWeight: 700, fontSize: '0.8rem', color: '#ef4444', marginBottom: '6px' }}>
                🛑 Mandatory Export Blockers (Rendering is disabled until resolved):
              </div>
              <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '0.78rem', color: '#fca5a5' }}>
                {project.qualityReport.blockedReasons.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Review Reasons list */}
          {project.qualityReport.reviewReasons && project.qualityReport.reviewReasons.length > 0 && (
            <div style={{ marginTop: '10px', background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: '6px', padding: '10px' }}>
              <div style={{ fontWeight: 700, fontSize: '0.8rem', color: '#f59e0b', marginBottom: '6px' }}>
                ⚠️ Review Recommended Items:
              </div>
              <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '0.78rem', color: '#fde68a' }}>
                {project.qualityReport.reviewReasons.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* ── Visual Storyboard & Narration-to-Scene Matching Review ── */}
      <div className="mex-card" style={{ border: '1px solid rgba(168,85,247,0.3)', background: 'rgba(15,23,42,0.85)' }}>
        <div className="mex-card-header">
          <div className="mex-card-title">
            <span>🎬</span>
            <span>Visual Storyboard & Narration-to-Scene Matching Review</span>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <span style={{ fontSize: '0.78rem', color: '#a855f7' }}>
              {project?.script?.segments?.length || 0} Narration Beats
            </span>
            <div style={{ display: 'flex', gap: '4px' }}>
              {(['all', 'flagged', 'low_confidence', 'screenshots'] as const).map((filter) => (
                <button
                  key={filter}
                  onClick={() => setStoryboardFilter(filter)}
                  style={{
                    fontSize: '0.72rem',
                    padding: '2px 8px',
                    borderRadius: '4px',
                    border: 'none',
                    background: storyboardFilter === filter ? '#a855f7' : 'rgba(255,255,255,0.08)',
                    color: storyboardFilter === filter ? '#fff' : '#94a3b8',
                    cursor: 'pointer',
                    fontWeight: storyboardFilter === filter ? 700 : 500,
                  }}
                >
                  {filter === 'all'
                    ? 'All'
                    : filter === 'flagged'
                    ? '⚠️ Flagged'
                    : filter === 'low_confidence'
                    ? '🔍 Low-Conf'
                    : '🖼️ Screenshots'}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Quick Batch Actions Toolbar */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '8px',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(168,85,247,0.25)',
            borderRadius: '6px',
            padding: '10px 12px',
            marginTop: '12px',
          }}
        >
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            <Button
              variant="primary"
              size="sm"
              loading={isAcceptingAllScreenshots}
              onClick={handleAcceptAllScreenshots}
              title="Accept and approve all screenshots across the entire timeline in one click without checking each one manually"
            >
              ✓ Accept All Screenshots ({screenshotCount})
            </Button>

            <Button
              variant="secondary"
              size="sm"
              loading={isAcceptingAllMatches}
              onClick={handleAcceptAllMatches}
              title="Accept and approve all valid scene matches across the timeline"
            >
              ✓ Accept All Matches ({unlockedCount})
            </Button>

            {unmatchedCount > 0 && (
              <Button
                variant="secondary"
                size="sm"
                loading={isConvertingUnmatched}
                onClick={handleConvertUnmatchedToScreenshots}
                title="Convert all missing/unmatched footage into moving Ken Burns screenshots"
              >
                🖼️ Convert Unmatched to Screenshots ({unmatchedCount})
              </Button>
            )}

            <Button
              variant="ghost"
              size="sm"
              loading={isAutoReviewing}
              onClick={handleAutoReviewAndApprove}
              title="Automatically review, resolve unmatched gaps, approve all compliant shots, and update Quality Gate"
              style={{ color: '#38bdf8', borderColor: 'rgba(56,189,248,0.3)', background: 'rgba(56,189,248,0.1)' }}
            >
              ⚡ Auto-Review & Approve (100% Quality)
            </Button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.78rem' }}>
            <span style={{ color: '#94a3b8' }}>
              🔒 <strong style={{ color: '#10b981' }}>{lockedCount}</strong> / {shots.length} Approved ({totalScreenshots} Screenshots)
            </span>
            {bulkActionSuccessMsg && (
              <span style={{ color: '#10b981', fontWeight: 700 }}>
                {bulkActionSuccessMsg}
              </span>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '12px' }}>
          {(project?.script?.segments || []).filter((seg) => {
            const shot = shots.find((s) => 
              s.segmentId === seg.segmentId || 
              (s.segmentId && seg.segmentId && s.segmentId.includes(seg.segmentId)) ||
              (seg.selectedShotId && s.shotId === seg.selectedShotId)
            );
            if (storyboardFilter === 'flagged') return shot?.duplicateWarning || shot?.isLowConfidence || shot?.isUnmatched;
            if (storyboardFilter === 'low_confidence') return shot?.isLowConfidence || (shot?.confidence || 0) < 0.48;
            if (storyboardFilter === 'screenshots') return shot?.isScreenshot || shot?.presentationType === 'screenshot';
            return true;
          }).map((seg, idx) => {
            const shot = shots.find((s) => 
              s.segmentId === seg.segmentId || 
              (s.segmentId && seg.segmentId && s.segmentId.includes(seg.segmentId)) ||
              (seg.selectedShotId && s.shotId === seg.selectedShotId) ||
              (s.timelineStart <= seg.voiceoverStart + 0.05 && s.timelineEnd >= seg.voiceoverEnd - 0.05)
            ) || shots[idx];
            const scene = scenes.find((s) => s.sceneId === (shot?.sceneId || seg.selectedSceneId));
            const isAlternativesOpen = expandedAlternativesSegmentId === seg.segmentId;

            return (
              <div
                key={seg.segmentId}
                style={{
                  background: 'rgba(0,0,0,0.4)',
                  border: `1px solid ${
                    shot?.duplicateWarning
                      ? 'rgba(239,68,68,0.4)'
                      : shot?.isLowConfidence
                      ? 'rgba(245,158,11,0.3)'
                      : 'rgba(255,255,255,0.08)'
                  }`,
                  borderRadius: '8px',
                  padding: '12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                }}
              >
                {/* Segment Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '0.78rem', fontWeight: 800, color: '#38bdf8' }}>
                      #{idx + 1}
                    </span>
                    <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                      ⏱️ {seg.voiceoverStart.toFixed(1)}s – {seg.voiceoverEnd.toFixed(1)}s ({(seg.voiceoverEnd - seg.voiceoverStart).toFixed(1)}s)
                    </span>
                    {seg.referencedCharacters && seg.referencedCharacters.length > 0 && (
                      <span style={{ fontSize: '0.72rem', background: 'rgba(56,189,248,0.15)', color: '#38bdf8', padding: '1px 6px', borderRadius: '4px' }}>
                        👤 {seg.referencedCharacters.join(', ')}
                      </span>
                    )}
                    {seg.storyEventOrAction && (
                      <span style={{ fontSize: '0.72rem', background: 'rgba(168,85,247,0.15)', color: '#c084fc', padding: '1px 6px', borderRadius: '4px' }}>
                        ⚡ {seg.storyEventOrAction}
                      </span>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    {shot?.presentationType === 'screenshot' || shot?.isScreenshot ? (
                      <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '2px 6px', borderRadius: '4px', background: 'rgba(168,85,247,0.2)', color: '#c084fc' }}>
                        🖼️ Screenshot ({shot.motionEffect || 'pan_left_to_right'})
                      </span>
                    ) : (
                      <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '2px 6px', borderRadius: '4px', background: 'rgba(59,130,246,0.2)', color: '#60a5fa' }}>
                        🎬 Video Clip ({(shot?.duration || 0).toFixed(1)}s)
                      </span>
                    )}

                    <span
                      style={{
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        padding: '2px 6px',
                        borderRadius: '4px',
                        background:
                          (shot?.confidence || seg.confidenceScore || 0) >= 0.7
                            ? 'rgba(16,185,129,0.2)'
                            : (shot?.confidence || seg.confidenceScore || 0) >= 0.48
                            ? 'rgba(245,158,11,0.2)'
                            : 'rgba(239,68,68,0.2)',
                        color:
                          (shot?.confidence || seg.confidenceScore || 0) >= 0.7
                            ? '#10b981'
                            : (shot?.confidence || seg.confidenceScore || 0) >= 0.48
                            ? '#f59e0b'
                            : '#ef4444',
                      }}
                    >
                      {Math.round((shot?.confidence || seg.confidenceScore || 0) * 100)}% Conf
                    </span>

                    {shot?.isLocked && (
                      <span style={{ fontSize: '0.72rem', color: '#10b981' }}>🔒 Approved</span>
                    )}
                  </div>
                </div>

                {/* Spoken Narration Text */}
                <div style={{ fontSize: '0.86rem', color: '#f1f5f9', fontStyle: 'italic', background: 'rgba(255,255,255,0.03)', padding: '8px 10px', borderRadius: '4px' }}>
                  "{seg.text}"
                </div>

                {/* Warnings if any */}
                {shot?.duplicateWarning && (
                  <div style={{ fontSize: '0.75rem', color: '#ef4444', background: 'rgba(239,68,68,0.1)', padding: '4px 8px', borderRadius: '4px' }}>
                    ⚠️ {shot.duplicateWarning}
                  </div>
                )}

                {/* Selected Visual Details & Actions */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {scene?.thumbnailUrl ? (
                      <img
                        src={scene.thumbnailUrl}
                        alt={scene.sceneId}
                        style={{ width: '70px', height: '40px', objectFit: 'cover', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.1)' }}
                      />
                    ) : (
                      <div style={{ width: '70px', height: '40px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', color: '#64748b' }}>
                        {shot?.sceneId || 'No visual'}
                      </div>
                    )}
                    <div>
                      <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#e2e8f0' }}>
                        Source: {shot?.sceneId || seg.selectedSceneId || 'unmatched'}
                        {scene && ` (${scene.startTime.toFixed(1)}s – ${scene.endTime.toFixed(1)}s)`}
                      </div>
                      <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                        {shot?.whyThisScene?.fullSummary || scene?.description || 'Synchronized narrative evidence'}
                      </div>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => seekTo(seg.voiceoverStart)}
                      title="Seek playhead to this narration beat"
                    >
                      ▶️ Play
                    </Button>

                    {shot && !shot.isLocked && (
                      <Button
                        variant="primary"
                        size="sm"
                        loading={acceptingShotId === shot.shotId}
                        onClick={() => handleAcceptMatch(shot.shotId)}
                        title="Accept and lock this scene match"
                      >
                        ✓ Accept
                      </Button>
                    )}

                    <Button
                      variant="secondary"
                      size="sm"
                      loading={convertingShotId === (shot?.shotId || seg.segmentId)}
                      onClick={() => handleConvertToScreenshot(shot?.shotId || seg.selectedShotId || seg.segmentId, 'pan_left_to_right')}
                      title="Convert to moving screenshot with pan effect"
                    >
                      🖼️ To Screenshot
                    </Button>

                    <Button
                      variant="ghost"
                      size="sm"
                      loading={recheckingSegmentId === seg.segmentId}
                      onClick={() => handleRecheckSegment(seg.segmentId)}
                      title="Re-run semantic scene matcher for this beat"
                    >
                      🔄 Recheck
                    </Button>

                    {shot && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openAlternativesModal(shot.shotId)}
                        title="Choose alternative scene candidates"
                      >
                        🔀 Alternatives
                      </Button>
                    )}

                    {seg.candidateAlternatives && seg.candidateAlternatives.length > 0 && (
                      <button
                        onClick={() => setExpandedAlternativesSegmentId(isAlternativesOpen ? null : seg.segmentId)}
                        style={{
                          fontSize: '0.72rem',
                          background: 'none',
                          border: 'none',
                          color: '#38bdf8',
                          cursor: 'pointer',
                          padding: '4px',
                        }}
                      >
                        {isAlternativesOpen ? '▲ Hide Alts' : `▼ ${seg.candidateAlternatives.length} Alts`}
                      </button>
                    )}
                  </div>
                </div>

                {/* Candidate Alternatives Tray */}
                {isAlternativesOpen && seg.candidateAlternatives && (
                  <div style={{ background: 'rgba(0,0,0,0.3)', padding: '8px', borderRadius: '6px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#94a3b8' }}>
                      Alternative Scene Candidates:
                    </div>
                    {seg.candidateAlternatives.map((alt, aIdx) => (
                      <div
                        key={aIdx}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          fontSize: '0.74rem',
                          padding: '4px 6px',
                          background: 'rgba(255,255,255,0.02)',
                          borderRadius: '4px',
                        }}
                      >
                        <span style={{ color: '#e2e8f0' }}>
                          <strong>{alt.sceneId}</strong> ({alt.startTime.toFixed(1)}s – {alt.endTime.toFixed(1)}s) • Score: {alt.score}%
                        </span>
                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                          <span style={{ color: '#64748b', fontSize: '0.7rem' }}>{alt.reason}</span>
                          {shot && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => useMovieExplanationStore.getState().replaceShot(shot.shotId, alt.sceneId)}
                            >
                              Select
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Section 1: Opening 120-Second Precision Narration & Visual Audit ── */}
      <div className="mex-card" style={{ border: '1px solid rgba(59,130,246,0.3)', background: 'rgba(15,23,42,0.85)' }}>
        <div className="mex-card-header">
          <div className="mex-card-title">
            <span>⏱️</span>
            <span>Opening 120-Second Precision Narration & Visual Audit</span>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {openingReport && (
              <span
                style={{
                  fontSize: '0.78rem',
                  padding: '3px 8px',
                  borderRadius: '4px',
                  fontWeight: 600,
                  background: openingReport.hasInitialBlackGap ? 'rgba(239,68,68,0.2)' : 'rgba(16,185,129,0.2)',
                  color: openingReport.hasInitialBlackGap ? '#ef4444' : '#10b981',
                }}
              >
                {openingReport.hasInitialBlackGap
                  ? `⚠️ ${openingReport.initialBlackDuration.toFixed(1)}s Opening Black Gap`
                  : '✓ Zero Opening Gap (Starts 0.000s)'}
              </span>
            )}
            <Button
              variant="ghost"
              size="sm"
              loading={isLoadingOpeningReport}
              onClick={() => fetchOpeningReport()}
            >
              🔄 Refresh Audit
            </Button>
            <Button
              variant="primary"
              size="sm"
              loading={isGeneratingOpeningPreview}
              onClick={() => generateOpeningPreview(120)}
            >
              ⚡ Preview First 120s Video
            </Button>
          </div>
        </div>

        {/* Opening preview video player if rendered */}
        {project?.openingPreviewVideoUrl && (
          <div style={{ marginBottom: '16px', borderRadius: '8px', overflow: 'hidden', border: '1px solid rgba(59,130,246,0.3)' }}>
            <div style={{ padding: '8px 12px', background: 'rgba(30,41,59,0.8)', fontSize: '0.8rem', fontWeight: 600, color: '#93c5fd' }}>
              🎥 Opening 120s High-Precision Preview (Streamed directly from local render)
            </div>
            <video
              controls
              src={project.openingPreviewVideoUrl}
              style={{ width: '100%', maxHeight: '360px', background: '#000', display: 'block' }}
            />
          </div>
        )}

        {/* Opening report details */}
        {openingReport ? (
          <div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '12px',
                marginBottom: '16px',
                padding: '12px',
                background: 'rgba(0,0,0,0.25)',
                borderRadius: '8px',
              }}
            >
              <div>
                <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>First Frame Timestamp</div>
                <div style={{ fontSize: '0.95rem', fontWeight: 700, color: openingReport.firstFrameTimestamp === 0 ? '#10b981' : '#f59e0b' }}>
                  {openingReport.firstFrameTimestamp.toFixed(3)}s {openingReport.firstFrameTimestamp === 0 ? '(Frame Accurate Zero-Point)' : ''}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Verified Narration Beats</div>
                <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#fff' }}>
                  {openingReport.narrationUnits.length} sentences audited
                </div>
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Export Gate Status</div>
                <div style={{ fontSize: '0.95rem', fontWeight: 700, color: openingReport.isReadyForFullExport ? '#10b981' : '#f59e0b' }}>
                  {openingReport.isReadyForFullExport ? '✓ Ready for Master Render' : '⚠ Issues Flagged'}
                </div>
              </div>
            </div>

            {/* Sentence-by-sentence verification table */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {openingReport.narrationUnits.map((unit, idx) => (
                <div
                  key={idx}
                  style={{
                    background: 'rgba(0,0,0,0.3)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: '8px',
                    padding: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '14px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1 }}>
                    {unit.selectedShot.thumbnailUrl ? (
                      <img
                        src={unit.selectedShot.thumbnailUrl}
                        alt="Scene thumbnail"
                        style={{ width: '80px', height: '45px', objectFit: 'cover', borderRadius: '4px', background: '#000' }}
                      />
                    ) : (
                      <div style={{ width: '80px', height: '45px', background: '#1e293b', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', color: '#64748b' }}>
                        No Thumb
                      </div>
                    )}
                    <div>
                      <div style={{ fontSize: '0.86rem', fontWeight: 600, color: '#fff', marginBottom: '2px' }}>
                        "{unit.text}"
                      </div>
                      <div style={{ fontSize: '0.76rem', color: '#94a3b8', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                        <span>⏱️ Timeline: <strong>{unit.voiceoverStart.toFixed(1)}s – {unit.voiceoverEnd.toFixed(1)}s</strong></span>
                        <span>🎬 Scene: <strong>{unit.selectedShot.sceneId}</strong> ({unit.selectedShot.sourceStart.toFixed(1)}s – {unit.selectedShot.sourceEnd.toFixed(1)}s)</span>
                        <span>🎯 Concept: {unit.intendedVisualConcept}</span>
                      </div>
                      <div style={{ fontSize: '0.74rem', color: '#cbd5e1', marginTop: '3px' }}>
                        🔍 Evidence: {unit.evidenceSummary}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px' }}>
                    <span
                      style={{
                        fontSize: '0.74rem',
                        fontWeight: 700,
                        padding: '2px 8px',
                        borderRadius: '4px',
                        background: unit.matchConfidence >= 0.7 ? 'rgba(16,185,129,0.2)' : 'rgba(245,158,11,0.2)',
                        color: unit.matchConfidence >= 0.7 ? '#10b981' : '#f59e0b',
                      }}
                    >
                      {Math.round(unit.matchConfidence * 100)}% Match
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openAlternativesModal(unit.selectedShot.shotId)}
                    >
                      Swap Candidate ({unit.candidateAlternatives?.length || 0})
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div style={{ color: '#94a3b8', fontSize: '0.84rem' }}>
            {isLoadingOpeningReport ? 'Auditing opening 120 seconds...' : 'Click "Refresh Audit" to analyze opening scene matches and timestamp mappings.'}
          </div>
        )}
      </div>

      {/* ── Section 2: Transformative Presentation & Creative Editing Controls ── */}
      <div className="mex-card" style={{ border: '1px solid rgba(255,255,255,0.1)' }}>
        <div className="mex-card-header">
          <div className="mex-card-title">
            <span>🎨</span>
            <span>Transformative Presentation & Creative Editing Controls</span>
          </div>
          <span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>
            Preset: <strong style={{ color: '#fff' }}>{selectedPreset}</strong> ({playbackSpeed.toFixed(2)}x)
          </span>
        </div>

        {/* Disclaimer Notice */}
        <div
          style={{
            background: 'rgba(59,130,246,0.08)',
            border: '1px solid rgba(59,130,246,0.25)',
            borderRadius: '6px',
            padding: '10px 14px',
            marginBottom: '16px',
            fontSize: '0.78rem',
            color: '#bfdbfe',
            lineHeight: 1.45,
          }}
        >
          <strong>Editorial & Legal Notice:</strong> Transformative editing controls (crop, color grading, mirroring, BGM ducking) are creative tools for visual commentary, accessibility, and narrative pacing. <strong>They do NOT guarantee Content ID bypass or fair use qualification.</strong> Ensure your video incorporates original narration, substantive analysis, commentary, or properly licensed source media.
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px', marginBottom: '16px' }}>
          {/* Creative Preset Selector */}
          <div>
            <label style={{ display: 'block', fontSize: '0.80rem', fontWeight: 600, color: '#cbd5e1', marginBottom: '6px' }}>
              Color & Presentation Preset
            </label>
            <select
              value={selectedPreset}
              onChange={(e) => setSelectedPreset(e.target.value as CreativePresetType)}
              style={{
                width: '100%',
                padding: '8px 10px',
                borderRadius: '6px',
                background: '#1e293b',
                color: '#fff',
                border: '1px solid rgba(255,255,255,0.15)',
                fontSize: '0.84rem',
              }}
            >
              <option value="neutral">Neutral Profile (1.00x, Original Pacing, 0% Color Shift) — Default</option>
              <option value="subtle_cinema">Subtle Cinema (Contrast 1.04, Warm Cinematic Tint)</option>
              <option value="vibrant_commentary">Vibrant Commentary (Saturation 1.12, Crisp Highlights)</option>
              <option value="dramatic_contrast">Dramatic Contrast (Contrast 1.10, Deep Shadows)</option>
            </select>
          </div>

          {/* Temporal Speed Adjustment */}
          <div>
            <label style={{ display: 'block', fontSize: '0.80rem', fontWeight: 600, color: '#cbd5e1', marginBottom: '6px' }}>
              Playback Speed Multiplier ({playbackSpeed.toFixed(2)}x)
            </label>
            <input
              type="range"
              min="0.95"
              max="1.05"
              step="0.01"
              value={playbackSpeed}
              onChange={(e) => setPlaybackSpeed(parseFloat(e.target.value))}
              style={{ width: '100%' }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.70rem', color: '#64748b', marginTop: '2px' }}>
              <span>0.95x (Pacing Slow)</span>
              <span style={{ color: playbackSpeed === 1.0 ? '#10b981' : '#f59e0b', fontWeight: 600 }}>1.00x (Neutral Sync)</span>
              <span>1.05x (Brisk Pacing)</span>
            </div>
          </div>

          {/* Horizontal Mirroring */}
          <div>
            <label style={{ display: 'block', fontSize: '0.80rem', fontWeight: 600, color: '#cbd5e1', marginBottom: '6px' }}>
              Horizontal Mirroring (Flip)
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.82rem', color: '#fff' }}>
              <input
                type="checkbox"
                checked={horizontalFlip}
                onChange={(e) => setHorizontalFlip(e.target.checked)}
              />
              <span>Enable Horizontal Flip (Reverses frame orientation)</span>
            </label>
            <div style={{ fontSize: '0.70rem', color: '#f59e0b', marginTop: '4px' }}>
              ⚠️ Caution: Mirroring reverses on-screen text, signs, logos, and badges.
            </div>
          </div>

          {/* Audio Mixing & BGM Ducking */}
          <div>
            <label style={{ display: 'block', fontSize: '0.80rem', fontWeight: 600, color: '#cbd5e1', marginBottom: '6px' }}>
              Audio Track Levels & Ducking
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.76rem' }}>
                <span style={{ color: '#94a3b8' }}>Voiceover Narration:</span>
                <span style={{ color: '#fff', fontWeight: 600 }}>{Math.round(voiceoverVol * 100)}%</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.76rem' }}>
                <span style={{ color: '#94a3b8' }}>Background Music (BGM):</span>
                <span style={{ color: '#fff', fontWeight: 600 }}>{Math.round(bgmVol * 100)}% (Ducks under speech)</span>
              </div>
              <input
                type="range"
                min="0.0"
                max="0.30"
                step="0.02"
                value={bgmVol}
                onChange={(e) => setBgmVol(parseFloat(e.target.value))}
                style={{ width: '100%' }}
              />
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            {settingsSavedMessage && (
              <span style={{ fontSize: '0.80rem', color: '#10b981', fontWeight: 600 }}>
                {settingsSavedMessage}
              </span>
            )}
          </div>
          <Button
            variant="primary"
            size="sm"
            loading={isSavingSettings}
            onClick={handleSaveSettings}
          >
            💾 Save Creative Settings
          </Button>
        </div>
      </div>

      {/* ── Section 3: Asset Rights & Pre-Export Clearance Audit ── */}
      <div className="mex-card" style={{ border: '1px solid rgba(16,185,129,0.3)', background: 'rgba(15,23,42,0.9)' }}>
        <div className="mex-card-header">
          <div className="mex-card-title">
            <span>🛡️</span>
            <span>Asset Rights & Pre-Export Clearance Audit</span>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <Button
              variant="ghost"
              size="sm"
              loading={isLoadingRightsReview}
              onClick={() => fetchRightsReview()}
            >
              🔄 Refresh Rights Audit
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                if (project?.projectId) {
                  window.open(api.getProvenanceManifestDownloadUrl(project.projectId, 'csv'), '_blank');
                }
              }}
              title="Download asset provenance and rights manifest as CSV"
            >
              📥 Provenance CSV
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                if (project?.projectId) {
                  window.open(api.getProvenanceManifestDownloadUrl(project.projectId, 'json'), '_blank');
                }
              }}
              title="Download complete asset provenance manifest as JSON"
            >
              📥 Provenance JSON
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowAttributionBox(!showAttributionBox)}
            >
              {showAttributionBox ? 'Hide Attribution' : '📋 Description Attribution'}
            </Button>
          </div>
        </div>

        {/* Legal and workflow notice */}
        <div
          style={{
            background: 'rgba(59,130,246,0.08)',
            border: '1px solid rgba(59,130,246,0.25)',
            borderRadius: '6px',
            padding: '10px 14px',
            marginBottom: '16px',
            fontSize: '0.78rem',
            color: '#bfdbfe',
            lineHeight: 1.45,
          }}
        >
          <strong>Pre-Export Rights Review:</strong> Flags unverified or restricted assets before export so you can replace footage you lack permission to use. <em>This tool assists your rights management workflow but does not automatically declare a video legal, infringing, fair use, or Content ID safe.</em>
        </div>

        {/* Rights Metrics Grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: '12px',
            marginBottom: '16px',
            padding: '14px',
            background: 'rgba(0,0,0,0.3)',
            borderRadius: '8px',
          }}
        >
          <div>
            <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>Total Visual Timeline Shots</div>
            <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#fff' }}>
              {rightsReview?.totalShots ?? shots.length}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>Verified / Cleared Assets</div>
            <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#10b981' }}>
              {(rightsReview?.ownedShotsCount || 0) + (rightsReview?.licensedShotsCount || 0) + (rightsReview?.permissionGrantedCount || 0) + (rightsReview?.publicDomainCount || 0)}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>Unverified Footage</div>
            <div style={{ fontSize: '1.1rem', fontWeight: 800, color: (rightsReview?.unverifiedShotsCount ?? 0) > 0 ? '#fbbf24' : '#10b981' }}>
              {rightsReview?.unverifiedShotsCount ?? 0}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>Restricted Footage</div>
            <div style={{ fontSize: '1.1rem', fontWeight: 800, color: (rightsReview?.restrictedShotsCount ?? 0) > 0 ? '#ef4444' : '#10b981' }}>
              {rightsReview?.restrictedShotsCount ?? 0}
            </div>
          </div>
        </div>

        {/* Attribution Helper Drawer */}
        {showAttributionBox && (
          <div
            style={{
              marginBottom: '16px',
              padding: '12px',
              background: 'rgba(0,0,0,0.4)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '8px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <span style={{ fontSize: '0.80rem', fontWeight: 700, color: '#fff' }}>
                YouTube Video Description Credits & Attribution:
              </span>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                {copyAttributionMessage && (
                  <span style={{ fontSize: '0.75rem', color: '#10b981', fontWeight: 600 }}>
                    {copyAttributionMessage}
                  </span>
                )}
                <Button variant="primary" size="sm" onClick={handleCopyAttribution}>
                  Copy Attribution
                </Button>
              </div>
            </div>
            <textarea
              readOnly
              rows={5}
              value={generateAttributionText()}
              style={{
                width: '100%',
                background: '#0f172a',
                color: '#cbd5e1',
                border: '1px solid rgba(255,255,255,0.15)',
                borderRadius: '6px',
                padding: '8px 10px',
                fontSize: '0.76rem',
                fontFamily: 'monospace',
                resize: 'none',
              }}
            />
          </div>
        )}

        {/* Flagged Shots List or All Clear Banner */}
        {rightsReview && (rightsReview.flaggedShotIds?.length || 0) > 0 ? (
          <div>
            <div style={{ fontWeight: 700, fontSize: '0.84rem', color: '#fbbf24', marginBottom: '8px' }}>
              ⚠️ Flagged Shots Requiring Review or Replacement ({rightsReview.flaggedShotIds.length}):
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '420px', overflowY: 'auto' }}>
              {shots
                .filter((s) => rightsReview.flaggedShotIds.includes(s.shotId))
                .map((shot) => {
                  const isEditing = editingRightsShotId === shot.shotId;
                  const status = shot.rightsMetadata?.rightsStatus || 'unverified';

                  return (
                    <div
                      key={shot.shotId}
                      style={{
                        background: 'rgba(0,0,0,0.3)',
                        border: `1px solid ${status === 'restricted' ? 'rgba(239,68,68,0.4)' : 'rgba(245,158,11,0.3)'}`,
                        borderRadius: '8px',
                        padding: '10px 14px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <span
                            style={{
                              fontSize: '0.72rem',
                              fontWeight: 700,
                              padding: '2px 8px',
                              borderRadius: '4px',
                              background: status === 'restricted' ? 'rgba(239,68,68,0.2)' : 'rgba(245,158,11,0.2)',
                              color: status === 'restricted' ? '#ef4444' : '#fbbf24',
                              textTransform: 'uppercase',
                            }}
                          >
                            {status}
                          </span>
                          <span style={{ fontWeight: 700, fontSize: '0.86rem', color: '#fff' }}>
                            Shot {shot.shotId} ({shot.sceneId})
                          </span>
                          <span style={{ fontSize: '0.76rem', color: '#94a3b8' }}>
                            ⏱️ {shot.timelineStart.toFixed(1)}s – {shot.timelineEnd.toFixed(1)}s ({shot.duration.toFixed(1)}s)
                          </span>
                        </div>

                        <div style={{ display: 'flex', gap: '6px' }}>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleStartEditRights(shot)}
                          >
                            ✏️ Edit Rights
                          </Button>
                          <Button
                            variant="primary"
                            size="sm"
                            onClick={() => openAlternativesModal(shot.shotId)}
                          >
                            🛡️ Replace with Licensed Asset
                          </Button>
                        </div>
                      </div>

                      <div style={{ fontSize: '0.76rem', color: '#cbd5e1' }}>
                        <strong>Source / Ref:</strong> {shot.rightsMetadata?.sourceFilename || shot.sceneId} • <strong>Category:</strong> {shot.replacementSource ? 'Replacement Visual' : 'Movie Source'}
                        {shot.rightsMetadata?.usageRestrictions && (
                          <div style={{ color: '#fde68a', marginTop: '2px' }}>
                            💡 {shot.rightsMetadata.usageRestrictions}
                          </div>
                        )}
                      </div>

                      {/* Inline Rights Editor if active for this shot */}
                      {isEditing && (
                        <div
                          style={{
                            background: 'rgba(30,41,59,0.8)',
                            borderRadius: '6px',
                            padding: '10px',
                            border: '1px solid rgba(255,255,255,0.1)',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '8px',
                          }}
                        >
                          <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#38bdf8' }}>
                            Update Rights Clearance for Shot {shot.shotId}
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '8px' }}>
                            <div>
                              <label style={{ fontSize: '0.70rem', color: '#94a3b8' }}>Status:</label>
                              <select
                                value={editingRightsStatus}
                                onChange={(e) => setEditingRightsStatus(e.target.value as AssetRightsStatus)}
                                style={{ width: '100%', padding: '4px 6px', background: '#0f172a', color: '#fff', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '4px', fontSize: '0.76rem' }}
                              >
                                <option value="owned">Owned (Creator Original)</option>
                                <option value="licensed">Licensed (Stock Media / Paid License)</option>
                                <option value="permission_granted">Permission Granted (Written Approval)</option>
                                <option value="public_domain">Public Domain / CC0</option>
                                <option value="unverified">Unverified (Flagged)</option>
                                <option value="restricted">Restricted (Do Not Use)</option>
                              </select>
                            </div>
                            <div>
                              <label style={{ fontSize: '0.70rem', color: '#94a3b8' }}>License / Proof ID:</label>
                              <input
                                type="text"
                                value={editingLicenseDetails}
                                onChange={(e) => setEditingLicenseDetails(e.target.value)}
                                placeholder="e.g. Envato #1234, Storyblocks #5678"
                                style={{ width: '100%', padding: '4px 6px', background: '#0f172a', color: '#fff', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '4px', fontSize: '0.76rem' }}
                              />
                            </div>
                            <div>
                              <label style={{ fontSize: '0.70rem', color: '#94a3b8' }}>Attribution Requirements:</label>
                              <input
                                type="text"
                                value={editingAttributionReqs}
                                onChange={(e) => setEditingAttributionReqs(e.target.value)}
                                placeholder="e.g. Stock courtesy of..."
                                style={{ width: '100%', padding: '4px 6px', background: '#0f172a', color: '#fff', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '4px', fontSize: '0.76rem' }}
                              />
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '4px' }}>
                            <Button variant="ghost" size="sm" onClick={() => setEditingRightsShotId(null)}>
                              Cancel
                            </Button>
                            <Button variant="primary" size="sm" loading={isUpdatingShotRights} onClick={handleSaveRights}>
                              Save Clearance Metadata
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          </div>
        ) : (
          <div style={{ color: '#10b981', fontSize: '0.84rem' }}>
            ✓ All visual assets have verified clearance metadata. No unverified or restricted assets detected.
          </div>
        )}

        {/* Rights Warning Acknowledgement Box */}
        {rightsReview && rightsReview.flaggedShotsCount > 0 && (
          <div
            style={{
              marginTop: '16px',
              padding: '12px 14px',
              borderRadius: '8px',
              background: rightsReview.userAcknowledged ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
              border: `1px solid ${rightsReview.userAcknowledged ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '1.1rem' }}>{rightsReview.userAcknowledged ? '✅' : '⚠️'}</span>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.86rem', color: rightsReview.userAcknowledged ? '#10b981' : '#f87171' }}>
                    {rightsReview.userAcknowledged
                      ? 'Pre-Export Rights Warnings Acknowledged'
                      : 'Pre-Export Rights Warning Acknowledgement Required'}
                  </div>
                  <div style={{ fontSize: '0.74rem', color: '#94a3b8' }}>
                    {rightsReview.flaggedShotsCount} timeline shot(s) remain flagged as restricted or unverified.
                  </div>
                </div>
              </div>
              {!rightsReview.userAcknowledged ? (
                <Button
                  variant="primary"
                  size="sm"
                  loading={isAcknowledgingRights}
                  onClick={async () => {
                    setIsAcknowledgingRights(true);
                    await acknowledgeRightsWarnings();
                    setIsAcknowledgingRights(false);
                  }}
                >
                  ✍️ Acknowledge Warnings & Proceed
                </Button>
              ) : (
                <span style={{ fontSize: '0.74rem', color: '#10b981', fontWeight: 600 }}>
                  ✓ Acknowledged on {new Date(rightsReview.acknowledgedAt || '').toLocaleTimeString()}
                </span>
              )}
            </div>
            <div style={{ fontSize: '0.72rem', color: '#94a3b8', lineHeight: 1.4 }}>
              <em>Acknowledgement notice:</em> Confirming acknowledgement is an editorial workflow step acknowledging that unverified or restricted assets remain on the timeline. It does not constitute legal clearance or guarantee freedom from platform claims.
            </div>
          </div>
        )}
      </div>

      {/* ── Section 3.5: AI Script Review & Original Commentary Assessment ── */}
      <div className="mex-card" style={{ border: '1px solid rgba(139,92,246,0.3)', background: 'rgba(15,23,42,0.9)' }}>
        <div className="mex-card-header">
          <div className="mex-card-title">
            <span>🎙️</span>
            <span>AI Script Review & Original Commentary Assessment</span>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {scriptReview && (
              <span
                style={{
                  fontSize: '0.80rem',
                  fontWeight: 700,
                  padding: '3px 8px',
                  borderRadius: '12px',
                  background: scriptReview.overallScore >= 70 ? 'rgba(16,185,129,0.2)' : 'rgba(245,158,11,0.2)',
                  color: scriptReview.overallScore >= 70 ? '#10b981' : '#fbbf24',
                  border: `1px solid ${scriptReview.overallScore >= 70 ? 'rgba(16,185,129,0.4)' : 'rgba(245,158,11,0.4)'}`,
                }}
              >
                Score: {scriptReview.overallScore}/100
              </span>
            )}
            <Button
              variant="secondary"
              size="sm"
              loading={isLoadingScriptReview}
              onClick={() => fetchScriptReview()}
            >
              🔄 Refresh Script Review
            </Button>
          </div>
        </div>

        {/* Creative Disclaimer */}
        <div
          style={{
            background: 'rgba(139,92,246,0.08)',
            border: '1px solid rgba(139,92,246,0.25)',
            borderRadius: '6px',
            padding: '10px 14px',
            marginBottom: '16px',
            fontSize: '0.78rem',
            color: '#ddd6fe',
            lineHeight: 1.45,
          }}
        >
          <strong>Commentary & Creative Review:</strong> Evaluates original analytical depth versus raw plot retelling, highlights excessive third-party TV footage reliance, and suggests diagrams or graphics. <em>This is an editorial quality tool, not legal advice or fair-use certification.</em>
        </div>

        {/* Script Metrics Grid */}
        {scriptReview ? (
          <div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: '12px',
                marginBottom: '16px',
                padding: '14px',
                background: 'rgba(0,0,0,0.3)',
                borderRadius: '8px',
              }}
            >
              <div>
                <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>Original Insight vs Plot Retelling</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 800, color: scriptReview.originalInsightScore >= 60 ? '#10b981' : '#fbbf24' }}>
                  {scriptReview.originalInsightScore}% {scriptReview.originalInsightScore >= 60 ? 'Insightful' : 'Plot Heavy'}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>Third-Party Footage Dependence</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 800, color: scriptReview.footageDependenceRatio > 0.75 ? '#f87171' : '#10b981' }}>
                  {Math.round(scriptReview.footageDependenceRatio * 100)}% TV Footage
                </div>
              </div>
              <div>
                <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>Hook & Opening Engagement</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 800, color: scriptReview.hookQualityScore >= 70 ? '#10b981' : '#fbbf24' }}>
                  {scriptReview.hookQualityScore}/100
                </div>
              </div>
              <div>
                <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>Climax & Payoff Coherence</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 800, color: scriptReview.climaxCoherenceScore >= 70 ? '#10b981' : '#fbbf24' }}>
                  {scriptReview.climaxCoherenceScore}/100
                </div>
              </div>
            </div>

            {/* Long 3rd-party spans warning */}
            {scriptReview.longThirdPartySpans && scriptReview.longThirdPartySpans.length > 0 && (
              <div
                style={{
                  marginBottom: '16px',
                  padding: '12px 14px',
                  background: 'rgba(239,68,68,0.1)',
                  border: '1px solid rgba(239,68,68,0.3)',
                  borderRadius: '8px',
                }}
              >
                <div style={{ fontWeight: 700, fontSize: '0.84rem', color: '#f87171', marginBottom: '4px' }}>
                  ⚠️ Extended Unbroken Third-Party Footage Spans ({scriptReview.longThirdPartySpans.length})
                </div>
                <div style={{ fontSize: '0.76rem', color: '#cbd5e1', marginBottom: '8px' }}>
                  The video contains long unbroken spans of broadcast footage without original visual alternatives:
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {scriptReview.longThirdPartySpans.map((span, idx) => (
                    <div
                      key={idx}
                      style={{
                        padding: '8px 10px',
                        borderRadius: '6px',
                        background: 'rgba(0,0,0,0.3)',
                        fontSize: '0.76rem',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <div>
                        <strong>{Math.floor(span.startSec / 60)}:{(Math.floor(span.startSec % 60)).toString().padStart(2, '0')} - {Math.floor(span.endSec / 60)}:{(Math.floor(span.endSec % 60)).toString().padStart(2, '0')} ({span.durationSec.toFixed(0)}s):</strong> {span.recommendation}
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setActiveTab('timeline')}
                      >
                        Inspect Timeline
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Suggestions list */}
            {scriptReview.suggestions && scriptReview.suggestions.length > 0 && (
              <div style={{ marginBottom: '16px' }}>
                <div style={{ fontSize: '0.80rem', fontWeight: 700, color: '#fff', marginBottom: '8px' }}>
                  Constructive Editorial Suggestions ({scriptReview.suggestions.length}):
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {scriptReview.suggestions.map((sug) => (
                    <div
                      key={sug.id}
                      style={{
                        padding: '10px 12px',
                        borderRadius: '6px',
                        background: sug.severity === 'caution' ? 'rgba(245,158,11,0.1)' : 'rgba(16,185,129,0.08)',
                        border: `1px solid ${sug.severity === 'caution' ? 'rgba(245,158,11,0.25)' : 'rgba(16,185,129,0.25)'}`,
                        fontSize: '0.80rem',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                        <span style={{ fontWeight: 700, color: sug.severity === 'caution' ? '#fbbf24' : '#10b981' }}>
                          {sug.title}
                        </span>
                        {sug.suggestedVisualAlternative && (
                          <span style={{ fontSize: '0.70rem', padding: '2px 6px', borderRadius: '4px', background: '#3b82f6', color: '#fff' }}>
                            💡 Suggests: {sug.suggestedVisualAlternative.replace('_', ' ')}
                          </span>
                        )}
                      </div>
                      <div style={{ color: '#cbd5e1', marginBottom: '4px' }}>{sug.description}</div>
                      {sug.suggestedImprovement && (
                        <div style={{ fontSize: '0.74rem', color: '#93c5fd' }}>
                          <strong>Recommendation:</strong> {sug.suggestedImprovement}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Narration Segment Inspector & Inline Editor */}
            {project?.script?.segments && (
              <div style={{ marginTop: '12px' }}>
                <div style={{ fontSize: '0.80rem', fontWeight: 700, color: '#fff', marginBottom: '8px' }}>
                  Edit Narration Sentences Directly:
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '240px', overflowY: 'auto', paddingRight: '4px' }}>
                  {project.script.segments.slice(0, 15).map((seg, idx) => (
                    <div
                      key={seg.segmentId}
                      style={{
                        padding: '8px 10px',
                        background: 'rgba(0,0,0,0.25)',
                        borderRadius: '6px',
                        border: '1px solid rgba(255,255,255,0.08)',
                        fontSize: '0.78rem',
                      }}
                    >
                      {editingSegmentId === seg.segmentId ? (
                        <div>
                          <textarea
                            value={editingSegmentText}
                            onChange={(e) => setEditingSegmentText(e.target.value)}
                            style={{
                              width: '100%',
                              minHeight: '60px',
                              padding: '6px 8px',
                              background: '#0f172a',
                              color: '#fff',
                              border: '1px solid #3b82f6',
                              borderRadius: '4px',
                              fontSize: '0.78rem',
                              fontFamily: 'inherit',
                            }}
                          />
                          <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', marginTop: '4px' }}>
                            <Button variant="ghost" size="sm" onClick={() => setEditingSegmentId(null)}>
                              Cancel
                            </Button>
                            <Button
                              variant="primary"
                              size="sm"
                              loading={isUpdatingSegment}
                              onClick={async () => {
                                setIsUpdatingSegment(true);
                                await updateScriptSegment(seg.segmentId, editingSegmentText);
                                setIsUpdatingSegment(false);
                                setEditingSegmentId(null);
                              }}
                            >
                              Save Sentence
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                          <div>
                            <span style={{ color: '#64748b', marginRight: '6px', fontWeight: 600 }}>#{idx + 1} ({seg.voiceoverStart.toFixed(1)}s):</span>
                            <span style={{ color: '#e2e8f0' }}>{seg.text}</span>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setEditingSegmentId(seg.segmentId);
                              setEditingSegmentText(seg.text);
                            }}
                          >
                            ✏️ Edit
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div style={{ color: '#94a3b8', fontSize: '0.80rem' }}>
            Click "Refresh Script Review" to analyze your script for original commentary and visual pacing.
          </div>
        )}
      </div>

      {/* ── Section 4: Low-Confidence Matches ── */}
      <div className="mex-card">
        <div className="mex-card-header">
          <div className="mex-card-title">
            <span>⚠</span>
            <span>Low-Confidence Scene Matches ({lowConfidenceShots.length})</span>
          </div>
          <span style={{ fontSize: '0.78rem', color: '#fbbf24' }}>
            {lowConfidenceShots.length === 0 ? '✓ None detected' : 'Attention recommended'}
          </span>
        </div>

        {lowConfidenceShots.length === 0 ? (
          <div style={{ color: '#10b981', fontSize: '0.84rem' }}>
            ✓ All timeline shots have verified high-confidence semantic matches to the narration script.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {lowConfidenceShots.map((shot) => (
              <div
                key={shot.shotId}
                style={{
                  background: 'rgba(0,0,0,0.3)',
                  border: '1px solid rgba(245,158,11,0.25)',
                  borderRadius: '8px',
                  padding: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '12px',
                }}
              >
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.86rem', color: '#fff' }}>
                    Shot {shot.shotId} ({shot.sceneId}) • Match: {Math.round(shot.matchScore)}%
                  </div>
                  <div style={{ fontSize: '0.78rem', color: '#94a3b8', marginTop: '2px' }}>
                    {shot.whyThisScene.fullSummary}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '6px' }}>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setSelectedShotId(shot.shotId);
                      setActiveTab('timeline');
                    }}
                  >
                    View in Timeline
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => openAlternativesModal(shot.shotId)}
                  >
                    Replace Scene
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Section 4: Premature Reveals Audit ── */}
      <div className="mex-card">
        <div className="mex-card-header">
          <div className="mex-card-title">
            <span>🔒</span>
            <span>Premature Reveal Protection ({prematureReveals.length})</span>
          </div>
          <span style={{ fontSize: '0.78rem', color: prematureReveals.length === 0 ? '#10b981' : '#fbbf24' }}>
            {prematureReveals.length === 0 ? '✓ Story chronology protected' : 'Review twist placement'}
          </span>
        </div>

        {prematureReveals.length === 0 ? (
          <div style={{ color: '#10b981', fontSize: '0.84rem' }}>
            ✓ No major twists or climax reveals appear prematurely in the early setup of the explanation.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {prematureReveals.map((shot) => (
              <div
                key={shot.shotId}
                style={{
                  background: 'rgba(0,0,0,0.3)',
                  borderRadius: '8px',
                  padding: '10px 14px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  fontSize: '0.82rem',
                }}
              >
                <div>
                  <strong>Shot {shot.shotId}:</strong> Scene {shot.sceneId} is tagged as a major revelation but appears early in the narration timeline.
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => openAlternativesModal(shot.shotId)}
                >
                  Choose Setup Shot
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Section 5: Repeated Footage Variety ── */}
      <div className="mex-card">
        <div className="mex-card-header">
          <div className="mex-card-title">
            <span>🔄</span>
            <span>Repeated Footage Monitor ({repeatedScenes.length})</span>
          </div>
          {repeatedScenes.length > 0 && (
            <Button
              variant="secondary"
              size="sm"
              onClick={async () => {
                await autoVaryRepeatedScenes();
              }}
              title="Automatically replaces overused scene occurrences with fresh unused footage from the movie pool"
            >
              ✨ Auto-Vary Repeated Scenes
            </Button>
          )}
        </div>

        {repeatedScenes.length === 0 ? (
          <div style={{ color: '#10b981', fontSize: '0.84rem' }}>
            ✓ High visual variety: No source scene is reused more than 2 distinct times.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {repeatedScenes.map(([sceneId, count]) => {
              const visits = sceneVisits.get(sceneId) || 1;
              return (
                <div
                  key={sceneId}
                  style={{
                    background: 'rgba(0,0,0,0.3)',
                    borderRadius: '8px',
                    padding: '10px 14px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    fontSize: '0.82rem',
                    gap: '12px',
                  }}
                >
                  <div>
                    Scene <strong>{sceneId}</strong> appears in <strong>{visits} narrative moments</strong> ({count} cuts).
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '0.76rem', color: '#94a3b8' }}>
                      {visits > 2 ? 'Revisited in separate moments.' : 'Contiguous sequence.'}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        const targetShot = shots.find((s) => s.sceneId === sceneId && !s.isLocked) || shots.find((s) => s.sceneId === sceneId);
                        if (targetShot) openAlternativesModal(targetShot.shotId);
                      }}
                    >
                      Choose Alternative
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Section 6: Project Lifecycle & Output Management ── */}
      <div className="mex-card">
        <div className="mex-card-header">
          <div className="mex-card-title">
            <span>📦</span>
            <span>Project Lifecycle & Output Management</span>
          </div>
          {Boolean(project?.renderedVideoPath) && (
            <span
              style={{
                fontSize: '0.78rem',
                color: project?.exportStatus === 'outdated' ? '#fbbf24' : '#10b981',
                fontWeight: 600,
              }}
            >
              {isRendering
                ? '⚡ Rendering New Revision...'
                : project?.exportStatus === 'outdated'
                ? `⚠️ Outdated (Timeline Rev ${project?.timelineRevision || 1})`
                : `✓ 60 FPS Master Video (Rev ${project?.timelineRevision || 1})`}
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#fff', marginBottom: '4px' }}>
              {project?.projectName || project?.name || 'Current Project'}
            </div>
            <div style={{ fontSize: '0.80rem', color: '#94a3b8' }}>
              {project?.renderedVideoPath ? (
                isRendering ? (
                  <span style={{ color: '#c084fc' }}>
                    A new 60 FPS master render is in progress. You can cancel at any time or download your existing completed render below.
                  </span>
                ) : project.exportStatus === 'outdated' ? (
                  <span style={{ color: '#fbbf24' }}>
                    Clip replacements or trims have been made (Rev {project.timelineRevision || 1}). You can download your existing completed render or re-render for latest edits.
                  </span>
                ) : (
                  <span>Verified 60 FPS master video ready for download with creative presentation presets.</span>
                )
              ) : (
                <span>You can start a new project at any time, or delete this existing project to free up disk space.</span>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <Button
              variant="ghost"
              size="sm"
              loading={isLoadingManifest}
              onClick={async () => {
                if (!exportManifest) {
                  await fetchExportManifest();
                }
                setShowManifestBox(!showManifestBox);
              }}
            >
              📜 {showManifestBox ? 'Hide Manifest' : 'Export Manifest'}
            </Button>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                if (project?.projectId) {
                  window.open(api.getProvenanceManifestDownloadUrl(project.projectId, 'csv'), '_blank');
                }
              }}
              title="Download asset provenance report as CSV spreadsheet"
            >
              📥 Provenance CSV
            </Button>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                if (project?.projectId) {
                  window.open(api.getProvenanceManifestDownloadUrl(project.projectId, 'json'), '_blank');
                }
              }}
              title="Download asset provenance report as JSON"
            >
              📥 Provenance JSON
            </Button>

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

            {!isRendering && project?.exportStatus === 'outdated' && (
              <Button
                variant="primary"
                size="sm"
                loading={isRendering}
                onClick={() => {
                  if (rightsReview && rightsReview.flaggedShotsCount > 0 && !rightsReview.userAcknowledged) {
                    alert('⚠️ Please review and acknowledge rights warnings in the Asset Rights section before rendering.');
                    return;
                  }
                  startRender();
                }}
              >
                ⚡ Render Updated Video (60 FPS)
              </Button>
            )}

            {Boolean(project?.renderedVideoPath) && (
              <Button
                variant={isRendering ? 'secondary' : project?.exportStatus === 'outdated' ? 'ghost' : 'primary'}
                size="sm"
                onClick={() => window.open(api.getMovieExplanationDownloadUrl(project!.projectId), '_blank')}
                title={
                  isRendering
                    ? 'Download existing completed render while new render runs'
                    : project?.exportStatus === 'outdated'
                    ? 'Download existing completed render (60 FPS)'
                    : 'Download 60 FPS Master Video'
                }
              >
                {isRendering
                  ? '📥 Download Existing Render'
                  : project?.exportStatus === 'outdated'
                  ? `📥 Download Existing Render (Rev ${project?.lastExportedRevision || 0})`
                  : '📥 Download 60 FPS Video'}
              </Button>
            )}

            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                createProject();
                setActiveTab('setup');
              }}
            >
              ✨ Start New Project
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
              >
                🗑️ Delete Project
              </Button>
            )}
          </div>
        </div>

        {/* Export Manifest Drawer */}
        {showManifestBox && exportManifest && (
          <div
            style={{
              marginTop: '16px',
              padding: '14px',
              background: 'rgba(0,0,0,0.4)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '8px',
              fontSize: '0.80rem',
            }}
          >
            <div style={{ fontWeight: 700, color: '#fff', marginBottom: '8px' }}>
              📜 Pre-Render Validated Export Manifest ({exportManifest.manifestId}):
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '8px', marginBottom: '10px' }}>
              <div><span style={{ color: '#94a3b8' }}>Revision:</span> <strong style={{ color: '#fff' }}>Rev {exportManifest.timelineRevision}</strong></div>
              <div><span style={{ color: '#94a3b8' }}>Resolution:</span> <strong style={{ color: '#fff' }}>{exportManifest.outputSettings.width}x{exportManifest.outputSettings.height} @ {exportManifest.outputSettings.fps}fps</strong></div>
              <div><span style={{ color: '#94a3b8' }}>Encoder:</span> <strong style={{ color: '#fff' }}>{exportManifest.outputSettings.encoder} (CRF {exportManifest.outputSettings.crf})</strong></div>
              <div><span style={{ color: '#94a3b8' }}>Total Shots:</span> <strong style={{ color: '#fff' }}>{exportManifest.shotsCount}</strong></div>
              <div><span style={{ color: '#94a3b8' }}>Timeline Duration:</span> <strong style={{ color: '#fff' }}>{exportManifest.totalDuration.toFixed(1)}s</strong></div>
              <div><span style={{ color: '#94a3b8' }}>Pre-Flight Check:</span> <strong style={{ color: exportManifest.validation.isValid ? '#10b981' : '#f87171' }}>{exportManifest.validation.isValid ? '✓ Validated' : 'Issues Found'}</strong></div>
            </div>
            {exportManifest.validation.warnings.length > 0 && (
              <div style={{ color: '#fbbf24', fontSize: '0.74rem' }}>
                Warnings: {exportManifest.validation.warnings.join('; ')}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
