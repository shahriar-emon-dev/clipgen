import React, { useEffect, useState } from 'react';
import { api } from '../../services/api.js';
import type { AppSettings } from '@shared/types.js';
import { Spinner } from '../common/Spinner.js';

export const SettingsPage: React.FC = () => {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getSettings()
      .then((data) => {
        setSettings(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0' }}>
        <Spinner size="lg" label="Loading settings..." />
      </div>
    );
  }

  return (
    <div className="settings-container">
      <div className="card settings-card">
        <h3>⚙️ Processing & AI Settings</h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '20px' }}>
          Centralized configuration for chunking, scoring weights, transcription engine, and AI model.
        </p>

        {settings && (
          <div className="settings-grid">
            <div className="setting-row">
              <span className="setting-label">AI Highlight Model</span>
              <span className="setting-value">{settings.aiModel} ({settings.aiProvider.toUpperCase()})</span>
            </div>

            <div className="setting-row">
              <span className="setting-label">Speech Transcription Engine</span>
              <span className="setting-value">{settings.transcriptionProvider === 'openai' ? 'OpenAI Whisper API' : 'Local faster-whisper'}</span>
            </div>

            <div className="setting-row">
              <span className="setting-label">Analysis Chunk Window</span>
              <span className="setting-value">{settings.pipelineConfig.analysisChunkSize}s (with {settings.pipelineConfig.chunkOverlap}s overlap)</span>
            </div>

            <div className="setting-row">
              <span className="setting-label">Max Short Duration</span>
              <span className="setting-value">{settings.pipelineConfig.maxShortDuration} seconds</span>
            </div>

            <div className="setting-row">
              <span className="setting-label">Output Aspect Ratio</span>
              <span className="setting-value">{settings.pipelineConfig.outputWidth} × {settings.pipelineConfig.outputHeight} (9:16)</span>
            </div>

            <div className="setting-row">
              <span className="setting-label">Output Framerate</span>
              <span className="setting-value">{settings.pipelineConfig.outputFps} FPS</span>
            </div>
          </div>
        )}
      </div>

      <div className="card settings-card" style={{ marginTop: '20px' }}>
        <h3>⚖️ Multi-Signal Scoring Weights</h3>
        <div className="weights-grid" style={{ marginTop: '12px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '12px' }}>
          <div className="weight-item">
            <span className="weight-name">🪝 Hook Strength</span>
            <span className="weight-pct">20%</span>
          </div>
          <div className="weight-item">
            <span className="weight-name">❤️ Emotional Intensity</span>
            <span className="weight-pct">15%</span>
          </div>
          <div className="weight-item">
            <span className="weight-name">💡 Information Value</span>
            <span className="weight-pct">15%</span>
          </div>
          <div className="weight-item">
            <span className="weight-name">😲 Surprise / Novelty</span>
            <span className="weight-pct">15%</span>
          </div>
          <div className="weight-item">
            <span className="weight-name">📖 Story Completeness</span>
            <span className="weight-pct">15%</span>
          </div>
          <div className="weight-item">
            <span className="weight-name">🎬 Visual Interest</span>
            <span className="weight-pct">10%</span>
          </div>
          <div className="weight-item">
            <span className="weight-name">🔊 Audio Energy</span>
            <span className="weight-pct">5%</span>
          </div>
          <div className="weight-item">
            <span className="weight-name">📱 Shorts Potential</span>
            <span className="weight-pct">5%</span>
          </div>
        </div>
      </div>
    </div>
  );
};
