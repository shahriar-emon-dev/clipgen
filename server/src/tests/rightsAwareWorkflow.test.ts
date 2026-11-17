// ============================================================
// Rights-Aware Video Production Workflow — Test Suite
// Verifies all objectives of the Copyright-Aware Upgrade:
// 1. Asset-level rights metadata & backward compatibility
// 2. Pre-export rights review (flagging unverified / restricted media)
// 3. Scene replacement workflow with licensed stock, diagrams, and original visuals
// 4. Invariant narration synchronization (Zero timeline drift)
// 5. Reviewable alignment adjustments (fit, crop, loop, hold)
// 6. Project persistence and quality gate audit integration
// ============================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'path';
import fs from 'fs';
import { rightsManagementService } from '../services/movieExplanation/RightsManagementService.js';
import { movieExplanationQualityGate } from '../services/movieExplanation/MovieExplanationQualityGate.js';
import { movieExplanationStore } from '../services/movieExplanation/MovieExplanationStore.js';
import type {
  MovieTimelineShot,
  EpisodeScene,
  AssetRightsMetadata,
  MovieExplanationProjectState,
} from '../../../shared/types.js';

function createMockShot(overrides?: Partial<MovieTimelineShot>): MovieTimelineShot {
  return {
    shotId: 'shot_001',
    segmentId: 'seg_001',
    sceneId: 'sc_001',
    sourceFile: 'mentalist_pilot.mp4',
    sourceStart: 100.0,
    sourceEnd: 105.5,
    timelineStart: 10.0,
    timelineEnd: 15.5,
    duration: 5.5,
    matchScore: 85,
    confidence: 0.85,
    isLowConfidence: false,
    whyThisScene: {
      characterMatch: 'Patrick Jane',
      actionMatch: 'examining clues',
      storyContextReason: 'Direct visual match to detective investigation',
      chronologyCheck: 'Chronologically consistent',
      emotionalFit: 'Focused and attentive',
      fullSummary: 'Patrick Jane studies evidence in the room.',
    },
    transition: 'cut',
    transitionDuration: 0,
    isLocked: false,
    isManualOverride: false,
    framingMode: 'action',
    ...overrides,
  };
}

function createMockScene(overrides?: Partial<EpisodeScene>): EpisodeScene {
  return {
    sceneId: 'sc_001',
    sceneIndex: 0,
    startTime: 100.0,
    endTime: 160.0,
    duration: 60.0,
    shotBoundaries: [100.0, 115.0, 130.0],
    dialogueSnippet: 'Look at the details on the wall.',
    dialogueText: 'Look at the details on the wall.',
    characters: ['Patrick Jane'],
    location: 'crime_scene',
    actions: ['walking'],
    objectsAndEvidence: [],
    events: [],
    emotionalTone: 'focused',
    narrativePurpose: 'setup',
    description: 'Patrick Jane inspects the painted red smile symbol.',
    visualDetails: ['crime scene wall'],
    isClueOrReveal: false,
    isQuietMotivational: false,
    isActionHeavy: false,
    importance: 'important',
    confidence: 0.95,
    ...overrides,
  };
}

test('1. Asset Rights Metadata — Initial Creation & Studio Restrict Detection', () => {
  // Test commercial studio media auto-detection (Warner / WBTV)
  const studioMeta = rightsManagementService.createInitialRightsMetadata(
    'The_Mentalist_S01E01_WBTV_WarnerBros.mp4',
    'movie_source'
  );
  assert.strictEqual(studioMeta.rightsStatus, 'restricted');
  assert.ok(studioMeta.usageRestrictions?.includes('copyright restrictions'));

  // Test generic movie footage default
  const genericMeta = rightsManagementService.createInitialRightsMetadata(
    'indie_film_source.mp4',
    'movie_source'
  );
  assert.strictEqual(genericMeta.rightsStatus, 'unverified');

  // Test licensed stock
  const stockMeta = rightsManagementService.createInitialRightsMetadata(
    'stock_police_tape.mp4',
    'licensed_stock'
  );
  assert.strictEqual(stockMeta.rightsStatus, 'licensed');

  // Test original user graphic
  const graphicMeta = rightsManagementService.createInitialRightsMetadata(
    'timeline_infographic.png',
    'original_graphic'
  );
  assert.strictEqual(graphicMeta.rightsStatus, 'owned');
});

