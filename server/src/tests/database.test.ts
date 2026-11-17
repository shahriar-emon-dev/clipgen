// ============================================================
// Database & Persistence Tests
// ============================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import { initializeDatabase, getDb } from '../services/database.js';
import { v4 as uuid } from 'uuid';

test('Database — Schema and CRUD operations', () => {
  initializeDatabase();
  const db = getDb();

  // 1. Create user
  const userId = uuid();
  db.prepare('INSERT INTO users (id, email, password_hash, name) VALUES (?, ?, ?, ?)')
    .run(userId, `test_${Date.now()}@clipgen.test`, 'hash', 'Test User');

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as any;
  assert.equal(user.id, userId);

  // 2. Create project
  const projectId = uuid();
  db.prepare('INSERT INTO projects (id, user_id, name, status) VALUES (?, ?, ?, ?)')
    .run(projectId, userId, '30-Minute Video Project', 'created');

  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId) as any;
  assert.equal(project.id, projectId);
  assert.equal(project.name, '30-Minute Video Project');

  // 3. Store video metadata
  const videoId = uuid();
  db.prepare(`
    INSERT INTO videos (id, project_id, filename, original_filename, file_path, file_size, duration, width, height, fps, codec)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(videoId, projectId, 'raw.mp4', 'raw.mp4', '/tmp/raw.mp4', 5000000, 1800, 1920, 1080, 30, 'h264');

  const video = db.prepare('SELECT * FROM videos WHERE project_id = ?').get(projectId) as any;
  assert.equal(video.duration, 1800);

  // 4. Store candidate and query top rank
  const highlightId = uuid();
  db.prepare(`
    INSERT INTO highlight_candidates (id, project_id, start_time, end_time, duration, transcript_text, score_total, rank, is_selected)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
  `).run(highlightId, projectId, 120, 148, 28, 'Engaging punchline moment.', 94, 1);

  const top = db.prepare('SELECT * FROM highlight_candidates WHERE project_id = ? ORDER BY score_total DESC LIMIT 1').get(projectId) as any;
  assert.equal(top.score_total, 94);
  assert.equal(top.duration, 28);
});
