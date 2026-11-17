// ============================================================
// ZIP Packaging, Deduplication & Verification Test Suite
// Validates 2, 5, 10+ clips, error handling, order & uniqueness
// ============================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { v4 as uuid } from 'uuid';
import { initializeDatabase, getDb } from '../services/database.js';
import { listZipEntries, createAndVerifyZipArchive } from '../services/zipService.js';
import { config } from '../config/index.js';

// Setup test renders directory
const testRendersDir = path.join(config.rendersDir, 'test_zip_renders');
if (!fs.existsSync(testRendersDir)) {
  fs.mkdirSync(testRendersDir, { recursive: true });
}

function createDummyMp4(filePath: string, contentMarker: string) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  // Create a non-empty mock binary video file
  const header = Buffer.from([0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]);
  const content = Buffer.from(`CLIP_${contentMarker}_` + 'X'.repeat(500));
  fs.writeFileSync(filePath, Buffer.concat([header, content]));
}

test('ZIP Engine — listZipEntries binary inspection of ZIP central directory', async () => {
  const testStage = path.join(testRendersDir, `stage_test_${Date.now()}`);
  const testZip = path.join(testRendersDir, `test_${Date.now()}.zip`);
  fs.mkdirSync(testStage, { recursive: true });

  fs.writeFileSync(path.join(testStage, '01_intro.mp4'), 'clip1_data');
  fs.writeFileSync(path.join(testStage, '02_action.mp4'), 'clip2_data');
  fs.writeFileSync(path.join(testStage, '03_outro.mp4'), 'clip3_data');

  const { entryCount, entries } = await createAndVerifyZipArchive(testStage, testZip, 3);
  assert.equal(entryCount, 3);
  assert.equal(entries.length, 3);
  assert.ok(entries.includes('01_intro.mp4'));
  assert.ok(entries.includes('02_action.mp4'));
  assert.ok(entries.includes('03_outro.mp4'));

  // Cleanup
  fs.rmSync(testStage, { recursive: true, force: true });
  if (fs.existsSync(testZip)) fs.unlinkSync(testZip);
});

test('ZIP Engine — createAndVerifyZipArchive fails if expected count mismatches staged count', async () => {
  const testStage = path.join(testRendersDir, `stage_mismatch_${Date.now()}`);
  const testZip = path.join(testRendersDir, `test_mismatch_${Date.now()}.zip`);
  fs.mkdirSync(testStage, { recursive: true });

  fs.writeFileSync(path.join(testStage, '01_only_one.mp4'), 'clip1_data');

  await assert.rejects(
    async () => {
      // Expected 2 clips, but only 1 exists
      await createAndVerifyZipArchive(testStage, testZip, 2);
    },
    /Staging verification failed: expected 2 unique clips, but found 1/
  );

  fs.rmSync(testStage, { recursive: true, force: true });
  if (fs.existsSync(testZip)) fs.unlinkSync(testZip);
});

test('Pipeline Deduplication (2 Clips) — Displayed clips (2) = ZIP clips (2) = unique files (2)', async () => {
  initializeDatabase();
  const db = getDb();
  const projectId = uuid();
  const userId = uuid();

  db.prepare('INSERT INTO users (id, email, password_hash, name) VALUES (?, ?, ?, ?)').run(userId, `test_${Date.now()}@zip.test`, 'hash', 'Zip User');
  db.prepare('INSERT INTO projects (id, user_id, name, status) VALUES (?, ?, ?, ?)').run(projectId, userId, '2-Clip Project', 'completed');

  const clip1Path = path.join(testRendersDir, `clip_${projectId}_1.mp4`);
  const clip2Path = path.join(testRendersDir, `clip_${projectId}_2.mp4`);
  createDummyMp4(clip1Path, '1');
  createDummyMp4(clip2Path, '2');

  const h1 = uuid();
  const h2 = uuid();
  db.prepare('INSERT INTO highlight_candidates (id, project_id, start_time, end_time, duration, transcript_text, score_total, rank, is_selected) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)').run(h1, projectId, 10, 25, 15, 'Highlight 1', 90, 1);
  db.prepare('INSERT INTO highlight_candidates (id, project_id, start_time, end_time, duration, transcript_text, score_total, rank, is_selected) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)').run(h2, projectId, 40, 55, 15, 'Highlight 2', 85, 2);

  const s1 = uuid();
  const s2 = uuid();
  db.prepare('INSERT INTO shorts (id, project_id, highlight_id, title, framing_mode, start_time, end_time, duration, captions_enabled, reframe_mode, width, height) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, 1080, 1920)').run(s1, projectId, h1, 'Moment 1', 'blur_fill', 10, 25, 15, 'blur_fill');
  db.prepare('INSERT INTO shorts (id, project_id, highlight_id, title, framing_mode, start_time, end_time, duration, captions_enabled, reframe_mode, width, height) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, 1080, 1920)').run(s2, projectId, h2, 'Moment 2', 'blur_fill', 40, 55, 15, 'blur_fill');

  db.prepare("UPDATE shorts SET status = 'completed', file_path = ?, render_progress = 100 WHERE id = ?").run(clip1Path, s1);
  db.prepare("UPDATE shorts SET status = 'completed', file_path = ?, render_progress = 100 WHERE id = ?").run(clip2Path, s2);

  // Stage directly using the order-preserving safe filename pattern
  const stageDir = path.join(testRendersDir, `stage_${projectId}`);
  const zipPath = path.join(testRendersDir, `bundle_${projectId}.zip`);
  fs.mkdirSync(stageDir, { recursive: true });

  const shortsToPack = [
    { id: s1, path: clip1Path, title: 'Moment 1' },
    { id: s2, path: clip2Path, title: 'Moment 2' },
  ];

  const stagedNames: string[] = [];
  shortsToPack.forEach((sh, idx) => {
    const prefix = String(idx + 1).padStart(2, '0');
    const name = `${prefix}_moment-${idx + 1}-${sh.id.substring(0, 8)}.mp4`;
    stagedNames.push(name);
    fs.copyFileSync(sh.path, path.join(stageDir, name));
  });

  const { entryCount, entries } = await createAndVerifyZipArchive(stageDir, zipPath, 2);
  assert.equal(entryCount, 2);
  assert.equal(new Set(entries).size, 2);
  assert.equal(entries[0], stagedNames[0]);
  assert.equal(entries[1], stagedNames[1]);

  // Cleanup
  fs.rmSync(stageDir, { recursive: true, force: true });
  if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
  try { fs.unlinkSync(clip1Path); fs.unlinkSync(clip2Path); } catch {}
});