test('2. Backward Compatibility — Existing Projects Without Rights Metadata', () => {
  // Legacy shot with no rights metadata attached
  const legacyShot = createMockShot();
  delete (legacyShot as any).rightsMetadata;
  delete (legacyShot as any).rightsStatus;

  const review = rightsManagementService.auditTimelineRights([legacyShot]);
  assert.strictEqual(review.totalShots, 1);
  assert.strictEqual(review.unverifiedShotsCount, 1);
  assert.strictEqual(review.flaggedShotsCount, 1);
  assert.deepStrictEqual(review.flaggedShotIds, ['shot_001']);

  // Verify disclaimer is present and does not make claims of legal certainty
  assert.ok(review.disclaimer.includes('does not constitute legal advice'));
  assert.ok(!review.disclaimer.includes('guaranteed safe'));
});

test('3. Reviewable Alignment — Shorter Replacement Asset with Loop Mode', () => {
  const targetShot = createMockShot({
    timelineStart: 20.0,
    timelineEnd: 26.0,
    duration: 6.0,
  });

  // Replacement video is only 2.5s (shorter than the 6.0s voiceover sentence)
  const replacementAsset = {
    assetId: 'asset_stock_broll_1',
    filePath: 'C:/assets/stock_cityscape.mp4',
    filename: 'stock_cityscape.mp4',
    duration: 2.5,
    width: 1920,
    height: 1080,
    assetCategory: 'licensed_stock' as const,
  };

  const { updatedShot, alignmentNotice } = rightsManagementService.prepareShotReplacement(
    targetShot,
    replacementAsset,
    'loop',
    0
  );

  // Invariant Narration Synchronization check:
  assert.strictEqual(updatedShot.timelineStart, 20.0, 'Timeline start must not shift');
  assert.strictEqual(updatedShot.timelineEnd, 26.0, 'Timeline end must not shift');
  assert.strictEqual(updatedShot.duration, 6.0, 'Duration must strictly match narration (6.0s)');
  assert.strictEqual(updatedShot.isLocked, true, 'Replaced shot must be locked against AI regeneration');

  // Replacement metadata check:
  assert.ok(updatedShot.replacementSource);
  assert.strictEqual(updatedShot.replacementSource?.alignmentMode, 'loop');
  assert.strictEqual(updatedShot.replacementSource?.actualFootageDuration, 2.5);
  assert.strictEqual(updatedShot.replacementSource?.originalNarrationDuration, 6.0);
  assert.ok(alignmentNotice.toLowerCase().includes('loop'));
});

test('4. Reviewable Alignment — Longer Replacement Asset with Fit & Offset', () => {
  const targetShot = createMockShot({
    timelineStart: 50.0,
    timelineEnd: 54.2,
    duration: 4.2,
  });

  // Replacement footage is 15.0s long
  const replacementAsset = {
    assetId: 'asset_diagram_anim',
    filePath: 'C:/assets/complex_diagram.mp4',
    filename: 'complex_diagram.mp4',
    duration: 15.0,
    width: 1920,
    height: 1080,
    assetCategory: 'original_graphic' as const,
  };

  const { updatedShot, alignmentNotice } = rightsManagementService.prepareShotReplacement(
    targetShot,
    replacementAsset,
    'fit_narration',
    3.0 // start 3 seconds into the diagram
  );

  assert.strictEqual(updatedShot.timelineStart, 50.0);
  assert.strictEqual(updatedShot.timelineEnd, 54.2);
  assert.strictEqual(updatedShot.duration, 4.2);
  assert.strictEqual(updatedShot.replacementSource?.startOffset, 3.0);
  assert.strictEqual(updatedShot.replacementSource?.alignmentMode, 'fit_narration');
  assert.ok(alignmentNotice.toLowerCase().includes('fitted') || alignmentNotice.toLowerCase().includes('narration'));
});

