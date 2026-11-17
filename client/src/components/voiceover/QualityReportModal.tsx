import React from 'react';
import { useVoiceoverStore } from '../../stores/voiceoverStore.js';
import { Button } from '../common/Button.js';

export const QualityReportModal: React.FC = () => {
  const { project, qualityReportModalOpen, setQualityReportModalOpen } = useVoiceoverStore();

  if (!qualityReportModalOpen || !project?.qualityReport) return null;
  const report = project.qualityReport;

  return (
    <div className="vo-modal-overlay" onClick={() => setQualityReportModalOpen(false)}>
      <div className="vo-modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '680px' }}>
        <div className="vo-modal-header">
          <div>
            <h3 style={{ margin: 0, fontSize: '1.1rem' }}>Production Quality Gate Audit</h3>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              12-point automated verification before master video rendering
            </span>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setQualityReportModalOpen(false)}>
            ✕
          </Button>
        </div>

        <div className="vo-modal-body">
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '16px 20px',
              borderRadius: 'var(--radius-md)',
              background: report.passed ? 'rgba(16, 185, 129, 0.1)' : 'rgba(245, 158, 11, 0.1)',
              border: `1px solid ${report.passed ? 'rgba(16, 185, 129, 0.25)' : 'rgba(245, 158, 11, 0.25)'}`,
            }}
          >
            <div>
              <div style={{ fontSize: '1.2rem', fontWeight: 700, color: report.passed ? '#10b981' : '#f59e0b' }}>
                {report.productionReadinessScore}/100 Readiness Score
              </div>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                {report.passed ? 'Ready for pristine master rendering' : 'Production warnings detected'}
              </span>
            </div>
            <div style={{ textAlign: 'right', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
              <div>Coverage: <strong>{report.visualCoveragePercent}%</strong></div>
              <div>Duration: <strong>{Math.round(report.voiceoverDuration)}s</strong></div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <h4 style={{ margin: '8px 0 4px', fontSize: '0.9rem' }}>Verification Checks</h4>
            {report.checks.map((chk) => (
              <div
                key={chk.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 14px',
                  background: 'var(--bg-tertiary)',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '0.82rem',
                }}
              >
                <div>
                  <div style={{ fontWeight: 600 }}>{chk.name}</div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{chk.details}</span>
                </div>
                <div>
                  <span
                    style={{
                      padding: '2px 8px',
                      borderRadius: '4px',
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      background:
                        chk.status === 'pass'
                          ? 'rgba(16, 185, 129, 0.15)'
                          : chk.status === 'warn'
                          ? 'rgba(245, 158, 11, 0.15)'
                          : 'rgba(239, 68, 68, 0.15)',
                      color:
                        chk.status === 'pass'
                          ? '#10b981'
                          : chk.status === 'warn'
                          ? '#f59e0b'
                          : '#ef4444',
                    }}
                  >
                    {chk.status.toUpperCase()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
