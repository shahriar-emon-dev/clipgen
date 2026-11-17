// ============================================================
// Master Copyright Workflow Upgrade — Automated Test Suite
// Validates:
// 1. Asset Rights Metadata (all 8 statuses, commercial use, evidence docs)
// 2. Pre-Export Rights Review & Flagged Timeline Sections
// 3. Mandatory User Rights Warning Acknowledgement Gate
// 4. AI Script & Commentary Review (Insight, Third-Party Dependence, Hook/Climax)
// 5. Scene-to-Voiceover Synchronization & Escalating Reuse Penalty
// 6. Validated Export Manifest & Pre-Render Integrity Checks
// 7. Zero-Drift Visual Replacement (Diagrams / Licensed Stock)
// 8. Backward Compatibility with Existing Projects
// ============================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { rightsManagementService } from '../services/movieExplanation/RightsManagementService.js';
import { scriptReviewService } from '../services/movieExplanation/ScriptReviewService.js';
import { aiDirectorEngine } from '../services/movieExplanation/AIDirectorEngine.js';
import { storySceneMatcher } from '../services/movieExplanation/StorySceneMatcher.js';
import { movieExplanationRenderer } from '../services/movieExplanation/MovieExplanationRenderer.js';
import { movieExplanationQualityGate } from '../services/movieExplanation/MovieExplanationQualityGate.js';
import { movieExplanationStore } from '../services/movieExplanation/MovieExplanationStore.js';
import type {
  MovieTimelineShot,
  EpisodeIntelligenceIndex,
  ExplanationScript,
  MovieExplanationTimeline,
  EpisodeScene,
} from '../../../shared/types.js';

function createDummyScene(id: string, start: number, end: number, desc: string, chars: string[] = ['character']): EpisodeScene {
  return {
    sceneId: id,
    sceneIndex: 0,
    startTime: start,
    endTime: end,
    duration: end - start,
    shotBoundaries: [start],
    dialogueSnippet: desc,
    dialogueText: desc,
    characters: chars,
    actions: ['investigating'],
    objectsAndEvidence: ['clue'],
    events: ['event'],
    emotionalTone: 'tense / analytical',
    narrativePurpose: 'investigation',
    description: desc,
    visualDetails: ['crime scene wall'],
    isClueOrReveal: false,
    isQuietMotivational: false,
    isActionHeavy: false,
    importance: 'important',
    confidence: 0.9,
    thumbnailUrl: `/thumbs/${id}.jpg`,
    isTitleOrBumper: false,
    isExcludedFromNarration: false,
    rightsMetadata: rightsManagementService.createInitialRightsMetadata(`episode_${id}.mp4`, 'movie_source'),
  };
}

function createDummyShot(id: string, segId: string, sceneId: string, tStart: number, tEnd: number, rightsStatus: any = 'unverified'): MovieTimelineShot {
  return {
    shotId: id,
    segmentId: segId,
    sceneId,
    sourceFile: path.join(os.tmpdir(), `source_${id}.mp4`),
    sourceStart: 10.0,
    sourceEnd: 10.0 + (tEnd - tStart),
    timelineStart: tStart,
    timelineEnd: tEnd,
    duration: tEnd - tStart,
    matchScore: 85,
    confidence: 0.85,
    isLowConfidence: false,
    whyThisScene: {
      characterMatch: 'Matched character',
      actionMatch: 'Matched action',
      storyContextReason: 'Context valid',
      chronologyCheck: 'Continuous',
      emotionalFit: 'Tense',
      fullSummary: 'Summary',
    },
    transition: 'cut',
    transitionDuration: 0,
    isLocked: false,
    isManualOverride: false,
    framingMode: 'action',
    rightsStatus,
    rightsMetadata: {
      rightsStatus,
      sourceFilename: `source_${id}.mp4`,
      sourceReference: `Studio footage ${id}`,
      usageRestrictions: rightsStatus === 'restricted' ? 'Commercial broadcast license required' : undefined,
      updatedAt: new Date().toISOString(),
    },
  };
}