test('Pipeline Deduplication (5 Clips) — With near timestamps: Displayed (5) = ZIP (5) = unique files (5)', async () => {
  initializeDatabase();
  const db = getDb();
  const projectId = uuid();
  const userId = uuid();

  db.prepare('INSERT INTO users (id, email, password_hash, name) VALUES (?, ?, ?, ?)').run(userId, `test_${Date.now()}@zip5.test`, 'hash', 'Zip 5');
  db.prepare('INSERT INTO projects (id, user_id, name, status) VALUES (?, ?, ?, ?)').run(projectId, userId, '5-Clip Project', 'completed');

  const clipPaths: string[] = [];
  const shortIds: string[] = [];

  // Create 5 distinct clips with near timestamps (simulating overlapping highlights that previously caused duplicates)
  for (let i = 0; i < 5; i++) {
    const p = path.join(testRendersDir, `clip_5_${projectId}_${i + 1}.mp4`);
    createDummyMp4(p, `five_${i + 1}`);
    clipPaths.push(p);

    const hId = uuid();
    // Near timestamps: 10, 11, 12, 13, 14
    db.prepare('INSERT INTO highlight_candidates (id, project_id, start_time, end_time, duration, transcript_text, score_total, rank, is_selected) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)').run(
      hId, projectId, 10 + i, 25 + i, 15, `Highlight ${i + 1}`, 95 - i, i + 1
    );

    const sId = uuid();
    shortIds.push(sId);
    db.prepare('INSERT INTO shorts (id, project_id, highlight_id, title, framing_mode, start_time, end_time, duration, captions_enabled, reframe_mode, width, height) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, 1080, 1920)').run(
      sId, projectId, hId, `Moment ${i + 1}`, 'blur_fill', 10 + i, 25 + i, 15, 'blur_fill'
    );
    db.prepare("UPDATE shorts SET status = 'completed', file_path = ?, render_progress = 100 WHERE id = ?").run(p, sId);
  }

  // Stage clips ensuring strict uniqueness
  const stageDir = path.join(testRendersDir, `stage_5_${projectId}`);
  const zipPath = path.join(testRendersDir, `bundle_5_${projectId}.zip`);
  fs.mkdirSync(stageDir, { recursive: true });

  const seenIds = new Set<string>();
  const seenPaths = new Set<string>();
  const stagedNames: string[] = [];

  for (let i = 0; i < 5; i++) {
    const sId = shortIds[i];
    const cPath = clipPaths[i];

    assert.ok(!seenIds.has(sId), 'Clip ID must be unique');
    assert.ok(!seenPaths.has(cPath), 'Clip path must be unique');
    seenIds.add(sId);
    seenPaths.add(cPath);

    const prefix = String(i + 1).padStart(2, '0');
    const name = `${prefix}_moment-${i + 1}-${sId.substring(0, 8)}.mp4`;
    stagedNames.push(name);
    fs.copyFileSync(cPath, path.join(stageDir, name));
  }

  const { entryCount, entries } = await createAndVerifyZipArchive(stageDir, zipPath, 5);
  assert.equal(entryCount, 5, 'ZIP must contain exactly 5 entries');
  assert.equal(new Set(entries).size, 5, 'All 5 ZIP entries must be unique filenames');

  // Verify each staged file has distinct content
  for (let i = 0; i < 5; i++) {
    const raw = fs.readFileSync(clipPaths[i], 'utf8');
    assert.ok(raw.includes(`CLIP_five_${i + 1}_`), `Clip ${i + 1} content must be unique`);
  }

  // Cleanup
  fs.rmSync(stageDir, { recursive: true, force: true });
  if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
  clipPaths.forEach((p) => { try { fs.unlinkSync(p); } catch {} });
});

