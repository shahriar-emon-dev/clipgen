import React from 'react';
import { useVoiceoverStore } from '../../stores/voiceoverStore.js';
import { Button } from '../common/Button.js';
import { Spinner } from '../common/Spinner.js';

export const ClipAlternativesModal: React.FC = () => {
  const {
    alternativesModalShotId,
    alternativesModalCurrentShot,
    alternatives,
    isLoadingAlternatives,
    closeAlternativesModal,
    replaceShotWithAlternative,
  } = useVoiceoverStore();

  if (!alternativesModalShotId) return null;

  return (
    <div className="vo-modal-overlay" onClick={closeAlternativesModal}>
      <div className="vo-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="vo-modal-header">
          <div>
            <h3 style={{ margin: 0, fontSize: '1.1rem' }}>Find Better Clip Alternatives</h3>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              AI Visual Director ranked alternatives for shot "{alternativesModalCurrentShot?.clipFilename}"
            </span>
          </div>
          <Button variant="ghost" size="sm" onClick={closeAlternativesModal}>
            ✕
          </Button>
        </div>

        <div className="vo-modal-body">
          {isLoadingAlternatives ? (
            <div style={{ padding: '40px 0', textAlign: 'center' }}>
              <Spinner size="lg" label="Ranking library candidates by semantic alignment..." />
            </div>
          ) : alternatives.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text-secondary)' }}>
              No other alternative clips found in your library for this shot duration.
            </div>
          ) : (
            alternatives.map((cand, idx) => (
              <div key={`${cand.clipId}_${cand.subSegmentId}_${idx}`} className="vo-candidate-card">
                <div className="vo-candidate-left">
                  {cand.thumbnailUrl ? (
                    <img src={cand.thumbnailUrl} alt="Thumbnail" className="vo-candidate-thumb" />
                  ) : (
                    <div className="vo-candidate-thumb" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#555', fontSize: '0.7rem' }}>
                      No Preview
                    </div>
                  )}

                  <div className="vo-candidate-info">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontWeight: 600, fontSize: '0.88rem' }}>
                        {cand.clipFilename || cand.clipId}
                      </span>
                      <span
                        className={`vo-score-badge ${cand.score.overallScore < 64 ? 'low' : ''}`}
                      >
                        {Math.round(cand.score.overallScore)}% Match
                      </span>
                    </div>

                    <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                      Range: {cand.sourceStart.toFixed(1)}s - {cand.sourceEnd.toFixed(1)}s ({cand.duration.toFixed(1)}s)
                    </div>

                    <div className="vo-candidate-reasons">
                      {cand.reasons.map((r, rIdx) => (
                        <span key={rIdx} className="vo-reason-tag">
                          {r}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => replaceShotWithAlternative(cand)}
                >
                  Replace Shot
                </Button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