test('1. Asset Rights Metadata — Extended Statuses & Metadata Capture', () => {
  const stockMeta = rightsManagementService.createInitialRightsMetadata('stock_city_timelapse.mp4', 'licensed_stock', {
    licenseDetails: 'Envato Elements #98214',
    evidenceDocumentPath: '/licenses/stock_98214.pdf',
    commercialUsePermitted: true,
    attributionRequirements: 'Footage courtesy of StudioB',
    notes: 'Verified commercial license for YouTube monetization',
  });

  assert.equal(stockMeta.rightsStatus, 'licensed');
  assert.equal(stockMeta.licenseDetails, 'Envato Elements #98214');
  assert.equal(stockMeta.commercialUsePermitted, true);
  assert.equal(stockMeta.evidenceDocumentPath, '/licenses/stock_98214.pdf');

  const studioMeta = rightsManagementService.createInitialRightsMetadata('Warner_Bros_Mentalist_Ep1.mkv', 'movie_source');
  assert.equal(studioMeta.rightsStatus, 'restricted');
  assert.ok(studioMeta.usageRestrictions?.includes('Third-party commercial studio footage'));
});

test('2. Pre-Export Rights Review & Flagged Timeline Intervals', () => {
  const shots: MovieTimelineShot[] = [
    createDummyShot('shot_1', 'seg_1', 'sc_1', 0.0, 4.0, 'owned'),
    createDummyShot('shot_2', 'seg_2', 'sc_2', 4.0, 9.5, 'restricted'),
    createDummyShot('shot_3', 'seg_3', 'sc_3', 9.5, 14.0, 'unverified'),
    createDummyShot('shot_4', 'seg_4', 'sc_4', 14.0, 18.0, 'licensed'),
  ];

  const review = rightsManagementService.auditTimelineRights(shots);

  assert.equal(review.totalShots, 4);
  assert.equal(review.ownedShotsCount, 1);
  assert.equal(review.licensedShotsCount, 1);
  assert.equal(review.restrictedShotsCount, 1);
  assert.equal(review.unverifiedShotsCount, 1);
  assert.equal(review.flaggedShotsCount, 2);
  assert.equal(review.flaggedShotIds.length, 2);

  // Verify exact flagged timeline intervals
  assert.equal(review.flaggedSections.length, 2);
  assert.equal(review.flaggedSections[0].shotId, 'shot_2');
  assert.equal(review.flaggedSections[0].timelineStart, 4.0);
  assert.equal(review.flaggedSections[0].timelineEnd, 9.5);
  assert.equal(review.flaggedSections[0].duration, 5.5);
  assert.equal(review.flaggedSections[0].suggestedAction, 'replace_with_graphic');
});

