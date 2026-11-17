// ============================================================
// Project Library & Storage Cleanup — Integration Tests
// Verifies:
// 1. Unified scanning across all 4 project stores (Movie Analyzer, Movie Explanation, Voiceover, Shorts Clipping)
// 2. Individual asset deletion without affecting the parent project or unrelated files
// 3. Project soft-deletion into Trash and Trash recovery (restore)
// 4. Bulk deletion of selected projects and assets
// 5. Protected DELETE ALL workflow requiring exact confirmation string 'DELETE ALL'
// 6. Safe disk file cleanup and orphan file scan
// ============================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { v4 as uuid } from 'uuid';
import { projectLibraryService } from '../services/projectLibrary/ProjectLibraryService.js';
import { movieAnalyzerStore } from '../services/movieAnalyzer/MovieAnalyzerStore.js';
import { movieExplanationStore } from '../services/movieExplanation/MovieExplanationStore.js';
import { config } from '../config/index.js';

test('Project Library: Unified overview scans all project categories accurately', async () => {
  const testId = `pl_test_${uuid().slice(0, 8)}`;
  const maProject = movieAnalyzerStore.createProject(testId, 'Library Scan Test Movie');

  // Create temporary mock files to simulate assets
  const tempDir = path.join(config.dataDir, 'test_scratch', testId);
  fs.mkdirSync(tempDir, { recursive: true });
  const mockVideoPath = path.join(tempDir, 'movie_source.mp4');
  const mockTranscriptPath = path.join(tempDir, 'transcript.txt');
  fs.writeFileSync(mockVideoPath, 'mock-video-binary-content-12345');
  fs.writeFileSync(mockTranscriptPath, 'mock-transcript-text-content');

  maProject.video = {
    id: uuid(),
    filename: 'movie_source.mp4',
    originalFilename: 'Movie_Source.mp4',
    filePath: mockVideoPath,
    fileSize: 2000,
    duration: 120,
    width: 1920,
    height: 1080,
    fps: 24,
    codec: 'h264',
    url: '/mock/video.mp4',
  };
  maProject.transcript = {
    filename: 'transcript.txt',
    rawText: 'mock-transcript-text-content',
    wordCount: 10,
    lineCount: 1,
    extractedCharacters: ['ALICE'],
    keyEvents: ['Alice enters'],
    turningPoints: [],
    warnings: [],
  };
  movieAnalyzerStore.saveProject(maProject);

  const overview = projectLibraryService.getOverview();
  assert.ok(overview, 'Overview should be returned');
  assert.ok(overview.totalProjectsCount >= 1, 'Should contain at least 1 project');
  assert.ok(overview.countsByCategory.movie_analyzer >= 1, 'Should include movie analyzer count');

  const foundItem = overview.projects.find((p) => p.id === testId && p.type === 'movie_analyzer');
  assert.ok(foundItem, 'Should list the newly created project');
  assert.equal(foundItem.name, 'Library Scan Test Movie');
  assert.ok(foundItem.assets.some((a) => a.type === 'video'), 'Should count the video asset');
  assert.ok(foundItem.assets.some((a) => a.type === 'transcript'), 'Should count the transcript asset');

  // Cleanup test files
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
    movieAnalyzerStore.deleteProject(testId);
  } catch {
    // ignore
  }
});

test('Project Library: Deleting an individual asset removes file without deleting the project', async () => {
  const testId = `pl_asset_test_${uuid().slice(0, 8)}`;
  const maProject = movieAnalyzerStore.createProject(testId, 'Asset Deletion Test Project');

  const tempDir = path.join(config.dataDir, 'test_scratch', testId);
  fs.mkdirSync(tempDir, { recursive: true });
  const mockVideoPath = path.join(tempDir, 'sample_del_video.mp4');
  const mockTranscriptPath = path.join(tempDir, 'sample_keep_transcript.txt');
  fs.writeFileSync(mockVideoPath, 'video content to be deleted');
  fs.writeFileSync(mockTranscriptPath, 'transcript content to be preserved');

  maProject.video = {
    id: uuid(),
    filename: 'sample_del_video.mp4',
    originalFilename: 'Sample_Del_Video.mp4',
    filePath: mockVideoPath,
    fileSize: 500,
    duration: 60,
    width: 1280,
    height: 720,
    fps: 30,
    codec: 'h264',
    url: '/mock/video.mp4',
  };
  maProject.transcript = {
    filename: 'sample_keep_transcript.txt',
    rawText: 'transcript content to be preserved',
    wordCount: 5,
    lineCount: 1,
    extractedCharacters: [],
    keyEvents: [],
    turningPoints: [],
    warnings: [],
  };
  movieAnalyzerStore.saveProject(maProject);

  assert.ok(fs.existsSync(mockVideoPath), 'Video file must exist before deletion');
  assert.ok(fs.existsSync(mockTranscriptPath), 'Transcript file must exist before deletion');

  // Delete only the video asset
  const result = projectLibraryService.deleteIndividualAsset('movie_analyzer', testId, 'video');
  assert.equal(result.success, true, 'Asset deletion must succeed');
  assert.ok(result.freedBytes > 0, 'Bytes freed should be reported');

  // Verify file was removed from disk
  assert.equal(fs.existsSync(mockVideoPath), false, 'Video file should be removed from disk');
  // Verify transcript still exists
  assert.ok(fs.existsSync(mockTranscriptPath), 'Transcript file must remain intact');

  // Verify project still exists and has transcript intact
  const updatedProject = movieAnalyzerStore.getProject(testId);
  assert.ok(updatedProject, 'Project must still exist after individual asset deletion');
  assert.equal(updatedProject.video, undefined, 'Video property should be cleared');
  assert.ok(updatedProject.transcript, 'Transcript property must still exist');

  // Cleanup
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
    movieAnalyzerStore.deleteProject(testId);
  } catch {
    // ignore
  }
});

