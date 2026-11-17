import React, { useState } from 'react';
import { useMovieExplanationStore } from '../../../stores/movieExplanationStore.js';
import { Button } from '../../common/Button.js';
import { api } from '../../../services/api.js';
import type { TimelineTextOverlay, TimelineCaptionItem } from '@shared/types.js';

type LibraryTab = 'media' | 'captions' | 'text' | 'audio' | 'rights';

export const EditorLeftLibrary: React.FC = () => {
  const {
    project,
    selectedShotId,
    seekTo,
    currentTime,
    addTextOverlay,
    setSelectedCaptionId,
    replaceShotScene,
    addSceneToTimeline,
    openAlternativesModal,
    autoGenerateCaptions,
  } = useMovieExplanationStore();

  const [activeTab, setActiveTab] = useState<LibraryTab>('media');
  const [searchQuery, setSearchQuery] = useState('');
  const [sceneFilter, setSceneFilter] = useState<'all' | 'unused' | 'used'>('all');

  const timeline = project?.timeline;
  const shots = timeline?.shots || [];
  const scenes: any[] = project?.episodeIndex?.scenes || (project as any)?.scenes || [];
  const captions = timeline?.captions || [];

  const selectedShot = shots.find((s) => s.shotId === selectedShotId);
  const alternatives = (selectedShot as any)?.alternatives || [];

  // Calculate usage count of each scene across the edited timeline
  const usageMap = new Map<string, number>();
  shots.forEach((s) => {
    usageMap.set(s.sceneId, (usageMap.get(s.sceneId) || 0) + 1);
  });

  const unusedCount = scenes.filter((sc: any) => (usageMap.get(sc.sceneId) || 0) === 0).length;
  const usedCount = scenes.length - unusedCount;

  const filteredScenes = scenes.filter((sc: any) => {
    const count = usageMap.get(sc.sceneId) || 0;
    if (sceneFilter === 'unused' && count > 0) return false;
    if (sceneFilter === 'used' && count === 0) return false;

    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      sc.sceneId.toLowerCase().includes(q) ||
      (sc.description && sc.description.toLowerCase().includes(q)) ||
      (sc.summary && sc.summary.toLowerCase().includes(q)) ||
      (sc.visualSummary && sc.visualSummary.toLowerCase().includes(q)) ||
      (sc.characters && sc.characters.some((c: any) => c.toLowerCase().includes(q)))
    );
  });

  const handleInsertTextPreset = (type: 'title' | 'lower_third' | 'chapter' | 'callout') => {
    let preset: TimelineTextOverlay;
    const id = `txt_${Date.now()}`;
    const start = currentTime || 0;

    switch (type) {
      case 'title':
        preset = {
          id,
          text: 'MAIN STORY TITLE',
          timelineStart: start,
          timelineEnd: start + 3.0,
          startTime: start,
          duration: 3.0,
          positionX: 50,
          positionY: 50,
          fontSize: 38,
          fontFamily: 'Inter, sans-serif',
          fontWeight: 'bold',
          fontColor: '#ffffff',
          backgroundColor: 'rgba(0,0,0,0.7)',
          outlineColor: '#6366f1',
          outlineWidth: 2,
          alignment: 'center',
          opacity: 1.0,
          rotation: 0,
        };
        break;
      case 'lower_third':
        preset = {
          id,
          text: 'Character / Scene Analysis',
          timelineStart: start,
          timelineEnd: start + 3.0,
          startTime: start,
          duration: 3.0,
          positionX: 50,
          positionY: 82,
          fontSize: 24,
          fontFamily: 'Inter, sans-serif',
          fontWeight: '600',
          fontColor: '#f8fafc',
          backgroundColor: 'rgba(15,23,42,0.85)',
          outlineColor: '#000000',
          outlineWidth: 1,
          alignment: 'center',
          opacity: 0.95,
          rotation: 0,
        };
        break;
      case 'chapter':
        preset = {
          id,
          text: 'CHAPTER 1: THE DISCOVERY',
          timelineStart: start,
          timelineEnd: start + 2.5,
          startTime: start,
          duration: 2.5,
          positionX: 50,
          positionY: 20,
          fontSize: 28,
          fontFamily: 'Inter, sans-serif',
          fontWeight: 'bold',
          fontColor: '#fbbf24',
          backgroundColor: 'rgba(0,0,0,0.8)',
          outlineColor: '#b45309',
          outlineWidth: 2,
          alignment: 'center',
          opacity: 1.0,
          rotation: 0,
        };
        break;
      case 'callout':
      default:
        preset = {
          id,
          text: 'KEY DETAIL OBSERVED',
          timelineStart: start,
          timelineEnd: start + 2.0,
          startTime: start,
          duration: 2.0,
          positionX: 50,
          positionY: 65,
          fontSize: 22,
          fontFamily: 'Inter, sans-serif',
          fontWeight: 'bold',
          fontColor: '#34d399',
          backgroundColor: 'rgba(6,78,59,0.85)',
          outlineColor: '#000000',
          outlineWidth: 1,
          alignment: 'center',
          opacity: 0.95,
          rotation: 0,
        };
        break;
    }

    addTextOverlay(preset);
  };

  const handleDownloadSRT = () => {
    if (!project) return;
    const url = api.getMovieExplanationSRTUrl(project.projectId);
    window.open(url, '_blank');
  };

  return (
    <div className="mex-left-library">
      {/* ── Tabs Header ── */}
      <div className="mex-library-tabs">
        <button
          className={`mex-ltab-btn ${activeTab === 'media' ? 'active' : ''}`}
          onClick={() => setActiveTab('media')}
          title="Source scenes and video assets"
        >
          🎬 Media
        </button>
        <button
          className={`mex-ltab-btn ${activeTab === 'captions' ? 'active' : ''}`}
          onClick={() => setActiveTab('captions')}
          title="Synchronized narration subtitles"
        >
          💬 Captions
        </button>
        <button
          className={`mex-ltab-btn ${activeTab === 'text' ? 'active' : ''}`}
          onClick={() => setActiveTab('text')}
          title="Titles and graphic overlays"
        >
          📝 Text
        </button>
        <button
          className={`mex-ltab-btn ${activeTab === 'audio' ? 'active' : ''}`}
          onClick={() => setActiveTab('audio')}
          title="Voiceover & sound effects"
        >
          🎵 Audio
        </button>
        <button
          className={`mex-ltab-btn ${activeTab === 'rights' ? 'active' : ''}`}
          onClick={() => setActiveTab('rights')}
          title="Asset copyright review"
        >
          🛡️ Rights
        </button>
      </div>

      {/* ── Content ── */}
      <div className="mex-library-content">
        {/* ── 1. MEDIA TAB ── */}
        {activeTab === 'media' && (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '8px' }}>
            {/* Search Input */}
            <input
              type="text"
              placeholder="🔍 Search indexed scenes..."
              className="mex-input"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />

            {/* Filter Pills (All / Unused / Used) */}
            <div style={{ display: 'flex', gap: '4px', background: 'rgba(0,0,0,0.35)', padding: '2px', borderRadius: '6px' }}>
              <button
                className={`mex-switcher-btn ${sceneFilter === 'all' ? 'active' : ''}`}
                onClick={() => setSceneFilter('all')}
                style={{ flex: 1, fontSize: '0.72rem', padding: '4px 4px' }}
              >
                All ({scenes.length})
              </button>
              <button
                className={`mex-switcher-btn ${sceneFilter === 'unused' ? 'active' : ''}`}
                onClick={() => setSceneFilter('unused')}
                style={{ flex: 1, fontSize: '0.72rem', padding: '4px 4px', color: sceneFilter === 'unused' ? '#34d399' : undefined }}
              >
                ✨ Unused ({unusedCount})
              </button>
              <button
                className={`mex-switcher-btn ${sceneFilter === 'used' ? 'active' : ''}`}
                onClick={() => setSceneFilter('used')}
                style={{ flex: 1, fontSize: '0.72rem', padding: '4px 4px', color: sceneFilter === 'used' ? '#c084fc' : undefined }}
              >
                Used ({usedCount})
              </button>
            </div>

            {/* AI Recommended Alternatives for Selected Shot */}
            {selectedShot && alternatives.length > 0 && (
              <div className="mex-alt-box">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#a5b4fc' }}>
                    🎯 Top Alternatives for {selectedShot.shotId}
                  </span>
                  <span style={{ fontSize: '0.65rem', color: '#94a3b8' }}>
                    Preserves timing
                  </span>
                </div>
                {alternatives.slice(0, 3).map((alt: any) => (
                  <div key={alt.sceneId} className="mex-alt-item">
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span style={{ fontWeight: 700, fontSize: '0.74rem', color: '#fff' }}>{alt.sceneId}</span>
                        <span style={{ fontSize: '0.65rem', color: '#38bdf8' }}>{Math.round(alt.score * 100)}% match</span>
                      </div>
                      <div style={{ fontSize: '0.66rem', color: '#94a3b8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {alt.reason}
                      </div>
                    </div>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => replaceShotScene(selectedShot.shotId, alt.sceneId)}
                      style={{ fontSize: '0.7rem', padding: '2px 8px' }}
                    >
                      🔄 Swap
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {/* Indexed Scene List */}
            <div className="mex-media-list">
              {filteredScenes.length > 0 ? (
                filteredScenes.map((sc: any) => {
                  const usage = usageMap.get(sc.sceneId) || 0;
                  const isSelectedShotScene = selectedShot?.sceneId === sc.sceneId;

                  return (
                    <div key={sc.sceneId} className={`mex-media-item ${isSelectedShotScene ? 'active' : ''}`}>
                      {sc.thumbnailUrl ? (
                        <img
                          src={sc.thumbnailUrl}
                          alt={sc.sceneId}
                          className="mex-media-thumb"
                          onError={(e) => {
                            (e.currentTarget as HTMLElement).style.display = 'none';
                          }}
                        />
                      ) : (
                        <div className="mex-media-thumb-placeholder">🎬</div>
                      )}
                      <div className="mex-media-info">
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '4px' }}>
                          <span className="mex-media-title">{sc.sceneId}</span>
                          {sc.isTitleOrBumper ? (
                            <span className="mex-badge-bumper" title="Opening logo, bumper, or title card">Logo/Title</span>
                          ) : usage > 0 ? (
                            <span className="mex-badge-used" title={`Used ${usage} time(s) on timeline`}>Used ({usage}x)</span>
                          ) : (
                            <span className="mex-badge-unused" title="Previously unused footage">Unused</span>
                          )}
                        </div>

                        <div className="mex-media-meta">
                          {sc.startTime.toFixed(1)}s - {sc.endTime.toFixed(1)}s ({sc.duration.toFixed(1)}s)
                        </div>

                        {(sc.description || sc.visualSummary || sc.summary) && (
                          <div className="mex-media-summary">
                            {sc.description || sc.visualSummary || sc.summary}
                          </div>
                        )}

                        <div style={{ marginTop: '6px', display: 'flex', gap: '4px' }}>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              if (selectedShotId) {
                                replaceShotScene(selectedShotId, sc.sceneId);
                              }
                            }}
                            disabled={!selectedShotId}
                            title={selectedShotId ? 'Replace selected timeline shot with this scene (preserves narration timing)' : 'Select a shot on timeline first to replace'}
                            style={{ fontSize: '0.7rem', padding: '2px 6px' }}
                          >
                            🔄 Replace
                          </Button>

                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => addSceneToTimeline(sc.sceneId, selectedShotId || undefined)}
                            title="Add this scene as a <= 3.0s clip on the timeline"
                            style={{ fontSize: '0.7rem', padding: '2px 6px' }}
                          >
                            ➕ Add
                          </Button>

                          <button
                            className="mex-chip-btn"
                            onClick={() => seekTo(sc.startTime)}
                            title={`Preview source footage from ${sc.startTime.toFixed(1)}s`}
                            style={{ fontSize: '0.68rem', padding: '2px 6px' }}
                          >
                            👁️
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div style={{ textAlign: 'center', padding: '30px 10px', color: '#94a3b8', fontSize: '0.82rem' }}>
                  No source scenes match search filter.
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── 2. CAPTIONS TAB ── */}
        {activeTab === 'captions' && (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '10px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#fff' }}>
                Subtitles ({captions.length})
              </span>
              <div style={{ display: 'flex', gap: '6px' }}>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={autoGenerateCaptions}
                  title="Generate synchronized subtitles from narration transcript"
                >
                  ⚡ Auto-Sync
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleDownloadSRT}
                  disabled={captions.length === 0}
                  title="Download .SRT subtitle file"
                >
                  📥 .SRT
                </Button>
              </div>
            </div>

            <div className="mex-captions-list">
              {captions.length > 0 ? (
                captions.map((cap, idx) => {
                  const isActive = currentTime >= cap.startTime && currentTime <= cap.endTime;
                  return (
                    <div
                      key={cap.id}
                      className={`mex-caption-card ${isActive ? 'active' : ''}`}
                      onClick={() => {
                        seekTo(cap.startTime);
                        setSelectedCaptionId(cap.id);
                      }}
                    >
                      <div className="mex-caption-tc">
                        <span>#{idx + 1}</span>
                        <span>{cap.startTime.toFixed(2)}s &rarr; {cap.endTime.toFixed(2)}s</span>
                      </div>
                      <div className="mex-caption-text">{cap.text}</div>
                    </div>
                  );
                })
              ) : (
                <div style={{ textAlign: 'center', padding: '30px 10px', color: '#94a3b8', fontSize: '0.82rem' }}>
                  No subtitles generated yet. Click "Auto-Sync" to align with narration audio.
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── 3. TEXT TAB ── */}
        {activeTab === 'text' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#fff' }}>
              Title & Graphic Presets
            </span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div className="mex-preset-card" onClick={() => handleInsertTextPreset('title')}>
                <div style={{ fontWeight: 700, fontSize: '0.92rem', color: '#fff' }}>MAIN TITLE</div>
                <div style={{ fontSize: '0.74rem', color: '#94a3b8' }}>Centered bold headline with shadow</div>
              </div>
              <div className="mex-preset-card" onClick={() => handleInsertTextPreset('lower_third')}>
                <div style={{ fontWeight: 600, fontSize: '0.86rem', color: '#93c5fd' }}>Lower Third Banner</div>
                <div style={{ fontSize: '0.74rem', color: '#94a3b8' }}>Semi-transparent bottom bar for context</div>
              </div>
              <div className="mex-preset-card" onClick={() => handleInsertTextPreset('chapter')}>
                <div style={{ fontWeight: 700, fontSize: '0.86rem', color: '#fbbf24' }}>Chapter Heading</div>
                <div style={{ fontSize: '0.74rem', color: '#94a3b8' }}>Top-anchored section header</div>
              </div>
              <div className="mex-preset-card" onClick={() => handleInsertTextPreset('callout')}>
                <div style={{ fontWeight: 600, fontSize: '0.86rem', color: '#34d399' }}>Callout Box</div>
                <div style={{ fontSize: '0.74rem', color: '#94a3b8' }}>Highlighting important narrative clues</div>
              </div>
            </div>
          </div>
        )}

        {/* ── 4. AUDIO TAB ── */}
        {activeTab === 'audio' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#fff' }}>
              Voiceover & Soundtrack
            </span>

            <div style={{ background: 'rgba(0,0,0,0.3)', padding: '12px', borderRadius: '8px' }}>
              <div style={{ fontWeight: 600, fontSize: '0.85rem', color: '#c084fc', marginBottom: '4px' }}>
                🎙️ Master Narration Voiceover
              </div>
              <div style={{ fontSize: '0.78rem', color: '#94a3b8', lineHeight: '1.4' }}>
                Status: Aligned with {shots.length} shots<br />
                Duration: {Math.floor((timeline?.duration || 0) / 60)}m {Math.floor((timeline?.duration || 0) % 60)}s
              </div>
            </div>

            <div style={{ background: 'rgba(0,0,0,0.3)', padding: '12px', borderRadius: '8px' }}>
              <div style={{ fontWeight: 600, fontSize: '0.85rem', color: '#60a5fa', marginBottom: '4px' }}>
                🎵 Background Music & Original Audio
              </div>
              <div style={{ fontSize: '0.78rem', color: '#94a3b8', lineHeight: '1.4' }}>
                Source clip audio is muted by default to prioritize crisp narration voiceover. Master narration mix is exported at 48 kHz stereo.
              </div>
            </div>
          </div>
        )}

        {/* ── 5. RIGHTS TAB ── */}
        {activeTab === 'rights' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#fff' }}>
              Copyright & Asset Review
            </span>

            {/* Quick status summary */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <div style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', padding: '8px', borderRadius: '6px' }}>
                <div style={{ fontSize: '0.74rem', color: '#34d399', fontWeight: 700 }}>VERIFIED / OWNED</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#fff' }}>
                  {shots.filter((s) => s.rightsMetadata?.rightsStatus === 'owned' || s.rightsMetadata?.rightsStatus === 'licensed').length}
                </div>
              </div>
              <div style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', padding: '8px', borderRadius: '6px' }}>
                <div style={{ fontSize: '0.74rem', color: '#fbbf24', fontWeight: 700 }}>UNVERIFIED / REVIEW</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#fff' }}>
                  {shots.filter((s) => !s.rightsMetadata || s.rightsMetadata.rightsStatus === 'unverified').length}
                </div>
              </div>
            </div>

            <div style={{ fontSize: '0.78rem', color: '#94a3b8', lineHeight: '1.4', marginTop: '6px' }}>
              Shots requiring alternative visuals or custom graphics can be replaced seamlessly while preserving exact voiceover synchronization.
            </div>

            {selectedShotId && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => openAlternativesModal(selectedShotId)}
              >
                🔍 Replace Selected with Safe Alternative
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