test('3. AI Script Review — Commentary Depth & Third-Party Dependence', () => {
  const dummyScript: ExplanationScript = {
    rawText: 'The central mystery begins when Patrick Jane notices the subtle psychological deception.',
    format: 'plain',
    segments: [
      {
        segmentId: 'seg_1',
        sentenceIndex: 0,
        paragraphIndex: 0,
        text: 'The central mystery begins when Patrick Jane notices the subtle psychological deception in the suspect demeanor.',
        voiceoverStart: 0.0,
        voiceoverEnd: 15.0,
        duration: 15.0,
        eventsDescribed: ['Inciting setup'],
        narrativePurpose: 'opening',
        visualIntent: 'Investigative premise',
        requiresMultiShot: false,
        targetShotCount: 1,
      },
      {
        segmentId: 'seg_2',
        sentenceIndex: 1,
        paragraphIndex: 0,
        text: 'Because the underlying motive reveals the moral dilemma, the subtext contrasts with the obvious clues.',
        voiceoverStart: 15.0,
        voiceoverEnd: 35.0,
        duration: 20.0,
        eventsDescribed: ['Deep critique'],
        narrativePurpose: 'investigation',
        visualIntent: 'Deep analysis',
        requiresMultiShot: false,
        targetShotCount: 1,
      },
      {
        segmentId: 'seg_3',
        sentenceIndex: 2,
        paragraphIndex: 1,
        text: 'The unsettling truth leaves us with a chilling lesson about justice and consequence.',
        voiceoverStart: 35.0,
        voiceoverEnd: 60.0,
        duration: 25.0,
        eventsDescribed: ['Climax takeaway'],
        narrativePurpose: 'resolution',
        visualIntent: 'Payoff takeaway',
        requiresMultiShot: false,
        targetShotCount: 1,
      },
    ],
    alignmentConfidence: 0.95,
    isAlignedToVoiceover: true,
  };

  const dummyTimeline: MovieExplanationTimeline = {
    timelineId: 'tl_test',
    projectId: 'proj_test',
    duration: 60.0,
    shots: [
      createDummyShot('s1', 'seg_1', 'sc_1', 0.0, 15.0, 'restricted'),
      createDummyShot('s2', 'seg_2', 'sc_2', 15.0, 35.0, 'restricted'),
      createDummyShot('s3', 'seg_3', 'sc_3', 35.0, 60.0, 'owned'), // Graphic replaces final shot
    ],
    outputAspectRatio: '16:9',
    outputWidth: 1920,
    outputHeight: 1080,
    outputFps: 60,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const report = scriptReviewService.reviewScript(dummyScript, dummyTimeline);

  assert.ok(report.overallScore >= 60, 'Analytical commentary produces healthy overall score');
  assert.ok(report.originalInsightScore >= 60, 'Contains high-frequency critical keywords');
  assert.ok(report.hookQualityScore >= 70, 'Opening question/mystery detected');
  assert.ok(report.climaxCoherenceScore >= 70, 'Resolution takeaway detected');
  assert.ok(report.longThirdPartySpans.length > 0, 'Flags continuous 35s third-party broadcast span');
  assert.ok(report.disclaimer.includes('Creative & Risk-Awareness Review'));
});

test('4. Scene-to-Voiceover Synchronization — Escalating Reuse Penalty', () => {
  const sceneA = createDummyScene('sc_A', 10.0, 40.0, 'Patrick Jane interrogates the witness');
  const dummyIndex: EpisodeIntelligenceIndex = {
    mediaId: 'media_test',
    originalVideoPath: path.join(os.tmpdir(), 'test_ep.mp4'),
    filename: 'test_ep.mp4',
    duration: 500.0,
    width: 1920,
    height: 1080,
    fps: 25,
    codec: 'hevc',
    audioCodec: 'aac',
    bitrate: 1000000,
    fileSize: 1000000,
    scenes: [sceneA],
    storyMap: {
      characters: [],
      characterRelationships: [],
      openingSituation: 'Intro',
      initialConflict: 'Conflict',
      importantDiscoveries: [],
      mysteriesAndClues: [],
      risingTensionBeats: [],
      majorTurningPoints: [],
      revelations: [],
      climaxSetup: '',
      mainClimax: {} as any,
      consequences: [],
      resolution: 'Resolution',
      confidence: 0.9,
    },
    indexedAt: new Date().toISOString(),
  };

  const segment = {
    segmentId: 'seg_1',
    sentenceIndex: 0,
    paragraphIndex: 0,
    text: 'Patrick Jane interrogates the witness about the crime scene.',
    voiceoverStart: 10.0,
    voiceoverEnd: 15.0,
    duration: 5.0,
    eventsDescribed: ['Interrogation'],
    narrativePurpose: 'investigation' as const,
    visualIntent: '',
    requiresMultiShot: false,
    targetShotCount: 1,
  };

  // Fresh use: count = 0
  const candidateFresh = storySceneMatcher.matchCandidatesForSegment(segment, dummyIndex, [segment], 0, new Map());
  const scoreFresh = candidateFresh[0].matchScore;

  // After 1 use
  const usageMap1 = new Map([['sc_A', 1]]);
  const candidate1 = storySceneMatcher.matchCandidatesForSegment(segment, dummyIndex, [segment], 0, usageMap1);
  const score1 = candidate1[0].matchScore;

  // After 3 uses
  const usageMap3 = new Map([['sc_A', 3]]);
  const candidate3 = storySceneMatcher.matchCandidatesForSegment(segment, dummyIndex, [segment], 0, usageMap3);
  const score3 = candidate3[0].matchScore;

  assert.ok(score1 < scoreFresh, 'Score drops after first reuse');
  assert.ok(score3 <= score1 - 40, 'Escalating reuse penalty strongly penalizes scene used 3+ times');
});

test('5. Validated Export Manifest — Pre-Render Integrity Gate', () => {
  const dummyVoiceover = path.join(os.tmpdir(), `test_vo_${Date.now()}.wav`);
  fs.writeFileSync(dummyVoiceover, Buffer.alloc(1024));

  const validSource = path.join(os.tmpdir(), `test_source_${Date.now()}.mp4`);
  fs.writeFileSync(validSource, Buffer.alloc(2048));

  const dummyTimeline: MovieExplanationTimeline = {
    timelineId: 'tl_manifest',
    projectId: 'proj_manifest',
    duration: 8.0,
    timelineRevision: 2,
    shots: [
      {
        ...createDummyShot('s1', 'seg_1', 'sc_1', 0.0, 4.0, 'owned'),
        sourceFile: validSource,
      },
      {
        ...createDummyShot('s2', 'seg_2', 'sc_2', 4.0, 8.0, 'licensed'),
        sourceFile: validSource,
      },
    ],
    outputAspectRatio: '16:9',
    outputWidth: 1920,
    outputHeight: 1080,
    outputFps: 60,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const manifest = movieExplanationRenderer.generateExportManifest(
    'proj_manifest',
    dummyTimeline,
    dummyVoiceover,
    {
      width: 1920,
      height: 1080,
      fps: 60,
      aspectRatio: '16:9',
      qualityPreset: 'pro_lossless',
      crf: 18,
      encoder: 'libx264',
      preset: 'fast',
    }
  );

  assert.equal(manifest.validation.isValid, true);
  assert.equal(manifest.timelineRevision, 2);
  assert.equal(manifest.shotsCount, 2);
  assert.equal(manifest.shots[0].timelineStart, 0.000);

  // Now test invalid manifest with missing media
  const brokenTimeline: MovieExplanationTimeline = {
    ...dummyTimeline,
    shots: [
      {
        ...dummyTimeline.shots[0],
        sourceFile: '/nonexistent/missing_file.mp4',
      },
    ],
  };

  const brokenManifest = movieExplanationRenderer.generateExportManifest(
    'proj_manifest',
    brokenTimeline,
    dummyVoiceover,
    {
      width: 1920,
      height: 1080,
      fps: 60,
      aspectRatio: '16:9',
      qualityPreset: 'pro_lossless',
      crf: 18,
      encoder: 'libx264',
      preset: 'fast',
    }
  );

  assert.equal(brokenManifest.validation.isValid, false);
  assert.ok(brokenManifest.validation.errors.some((e) => e.includes('Source media missing')));

  // Cleanup
  try { fs.unlinkSync(dummyVoiceover); } catch {}
  try { fs.unlinkSync(validSource); } catch {}
});

test('6. Zero-Drift Visual Replacement — Narration Invariant Rule', () => {
  const originalShot = createDummyShot('target_shot', 'seg_5', 'sc_mentalist', 45.0, 52.5, 'restricted');
  const initialDuration = Number((52.5 - 45.0).toFixed(3)); // 7.5s

  // Replace with a 15-second original infographic video
  const replacementAsset = {
    assetId: 'asset_infographic_1',
    filePath: path.join(os.tmpdir(), 'infographic.mp4'),
    filename: 'infographic.mp4',
    duration: 15.0,
    width: 1920,
    height: 1080,
    assetCategory: 'original_graphic' as const,
    rightsMetadata: {
      rightsStatus: 'owned' as const,
      sourceFilename: 'infographic.mp4',
      sourceReference: 'Original suspect relationship chart',
      updatedAt: new Date().toISOString(),
    },
  };

  const { updatedShot } = rightsManagementService.prepareShotReplacement(
    originalShot,
    replacementAsset,
    'fit_narration',
    2.0
  );

  assert.equal(updatedShot.timelineStart, originalShot.timelineStart, 'Timeline start remains identical');
  assert.equal(updatedShot.timelineEnd, originalShot.timelineEnd, 'Timeline end remains identical');
  assert.equal(updatedShot.duration, initialDuration, 'Shot duration remains identical with zero narration drift');
  assert.equal(updatedShot.rightsStatus, 'owned', 'Rights status upgraded to owned');
  assert.equal(updatedShot.sourceFile, replacementAsset.filePath);
  assert.equal(updatedShot.sourceStart, 2.0);
  assert.equal(updatedShot.sourceEnd, 9.5);
});

test('7. Backward Compatibility — Gracefully Handles Missing Metadata', () => {
  const legacyShot = {
    shotId: 'legacy_1',
    segmentId: 'seg_1',
    sceneId: 'sc_1',
    sourceFile: 'ep1.mp4',
    sourceStart: 0,
    sourceEnd: 5,
    timelineStart: 0,
    timelineEnd: 5,
    duration: 5,
    matchScore: 80,
    confidence: 0.8,
    isLowConfidence: false,
    whyThisScene: {
      characterMatch: '',
      actionMatch: '',
      storyContextReason: '',
      chronologyCheck: '',
      emotionalFit: '',
      fullSummary: '',
    },
    transition: 'cut' as const,
    transitionDuration: 0,
    isLocked: false,
    isManualOverride: false,
    framingMode: 'action' as const,
  };

  const audit = rightsManagementService.auditTimelineRights([legacyShot as any]);
  assert.equal(audit.unverifiedShotsCount, 1);
  assert.equal(audit.flaggedShotsCount, 1);
  assert.equal(audit.flaggedSections.length, 1);
  assert.equal(audit.flaggedSections[0].rightsStatus, 'unverified');
});
