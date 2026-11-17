import test from 'node:test';
import assert from 'node:assert/strict';
import { studioPipelineOrchestrator } from '../services/movieExplanation/StudioPipelineOrchestrator.js';
import { movieExplanationStore } from '../services/movieExplanation/MovieExplanationStore.js';
import type {
  MovieExplanationProject,
  EpisodeScene,
  ExplanationScriptSegment,
} from '../../../shared/types.js';

test('Stage 6.1: StudioPipelineOrchestrator validates missing input dependencies', async () => {
  const emptyProject: MovieExplanationProject = {
    projectId: 'test_empty_pipe_001',
    name: 'Empty Pipeline Project',
    createdAt: new Date().toISOString(),
    status: 'setup',
  };

  await assert.rejects(
    async () => {
      await studioPipelineOrchestrator.runFullPipeline(emptyProject);
    },
    /Episode source video is required/
  );
});

test('Stage 6.2: StudioPipelineOrchestrator executes end-to-end pipeline and generates QC-validated timeline', async () => {
  const projectId = 'test_orch_pipe_002';

  const mockScenes: EpisodeScene[] = [
    {
      sceneId: 'sc_orch_01',
      startTime: 0,
      endTime: 30,
      duration: 30,
      description: 'Patrick Jane arrives at Sacramento crime scene exterior.',
      environmentType: 'exterior',
      characters: ['Patrick Jane'],
      actions: ['arrives in car', 'walks to police line'],
    },
    {
      sceneId: 'sc_orch_02',
      startTime: 30,
      endTime: 65,
      duration: 35,
      description: 'Jane discovers bloodstained knife and examines hidden letter.',
      characters: ['Patrick Jane', 'Lisbon'],
      actions: ['examines knife', 'reads note'],
    },
    {
      sceneId: 'sc_orch_03',
      startTime: 65,
      endTime: 100,
      duration: 35,
      description: 'Police interrogation room discussion between detectives.',
      characters: ['Lisbon', 'Cho'],
      actions: ['interrogating suspect'],
    },
  ];

  const mockSegments: ExplanationScriptSegment[] = [
    {
      segmentId: 'seg_orch_1',
      sentenceIndex: 0,
      text: 'প্যাট্রিক জেন সকালে শহরের ক্রাইম সিনে পৌঁছায়।',
      cleanScript: 'প্যাট্রিক জেন সকালে শহরের ক্রাইম সিনে পৌঁছায়।',
      voiceoverStart: 0.0,
      voiceoverEnd: 3.5,
      narrativePurpose: 'setup',
      referencedCharacters: ['Patrick Jane'],
    },
    {
      segmentId: 'seg_orch_2',
      sentenceIndex: 1,
      text: 'সেখানে সে রক্তমাখা ছুরি এবং একটি চিঠি দেখতে পায়।',
      cleanScript: 'সেখানে সে রক্তমাখা ছুরি এবং একটি চিঠি দেখতে পায়।',
      voiceoverStart: 3.5,
      voiceoverEnd: 7.2,
      narrativePurpose: 'investigation',
      referencedCharacters: ['Patrick Jane'],
    },
    {
      segmentId: 'seg_orch_3',
      sentenceIndex: 2,
      text: 'গোয়েন্দারা তখন বুঝতে পারল আসল খুনির পরিকল্পনা।',
      cleanScript: 'গোয়েন্দারা তখন বুঝতে পারল আসল খুনির পরিকল্পনা।',
      voiceoverStart: 7.2,
      voiceoverEnd: 10.8,
      narrativePurpose: 'reveal',
      referencedCharacters: ['Lisbon'],
    },
  ];

  const mockProject: MovieExplanationProject = {
    projectId,
    name: 'Mentalist 1-Click Pipeline Test',
    createdAt: new Date().toISOString(),
    status: 'setup',
    originalVideo: {
      videoId: 'vid_orch_01',
      filename: 'episode_mock.mp4',
      originalFilename: 'episode_mock.mp4',
      filePath: 'C:/fake/episode_mock.mp4',
      duration: 100,
      width: 1920,
      height: 1080,
      fps: 30,
      fileSize: 1000000,
      isAnalyzed: true,
    },
    voiceoverAudio: {
      audioId: 'vo_orch_01',
      filename: 'bangla_vo.wav',
      originalFilename: 'bangla_vo.wav',
      filePath: 'C:/fake/bangla_vo.wav',
      duration: 10.8,
      fileSize: 50000,
      isAligned: true,
    },
    script: {
      language: 'bn',
      rawText: mockSegments.map((s) => s.text).join('\n'),
      fullScript: mockSegments.map((s) => s.text).join('\n'),
      totalEstimatedDuration: 10.8,
      isAlignedToVoiceover: true,
      segments: mockSegments,
    },
    episodeIndex: {
      indexId: 'idx_orch_01',
      mediaId: 'vid_orch_01',
      originalVideoPath: 'C:/fake/episode_mock.mp4',
      duration: 100,
      scenesCount: 3,
      analyzedAt: new Date().toISOString(),
      scenes: mockScenes,
    },
  };

  movieExplanationStore.createProject(projectId, mockProject.name);
  movieExplanationStore.updateProject(projectId, mockProject);

  const progressEvents: Array<{ step: string; pct: number }> = [];

  const result = await studioPipelineOrchestrator.runFullPipeline(
    mockProject,
    { autoRender: false },
    (step, pct) => {
      progressEvents.push({ step, pct });
    }
  );

  assert.equal(result.success, true);
  assert.equal(result.projectId, projectId);
  assert.equal(result.indexedScenesCount, 3);
  assert.equal(result.alignedSegmentsCount, 3);
  assert.ok(result.totalShotsCount >= 3, 'Must produce at least 3 shots');
  assert.ok(result.qualityScore >= 60, `Quality score should be >= 60 (got ${result.qualityScore})`);
  assert.ok(result.telemetry.stepsCompleted.includes('directing'));
  assert.ok(result.telemetry.stepsCompleted.includes('qc_audit'));
  assert.ok(progressEvents.length > 0, 'Must emit progress events');

  // Verify project state in store
  const stored = movieExplanationStore.getProject(projectId);
  assert.ok(stored?.timeline, 'Timeline must be persisted');
  assert.ok(stored?.qualityReport, 'Quality report must be persisted');
  assert.equal(stored?.status, 'timeline_ready');
});

