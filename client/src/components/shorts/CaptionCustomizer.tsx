import React from 'react';
import type { CaptionStyle, CaptionPosition } from '@shared/types.js';

interface CaptionCustomizerProps {
  captionStyle: CaptionStyle;
  onChange: (style: Partial<CaptionStyle>) => void;
  enabled: boolean;
  onToggleEnabled: (enabled: boolean) => void;
  onClose?: () => void;
}

const PRESETS = [
  {
    name: '⚡ TikTok Viral',
    style: {
      fontSize: 32,
      fontColor: '#FFFFFF',
      backgroundColor: '#000000',
      backgroundOpacity: 0.8,
      outlineColor: '#000000',
      outlineWidth: 3,
      position: 'bottom' as CaptionPosition,
      maxWordsPerLine: 3,
      uppercase: true,
    },
  },
  {
    name: '🔥 Yellow Highlight',
    style: {
      fontSize: 30,
      fontColor: '#FFE600',
      backgroundColor: 'rgba(0,0,0,0.6)',
      backgroundOpacity: 0.6,
      outlineColor: '#000000',
      outlineWidth: 2,
      position: 'center' as CaptionPosition,
      maxWordsPerLine: 2,
      uppercase: true,
    },
  },
  {
    name: '✨ Clean Minimal',
    style: {
      fontSize: 26,
      fontColor: '#FFFFFF',
      backgroundColor: 'transparent',
      backgroundOpacity: 0,
      outlineColor: '#000000',
      outlineWidth: 2,
      position: 'bottom' as CaptionPosition,
      maxWordsPerLine: 4,
      uppercase: false,
    },
  },
  {
    name: '💎 Bold Neon Box',
    style: {
      fontSize: 28,
      fontColor: '#00F0FF',
      backgroundColor: '#0A0A14',
      backgroundOpacity: 0.9,
      outlineColor: '#00F0FF',
      outlineWidth: 1,
      position: 'top' as CaptionPosition,
      maxWordsPerLine: 3,
      uppercase: true,
    },
  },
];

export const CaptionCustomizer: React.FC<CaptionCustomizerProps> = ({
  captionStyle,
  onChange,
  enabled,
  onToggleEnabled,
  onClose,
}) => {
  return (
    <div className="caption-customizer-panel">
      <div className="panel-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '1.2rem' }}>🎨</span>
          <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>Caption Customization</h4>
        </div>
        {onClose && (
          <button className="panel-close-btn" onClick={onClose}>✕</button>
        )}
      </div>

      {/* Enable/Disable Toggle */}
      <div className="customizer-section toggle-row">
        <label className="switch-label">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => onToggleEnabled(e.target.checked)}
          />
          <span className="switch-slider" />
          <span className="switch-text">Show Captions on Short</span>
        </label>
      </div>

      {enabled && (
        <>
          {/* Quick Style Presets */}
          <div className="customizer-section">
            <label className="section-label">Style Presets</label>
            <div className="preset-grid">
              {PRESETS.map((preset) => (
                <button
                  key={preset.name}
                  className="preset-btn"
                  onClick={() => onChange(preset.style)}
                >
                  {preset.name}
                </button>
              ))}
            </div>
          </div>

          {/* Position Selector */}
          <div className="customizer-section">
            <label className="section-label">Screen Position</label>
            <div className="position-button-group">
              {(['top', 'center', 'bottom'] as CaptionPosition[]).map((pos) => (
                <button
                  key={pos}
                  className={`pos-btn ${captionStyle.position === pos ? 'active' : ''}`}
                  onClick={() => onChange({ position: pos })}
                >
                  {pos === 'top' ? '⬆ Top' : pos === 'center' ? '⏺ Center' : '⬇ Bottom'}
                </button>
              ))}
            </div>
          </div>

          {/* Font Size & Words Per Line */}
          <div className="customizer-grid-2">
            <div className="customizer-field">
              <label className="field-label">Font Size: {captionStyle.fontSize || 28}px</label>
              <input
                type="range"
                min="18"
                max="44"
                step="2"
                value={captionStyle.fontSize || 28}
                onChange={(e) => onChange({ fontSize: parseInt(e.target.value) })}
                className="range-slider"
              />
            </div>

            <div className="customizer-field">
              <label className="field-label">Words Per Line: {captionStyle.maxWordsPerLine || 3}</label>
              <input
                type="range"
                min="1"
                max="6"
                step="1"
                value={captionStyle.maxWordsPerLine || 3}
                onChange={(e) => onChange({ maxWordsPerLine: parseInt(e.target.value) })}
                className="range-slider"
              />
            </div>
          </div>

          {/* Capitalization & Box Background */}
          <div className="customizer-grid-2" style={{ marginTop: '12px' }}>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={!!captionStyle.uppercase}
                onChange={(e) => onChange({ uppercase: e.target.checked })}
              />
              <span>ALL CAPS (Uppercase)</span>
            </label>

            <div className="customizer-field">
              <label className="field-label">Box Opacity: {Math.round((captionStyle.backgroundOpacity || 0) * 100)}%</label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={captionStyle.backgroundOpacity ?? 0.8}
                onChange={(e) => onChange({ backgroundOpacity: parseFloat(e.target.value) })}
                className="range-slider"
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
};
