import React from 'react';
import type { Short, ReframeMode } from '@shared/types.js';

interface CaptionEditorProps {
  short: Short;
  onChange: (captionsEnabled: boolean, reframeMode: ReframeMode) => void;
}

export const CaptionEditor: React.FC<CaptionEditorProps> = ({ short, onChange }) => {
  return (
    <div className="card caption-editor-card">
      <h4>⚡ Short Customization</h4>

      <div className="form-group" style={{ marginTop: '12px' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={short.captionsEnabled}
            onChange={(e) => onChange(e.target.checked, short.reframeMode)}
          />
          <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Burn Animated Captions (Synced Subtitles)</span>
        </label>
      </div>

      <div className="form-group" style={{ marginTop: '12px' }}>
        <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>9:16 Smart Reframing Mode</span>
          <span style={{ fontSize: '0.74rem', color: short.reframeMode === 'blur_fill' ? '#34D399' : '#FBBF24', fontWeight: 600 }}>
            {short.reframeMode === 'blur_fill' ? '✨ 100% Full Quality' : '⚠️ Digital Zoom (Cropped)'}
          </span>
        </label>
        <select
          className="input"
          value={short.reframeMode}
          onChange={(e) => onChange(short.captionsEnabled, e.target.value as any)}
          style={{
            borderColor: short.reframeMode === 'blur_fill' ? '#10B981' : 'rgba(255, 255, 255, 0.15)',
            background: short.reframeMode === 'blur_fill' ? 'rgba(16, 185, 129, 0.12)' : undefined,
          }}
        >
          <option value="blur_fill">🖼️ Lossless Blur (100% Original Sharpness & Full Frame — Recommended)</option>
          <option value="action">🎯 Smart Action (Sports Tracking — 2.7x Digital Zoom Crop)</option>
          <option value="face">👤 Subject / Speaker Focus (Cropped)</option>
          <option value="center">📐 Center Crop (Fixed 2.7x Crop)</option>
        </select>

        {short.reframeMode === 'blur_fill' ? (
          <div
            style={{
              marginTop: '8px',
              padding: '8px 12px',
              borderRadius: '6px',
              background: 'rgba(16, 185, 129, 0.12)',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              fontSize: '0.78rem',
              color: '#6EE7B7',
              lineHeight: 1.45,
            }}
          >
            ✓ <strong>Pristine 100% Quality:</strong> Retains all original pixels, full pitch width, all players, ball, and goal without any digital zoom degradation.
          </div>
        ) : (
          <div
            style={{
              marginTop: '8px',
              padding: '8px 12px',
              borderRadius: '6px',
              background: 'rgba(245, 158, 11, 0.12)',
              border: '1px solid rgba(245, 158, 11, 0.35)',
              fontSize: '0.78rem',
              color: '#FCD34D',
              lineHeight: 1.45,
            }}
          >
            ⚠️ <strong>Why this looks soft / blurry:</strong> Cropping 16:9 landscape footage into 9:16 forces a <strong>2.7x digital zoom</strong> (magnifying ~405px of width to 1080px).
            <button
              type="button"
              onClick={() => onChange(short.captionsEnabled, 'blur_fill')}
              style={{
                display: 'block',
                marginTop: '6px',
                background: 'rgba(16, 185, 129, 0.25)',
                border: '1px solid #10B981',
                color: '#34D399',
                padding: '4px 10px',
                borderRadius: '4px',
                fontSize: '0.74rem',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              👉 Switch to Lossless Blur (100% Original Sharpness)
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
