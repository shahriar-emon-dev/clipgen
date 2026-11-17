// ============================================================
// Movie Explanation — Why This Scene Modal
// Explains evidence-based reasoning for every selected shot:
// character match, action match, cause-and-effect, and timecodes.
// ============================================================

import React from 'react';
import { useMovieExplanationStore } from '../../stores/movieExplanationStore.js';
import { Button } from '../common/Button.js';

export const WhyThisSceneModal: React.FC = () => {
  const {
    project,
    selectedShotId,
    isWhyModalOpen,
    setIsWhyModalOpen,
  } = useMovieExplanationStore();

  if (!isWhyModalOpen) return null;

  const timeline = project?.timeline;
  const shots = timeline?.shots || [];
  const selectedShot = shots.find((s) => s.shotId === selectedShotId) || shots[0];

  if (!selectedShot) return null;

  const why = selectedShot.whyThisScene;

  return (
    <div className="mex-modal-backdrop" onClick={() => setIsWhyModalOpen(false)}>
      <div className="mex-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="mex-modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '1.2rem' }}>💡</span>
            <span style={{ fontWeight: 800, fontSize: '1rem', color: '#fff' }}>
              Why was this scene selected?
            </span>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={() => setIsWhyModalOpen(false)}>
            ✕
          </button>
        </div>

        <div className="mex-modal-body">
          {/* Header Summary */}
          <div style={{ background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.25)', borderRadius: '8px', padding: '12px' }}>
            <div style={{ fontWeight: 700, fontSize: '0.92rem', color: '#a5b4fc', marginBottom: '4px' }}>
              {selectedShot.sceneId} • Match Confidence: {Math.round(selectedShot.matchScore)}%
            </div>
            <p style={{ fontSize: '0.84rem', color: '#e2e8f0', margin: 0, lineHeight: '1.5' }}>
              {why.fullSummary}
            </p>
          </div>

          {/* Evidence Breakdown Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '12px' }}>
            <div style={{ background: 'rgba(0,0,0,0.3)', padding: '12px', borderRadius: '8px', borderLeft: '3px solid #6366f1' }}>
              <div style={{ fontSize: '0.74rem', textTransform: 'uppercase', color: '#a5b4fc', fontWeight: 700 }}>
                Character Presence
              </div>
              <div style={{ fontSize: '0.82rem', marginTop: '4px', color: '#f1f5f9' }}>
                {why.characterMatch}
              </div>
            </div>

            <div style={{ background: 'rgba(0,0,0,0.3)', padding: '12px', borderRadius: '8px', borderLeft: '3px solid #f59e0b' }}>
              <div style={{ fontSize: '0.74rem', textTransform: 'uppercase', color: '#fcd34d', fontWeight: 700 }}>
                Action & Confrontation
              </div>
              <div style={{ fontSize: '0.82rem', marginTop: '4px', color: '#f1f5f9' }}>
                {why.actionMatch}
              </div>
            </div>

            <div style={{ background: 'rgba(0,0,0,0.3)', padding: '12px', borderRadius: '8px', borderLeft: '3px solid #10b981' }}>
              <div style={{ fontSize: '0.74rem', textTransform: 'uppercase', color: '#6ee7b7', fontWeight: 700 }}>
                Cause & Narrative Progression
              </div>
              <div style={{ fontSize: '0.82rem', marginTop: '4px', color: '#f1f5f9' }}>
                {why.storyContextReason}
              </div>
            </div>

            <div style={{ background: 'rgba(0,0,0,0.3)', padding: '12px', borderRadius: '8px', borderLeft: '3px solid #38bdf8' }}>
              <div style={{ fontSize: '0.74rem', textTransform: 'uppercase', color: '#7dd3fc', fontWeight: 700 }}>
                Chronology & Reveal Safety
              </div>
              <div style={{ fontSize: '0.82rem', marginTop: '4px', color: '#f1f5f9' }}>
                {why.chronologyCheck}
              </div>
            </div>
          </div>

          {/* Source Evidence Details */}
          <div style={{ background: 'rgba(0,0,0,0.25)', borderRadius: '8px', padding: '12px', fontSize: '0.8rem', color: '#cbd5e1' }}>
            <div><strong>Source Timecodes:</strong> {selectedShot.sourceStart.toFixed(2)}s - {selectedShot.sourceEnd.toFixed(2)}s (Duration: {selectedShot.duration.toFixed(1)}s)</div>
            {selectedShot.sceneDialogue && (
              <div style={{ marginTop: '4px', fontStyle: 'italic' }}>
                <strong>Original Dialogue:</strong> "{selectedShot.sceneDialogue}"
              </div>
            )}
          </div>
        </div>

        <div className="mex-modal-footer">
          <Button variant="primary" size="sm" onClick={() => setIsWhyModalOpen(false)}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
};
