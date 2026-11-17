import React, { useState, useEffect } from 'react';
import { useMovieExplanationStore, CAPTION_PRESETS } from '../../../stores/movieExplanationStore.js';
import { Button } from '../../common/Button.js';
import type {
  ClipTransformSettings,
  ClipColorGrading,
  ClipFilterEffect,
  ClipBorderSettings,
  ClipSpeedSettings,
  TimelineTextOverlay,
  TimelineCaptionItem,
  CaptionStyleSettings,
} from '@shared/types.js';

type InspectorTab = 'transform' | 'speed' | 'color' | 'effects' | 'border' | 'text' | 'captions' | 'ai';

export const EditorInspectorPanel: React.FC = () => {
  const {
    project,
    selectedShotId,
    selectedTextOverlayId,
    selectedCaptionId,
    updateShotTransform,
    batchUpdateShots,
    toggleShotLock,
    openAlternativesModal,
    setIsWhyModalOpen,
    regenerateTimeline,
    addTextOverlay,
    updateTextOverlay,
    deleteTextOverlay,
    updateCaption,
    updateCaptionStyle,
    applyCaptionPreset,
    splitCaption,
    mergeCaptions,
    deleteCaption,
    captionsVisible,
    toggleCaptionsVisible,
    currentTime,
  } = useMovieExplanationStore();

  const [activeTab, setActiveTab] = useState<InspectorTab>('transform');
  const [copySuccess, setCopySuccess] = useState<string | null>(null);

  // Auto-switch inspector tab when subtitle or text overlay is selected
  useEffect(() => {
    if (selectedCaptionId) {
      setActiveTab('captions');
    }
  }, [selectedCaptionId]);

  useEffect(() => {
    if (selectedTextOverlayId) {
      setActiveTab('text');
    }
  }, [selectedTextOverlayId]);

  const timeline = project?.timeline;
  const shots = timeline?.shots || [];
  const selectedShot = shots.find((s) => s.shotId === selectedShotId) || shots[0];

  const selectedTextOverlay = timeline?.textOverlays?.find((t) => t.id === selectedTextOverlayId);
  const selectedCaption = timeline?.captions?.find((c) => c.id === selectedCaptionId);

  if (!timeline || shots.length === 0) {
    return (
      <div className="mex-inspector-empty">
        <span style={{ fontSize: '2rem' }}>⚙️</span>
        <p>No timeline active. Generate or import a project to inspect clip properties.</p>
      </div>
    );
  }

  const showNotification = (msg: string) => {
    setCopySuccess(msg);
    setTimeout(() => setCopySuccess(null), 2500);
  };

  // ── Transform handlers ──
  const currentTransform: ClipTransformSettings = selectedShot?.transformSettings || selectedShot?.transform || {
    scale: 1.0,
    zoom: 1.0,
    positionX: 0,
    positionY: 0,
    cropTop: 0,
    cropBottom: 0,
    cropLeft: 0,
    cropRight: 0,
    rotation: 0,
    flipHorizontal: false,
    flipVertical: false,
    fitMode: 'fill',
    keepAspectRatio: true,
    horizontalAlign: 'center',
    verticalAlign: 'center',
  };

  const handleTransformChange = (changes: Partial<ClipTransformSettings>) => {
    if (!selectedShot) return;
    const updated = { ...currentTransform, ...changes };
    updateShotTransform(selectedShot.shotId, { transform: updated });
  };

  const handleResetTransform = () => {
    if (!selectedShot) return;
    updateShotTransform(selectedShot.shotId, {
      transform: {
        scale: 1.0,
        positionX: 0,
        positionY: 0,
        cropTop: 0,
        cropBottom: 0,
        cropLeft: 0,
        cropRight: 0,
        rotation: 0,
        flipHorizontal: false,
        flipVertical: false,
        fitMode: 'fill',
      },
    });
    showNotification('Transform reset');
  };

  // ── Speed handlers ──
  const currentSpeed: ClipSpeedSettings = selectedShot?.speedSettings || {
    playbackRate: 1.0,
    preset: 'normal',
    maintainPitch: true,
    muteOriginalAudio: true,
  };

  const handleSpeedChange = (playbackRate: number) => {
    if (!selectedShot) return;
    updateShotTransform(selectedShot.shotId, {
      speed: {
        ...currentSpeed,
        playbackRate,
        preset: playbackRate === 1.0 ? 'normal' : playbackRate < 1.0 ? 'slow' : 'fast',
      },
    });
  };

  // ── Color grading handlers ──
  const currentColor: ClipColorGrading = selectedShot?.colorGrading || {
    brightness: 0,
    exposure: 0,
    contrast: 0,
    saturation: 0,
    temperature: 0,
    tint: 0,
    sharpen: 0,
    vignette: 0,
  };

  const handleColorChange = (changes: Partial<ClipColorGrading>) => {
    if (!selectedShot) return;
    const updated = { ...currentColor, ...changes };
    updateShotTransform(selectedShot.shotId, { colorGrading: updated });
  };

  const handleApplyColorPreset = (presetName: string) => {
    if (!selectedShot) return;
    let newColor: ClipColorGrading = { ...currentColor, presetName };
    switch (presetName) {
      case 'Cinematic Warm':
        newColor = { brightness: 2, exposure: 4, contrast: 12, saturation: 10, temperature: 18, tint: -4, sharpen: 10, vignette: 15, presetName };
        break;
      case 'Moody Cool':
        newColor = { brightness: -2, exposure: -5, contrast: 16, saturation: -15, temperature: -22, tint: 8, sharpen: 12, vignette: 25, presetName };
        break;
      case 'Punchy Pop':
        newColor = { brightness: 5, exposure: 8, contrast: 20, saturation: 28, temperature: 4, tint: 0, sharpen: 15, vignette: 5, presetName };
        break;
      case 'Vintage Film':
        newColor = { brightness: 4, exposure: 2, contrast: -8, saturation: -20, temperature: 14, tint: 12, sharpen: 5, vignette: 30, presetName };
        break;
      case 'Noir B&W':
        newColor = { brightness: 0, exposure: 0, contrast: 30, saturation: -100, temperature: 0, tint: 0, sharpen: 20, vignette: 35, presetName };
        break;
      case 'Reset':
      default:
        newColor = { brightness: 0, exposure: 0, contrast: 0, saturation: 0, temperature: 0, tint: 0, sharpen: 0, vignette: 0, presetName: 'None' };
        break;
    }
    updateShotTransform(selectedShot.shotId, { colorGrading: newColor });
    showNotification(`Applied ${presetName}`);
  };

  const handleCopyColorToAll = () => {
    if (!selectedShot) return;
    batchUpdateShots({
      shotIds: shots.map((s) => s.shotId),
      settings: { colorGrading: currentColor },
    });
    showNotification(`Color grade copied to all ${shots.length} shots`);
  };

  // ── Visual Effect handlers ──
  const currentEffect: ClipFilterEffect = selectedShot?.filterEffect || {
    type: 'none',
    effectType: 'none',
    intensity: 75,
    enabled: true,
  };

  const handleEffectChange = (effectType: string, intensity?: number) => {
    if (!selectedShot) return;
    updateShotTransform(selectedShot.shotId, {
      filterEffect: {
        ...currentEffect,
        type: (effectType as any) || 'none',
        effectType: effectType as any,
        intensity: intensity !== undefined ? intensity : currentEffect.intensity,
        enabled: effectType !== 'none',
      },
    });
  };

  const handleCopyEffectToAll = () => {
    if (!selectedShot) return;
    batchUpdateShots({
      shotIds: shots.map((s) => s.shotId),
      settings: { filterEffect: currentEffect },
    });
    showNotification(`Effect copied to all ${shots.length} shots`);
  };

  // ── Border & Canvas handlers ──
  const currentBorder: ClipBorderSettings = selectedShot?.borderSettings || selectedShot?.border || {
    enabled: false,
    style: 'none',
    thickness: 4,
    padding: 0,
    borderRadius: 0,
    shadow: false,
    color: '#ffffff',
    borderColor: '#ffffff',
    backgroundColor: '#000000',
    hasShadow: false,
    scope: 'shot',
  };

  const handleBorderChange = (changes: Partial<ClipBorderSettings>) => {
    if (!selectedShot) return;
    const updated = { ...currentBorder, ...changes };
    updateShotTransform(selectedShot.shotId, { border: updated });
  };

  const handleApplyBorderToAll = () => {
    if (!selectedShot) return;
    const allBorder = { ...currentBorder, scope: 'all' as const };
    batchUpdateShots({
      shotIds: shots.map((s) => s.shotId),
      settings: { border: allBorder },
    });
    showNotification(`Border applied to all ${shots.length} shots`);
  };

  return (
    <div className="mex-inspector-panel">
      {/* ── Top Header with Clip Quick Info ── */}
      <div className="mex-inspector-header">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '1rem' }}>🎛️</span>
            <span style={{ fontWeight: 700, fontSize: '0.88rem', color: '#fff' }}>
              Clip Inspector
            </span>
            {selectedShot && (
              <span className="mex-tag mex-tag-scene">
                {selectedShot.sceneId} ({selectedShot.duration.toFixed(1)}s)
              </span>
            )}
          </div>
          {copySuccess && (
            <span style={{ fontSize: '0.74rem', color: '#34d399', fontWeight: 600 }}>
              ✓ {copySuccess}
            </span>
          )}
        </div>
      </div>

      {/* ── Tab Switcher ── */}
      <div className="mex-inspector-tabs">
        <button
          className={`mex-itab-btn ${activeTab === 'transform' ? 'active' : ''}`}
          onClick={() => setActiveTab('transform')}
          title="Zoom, Position, Crop & Framing"
        >
          📐 Transform
        </button>
        <button
          className={`mex-itab-btn ${activeTab === 'speed' ? 'active' : ''}`}
          onClick={() => setActiveTab('speed')}
          title="Clip Speed & Duration"
        >
          ⚡ Speed
        </button>
        <button
          className={`mex-itab-btn ${activeTab === 'color' ? 'active' : ''}`}
          onClick={() => setActiveTab('color')}
          title="Color Correction & Grading"
        >
          🎨 Color
        </button>
        <button
          className={`mex-itab-btn ${activeTab === 'effects' ? 'active' : ''}`}
          onClick={() => setActiveTab('effects')}
          title="Visual Filters & Effects"
        >
          ✨ Effects
        </button>
        <button
          className={`mex-itab-btn ${activeTab === 'border' ? 'active' : ''}`}
          onClick={() => setActiveTab('border')}
          title="Frames, Borders & Canvas"
        >
          🖼️ Border
        </button>
        <button
          className={`mex-itab-btn ${activeTab === 'text' ? 'active' : ''}`}
          onClick={() => setActiveTab('text')}
          title="Text & Titles Overlay"
        >
          📝 Text
        </button>
        <button
          className={`mex-itab-btn ${activeTab === 'captions' ? 'active' : ''}`}
          onClick={() => setActiveTab('captions')}
          title="Synchronized Subtitles"
        >
          💬 Captions
        </button>
        <button
          className={`mex-itab-btn ${activeTab === 'ai' ? 'active' : ''}`}
          onClick={() => setActiveTab('ai')}
          title="AI Scene Matching & Copyright"
        >
          🤖 AI Info
        </button>
      </div>

      {/* ── Inspector Body ── */}
      <div className="mex-inspector-content">
        {/* ────────────────── 1. TRANSFORM TAB ────────────────── */}
        {activeTab === 'transform' && (
          <div className="mex-inspector-section">
            <div className="mex-prop-header">
              <span>Zoom & Scale</span>
              <span className="mex-prop-val">{Math.round((currentTransform.scale || 1.0) * 100)}%</span>
            </div>
            <input
              type="range"
              min="0.5"
              max="2.5"
              step="0.05"
              className="mex-slider"
              value={currentTransform.scale || 1.0}
              onChange={(e) => handleTransformChange({ scale: parseFloat(e.target.value) })}
            />

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '12px' }}>
              <div>
                <div className="mex-prop-header">
                  <span>Position X</span>
                  <span className="mex-prop-val">{Math.round(currentTransform.positionX || 0)}%</span>
                </div>
                <input
                  type="range"
                  min="-50"
                  max="50"
                  step="1"
                  className="mex-slider"
                  value={currentTransform.positionX || 0}
                  onChange={(e) => handleTransformChange({ positionX: parseInt(e.target.value) })}
                />
              </div>
              <div>
                <div className="mex-prop-header">
                  <span>Position Y</span>
                  <span className="mex-prop-val">{Math.round(currentTransform.positionY || 0)}%</span>
                </div>
                <input
                  type="range"
                  min="-50"
                  max="50"
                  step="1"
                  className="mex-slider"
                  value={currentTransform.positionY || 0}
                  onChange={(e) => handleTransformChange({ positionY: parseInt(e.target.value) })}
                />
              </div>
            </div>

            <div style={{ marginTop: '14px' }}>
              <div className="mex-prop-header">
                <span>Crop Borders (Top / Bottom / Left / Right)</span>
                <span className="mex-prop-val">
                  {currentTransform.cropTop || 0}% / {currentTransform.cropBottom || 0}%
                </span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '6px' }}>
                <div>
                  <label className="mex-sublabel">Crop Top %</label>
                  <input
                    type="range"
                    min="0"
                    max="35"
                    step="1"
                    className="mex-slider"
                    value={currentTransform.cropTop || 0}
                    onChange={(e) => handleTransformChange({ cropTop: parseInt(e.target.value) })}
                  />
                </div>
                <div>
                  <label className="mex-sublabel">Crop Bottom %</label>
                  <input
                    type="range"
                    min="0"
                    max="35"
                    step="1"
                    className="mex-slider"
                    value={currentTransform.cropBottom || 0}
                    onChange={(e) => handleTransformChange({ cropBottom: parseInt(e.target.value) })}
                  />
                </div>
                <div>
                  <label className="mex-sublabel">Crop Left %</label>
                  <input
                    type="range"
                    min="0"
                    max="35"
                    step="1"
                    className="mex-slider"
                    value={currentTransform.cropLeft || 0}
                    onChange={(e) => handleTransformChange({ cropLeft: parseInt(e.target.value) })}
                  />
                </div>
                <div>
                  <label className="mex-sublabel">Crop Right %</label>
                  <input
                    type="range"
                    min="0"
                    max="35"
                    step="1"
                    className="mex-slider"
                    value={currentTransform.cropRight || 0}
                    onChange={(e) => handleTransformChange({ cropRight: parseInt(e.target.value) })}
                  />
                </div>
              </div>
            </div>

            <div style={{ marginTop: '14px' }}>
              <div className="mex-prop-header">
                <span>Rotation</span>
                <span className="mex-prop-val">{currentTransform.rotation || 0}°</span>
              </div>
              <input
                type="range"
                min="-180"
                max="180"
                step="1"
                className="mex-slider"
                value={currentTransform.rotation || 0}
                onChange={(e) => handleTransformChange({ rotation: parseInt(e.target.value) })}
              />
            </div>

            {/* Quick alignment and flip actions */}
            <div style={{ display: 'flex', gap: '8px', marginTop: '16px', flexWrap: 'wrap' }}>
              <button
                className={`mex-chip-btn ${currentTransform.flipHorizontal ? 'active' : ''}`}
                onClick={() => handleTransformChange({ flipHorizontal: !currentTransform.flipHorizontal })}
              >
                ↔ Flip Horiz
              </button>
              <button
                className={`mex-chip-btn ${currentTransform.flipVertical ? 'active' : ''}`}
                onClick={() => handleTransformChange({ flipVertical: !currentTransform.flipVertical })}
              >
                ↕ Flip Vert
              </button>
              <button
                className={`mex-chip-btn ${currentTransform.fitMode === 'fill' ? 'active' : ''}`}
                onClick={() => handleTransformChange({ fitMode: 'fill', scale: 1.05 })}
              >
                🔲 Fill Frame
              </button>
              <button
                className={`mex-chip-btn ${currentTransform.fitMode === 'fit' ? 'active' : ''}`}
                onClick={() => handleTransformChange({ fitMode: 'fit', scale: 1.0 })}
              >
                🔍 Fit to Screen
              </button>
              <button className="mex-chip-btn danger" onClick={handleResetTransform}>
                ↺ Reset All
              </button>
            </div>
          </div>
        )}

        {/* ────────────────── 2. SPEED TAB ────────────────── */}
        {activeTab === 'speed' && (
          <div className="mex-inspector-section">
            <div className="mex-prop-header">
              <span>Playback Rate</span>
              <span className="mex-prop-val">{(currentSpeed.playbackRate || 1.0).toFixed(2)}x</span>
            </div>
            <input
              type="range"
              min="0.25"
              max="3.0"
              step="0.05"
              className="mex-slider"
              value={currentSpeed.playbackRate || 1.0}
              onChange={(e) => handleSpeedChange(parseFloat(e.target.value))}
            />

            <div style={{ display: 'flex', gap: '6px', marginTop: '12px', flexWrap: 'wrap' }}>
              {[0.5, 0.75, 1.0, 1.25, 1.5, 2.0].map((rate) => (
                <button
                  key={rate}
                  className={`mex-chip-btn ${currentSpeed.playbackRate === rate ? 'active' : ''}`}
                  onClick={() => handleSpeedChange(rate)}
                >
                  {rate}x
                </button>
              ))}
            </div>

            <div style={{ marginTop: '18px', background: 'rgba(0,0,0,0.25)', padding: '12px', borderRadius: '8px', fontSize: '0.8rem', color: '#94a3b8' }}>
              <div style={{ color: '#fff', fontWeight: 600, marginBottom: '4px' }}>
                ⏱️ Pacing & Narration Note
              </div>
              Adjusting clip speed preserves the strict maximum duration (&le; 3.0s) and does not distort the master narration audio. Source playback adjusts smoothly.
            </div>
          </div>
        )}

        {/* ────────────────── 3. COLOR TAB ────────────────── */}
        {activeTab === 'color' && (
          <div className="mex-inspector-section">
            {/* Quick Color Presets */}
            <div style={{ marginBottom: '14px' }}>
              <span style={{ fontSize: '0.78rem', color: '#94a3b8', fontWeight: 600, display: 'block', marginBottom: '6px' }}>
                Color Grading Presets
              </span>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {['Reset', 'Cinematic Warm', 'Moody Cool', 'Punchy Pop', 'Vintage Film', 'Noir B&W'].map((preset) => (
                  <button
                    key={preset}
                    className={`mex-chip-btn ${currentColor.presetName === preset ? 'active' : ''}`}
                    onClick={() => handleApplyColorPreset(preset)}
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>

            {/* Sliders */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div>
                <div className="mex-prop-header">
                  <span>Brightness</span>
                  <span className="mex-prop-val">{currentColor.brightness || 0}</span>
                </div>
                <input
                  type="range"
                  min="-50"
                  max="50"
                  step="1"
                  className="mex-slider"
                  value={currentColor.brightness || 0}
                  onChange={(e) => handleColorChange({ brightness: parseInt(e.target.value) })}
                />
              </div>

              <div>
                <div className="mex-prop-header">
                  <span>Contrast</span>
                  <span className="mex-prop-val">{currentColor.contrast || 0}</span>
                </div>
                <input
                  type="range"
                  min="-50"
                  max="50"
                  step="1"
                  className="mex-slider"
                  value={currentColor.contrast || 0}
                  onChange={(e) => handleColorChange({ contrast: parseInt(e.target.value) })}
                />
              </div>

              <div>
                <div className="mex-prop-header">
                  <span>Saturation</span>
                  <span className="mex-prop-val">{currentColor.saturation || 0}</span>
                </div>
                <input
                  type="range"
                  min="-100"
                  max="100"
                  step="1"
                  className="mex-slider"
                  value={currentColor.saturation || 0}
                  onChange={(e) => handleColorChange({ saturation: parseInt(e.target.value) })}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <div className="mex-prop-header">
                    <span>Temp (Cool/Warm)</span>
                    <span className="mex-prop-val">{currentColor.temperature || 0}</span>
                  </div>
                  <input
                    type="range"
                    min="-50"
                    max="50"
                    step="1"
                    className="mex-slider"
                    value={currentColor.temperature || 0}
                    onChange={(e) => handleColorChange({ temperature: parseInt(e.target.value) })}
                  />
                </div>
                <div>
                  <div className="mex-prop-header">
                    <span>Tint (Green/Mag)</span>
                    <span className="mex-prop-val">{currentColor.tint || 0}</span>
                  </div>
                  <input
                    type="range"
                    min="-50"
                    max="50"
                    step="1"
                    className="mex-slider"
                    value={currentColor.tint || 0}
                    onChange={(e) => handleColorChange({ tint: parseInt(e.target.value) })}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <div className="mex-prop-header">
                    <span>Sharpen</span>
                    <span className="mex-prop-val">{currentColor.sharpen || 0}</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="5"
                    className="mex-slider"
                    value={currentColor.sharpen || 0}
                    onChange={(e) => handleColorChange({ sharpen: parseInt(e.target.value) })}
                  />
                </div>
                <div>
                  <div className="mex-prop-header">
                    <span>Vignette</span>
                    <span className="mex-prop-val">{currentColor.vignette || 0}</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="5"
                    className="mex-slider"
                    value={currentColor.vignette || 0}
                    onChange={(e) => handleColorChange({ vignette: parseInt(e.target.value) })}
                  />
                </div>
              </div>
            </div>

            <div style={{ marginTop: '16px' }}>
              <Button variant="secondary" size="sm" onClick={handleCopyColorToAll} style={{ width: '100%' }}>
                📋 Apply This Color Grade to All Clips
              </Button>
            </div>
          </div>
        )}

        {/* ────────────────── 4. EFFECTS TAB ────────────────── */}
        {activeTab === 'effects' && (
          <div className="mex-inspector-section">
            <span style={{ fontSize: '0.78rem', color: '#94a3b8', fontWeight: 600, display: 'block', marginBottom: '8px' }}>
              Select Visual Filter / Effect
            </span>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              {[
                { id: 'none', label: 'None' },
                { id: 'cinematic', label: '🎬 Cinematic' },
                { id: 'vintage', label: '📻 Vintage 70s' },
                { id: 'bw', label: '🎞️ B&W Classic' },
                { id: 'film_grain', label: '🍿 Film Grain' },
                { id: 'glow', label: '✨ Dream Glow' },
                { id: 'glitch', label: '⚡ Glitch' },
                { id: 'blur', label: '🌫️ Soft Blur' },
                { id: 'warm', label: '🌅 Golden Hour' },
                { id: 'cool', label: '❄️ Cool Dusk' },
              ].map((eff) => (
                <button
                  key={eff.id}
                  className={`mex-chip-btn ${currentEffect.effectType === eff.id ? 'active' : ''}`}
                  onClick={() => handleEffectChange(eff.id)}
                  style={{ textAlign: 'left', padding: '8px 10px' }}
                >
                  {eff.label}
                </button>
              ))}
            </div>

            {currentEffect.effectType !== 'none' && (
              <div style={{ marginTop: '16px' }}>
                <div className="mex-prop-header">
                  <span>Effect Intensity</span>
                  <span className="mex-prop-val">{currentEffect.intensity || 75}%</span>
                </div>
                <input
                  type="range"
                  min="10"
                  max="100"
                  step="5"
                  className="mex-slider"
                  value={currentEffect.intensity || 75}
                  onChange={(e) => handleEffectChange(currentEffect.effectType || currentEffect.type || 'none', parseInt(e.target.value))}
                />
              </div>
            )}

            <div style={{ marginTop: '16px' }}>
              <Button variant="secondary" size="sm" onClick={handleCopyEffectToAll} style={{ width: '100%' }}>
                📋 Apply This Effect to All Clips
              </Button>
            </div>
          </div>
        )}

        {/* ────────────────── 5. BORDER TAB ────────────────── */}
        {activeTab === 'border' && (
          <div className="mex-inspector-section">
            <span style={{ fontSize: '0.78rem', color: '#94a3b8', fontWeight: 600, display: 'block', marginBottom: '8px' }}>
              Frame & Border Style
            </span>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '14px' }}>
              {[
                { id: 'none', label: 'None' },
                { id: 'clean', label: 'Clean Line' },
                { id: 'rounded', label: 'Rounded Box' },
                { id: 'cinematic', label: 'Cinematic Matte' },
                { id: 'gradient', label: 'Gradient Glow' },
              ].map((style) => (
                <button
                  key={style.id}
                  className={`mex-chip-btn ${currentBorder.style === style.id ? 'active' : ''}`}
                  onClick={() => handleBorderChange({ style: style.id as any })}
                >
                  {style.label}
                </button>
              ))}
            </div>

            {currentBorder.style !== 'none' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div>
                  <div className="mex-prop-header">
                    <span>Border Thickness</span>
                    <span className="mex-prop-val">{currentBorder.thickness || 4}px</span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="20"
                    step="1"
                    className="mex-slider"
                    value={currentBorder.thickness || 4}
                    onChange={(e) => handleBorderChange({ thickness: parseInt(e.target.value) })}
                  />
                </div>

                <div>
                  <div className="mex-prop-header">
                    <span>Inner Margin / Padding</span>
                    <span className="mex-prop-val">{currentBorder.padding || 0}px</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="40"
                    step="2"
                    className="mex-slider"
                    value={currentBorder.padding || 0}
                    onChange={(e) => handleBorderChange({ padding: parseInt(e.target.value) })}
                  />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <label className="mex-sublabel">Border Color:</label>
                  <input
                    type="color"
                    value={currentBorder.borderColor || '#ffffff'}
                    onChange={(e) => handleBorderChange({ borderColor: e.target.value })}
                    style={{ background: 'transparent', border: 'none', width: '36px', height: '36px', cursor: 'pointer' }}
                  />
                  <div style={{ display: 'flex', gap: '4px' }}>
                    {['#ffffff', '#000000', '#6366f1', '#fbbf24', '#f43f5e'].map((c) => (
                      <button
                        key={c}
                        onClick={() => handleBorderChange({ borderColor: c })}
                        style={{
                          width: '20px',
                          height: '20px',
                          borderRadius: '4px',
                          backgroundColor: c,
                          border: currentBorder.borderColor === c ? '2px solid #fff' : '1px solid rgba(255,255,255,0.2)',
                          cursor: 'pointer',
                        }}
                      />
                    ))}
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input
                    type="checkbox"
                    id="border-shadow-toggle"
                    checked={currentBorder.hasShadow || false}
                    onChange={(e) => handleBorderChange({ hasShadow: e.target.checked })}
                  />
                  <label htmlFor="border-shadow-toggle" style={{ fontSize: '0.82rem', color: '#cbd5e1', cursor: 'pointer' }}>
                    Enable Drop Shadow & Outer Glow
                  </label>
                </div>
              </div>
            )}

            <div style={{ marginTop: '16px' }}>
              <Button variant="secondary" size="sm" onClick={handleApplyBorderToAll} style={{ width: '100%' }}>
                🖼️ Apply Border to Entire Project Canvas
              </Button>
            </div>
          </div>
        )}

        {/* ────────────────── 6. TEXT OVERLAY TAB ────────────────── */}
        {activeTab === 'text' && (
          <div className="mex-inspector-section">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#fff' }}>
                Text Overlays ({timeline?.textOverlays?.length || 0})
              </span>
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  const start = selectedShot?.timelineStart || 0;
                  const dur = Math.min(3.0, selectedShot?.duration || 3.0);
                  const newOverlay: TimelineTextOverlay = {
                    id: `txt_${Date.now()}`,
                    text: 'Chapter Title',
                    timelineStart: start,
                    timelineEnd: start + dur,
                    startTime: start,
                    duration: dur,
                    positionX: 50,
                    positionY: 82,
                    fontSize: 32,
                    fontFamily: 'Inter, sans-serif',
                    fontWeight: 'bold',
                    fontColor: '#ffffff',
                    color: '#ffffff',
                    backgroundColor: 'rgba(0, 0, 0, 0.6)',
                    outlineColor: '#000000',
                    outlineWidth: 2,
                    alignment: 'center',
                    opacity: 1.0,
                    rotation: 0,
                  };
                  addTextOverlay(newOverlay);
                  showNotification('Added text overlay');
                }}
              >
                + Add Text
              </Button>
            </div>

            {selectedTextOverlay ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div>
                  <label className="mex-sublabel">Text Content</label>
                  <input
                    type="text"
                    className="mex-input"
                    value={selectedTextOverlay.text}
                    onChange={(e) => updateTextOverlay(selectedTextOverlay.id, { text: e.target.value })}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <div>
                    <label className="mex-sublabel">Font Size (px)</label>
                    <input
                      type="number"
                      className="mex-input"
                      value={selectedTextOverlay.fontSize}
                      onChange={(e) => updateTextOverlay(selectedTextOverlay.id, { fontSize: parseInt(e.target.value) || 24 })}
                    />
                  </div>
                  <div>
                    <label className="mex-sublabel">Text Color</label>
                    <input
                      type="color"
                      value={selectedTextOverlay.color}
                      onChange={(e) => updateTextOverlay(selectedTextOverlay.id, { color: e.target.value })}
                      style={{ width: '100%', height: '36px', background: 'transparent', border: 'none', cursor: 'pointer' }}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <div>
                    <label className="mex-sublabel">Position Y (%)</label>
                    <input
                      type="range"
                      min="10"
                      max="90"
                      value={selectedTextOverlay.positionY}
                      onChange={(e) => updateTextOverlay(selectedTextOverlay.id, { positionY: parseInt(e.target.value) })}
                      className="mex-slider"
                    />
                  </div>
                  <div>
                    <label className="mex-sublabel">Duration (s)</label>
                    <input
                      type="number"
                      step="0.5"
                      min="0.5"
                      max="30"
                      className="mex-input"
                      value={selectedTextOverlay.duration}
                      onChange={(e) => updateTextOverlay(selectedTextOverlay.id, { duration: parseFloat(e.target.value) || 2.0 })}
                    />
                  </div>
                </div>

                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => {
                    deleteTextOverlay(selectedTextOverlay.id);
                    showNotification('Text deleted');
                  }}
                >
                  🗑️ Delete Text Layer
                </Button>
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '20px 0', color: '#94a3b8', fontSize: '0.82rem' }}>
                Select a text block from the Text track or click "+ Add Text" to customize titles and lower thirds.
              </div>
            )}
          </div>
        )}

        {/* ────────────────── 7. CAPTIONS TAB ────────────────── */}
        {activeTab === 'captions' && (
          <div className="mex-inspector-section">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
              <span style={{ fontSize: '0.88rem', fontWeight: 700, color: '#fff' }}>
                💬 Subtitle & Caption Controls
              </span>
              <button
                className={`mex-chip-btn ${captionsVisible ? 'active' : ''}`}
                onClick={toggleCaptionsVisible}
                title="Toggle caption visibility across editor and preview"
                style={{ fontSize: '0.72rem' }}
              >
                {captionsVisible ? '👁️ Captions ON' : '🙈 Captions OFF'}
              </button>
            </div>

            {selectedCaption ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {/* Live Caption Preview Card */}
                <div
                  style={{
                    background: '#040711',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '8px',
                    padding: '12px',
                    textAlign: selectedCaption.align || timeline?.captionStyle?.align || 'center',
                    minHeight: '52px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <span
                    style={{
                      background: selectedCaption.backgroundColor || timeline?.captionStyle?.backgroundColor || 'rgba(0,0,0,0.65)',
                      color: selectedCaption.fontColor || timeline?.captionStyle?.fontColor || '#ffffff',
                      fontFamily: selectedCaption.fontFamily || timeline?.captionStyle?.fontFamily || 'Inter, sans-serif',
                      fontSize: `${selectedCaption.fontSize || timeline?.captionStyle?.fontSize || 15}px`,
                      fontWeight: selectedCaption.fontWeight || timeline?.captionStyle?.fontWeight || 600,
                      padding: '4px 12px',
                      borderRadius: '5px',
                      lineHeight: 1.3,
                      textShadow: '0 2px 4px rgba(0,0,0,0.9)',
                      border: '1px solid rgba(255,255,255,0.12)',
                    }}
                  >
                    {selectedCaption.text}
                  </span>
                </div>

                {/* Subtitle Text Edit */}
                <div>
                  <label className="mex-sublabel">Subtitle Text</label>
                  <textarea
                    rows={3}
                    className="mex-textarea"
                    value={selectedCaption.text}
                    onChange={(e) => updateCaption(selectedCaption.id, { text: e.target.value })}
                    placeholder="Enter subtitle text..."
                  />
                </div>

                {/* Timing controls */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
                  <div>
                    <label className="mex-sublabel">Start (s)</label>
                    <input
                      type="number"
                      step="0.05"
                      className="mex-input"
                      value={selectedCaption.startTime}
                      onChange={(e) => updateCaption(selectedCaption.id, { startTime: parseFloat(e.target.value) || 0 })}
                    />
                  </div>
                  <div>
                    <label className="mex-sublabel">End (s)</label>
                    <input
                      type="number"
                      step="0.05"
                      className="mex-input"
                      value={selectedCaption.endTime}
                      onChange={(e) => updateCaption(selectedCaption.id, { endTime: parseFloat(e.target.value) || 0 })}
                    />
                  </div>
                  <div>
                    <label className="mex-sublabel">Duration</label>
                    <div style={{ padding: '6px 8px', background: 'rgba(255,255,255,0.05)', borderRadius: '6px', fontSize: '0.8rem', color: '#38bdf8', fontFamily: 'monospace', textAlign: 'center' }}>
                      {(selectedCaption.endTime - selectedCaption.startTime).toFixed(2)}s
                    </div>
                  </div>
                </div>

                {/* Preset Templates Selector */}
                <div>
                  <div className="mex-prop-header">
                    <span>Preset Templates</span>
                    <button
                      className="btn btn-ghost btn-xs"
                      onClick={() => {
                        const style = {
                          fontSize: selectedCaption.fontSize,
                          fontFamily: selectedCaption.fontFamily,
                          fontWeight: selectedCaption.fontWeight,
                          fontColor: selectedCaption.fontColor,
                          backgroundColor: selectedCaption.backgroundColor,
                          backgroundOpacity: selectedCaption.backgroundOpacity,
                          outlineThickness: selectedCaption.outlineThickness,
                          outlineColor: selectedCaption.outlineColor,
                          align: selectedCaption.align,
                          positionY: selectedCaption.positionY,
                          maxWidth: selectedCaption.maxWidth,
                          animation: selectedCaption.animation,
                          highlightColor: selectedCaption.highlightColor,
                        };
                        updateCaptionStyle(style);
                        showNotification('Applied to all project subtitles!');
                      }}
                      title="Apply current subtitle style across all captions in project"
                      style={{ fontSize: '0.7rem', color: '#c084fc' }}
                    >
                      🌐 Apply to All
                    </button>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                    {Object.entries(CAPTION_PRESETS).map(([key, p]) => (
                      <button
                        key={key}
                        className={`mex-chip-btn ${selectedCaption.animation === p.animation && (selectedCaption.fontColor === p.fontColor || !selectedCaption.fontColor) ? 'active' : ''}`}
                        onClick={() => {
                          updateCaption(selectedCaption.id, {
                            fontSize: p.fontSize,
                            fontFamily: p.fontFamily,
                            fontWeight: p.fontWeight,
                            fontColor: p.fontColor,
                            backgroundColor: p.backgroundColor,
                            backgroundOpacity: p.backgroundOpacity,
                            outlineThickness: p.outlineThickness,
                            outlineColor: p.outlineColor,
                            shadow: p.shadow,
                            align: p.align,
                            positionY: p.positionY,
                            bottomMargin: p.bottomMargin,
                            maxWidth: p.maxWidth,
                            lineSpacing: p.lineSpacing,
                            letterSpacing: p.letterSpacing,
                            animation: p.animation,
                            highlightColor: p.highlightColor,
                          });
                        }}
                        style={{ fontSize: '0.72rem', textAlign: 'left', padding: '6px 8px' }}
                      >
                        {key === 'minimal_bottom' && '📄 Minimal Bottom'}
                        {key === 'clean_white' && '✨ Clean White'}
                        {key === 'cinematic' && '🎬 Cinematic Gold'}
                        {key === 'typewriter' && '⌨️ Typewriter Cyan'}
                        {key === 'word_highlight' && '🟡 Word Highlight'}
                        {key === 'karaoke' && '🎤 Karaoke Pulse'}
                        {key === 'bold_emphasis' && '🔥 Bold Emphasis'}
                        {key === 'compact_two_line' && '📑 Compact 2-Line'}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Typography Controls */}
                <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '8px', padding: '10px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#e2e8f0' }}>Typography & Appearance</span>

                  {/* Font Size */}
                  <div>
                    <div className="mex-prop-header">
                      <span>Font Size</span>
                      <span className="mex-prop-val">{selectedCaption.fontSize || timeline?.captionStyle?.fontSize || 15}px</span>
                    </div>
                    <input
                      type="range"
                      min="10"
                      max="34"
                      step="1"
                      className="mex-slider"
                      value={selectedCaption.fontSize || timeline?.captionStyle?.fontSize || 15}
                      onChange={(e) => updateCaption(selectedCaption.id, { fontSize: parseInt(e.target.value) })}
                    />
                  </div>

                  {/* Font Family & Weight */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    <div>
                      <label className="mex-sublabel">Font Family</label>
                      <select
                        className="mex-select"
                        value={selectedCaption.fontFamily || timeline?.captionStyle?.fontFamily || 'Inter, sans-serif'}
                        onChange={(e) => updateCaption(selectedCaption.id, { fontFamily: e.target.value })}
                        style={{ fontSize: '0.74rem' }}
                      >
                        <option value="Inter, sans-serif">Inter (Modern Clean)</option>
                        <option value="Roboto, sans-serif">Roboto</option>
                        <option value="Consolas, monospace">Consolas (Typewriter)</option>
                        <option value="Georgia, serif">Georgia (Cinematic)</option>
                        <option value="Impact, Arial Black, sans-serif">Impact (Bold)</option>
                      </select>
                    </div>
                    <div>
                      <label className="mex-sublabel">Weight</label>
                      <select
                        className="mex-select"
                        value={selectedCaption.fontWeight || timeline?.captionStyle?.fontWeight || '600'}
                        onChange={(e) => updateCaption(selectedCaption.id, { fontWeight: e.target.value })}
                        style={{ fontSize: '0.74rem' }}
                      >
                        <option value="400">Regular (400)</option>
                        <option value="600">Semi-Bold (600)</option>
                        <option value="700">Bold (700)</option>
                        <option value="800">Extra-Bold (800)</option>
                        <option value="900">Black (900)</option>
                      </select>
                    </div>
                  </div>

                  {/* Text Color & Background Opacity */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    <div>
                      <label className="mex-sublabel">Text Color</label>
                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                        <input
                          type="color"
                          value={selectedCaption.fontColor || timeline?.captionStyle?.fontColor || '#ffffff'}
                          onChange={(e) => updateCaption(selectedCaption.id, { fontColor: e.target.value })}
                          style={{ width: '28px', height: '28px', border: 'none', borderRadius: '4px', cursor: 'pointer', background: 'transparent' }}
                        />
                        <span style={{ fontSize: '0.75rem', fontFamily: 'monospace' }}>
                          {selectedCaption.fontColor || '#ffffff'}
                        </span>
                      </div>
                    </div>
                    <div>
                      <label className="mex-sublabel">Background Box</label>
                      <select
                        className="mex-select"
                        value={selectedCaption.backgroundColor || timeline?.captionStyle?.backgroundColor || 'rgba(0,0,0,0.65)'}
                        onChange={(e) => updateCaption(selectedCaption.id, { backgroundColor: e.target.value })}
                        style={{ fontSize: '0.74rem' }}
                      >
                        <option value="transparent">None (Transparent)</option>
                        <option value="rgba(0,0,0,0.5)">Dark 50%</option>
                        <option value="rgba(0,0,0,0.75)">Dark 75%</option>
                        <option value="rgba(15,23,42,0.85)">Navy Blue 85%</option>
                        <option value="rgba(0,0,0,0.95)">Solid Black</option>
                      </select>
                    </div>
                  </div>

                  {/* Outline Thickness & Color */}
                  <div>
                    <div className="mex-prop-header">
                      <span>Outline Thickness</span>
                      <span className="mex-prop-val">{selectedCaption.outlineThickness ?? timeline?.captionStyle?.outlineThickness ?? 2}px</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="6"
                      step="1"
                      className="mex-slider"
                      value={selectedCaption.outlineThickness ?? timeline?.captionStyle?.outlineThickness ?? 2}
                      onChange={(e) => updateCaption(selectedCaption.id, { outlineThickness: parseInt(e.target.value) })}
                    />
                  </div>

                  {/* Horizontal Alignment */}
                  <div>
                    <label className="mex-sublabel">Text Alignment</label>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      {(['left', 'center', 'right'] as const).map((al) => (
                        <button
                          key={al}
                          className={`mex-chip-btn ${(selectedCaption.align || timeline?.captionStyle?.align || 'center') === al ? 'active' : ''}`}
                          onClick={() => updateCaption(selectedCaption.id, { align: al })}
                          style={{ flex: 1, textTransform: 'capitalize' }}
                        >
                          {al}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Vertical Position (Safe Bottom Position) */}
                  <div>
                    <div className="mex-prop-header">
                      <span>Vertical Position Y</span>
                      <span className="mex-prop-val">{selectedCaption.positionY ?? timeline?.captionStyle?.positionY ?? 89}%</span>
                    </div>
                    <input
                      type="range"
                      min="50"
                      max="96"
                      step="1"
                      className="mex-slider"
                      value={selectedCaption.positionY ?? timeline?.captionStyle?.positionY ?? 89}
                      onChange={(e) => updateCaption(selectedCaption.id, { positionY: parseInt(e.target.value) })}
                    />
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', color: '#64748b', marginTop: '2px' }}>
                      <span>Middle (50%)</span>
                      <span>Safe Bottom (89%)</span>
                      <span>Extreme Edge (96%)</span>
                    </div>
                  </div>

                  {/* Maximum Width */}
                  <div>
                    <div className="mex-prop-header">
                      <span>Maximum Width</span>
                      <span className="mex-prop-val">{selectedCaption.maxWidth ?? timeline?.captionStyle?.maxWidth ?? 75}%</span>
                    </div>
                    <input
                      type="range"
                      min="40"
                      max="95"
                      step="5"
                      className="mex-slider"
                      value={selectedCaption.maxWidth ?? timeline?.captionStyle?.maxWidth ?? 75}
                      onChange={(e) => updateCaption(selectedCaption.id, { maxWidth: parseInt(e.target.value) })}
                    />
                  </div>
                </div>

                {/* Animation & Reveal Mode */}
                <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '8px', padding: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#e2e8f0' }}>Animation & Reveal</span>
                  <div>
                    <label className="mex-sublabel">Animation Style</label>
                    <select
                      className="mex-select"
                      value={selectedCaption.animation || timeline?.captionStyle?.animation || 'none'}
                      onChange={(e) => updateCaption(selectedCaption.id, { animation: e.target.value as any })}
                      style={{ fontSize: '0.74rem' }}
                    >
                      <option value="none">Instant (Standard)</option>
                      <option value="typewriter">⌨️ Typewriter (Progressive letters)</option>
                      <option value="word_by_word">🟡 Word-by-Word Reveal</option>
                      <option value="karaoke">🎤 Karaoke Highlight</option>
                      <option value="fade">✨ Subtle Fade In/Out</option>
                    </select>
                  </div>

                  {(selectedCaption.animation === 'word_by_word' || selectedCaption.animation === 'karaoke') && (
                    <div>
                      <label className="mex-sublabel">Highlight Color</label>
                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                        <input
                          type="color"
                          value={selectedCaption.highlightColor || timeline?.captionStyle?.highlightColor || '#facc15'}
                          onChange={(e) => updateCaption(selectedCaption.id, { highlightColor: e.target.value })}
                          style={{ width: '28px', height: '28px', border: 'none', borderRadius: '4px', cursor: 'pointer', background: 'transparent' }}
                        />
                        <span style={{ fontSize: '0.75rem', fontFamily: 'monospace' }}>
                          {selectedCaption.highlightColor || '#facc15'}
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Split, Merge, Reset, Delete Actions */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => splitCaption(selectedCaption.id, currentTime)}
                      title="Split caption into two at the current playhead position"
                    >
                      ✂️ Split at Playhead
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        const caps = timeline?.captions || [];
                        const idx = caps.findIndex((c) => c.id === selectedCaption.id);
                        if (idx < caps.length - 1) {
                          mergeCaptions(selectedCaption.id, caps[idx + 1].id);
                        } else {
                          showNotification('No following caption to merge with.');
                        }
                      }}
                      title="Merge this caption with the next caption"
                    >
                      🔗 Merge Next
                    </Button>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        const def = CAPTION_PRESETS['clean_white'];
                        updateCaption(selectedCaption.id, { ...def });
                        showNotification('Reset to default style');
                      }}
                      title="Reset subtitle style to clean white default"
                    >
                      🔄 Reset Style
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => deleteCaption(selectedCaption.id)}
                      title="Delete this caption from the project"
                    >
                      🗑️ Delete Subtitle
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '10px 0' }}>
                <div style={{ fontSize: '0.82rem', color: '#94a3b8', lineHeight: '1.5' }}>
                  No individual caption selected. Choose a global subtitle preset or click any subtitle block on the timeline to customize it.
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label className="mex-sublabel">Global Project Subtitle Presets</label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                    {Object.entries(CAPTION_PRESETS).map(([key]) => (
                      <button
                        key={key}
                        className={`mex-chip-btn ${timeline?.captionStyle?.preset === key ? 'active' : ''}`}
                        onClick={() => applyCaptionPreset(key)}
                        style={{ fontSize: '0.72rem', textAlign: 'left', padding: '6px 8px' }}
                      >
                        {key === 'minimal_bottom' && '📄 Minimal Bottom'}
                        {key === 'clean_white' && '✨ Clean White'}
                        {key === 'cinematic' && '🎬 Cinematic Gold'}
                        {key === 'typewriter' && '⌨️ Typewriter Cyan'}
                        {key === 'word_highlight' && '🟡 Word Highlight'}
                        {key === 'karaoke' && '🎤 Karaoke Pulse'}
                        {key === 'bold_emphasis' && '🔥 Bold Emphasis'}
                        {key === 'compact_two_line' && '📑 Compact 2-Line'}
                      </button>
                    ))}
                  </div>
                </div>

                <div style={{ marginTop: '8px' }}>
                  <label className="mex-sublabel">Global Font Size</label>
                  <input
                    type="range"
                    min="10"
                    max="32"
                    step="1"
                    className="mex-slider"
                    value={timeline?.captionStyle?.fontSize || 15}
                    onChange={(e) => updateCaptionStyle({ fontSize: parseInt(e.target.value) })}
                  />
                  <div style={{ textAlign: 'right', fontSize: '0.74rem', color: '#c084fc', fontFamily: 'monospace', marginTop: '2px' }}>
                    {timeline?.captionStyle?.fontSize || 15}px
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ────────────────── 8. AI & RIGHTS TAB ────────────────── */}
        {activeTab === 'ai' && selectedShot && (
          <div className="mex-inspector-section">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <span style={{ fontWeight: 700, fontSize: '0.88rem', color: '#fff' }}>
                AI Scene Story Match
              </span>
              <span className={`mex-score-pill ${selectedShot.matchScore >= 75 ? 'high' : 'low'}`}>
                {Math.round(selectedShot.matchScore)}% Match Score
              </span>
            </div>

            <div style={{ background: 'rgba(0,0,0,0.3)', padding: '10px 12px', borderRadius: '8px', fontSize: '0.82rem', marginBottom: '12px', lineHeight: '1.5' }}>
              <div style={{ color: '#94a3b8', marginBottom: '4px' }}>
                <strong>Narration Segment:</strong>
              </div>
              <div style={{ color: '#f1f5f9' }}>"{selectedShot.sentenceText || 'Scene visual'}"</div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
              <span style={{ fontSize: '0.82rem', color: '#94a3b8' }}>Clip Editability:</span>
              <button
                className={`mex-chip-btn ${selectedShot.isLocked ? 'active' : ''}`}
                onClick={() => toggleShotLock(selectedShot.shotId)}
                title={selectedShot.isLocked ? 'Clip is locked against AI re-matching. Click to unlock.' : 'Clip is fully editable. Click to lock against AI.'}
              >
                {selectedShot.isLocked ? '🔒 Locked (Protected from AI)' : '🔓 Unlocked (Fully Editable)'}
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <Button variant="secondary" size="sm" onClick={() => setIsWhyModalOpen(true)}>
                💡 Why This Scene? (AI Rationale)
              </Button>
              <Button variant="secondary" size="sm" onClick={() => openAlternativesModal(selectedShot.shotId)}>
                🔍 Find Alternative Scenes
              </Button>
              <Button variant="ghost" size="sm" onClick={regenerateTimeline} title="Regenerates unlocked shots while preserving locked ones">
                🔄 Regenerate Unlocked Shots
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
