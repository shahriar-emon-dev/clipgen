// ============================================================
// Movie Explanation — Scene Alternatives Modal
// Supports swapping timeline scenes with alternative candidate scenes
// OR replacing with user-owned, properly licensed, or original visuals
// while strictly preserving master narration timing and neighboring shots.
// ============================================================

import React, { useState, useEffect } from 'react';
import { useMovieExplanationStore } from '../../stores/movieExplanationStore.js';
import { Button } from '../common/Button.js';
import type {
  ShotAlignmentMode,
  AssetRightsStatus,
  VisualAssetCategory,
  MovieExplanationClipAsset,
} from '@shared/types.js';

export const SceneAlternativesModal: React.FC = () => {
  const {
    isAlternativesModalOpen,
    selectedAlternativeShotId,
    alternativesList,
    project,
    replacementAssets,
    isUploadingVisual,
    setIsAlternativesModalOpen,
    replaceShot,
    replaceShotWithAsset,
    uploadReplacementVisual,
    loadReplacementAssets,
  } = useMovieExplanationStore();

  const [activeTab, setActiveTab] = useState<'episode_scenes' | 'licensed_asset'>('episode_scenes');

  // Replacement asset form state
  const [selectedAssetId, setSelectedAssetId] = useState<string>('');
  const [alignmentMode, setAlignmentMode] = useState<ShotAlignmentMode>('fit_narration');
  const [assetStartOffset, setAssetStartOffset] = useState<number>(0);
  const [isApplyingReplacement, setIsApplyingReplacement] = useState<boolean>(false);

  // Upload form state
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [assetLabel, setAssetLabel] = useState<string>('');
  const [assetCategory, setAssetCategory] = useState<VisualAssetCategory>('licensed_stock');
  const [assetRightsStatus, setAssetRightsStatus] = useState<AssetRightsStatus>('licensed');
  const [licenseDetails, setLicenseDetails] = useState<string>('');
  const [evidenceReference, setEvidenceReference] = useState<string>('');
  const [attributionRequirements, setAttributionRequirements] = useState<string>('');
  const [uploadSuccessMsg, setUploadSuccessMsg] = useState<string | null>(null);

  const currentShot = project?.timeline?.shots.find(
    (s) => s.shotId === selectedAlternativeShotId
  );

  useEffect(() => {
    if (isAlternativesModalOpen) {
      loadReplacementAssets();
      setSelectedAssetId('');
      setAlignmentMode('fit_narration');
      setAssetStartOffset(0);
      setUploadFile(null);
      setAssetLabel('');
      setUploadSuccessMsg(null);
    }
  }, [isAlternativesModalOpen]);

  if (!isAlternativesModalOpen || !selectedAlternativeShotId) return null;

  const selectedAsset = replacementAssets.find(
    (a) => a.clipId === selectedAssetId || a.assetId === selectedAssetId
  );

  const handleFileUploadAndApply = async () => {
    if (!uploadFile) return;
    const label = assetLabel.trim() || uploadFile.name;
    const asset = await uploadReplacementVisual(uploadFile, {
      label,
      category: assetCategory,
      rightsStatus: assetRightsStatus,
      licenseDetails,
      evidenceReference,
      attributionRequirements,
    });
    if (asset) {
      setSelectedAssetId(asset.clipId || asset.assetId || '');
      setUploadSuccessMsg(`✓ Successfully uploaded "${asset.label || asset.originalFilename}". You can now apply it to the timeline.`);
      setUploadFile(null);
      setAssetLabel('');
      setTimeout(() => setUploadSuccessMsg(null), 4000);
    }
  };

  const handleApplyReplacement = async () => {
    if (!selectedAssetId) return;
    setIsApplyingReplacement(true);
    try {
      await replaceShotWithAsset(
        selectedAlternativeShotId,
        selectedAssetId,
        alignmentMode,
        assetStartOffset
      );
    } finally {
      setIsApplyingReplacement(false);
    }
  };

  return (
    <div className="mex-modal-backdrop" onClick={() => setIsAlternativesModalOpen(false)}>
      <div
        className="mex-modal-card"
        style={{ maxWidth: '880px', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="mex-modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '1.25rem' }}>🎬</span>
            <div>
              <span style={{ fontWeight: 800, fontSize: '1.05rem', color: '#fff' }}>
                Replace Footage for Shot {selectedAlternativeShotId}
              </span>
              {currentShot && (
                <div style={{ fontSize: '0.78rem', color: '#94a3b8' }}>
                  Narration Window: <strong>{currentShot.timelineStart.toFixed(1)}s – {currentShot.timelineEnd.toFixed(1)}s</strong> ({currentShot.duration.toFixed(1)}s) • Current: <strong>{currentShot.sceneId}</strong>
                </div>
              )}
            </div>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={() => setIsAlternativesModalOpen(false)}>
            ✕
          </button>
        </div>

        {/* Tab Selection */}
        <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.1)', padding: '0 20px', gap: '8px', background: 'rgba(0,0,0,0.2)' }}>
          <button
            onClick={() => setActiveTab('episode_scenes')}
            style={{
              padding: '12px 16px',
              background: 'transparent',
              border: 'none',
              borderBottom: activeTab === 'episode_scenes' ? '2px solid #3b82f6' : '2px solid transparent',
              color: activeTab === 'episode_scenes' ? '#fff' : '#94a3b8',
              fontWeight: activeTab === 'episode_scenes' ? 700 : 500,
              fontSize: '0.86rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <span>🎥</span> Candidate Episode Scenes ({alternativesList.length})
          </button>
          <button
            onClick={() => setActiveTab('licensed_asset')}
            style={{
              padding: '12px 16px',
              background: 'transparent',
              border: 'none',
              borderBottom: activeTab === 'licensed_asset' ? '2px solid #10b981' : '2px solid transparent',
              color: activeTab === 'licensed_asset' ? '#34d399' : '#94a3b8',
              fontWeight: activeTab === 'licensed_asset' ? 700 : 500,
              fontSize: '0.86rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <span>🛡️</span> Replace with Licensed / Original Asset
          </button>
        </div>

        {/* Modal Body */}
        <div className="mex-modal-body" style={{ overflowY: 'auto', flex: 1, padding: '16px 20px' }}>
          {/* TAB 1: Episode Scenes */}
          {activeTab === 'episode_scenes' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <p style={{ fontSize: '0.82rem', color: '#94a3b8', margin: 0 }}>
                Ranked alternative candidate scenes from the Episode Intelligence Index. Selecting a replacement automatically locks (🔒) the shot against AI regeneration.
              </p>

              {alternativesList.length === 0 ? (
                <div style={{ padding: '30px', textAlign: 'center', color: '#94a3b8', background: 'rgba(0,0,0,0.2)', borderRadius: '8px' }}>
                  No alternative movie candidates found for this shot. Consider replacing with original visual assets in the next tab.
                </div>
              ) : (
                alternativesList.map((cand) => (
                  <div
                    key={cand.sceneId}
                    style={{
                      background: 'rgba(0,0,0,0.35)',
                      border: '1px solid rgba(255,255,255,0.08)',
                      borderRadius: '10px',
                      padding: '12px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '16px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px', minWidth: 0 }}>
                      {cand.thumbnailUrl ? (
                        <img
                          src={cand.thumbnailUrl}
                          alt=""
                          style={{ width: '90px', height: '54px', objectFit: 'cover', borderRadius: '6px', flexShrink: 0 }}
                        />
                      ) : (
                        <div style={{ width: '90px', height: '54px', background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '6px', flexShrink: 0 }}>
                          🎬
                        </div>
                      )}

                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontWeight: 700, fontSize: '0.9rem', color: '#fff' }}>
                            {cand.sceneId}
                          </span>
                          <span className={`mex-score-pill ${cand.matchScore >= 70 ? 'high' : 'low'}`}>
                            {Math.round(cand.matchScore)}% Match
                          </span>
                          <span style={{ fontSize: '0.74rem', color: '#94a3b8' }}>
                            {cand.duration.toFixed(1)}s (at {Math.floor(cand.startTime / 60)}m{Math.floor(cand.startTime % 60)}s)
                          </span>
                        </div>

                        <div style={{ fontSize: '0.8rem', color: '#cbd5e1', marginTop: '4px' }} className="truncate">
                          {cand.description}
                        </div>

                        {cand.dialogue && (
                          <div style={{ fontSize: '0.74rem', color: '#94a3b8', fontStyle: 'italic', marginTop: '2px' }} className="truncate">
                            "{cand.dialogue}"
                          </div>
                        )}
                      </div>
                    </div>

                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => {
                        if (selectedAlternativeShotId) {
                          replaceShot(selectedAlternativeShotId, cand.sceneId);
                        }
                      }}
                      style={{ flexShrink: 0 }}
                    >
                      Use This Scene
                    </Button>
                  </div>
                ))
              )}
            </div>
          )}

          {/* TAB 2: Licensed / Original Asset Replacement */}
          {activeTab === 'licensed_asset' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              {/* Educational Notice on Rights & Voiceover Sync */}
              <div
                style={{
                  background: 'rgba(16,185,129,0.08)',
                  border: '1px solid rgba(16,185,129,0.25)',
                  borderRadius: '8px',
                  padding: '12px 14px',
                  fontSize: '0.80rem',
                  color: '#a7f3d0',
                  lineHeight: '1.45',
                }}
              >
                <strong>Zero-Drift Narration Guarantee:</strong> Replacing this shot with original graphics, diagrams, or licensed stock footage preserves 100% of your voiceover timing, transcript synchronization, audio bed, and neighboring timeline entries.
              </div>

              {/* Upload Section */}
              <div
                style={{
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: '8px',
                  padding: '14px',
                }}
              >
                <div style={{ fontWeight: 700, fontSize: '0.88rem', color: '#fff', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>📤</span> Upload New Replacement Visual Asset
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px', marginBottom: '10px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.74rem', color: '#94a3b8', marginBottom: '4px' }}>
                      Visual Media File (MP4, WEBM, MOV, PNG, JPG) *
                    </label>
                    <input
                      type="file"
                      accept="video/*,image/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          setUploadFile(file);
                          if (!assetLabel) setAssetLabel(file.name.replace(/\.[^/.]+$/, ''));
                        }
                      }}
                      style={{ fontSize: '0.78rem', color: '#fff', width: '100%' }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.74rem', color: '#94a3b8', marginBottom: '4px' }}>
                      Asset Title / Label *
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Crime Scene Infographic / Stock Cityscape"
                      value={assetLabel}
                      onChange={(e) => setAssetLabel(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '6px 10px',
                        borderRadius: '4px',
                        background: '#1e293b',
                        border: '1px solid rgba(255,255,255,0.15)',
                        color: '#fff',
                        fontSize: '0.80rem',
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.74rem', color: '#94a3b8', marginBottom: '4px' }}>
                      Visual Category *
                    </label>
                    <select
                      value={assetCategory}
                      onChange={(e) => setAssetCategory(e.target.value as VisualAssetCategory)}
                      style={{
                        width: '100%',
                        padding: '6px 10px',
                        borderRadius: '4px',
                        background: '#1e293b',
                        border: '1px solid rgba(255,255,255,0.15)',
                        color: '#fff',
                        fontSize: '0.80rem',
                      }}
                    >
                      <option value="licensed_stock">Licensed Stock Footage</option>
                      <option value="original_graphic">Original Graphic / Animation</option>
                      <option value="diagram">Exploratory Diagram / Infographic</option>
                      <option value="commentary_title_card">Commentary Title Card</option>
                      <option value="user_visual">User-Captured Visual</option>
                      <option value="other">Other Visual</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.74rem', color: '#94a3b8', marginBottom: '4px' }}>
                      Rights Clearance Status *
                    </label>
                    <select
                      value={assetRightsStatus}
                      onChange={(e) => setAssetRightsStatus(e.target.value as AssetRightsStatus)}
                      style={{
                        width: '100%',
                        padding: '6px 10px',
                        borderRadius: '4px',
                        background: '#1e293b',
                        border: '1px solid rgba(255,255,255,0.15)',
                        color: '#fff',
                        fontSize: '0.80rem',
                      }}
                    >
                      <option value="owned">Owned (Original Creation / Creator Owned)</option>
                      <option value="licensed">Licensed (Commercial Stock / Royalty Free)</option>
                      <option value="permission_granted">Permission Granted (Written Approval)</option>
                      <option value="public_domain">Public Domain / CC0</option>
                      <option value="unverified">Unverified (Requires Rights Review)</option>
                    </select>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px', marginBottom: '10px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.74rem', color: '#94a3b8', marginBottom: '4px' }}>
                      License Reference / Proof ID
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Envato #837281, Storyblocks #1928"
                      value={licenseDetails}
                      onChange={(e) => setLicenseDetails(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '6px 10px',
                        borderRadius: '4px',
                        background: '#1e293b',
                        border: '1px solid rgba(255,255,255,0.15)',
                        color: '#fff',
                        fontSize: '0.80rem',
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.74rem', color: '#94a3b8', marginBottom: '4px' }}>
                      Attribution Requirements (for YouTube description)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Stock footage courtesy of Pexels/Studio"
                      value={attributionRequirements}
                      onChange={(e) => setAttributionRequirements(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '6px 10px',
                        borderRadius: '4px',
                        background: '#1e293b',
                        border: '1px solid rgba(255,255,255,0.15)',
                        color: '#fff',
                        fontSize: '0.80rem',
                      }}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '6px' }}>
                  {uploadSuccessMsg && (
                    <span style={{ fontSize: '0.78rem', color: '#34d399', fontWeight: 600 }}>
                      {uploadSuccessMsg}
                    </span>
                  )}
                  <div style={{ marginLeft: 'auto' }}>
                    <Button
                      variant="primary"
                      size="sm"
                      loading={isUploadingVisual}
                      disabled={!uploadFile}
                      onClick={handleFileUploadAndApply}
                    >
                      Upload Asset to Library
                    </Button>
                  </div>
                </div>
              </div>

              {/* Asset Selection & Alignment Adjustment */}
              <div>
                <div style={{ fontWeight: 700, fontSize: '0.88rem', color: '#fff', marginBottom: '8px' }}>
                  Select Replacement Asset from Project Library ({replacementAssets.length})
                </div>

                {replacementAssets.length === 0 ? (
                  <div style={{ padding: '24px', textAlign: 'center', color: '#94a3b8', background: 'rgba(0,0,0,0.2)', borderRadius: '8px' }}>
                    No replacement visual assets uploaded yet. Use the upload box above to add stock footage, graphics, or diagrams.
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '10px', marginBottom: '14px' }}>
                    {replacementAssets.map((asset) => {
                      const id = asset.clipId || asset.assetId || '';
                      const isSelected = selectedAssetId === id;
                      const rightsStatus = asset.rightsMetadata?.rightsStatus || 'unverified';
                      const mediaType = asset.mediaType || 'video';
                      const label = asset.label || asset.originalFilename || asset.filename;

                      return (
                        <div
                          key={id}
                          onClick={() => setSelectedAssetId(id)}
                          style={{
                            padding: '10px',
                            borderRadius: '8px',
                            background: isSelected ? 'rgba(59,130,246,0.15)' : 'rgba(0,0,0,0.3)',
                            border: `1.5px solid ${isSelected ? '#3b82f6' : 'rgba(255,255,255,0.08)'}`,
                            cursor: 'pointer',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '6px',
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontWeight: 700, fontSize: '0.84rem', color: '#fff' }} className="truncate">
                              {label}
                            </span>
                            <span
                              style={{
                                fontSize: '0.70rem',
                                padding: '2px 6px',
                                borderRadius: '4px',
                                background: rightsStatus === 'owned' || rightsStatus === 'licensed'
                                  ? 'rgba(16,185,129,0.2)'
                                  : 'rgba(245,158,11,0.2)',
                                color: rightsStatus === 'owned' || rightsStatus === 'licensed'
                                  ? '#10b981'
                                  : '#f59e0b',
                                textTransform: 'capitalize',
                              }}
                            >
                              {rightsStatus}
                            </span>
                          </div>

                          <div style={{ fontSize: '0.74rem', color: '#94a3b8', display: 'flex', gap: '8px' }}>
                            <span>📁 {mediaType.toUpperCase()}</span>
                            <span>⏱️ {mediaType === 'image' ? 'Still Image' : `${asset.duration.toFixed(1)}s`}</span>
                            <span>🏷️ {asset.category || asset.assetCategory || 'visual'}</span>
                          </div>

                          {asset.rightsMetadata?.licenseDetails && (
                            <div style={{ fontSize: '0.70rem', color: '#cbd5e1' }} className="truncate">
                              Lic: {asset.rightsMetadata.licenseDetails}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Reviewable Alignment Adjustment Section */}
              {selectedAsset && currentShot && (
                <div
                  style={{
                    background: 'rgba(59,130,246,0.08)',
                    border: '1px solid rgba(59,130,246,0.3)',
                    borderRadius: '8px',
                    padding: '14px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px',
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: '0.88rem', color: '#93c5fd', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span>⚖️</span> Reviewable Alignment Adjustment
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', background: 'rgba(0,0,0,0.3)', padding: '10px 14px', borderRadius: '6px' }}>
                    <div>
                      <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>Target Narration Duration</div>
                      <div style={{ fontSize: '0.96rem', fontWeight: 700, color: '#fff' }}>
                        {currentShot.duration.toFixed(2)} seconds
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>Selected Visual Duration</div>
                      <div style={{ fontSize: '0.96rem', fontWeight: 700, color: '#38bdf8' }}>
                        {(selectedAsset.mediaType || 'video') === 'image' ? 'Static (Loops to Fit)' : `${selectedAsset.duration.toFixed(2)}s`}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>Duration Difference</div>
                      <div style={{ fontSize: '0.96rem', fontWeight: 700, color: (selectedAsset.mediaType || 'video') === 'image' ? '#10b981' : Math.abs(selectedAsset.duration - currentShot.duration) < 0.1 ? '#10b981' : '#f59e0b' }}>
                        {(selectedAsset.mediaType || 'video') === 'image'
                          ? 'Zero gap (Auto-held)'
                          : `${(selectedAsset.duration - currentShot.duration > 0 ? '+' : '')}${(selectedAsset.duration - currentShot.duration).toFixed(2)}s`}
                      </div>
                    </div>
                  </div>

                  {/* Alignment Mode Picker */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.74rem', color: '#cbd5e1', marginBottom: '4px', fontWeight: 600 }}>
                        Alignment Adaptation Mode
                      </label>
                      <select
                        value={alignmentMode}
                        onChange={(e) => setAlignmentMode(e.target.value as ShotAlignmentMode)}
                        style={{
                          width: '100%',
                          padding: '8px 10px',
                          borderRadius: '6px',
                          background: '#1e293b',
                          border: '1px solid rgba(255,255,255,0.2)',
                          color: '#fff',
                          fontSize: '0.82rem',
                        }}
                      >
                        <option value="fit_narration">Fit Narration Window (Clip exactly to voiceover duration)</option>
                        <option value="crop_duration">Match Duration (Trim to {currentShot.duration.toFixed(1)}s)</option>
                        <option value="loop">Loop Asset (Repeats visual if shorter than speech)</option>
                        <option value="hold">Hold Last Frame (Freeze frame to bridge narration gap)</option>
                      </select>
                    </div>

                    {(selectedAsset.mediaType || 'video') === 'video' && selectedAsset.duration > currentShot.duration && (
                      <div>
                        <label style={{ display: 'block', fontSize: '0.74rem', color: '#cbd5e1', marginBottom: '4px', fontWeight: 600 }}>
                          Start Offset in Asset ({assetStartOffset.toFixed(1)}s)
                        </label>
                        <input
                          type="range"
                          min="0"
                          max={Math.max(0, selectedAsset.duration - currentShot.duration)}
                          step="0.5"
                          value={assetStartOffset}
                          onChange={(e) => setAssetStartOffset(parseFloat(e.target.value))}
                          style={{ width: '100%' }}
                        />
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', color: '#94a3b8' }}>
                          <span>0.0s (Start)</span>
                          <span>Max {Math.max(0, selectedAsset.duration - currentShot.duration).toFixed(1)}s</span>
                        </div>
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '6px' }}>
                    <Button
                      variant="primary"
                      size="md"
                      loading={isApplyingReplacement}
                      onClick={handleApplyReplacement}
                    >
                      ✓ Apply Replacement to Timeline
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="mex-modal-footer">
          <Button variant="ghost" size="sm" onClick={() => setIsAlternativesModalOpen(false)}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
};