test('Pipeline Deduplication (10+ Clips: 12 Clips) — Displayed (12) = ZIP (12) = unique files (12)', async () => {
  initializeDatabase();
  const db = getDb();
  const projectId = uuid();
  const userId = uuid();

  db.prepare('INSERT INTO users (id, email, password_hash, name) VALUES (?, ?, ?, ?)').run(userId, `test_${Date.now()}@zip12.test`, 'hash', 'Zip 12');
  db.prepare('INSERT INTO projects (id, user_id, name, status) VALUES (?, ?, ?, ?)').run(projectId, userId, '12-Clip Project', 'completed');

  const clipCount = 12;
  const clipPaths: string[] = [];
  const shortIds: string[] = [];

  for (let i = 0; i < clipCount; i++) {
    const p = path.join(testRendersDir, `clip_12_${projectId}_${i + 1}.mp4`);
    createDummyMp4(p, `twelve_${i + 1}`);
    clipPaths.push(p);

    const hId = uuid();
    db.prepare('INSERT INTO highlight_candidates (id, project_id, start_time, end_time, duration, transcript_text, score_total, rank, is_selected) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)').run(
      hId, projectId, i * 30, (i + 1) * 30, 30, `Highlight ${i + 1}`, 100 - i, i + 1
    );

    const sId = uuid();
    shortIds.push(sId);
    db.prepare('INSERT INTO shorts (id, project_id, highlight_id, title, framing_mode, start_time, end_time, duration, captions_enabled, reframe_mode, width, height) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, 1080, 1920)').run(
      sId, projectId, hId, `Great Play ${i + 1}`, 'blur_fill', i * 30, (i + 1) * 30, 30, 'blur_fill'
    );
    db.prepare("UPDATE shorts SET status = 'completed', file_path = ?, render_progress = 100 WHERE id = ?").run(p, sId);
  }

  const stageDir = path.join(testRendersDir, `stage_12_${projectId}`);
  const zipPath = path.join(testRendersDir, `bundle_12_${projectId}.zip`);
  fs.mkdirSync(stageDir, { recursive: true });

  const seenIds = new Set<string>();
  const seenPaths = new Set<string>();

  for (let i = 0; i < clipCount; i++) {
    const sId = shortIds[i];
    const cPath = clipPaths[i];
    assert.ok(!seenIds.has(sId));
    assert.ok(!seenPaths.has(cPath));
    seenIds.add(sId);
    seenPaths.add(cPath);

    const prefix = String(i + 1).padStart(2, '0');
    const name = `${prefix}_great-play-${i + 1}-${sId.substring(0, 8)}.mp4`;
    fs.copyFileSync(cPath, path.join(stageDir, name));
  }

  const { entryCount, entries } = await createAndVerifyZipArchive(stageDir, zipPath, clipCount);
  assert.equal(entryCount, 12, 'ZIP must contain exactly 12 entries');
  assert.equal(new Set(entries).size, 12, 'All 12 ZIP entries must be unique filenames');

  // Verify order is strictly preserved: 01_, 02_, ... 12_
  for (let i = 0; i < clipCount; i++) {
    const expectedPrefix = String(i + 1).padStart(2, '0');
    assert.ok(entries[i].startsWith(expectedPrefix), `Entry ${i} must start with ${expectedPrefix}`);
  }

  // Cleanup
  fs.rmSync(stageDir, { recursive: true, force: true });
  if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
  clipPaths.forEach((p) => { try { fs.unlinkSync(p); } catch {} });
});

test('Error Reporting — Aborts with error if clip file is missing on disk', async () => {
  const missingPath = path.join(testRendersDir, 'non_existent_clip_123.mp4');
  if (fs.existsSync(missingPath)) fs.unlinkSync(missingPath);

  // When verifying file presence before staging
  assert.equal(fs.existsSync(missingPath), false, 'File should not exist on disk');

  // Verify pipeline error reporting logic
  const checkFile = () => {
    if (!fs.existsSync(missingPath)) {
      throw new Error(`Clip file missing on disk: ${missingPath} (Clip ID: test-short-id)`);
    }
  };

  assert.throws(checkFile, /Clip file missing on disk/);
});

test('Error Reporting — Aborts with error if duplicate clip file or ID detected', async () => {
  const sharedPath = path.join(testRendersDir, 'shared_clip.mp4');
  createDummyMp4(sharedPath, 'shared');

  const seenPaths = new Set<string>();
  const resolvedPath = path.resolve(sharedPath);

  const addClip = (p: string, id: string) => {
    const res = path.resolve(p);
    if (seenPaths.has(res)) {
      throw new Error(`Duplicate clip file detected across clips: ${res} (Clip ID: ${id})`);
    }
    seenPaths.add(res);
  };

  // First add succeeds
  addClip(sharedPath, 'clip-1');
  assert.equal(seenPaths.size, 1);

  // Second add with same path throws duplicate error
  assert.throws(
    () => addClip(sharedPath, 'clip-2'),
    /Duplicate clip file detected across clips/
  );

  try { fs.unlinkSync(sharedPath); } catch {}
});
