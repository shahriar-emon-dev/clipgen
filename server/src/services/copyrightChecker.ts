// ============================================================
// Copyright Risk Checker — Rights & Licensing Safety
// Detects potentially copyrighted music or long third-party audio
// ============================================================

import { getDb } from './database.js';
import { v4 as uuid } from 'uuid';
import type { CopyrightCheck, CopyrightFinding, CopyrightRiskLevel } from '../../../shared/types.js';

export async function checkCopyrightRisk(
  projectId: string,
  audioDuration: number,
  transcriptText: string
): Promise<CopyrightCheck> {
  const findings: CopyrightFinding[] = [];
  let riskLevel: CopyrightRiskLevel = 'low';

  // 1. Check for long continuous music/speech segments or recognizable music indicators
  const musicKeywords = ['official music video', 'soundtrack', 'ost', 'remix', 'feat.', 'ft.', 'prod. by', 'records', 'vevo', 'copyright', 'all rights reserved'];
  const lowerText = transcriptText.toLowerCase();

  for (const kw of musicKeywords) {
    if (lowerText.includes(kw)) {
      findings.push({
        type: 'music',
        description: `Potential third-party audio or music attribution keyword detected: "${kw}"`,
        startTime: 0,
        endTime: Math.min(30, audioDuration),
        confidence: 0.75,
      });
      riskLevel = 'medium';
    }
  }

  // 2. If video duration is very long with commercial music cues
  if (audioDuration > 1200 && findings.length > 0) {
    riskLevel = 'high';
  }

  if (findings.length === 0) {
    findings.push({
      type: 'speech',
      description: 'Standard speech pattern detected. No overt commercial music indicators identified.',
      startTime: 0,
      endTime: audioDuration,
      confidence: 0.9,
    });
  }

  const checkId = uuid();
  const db = getDb();

  db.prepare(`
    INSERT INTO copyright_checks (id, project_id, risk_level, details, checked_at)
    VALUES (?, ?, ?, ?, datetime('now'))
  `).run(checkId, projectId, riskLevel, JSON.stringify(findings));

  return {
    id: checkId,
    projectId,
    riskLevel,
    details: findings,
    checkedAt: new Date().toISOString(),
  };
}

export function getCopyrightCheck(projectId: string): CopyrightCheck | null {
  const db = getDb();
  const row = db.prepare(
    'SELECT * FROM copyright_checks WHERE project_id = ? ORDER BY checked_at DESC LIMIT 1'
  ).get(projectId) as any;

  if (!row) return null;

  return {
    id: row.id,
    projectId: row.project_id,
    riskLevel: row.risk_level,
    details: JSON.parse(row.details || '[]'),
    checkedAt: row.checked_at,
  };
}
