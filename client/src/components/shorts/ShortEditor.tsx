import React, { useState } from 'react';
import type { Short, Video } from '@shared/types.js';
import { ShortPreview } from './ShortPreview.js';
import { CaptionEditor } from './CaptionEditor.js';
import { ExportDialog } from './ExportDialog.js';
import { Button } from '../common/Button.js';
import { useShortsStore } from '../../stores/shortsStore.js';

interface ShortEditorProps {
  short: Short;
  video?: Video;
  onBack: () => void;
}

export const ShortEditor: React.FC<ShortEditorProps> = ({ short, video, onBack }) => {
  const [title, setTitle] = useState(short.title || '');
  const [startTime, setStartTime] = useState(short.startTime);
  const [endTime, setEndTime] = useState(short.endTime);
  const [showExport, setShowExport] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isAutoFraming, setIsAutoFraming] = useState(false);

  const { updateShort, exportShort, autoFrameHighlight } = useShortsStore();

  const handleTitleBlur = async () => {
    if (title.trim() && title !== short.title) {
      await updateShort(short.id, { title: title.trim() } as any);
    }
  };

  const handleTimeChange = async () => {
    setIsSaving(true);
    try {
      await updateShort(short.id, {
        startTime,
        endTime,
      });
      // Re-trigger render
      await exportShort(short.id);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCustomizationChange = async (captionsEnabled: boolean, reframeMode: any) => {
    await updateShort(short.id, {
      captionsEnabled,
      reframeMode,
    });
    await exportShort(short.id);
  };

  const handleAutoFrame = async () => {
    if (!short.highlightId) return;
    setIsAutoFraming(true);
    try {
      const updatedCandidate = await autoFrameHighlight(short.highlightId);
      if (updatedCandidate?.framingMode) {
        await updateShort(short.id, {
          reframeMode: updatedCandidate.framingMode,
        });
        await exportShort(short.id);
      }
    } catch (err) {
      console.error('Auto frame failed:', err);
    } finally {
      setIsAutoFraming(false);
    }
  };

  const duration = Math.max(0, endTime - startTime);
  const sourceVideoUrl = video ? `/api/files/${video.projectId}/${video.filename}` : undefined;

  return (
    <div className="short-editor-layout">
      <div className="short-editor-main">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <button className="btn btn-ghost btn-sm" onClick={onBack}>
            ← Back to Highlights
          </button>
          <div style={{ display: 'flex', gap: '8px' }}>
            <Button
              variant="secondary"
              size="md"
              onClick={handleAutoFrame}
              loading={isAutoFraming}
              title="Automatically calculate optimal sports/action framing via OpenCV"
              style={{
                background: 'rgba(99, 102, 241, 0.15)',
                borderColor: 'rgba(99, 102, 241, 0.4)',
                color: '#C7D2FE',
                fontWeight: 600,
              }}
            >
              ✨ Auto Frame
            </Button>

            <Button variant="primary" size="md" onClick={() => setShowExport(true)}>
              Export & Download
            </Button>
          </div>
        </div>

        <div className="short-editor-workspace">
          <ShortPreview
            short={short}
            sourceVideoUrl={sourceVideoUrl}
          />

          <div className="short-editor-controls">
            {/* Title Editing Card */}
            <div className="card" style={{ padding: '14px 18px', marginBottom: '14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <label className="form-label" style={{ margin: 0, fontWeight: 700, color: '#FFFFFF' }}>
                  ✨ Human Short Title
                </label>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                  Auto-slugged into download filename
                </span>
              </div>
              <input
                className="input"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={handleTitleBlur}
                placeholder="Give this Short a meaningful title..."
                style={{ fontWeight: 600, fontSize: '0.92rem' }}
              />
            </div>

            {/* Precise Boundary Trimming */}
            <div className="card trim-controls-card">
              <h4>⏱️ Precise 30-Second Boundary Trimming</h4>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '12px' }}>
                Adjust start/end markers to ensure natural sentence boundaries and crisp punchlines.
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="form-group">
                  <label className="form-label">Start Time (sec)</label>
                  <input
                    className="input"
                    type="number"
                    step="0.1"
                    value={startTime}
                    onChange={(e) => setStartTime(parseFloat(e.target.value) || 0)}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">End Time (sec)</label>
                  <input
                    className="input"
                    type="number"
                    step="0.1"
                    value={endTime}
                    onChange={(e) => setEndTime(parseFloat(e.target.value) || 0)}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: duration > 30 ? 'var(--error)' : 'var(--success)' }}>
                  Total Duration: {duration.toFixed(1)}s {duration > 30 ? '(Exceeds 30s limit)' : '(Optimal)'}
                </span>

                <Button variant="secondary" size="sm" onClick={handleTimeChange} loading={isSaving}>
                  Apply Trim & Re-render
                </Button>
              </div>
            </div>

            {/* Customization & Reframing */}
            <CaptionEditor short={short} onChange={handleCustomizationChange} />
          </div>
        </div>
      </div>

      <ExportDialog
        short={{ ...short, title: title || short.title }}
        isOpen={showExport}
        onClose={() => setShowExport(false)}
      />
    </div>
  );
};
