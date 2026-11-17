// ============================================================
// Integration Tests — End-to-End Pipeline & FFmpeg Validation
// ============================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import { checkFFmpeg } from '../services/ffmpeg.js';
import { checkCopyrightRisk } from '../services/copyrightChecker.js';
import { initializeDatabase } from '../services/database.js';
import { v4 as uuid } from 'uuid';

test('Integration — FFmpeg engine availability', async () => {
  const result = await checkFFmpeg();
  assert.ok(typeof result.available === 'boolean', 'FFmpeg check should return a boolean');
});

test('Integration — Copyright risk analysis advisory', async () => {
  initializeDatabase();
  const projectId = uuid();
  const transcriptWithMusic = 'Welcome to the official music video remix produced by records company.';

  const check = await checkCopyrightRisk(projectId, 1500, transcriptWithMusic);
  assert.ok(check.riskLevel === 'medium' || check.riskLevel === 'high');
  assert.ok(check.details.length > 0);
});