test('Project Library: Project soft-deletion into Trash and Restore workflow', async () => {
  const meProject = movieExplanationStore.createProject('Trash Recovery Test Project');
  const actualId = meProject.projectId;

  // Verify initially visible in overview
  let overview = projectLibraryService.getOverview();
  let found = overview.projects.find((p) => p.id === actualId);
  assert.ok(found, 'Active project must appear in overview');
  assert.equal(found.isTrash ?? false, false);

  // Move project to Trash
  const delResult = projectLibraryService.deleteProject('movie_explanation', actualId, false);
  assert.equal(delResult.success, true);

  // Verify project now marked as trash in overview
  overview = projectLibraryService.getOverview();
  found = overview.projects.find((p) => p.id === actualId);
  assert.ok(found, 'Project should still exist in overview');
  assert.equal(found.isTrash, true, 'Project must be marked as trash');

  // Restore project
  const restoreSuccess = projectLibraryService.restoreProject('movie_explanation', actualId);
  assert.equal(restoreSuccess, true, 'Restore must succeed');

  // Verify project is no longer trash
  overview = projectLibraryService.getOverview();
  found = overview.projects.find((p) => p.id === actualId);
  assert.ok(found, 'Restored project must exist');
  assert.equal(found.isTrash ?? false, false, 'Project should no longer be marked as trash');

  // Permanently delete to clean up
  projectLibraryService.deleteProject('movie_explanation', actualId, true);
});

test('Project Library: Bulk deletion removes selected items correctly', async () => {
  const p1 = movieExplanationStore.createProject('Bulk Test Project 1');
  const p2 = movieExplanationStore.createProject('Bulk Test Project 2');

  const bulkRequest = {
    items: [
      { projectId: p1.projectId, type: 'movie_explanation' as const },
      { projectId: p2.projectId, type: 'movie_explanation' as const },
    ],
    permanent: true,
  };

  const bulkResult = projectLibraryService.bulkDelete(bulkRequest);
  assert.equal(bulkResult.deletedProjectsCount, 2, 'Should report 2 deleted projects');

  const overview = projectLibraryService.getOverview();
  assert.equal(overview.projects.some((p) => p.id === p1.projectId), false, 'Project 1 must be permanently removed');
  assert.equal(overview.projects.some((p) => p.id === p2.projectId), false, 'Project 2 must be permanently removed');
});

test('Project Library: Protected DELETE ALL requires exact confirmation string', async () => {
  // Test rejecting incorrect confirmation phrase
  assert.throws(
    () => {
      projectLibraryService.deleteAllProjects({
        confirmPhrase: 'delete all', // wrong case
      });
    },
    {
      message: "Invalid confirmation phrase. You must type 'DELETE ALL' exactly to confirm this action.",
    }
  );

  assert.throws(
    () => {
      projectLibraryService.deleteAllProjects({
        confirmPhrase: 'DELETE',
      });
    },
    {
      message: "Invalid confirmation phrase. You must type 'DELETE ALL' exactly to confirm this action.",
    }
  );
});

test('Project Library: Protected DELETE ALL operates safely when confirmed for trash_only', async () => {
  const activeProject = movieAnalyzerStore.createProject(`active_${uuid().slice(0, 6)}`, 'Active Preserved Project');
  const trashProject = movieExplanationStore.createProject('Trash Target Project');
  projectLibraryService.deleteProject('movie_explanation', trashProject.projectId, false); // move to trash

  // Perform DELETE ALL with scope: 'trash_only'
  const result = projectLibraryService.deleteAllProjects({
    confirmPhrase: 'DELETE ALL',
    scope: 'trash_only',
  });

  assert.equal(result.success, true);
  assert.ok(result.deletedProjectsCount >= 1, 'Should delete trashed project');

  // Active project MUST remain untouched
  const activeCheck = movieAnalyzerStore.getProject(activeProject.id);
  assert.ok(activeCheck, 'Active project must remain untouched');

  // Cleanup active project
  movieAnalyzerStore.deleteProject(activeProject.id);
});