test('5. Static Image Replacement (Diagrams / Original Graphics)', () => {
  const targetShot = createMockShot({
    duration: 8.0,
  });

  const imageAsset = {
    assetId: 'asset_infographic_still',
    filePath: 'C:/assets/suspect_board.png',
    filename: 'suspect_board.png',
    duration: 0,
    width: 1920,
    height: 1080,
    assetCategory: 'original_graphic' as const,
  };

  const { updatedShot } = rightsManagementService.prepareShotReplacement(
    targetShot,
    imageAsset,
    'hold',
    0
  );

  assert.strictEqual(updatedShot.duration, 8.0);
  assert.strictEqual(updatedShot.replacementSource?.mediaType, 'image');
  assert.strictEqual(updatedShot.replacementSource?.alignmentMode, 'hold');
});

test('6. Zero Timeline Ripple — Neighboring Shots Retain Exact Timing', () => {
  const shotA = createMockShot({ shotId: 'shot_A', timelineStart: 0.0, timelineEnd: 5.0, duration: 5.0 });
  const shotB = createMockShot({ shotId: 'shot_B', timelineStart: 5.0, timelineEnd: 12.0, duration: 7.0 });
  const shotC = createMockShot({ shotId: 'shot_C', timelineStart: 12.0, timelineEnd: 18.0, duration: 6.0 });

  // Replace middle shot B with a 3.0s replacement asset
  const { updatedShot: replacedB } = rightsManagementService.prepareShotReplacement(
    shotB,
    {
      assetId: 'asset_user_broll',
      filePath: 'C:/assets/user_broll.mp4',
      filename: 'user_broll.mp4',
      duration: 3.0,
      width: 1920,
      height: 1080,
    },
    'fit_narration',
    0
  );

  const timeline = [shotA, replacedB, shotC];

  // Verify shot A remains unaltered
  assert.strictEqual(timeline[0].timelineStart, 0.0);
  assert.strictEqual(timeline[0].timelineEnd, 5.0);

  // Verify shot B maintains exact slot
  assert.strictEqual(timeline[1].timelineStart, 5.0);
  assert.strictEqual(timeline[1].timelineEnd, 12.0);
  assert.strictEqual(timeline[1].duration, 7.0);

  // Verify shot C has zero drift
  assert.strictEqual(timeline[2].timelineStart, 12.0);
  assert.strictEqual(timeline[2].timelineEnd, 18.0);
});

test('7. Pre-Export Rights Review & Attribution Generation', () => {
  const shot1 = createMockShot({
    shotId: 's1',
    rightsStatus: 'licensed',
    rightsMetadata: {
      rightsStatus: 'licensed',
      sourceFilename: 'stock_police_siren.mp4',
      licenseDetails: 'Envato Elements #982183',
      attributionRequirements: 'Police b-roll courtesy of Storyblocks / Artist X',
    },
  });

  const shot2 = createMockShot({
    shotId: 's2',
    rightsStatus: 'owned',
    rightsMetadata: {
      rightsStatus: 'owned',
      sourceFilename: 'crime_scene_diagram.png',
      licenseDetails: 'Self-created illustration',
      attributionRequirements: 'Original diagram by Channel Author',
    },
  });

  const shot3 = createMockShot({
    shotId: 's3',
    rightsStatus: 'restricted',
    rightsMetadata: {
      rightsStatus: 'restricted',
      sourceFilename: 'the_mentalist_s01e01.mp4',
      usageRestrictions: 'Studio copyrighted footage. Replace before publishing.',
    },
  });

  const review = rightsManagementService.auditTimelineRights([shot1, shot2, shot3]);

  assert.strictEqual(review.totalShots, 3);
  assert.strictEqual(review.licensedShotsCount, 1);
  assert.strictEqual(review.ownedShotsCount, 1);
  assert.strictEqual(review.restrictedShotsCount, 1);
  assert.strictEqual(review.flaggedShotsCount, 1);
  assert.deepStrictEqual(review.flaggedShotIds, ['s3']);

  // Verify attributions list
  assert.strictEqual(review.attributions.length, 2);
  assert.ok(review.attributions.includes('Police b-roll courtesy of Storyblocks / Artist X'));
  assert.ok(review.attributions.includes('Original diagram by Channel Author'));

  // Verify usage restrictions list
  assert.strictEqual(review.usageRestrictions.length, 1);
  assert.ok(review.usageRestrictions[0].includes('Studio copyrighted footage'));
});

