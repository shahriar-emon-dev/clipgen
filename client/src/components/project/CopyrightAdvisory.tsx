import React from 'react';
import type { CopyrightCheck, CopyrightFinding } from '@shared/types.js';
import { Badge } from '../common/Badge.js';

interface CopyrightAdvisoryProps {
  copyright: CopyrightCheck | null;
}

export const CopyrightAdvisory: React.FC<CopyrightAdvisoryProps> = ({ copyright }) => {
  if (!copyright) {
    return (
      <div className="card" style={{ padding: '32px' }}>
        <div className="empty-state">
          <div className="empty-state-icon">🛡️</div>
          <h3>Copyright & Rights Safety</h3>
          <p>Process your video to evaluate licensing risk indicators for third-party audio and footage.</p>
        </div>
      </div>
    );
  }

  const getRiskBadge = (level: string) => {
    switch (level) {
      case 'high': return <Badge variant="error">HIGH RISK</Badge>;
      case 'medium': return <Badge variant="warning">MEDIUM RISK</Badge>;
      default: return <Badge variant="success">LOW RISK</Badge>;
    }
  };

  return (
    <div className="card" style={{ padding: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Copyright & Rights Risk Assessment</h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Evaluates media signals to help ensure you have proper rights before publishing.
          </p>
        </div>
        {getRiskBadge(copyright.riskLevel)}
      </div>

      <div style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '16px', marginBottom: '20px' }}>
        <h4 style={{ fontSize: '0.9rem', color: 'var(--warning)', marginBottom: '4px' }}>⚠️ Rights Advisory</h4>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
          This system checks for detectable third-party music cues and attribution markers. It does <strong>not</strong> bypass YouTube Content ID or guarantee exemption from licensing rules. Ensure you own or hold permissions for all media used.
        </p>
      </div>

      <h4 style={{ fontSize: '0.9rem', marginBottom: '12px' }}>Signal Inspection Log</h4>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {copyright.details.map((finding: CopyrightFinding, idx: number) => (
          <div key={idx} style={{ display: 'flex', gap: '12px', padding: '10px 12px', background: 'var(--bg-primary)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', fontSize: '0.85rem' }}>
            <span>{finding.type === 'music' ? '🎵' : '🗣️'}</span>
            <div style={{ flex: 1 }}>
              <p>{finding.description}</p>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                Confidence: {Math.round(finding.confidence * 100)}%
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
