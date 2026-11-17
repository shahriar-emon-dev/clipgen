// ============================================================
// Movie Explanation — Quality Report Modal
// Displays the 16-point automated pre-flight Quality Gate report.
// ============================================================

import React from 'react';
import { useMovieExplanationStore } from '../../stores/movieExplanationStore.js';
import { Button } from '../common/Button.js';

export const MovieQualityReportModal: React.FC = () => {
  const {
    project,
    isQualityModalOpen,
    setIsQualityModalOpen,
  } = useMovieExplanationStore();

  if (!isQualityModalOpen || !project?.qualityReport) return null;

  const report = project.qualityReport;

  return (
    <div className="mex-modal-backdrop" onClick={() => setIsQualityModalOpen(false)}>
      <div className="mex-modal-card" style={{ maxWidth: '780px' }} onClick={(e) => e.stopPropagation()}>
        <div className="mex-modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '1.3rem' }}>🛡️</span>
            <div>
              <div style={{ fontWeight: 800, fontSize: '1rem', color: '#fff' }}>
                16-Point Quality Gate Report
              </div>
              <div style={{ fontSize: '0.76rem', color: '#94a3b8' }}>
                Automated pre-flight production audit
              </div>
            </div>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={() => setIsQualityModalOpen(false)}>
            ✕
          </button>
        </div>

        <div className="mex-modal-body">
          {/* Header Score Card */}
          <div
            style={{
              background: report.passed ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.1)',
              border: `1px solid ${report.passed ? 'rgba(16,185,129,0.3)' : 'rgba(245,158,11,0.3)'}`,
              borderRadius: '10px',
              padding: '16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, color: report.passed ? '#34d399' : '#fbbf24' }}>
                {report.overallReadinessScore} / 100 Production Readiness
              </div>
              <div style={{ fontSize: '0.82rem', color: '#cbd5e1', marginTop: '4px' }}>
                {report.passed
                  ? 'All critical technical gates passed. Ready for pristine source rendering.'
                  : 'Warnings detected. Review recommendations below before rendering.'}
              </div>
            </div>

            <div style={{ textAlign: 'right', fontSize: '0.78rem', color: '#94a3b8' }}>
              <div>Visual Coverage: <strong>{report.visualCoveragePercent}%</strong></div>
              <div>Strong Matches: <strong>{report.strongMatchesCount}</strong></div>
              <div>Low Confidence: <strong>{report.lowConfidenceCount}</strong></div>
            </div>
          </div>

          {/* Pre-Render Audit Grid (Section 6) */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
              gap: '8px',
              padding: '12px',
              background: 'rgba(0,0,0,0.4)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '8px',
            }}
          >
            <div>
              <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>Narration Duration</div>
              <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#fff' }}>
                {(report.totalNarrationDuration ?? report.voiceoverDuration).toFixed(1)}s
              </div>
            </div>
            <div>
              <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>Assigned Video</div>
              <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#fff' }}>
                {(report.totalAssignedVideoDuration ?? report.timelineDuration).toFixed(1)}s
              </div>
            </div>
            <div>
              <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>Unique Scenes</div>
              <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#38bdf8' }}>
                {report.uniqueScenesCount ?? '—'}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>Unmatched Shots</div>
              <div style={{ fontSize: '0.9rem', fontWeight: 700, color: (report.unmatchedSegmentsCount ?? 0) > 0 ? '#ef4444' : '#10b981' }}>
                {report.unmatchedSegmentsCount ?? 0}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>Repeated to Review</div>
              <div style={{ fontSize: '0.9rem', fontWeight: 700, color: (report.repeatedScenesToReviewCount ?? 0) > 0 ? '#f59e0b' : '#10b981' }}>
                {report.repeatedScenesToReviewCount ?? report.repeatedScenesCount}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>Longest Shot</div>
              <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#fff' }}>
                {report.longestShotDuration ? `${report.longestShotDuration.toFixed(1)}s` : '—'}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>Still Holds</div>
              <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#fff' }}>
                {report.stillImageShotsCount ?? 0}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>Missing Media</div>
              <div style={{ fontSize: '0.9rem', fontWeight: 700, color: (report.missingMediaCount ?? 0) > 0 ? '#ef4444' : '#10b981' }}>
                {report.missingMediaCount ?? 0}
              </div>
            </div>
          </div>

          {/* Rights Clearance Audit Breakdown */}
          {report.rightsAudit && (() => {
            const audit = report.rightsAudit;
            const clearedCount =
              audit.ownedShotsCount +
              audit.licensedShotsCount +
              audit.permissionGrantedCount +
              audit.publicDomainCount;
            const isCleared = audit.flaggedShotsCount === 0;

            return (
              <div
                style={{
                  background: isCleared ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.1)',
                  border: `1px solid ${isCleared ? 'rgba(16,185,129,0.3)' : 'rgba(245,158,11,0.3)'}`,
                  borderRadius: '8px',
                  padding: '12px 14px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '8px',
                }}
              >
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.84rem', color: isCleared ? '#34d399' : '#fbbf24' }}>
                    🛡️ Rights Clearance: {clearedCount} of {audit.totalShots} Shots Verified
                  </div>
                  <div style={{ fontSize: '0.76rem', color: '#cbd5e1', marginTop: '2px' }}>
                    {audit.flaggedShotsCount > 0
                      ? `${audit.flaggedShotsCount} unverified or restricted assets flagged for review.`
                      : 'All visual assets have confirmed creator ownership or commercial licensing.'}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '8px', fontSize: '0.74rem' }}>
                  <span style={{ color: '#10b981', fontWeight: 600 }}>✓ {clearedCount} Cleared</span>
                  {audit.unverifiedShotsCount > 0 && <span style={{ color: '#fbbf24', fontWeight: 600 }}>⚠ {audit.unverifiedShotsCount} Unverified</span>}
                  {audit.restrictedShotsCount > 0 && <span style={{ color: '#ef4444', fontWeight: 600 }}>⛔ {audit.restrictedShotsCount} Restricted</span>}
                </div>
              </div>
            );
          })()}

          {/* Actionable Errors Banner */}
          {report.actionableErrors && report.actionableErrors.length > 0 && (
            <div
              style={{
                background: 'rgba(239,68,68,0.12)',
                border: '1px solid rgba(239,68,68,0.3)',
                borderRadius: '8px',
                padding: '12px',
              }}
            >
              <div style={{ fontWeight: 700, fontSize: '0.84rem', color: '#f87171', marginBottom: '6px' }}>
                ⛔ Actionable Render Gate Errors (Must be resolved before export):
              </div>
              <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '0.78rem', color: '#fca5a5' }}>
                {report.actionableErrors.map((err, i) => (
                  <li key={i} style={{ marginBottom: '3px' }}>{err}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Actionable Warnings Banner */}
          {report.actionableWarnings && report.actionableWarnings.length > 0 && (
            <div
              style={{
                background: 'rgba(245,158,11,0.1)',
                border: '1px solid rgba(245,158,11,0.25)',
                borderRadius: '8px',
                padding: '10px 12px',
              }}
            >
              <div style={{ fontWeight: 700, fontSize: '0.82rem', color: '#fbbf24', marginBottom: '4px' }}>
                ⚠️ Editorial Review Items:
              </div>
              <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '0.78rem', color: '#fde68a' }}>
                {report.actionableWarnings.map((warn, i) => (
                  <li key={i} style={{ marginBottom: '2px' }}>{warn}</li>
                ))}
              </ul>
            </div>
          )}

          {/* 16 Checks List */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {report.checks.map((check) => {
              const statusColor =
                check.status === 'pass'
                  ? '#34d399'
                  : check.status === 'warn'
                  ? '#fbbf24'
                  : '#ef4444';
              const statusIcon =
                check.status === 'pass'
                  ? '✓'
                  : check.status === 'warn'
                  ? '⚠'
                  : '✕';

              return (
                <div
                  key={check.id}
                  style={{
                    background: 'rgba(0,0,0,0.3)',
                    border: '1px solid rgba(255,255,255,0.06)',
                    borderRadius: '8px',
                    padding: '10px 14px',
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    gap: '12px',
                    fontSize: '0.82rem',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                    <span style={{ color: statusColor, fontWeight: 700, fontSize: '0.9rem' }}>
                      {statusIcon}
                    </span>
                    <div>
                      <div style={{ fontWeight: 700, color: '#fff' }}>{check.name}</div>
                      <div style={{ color: '#cbd5e1', marginTop: '2px', fontSize: '0.78rem' }}>
                        {check.details}
                      </div>
                    </div>
                  </div>

                  {check.metricValue && (
                    <span
                      style={{
                        padding: '2px 8px',
                        background: 'rgba(255,255,255,0.08)',
                        borderRadius: '4px',
                        fontSize: '0.74rem',
                        color: statusColor,
                        fontWeight: 600,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {check.metricValue}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="mex-modal-footer">
          <Button variant="primary" size="sm" onClick={() => setIsQualityModalOpen(false)}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
};