test('8. Quality Gate Pre-Flight Evaluation with Rights Review', () => {
  const unverifiedShot = createMockShot({
    shotId: 's_unverified',
    rightsStatus: 'unverified',
    rightsMetadata: {
      rightsStatus: 'unverified',
      sourceFilename: 'unverified_tv_clip.mp4',
    },
  });

  const mockTimeline = {
    timelineId: 'tl_mock',
    projectId: 'p_mock',
    duration: 5.5,
    outputAspectRatio: '16:9' as const,
    outputWidth: 1920,
    outputHeight: 1080,
    outputFps: 60,
    shots: [unverifiedShot],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const report = movieExplanationQualityGate.evaluateTimeline(
    mockTimeline,
    5.5
  );

  // Quality report must include rightsAudit
  assert.ok(report.rightsAudit);
  assert.strictEqual(report.rightsAudit?.unverifiedShotsCount, 1);
  assert.strictEqual(report.rightsAudit?.flaggedShotsCount, 1);

  // Must surface review warning without blocking technical gate or claiming legal judgment
  const hasRightsWarning = report.actionableWarnings?.some((w) =>
    w.includes('unverified or restricted')
  );
  assert.ok(hasRightsWarning, 'Expected actionable warning for unverified media');
});

test('9. Project State Persistence with Rights & Replacement Assets', () => {
  const projectId = `test_rights_${Date.now()}`;
  const mockProject: MovieExplanationProjectState = {
    projectId,
    projectName: 'Rights Test Project',
    status: 'timeline_ready',
    inputMode: 'single_video',
    timelineRevision: 2,
    renderProgress: 0,
    renderStage: 'idle',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    replacementAssets: [
      {
        clipId: 'asset_test_1',
        assetId: 'asset_test_1',
        label: 'Licensed Stock Investigation',
        category: 'licensed_stock',
        mediaType: 'video',
        filename: 'stock_investigation.mp4',
        originalFilename: 'stock_investigation.mp4',
        filePath: 'C:/assets/stock_investigation.mp4',
        duration: 12.0,
        width: 1920,
        height: 1080,
        fps: 30,
        fileSize: 1048576,
        isAnalyzed: true,
        rightsMetadata: {
          rightsStatus: 'licensed',
          sourceFilename: 'stock_investigation.mp4',
          licenseDetails: 'Pexels CC0 Commercial License',
        },
      },
    ],
    timeline: {
      timelineId: `tl_${projectId}`,
      projectId,
      duration: 10.0,
      outputAspectRatio: '16:9',
      outputWidth: 1920,
      outputHeight: 1080,
      outputFps: 60,
      shots: [
        createMockShot({
          shotId: 'shot_persisted',
          rightsStatus: 'licensed',
          rightsMetadata: {
            rightsStatus: 'licensed',
            sourceFilename: 'stock_investigation.mp4',
            licenseDetails: 'Pexels CC0 Commercial License',
          },
        }),
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  };

  // Save to project store
  movieExplanationStore.saveProject(mockProject);

  // Retrieve and verify
  const loaded = movieExplanationStore.getProject(projectId);
  assert.ok(loaded);
  assert.strictEqual(loaded?.replacementAssets?.length, 1);
  assert.strictEqual(loaded?.replacementAssets?.[0].rightsMetadata?.rightsStatus, 'licensed');
  assert.strictEqual(loaded?.timeline?.shots[0].rightsStatus, 'licensed');

  // Cleanup test project
  movieExplanationStore.deleteProject(projectId);
  assert.ok(!movieExplanationStore.getProject(projectId));
});
