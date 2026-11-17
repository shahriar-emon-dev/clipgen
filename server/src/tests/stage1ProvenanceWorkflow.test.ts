import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  provenanceManifestService,
  formatSecondsToTimecode,
  escapeCsvCell,
} from '../services/movieExplanation/ProvenanceManifestService.js';
import { rightsManagementService } from '../services/movieExplanation/RightsManagementService.js';
import type {
  MovieExplanationProject,
  MovieTimelineShot,
  EpisodeScene,
} from '../../../shared/types.js';

test('Stage 1.1: Timecode and CSV formatting helpers', () => {
  assert.equal(formatSecondsToTimecode(0), '00:00:00.000');
  assert.equal(formatSecondsToTimecode(65.5), '00:01:05.500');
  assert.equal(formatSecondsToTimecode(3661.123), '01:01:01.123');

  assert.equal(escapeCsvCell('Hello World'), '"Hello World"');
  assert.equal(escapeCsvCell('Said "Hello"'), '"Said ""Hello"""');
  assert.equal(escapeCsvCell(null), '""');
  assert.equal(escapeCsvCell(123), '"123"');
});

test('Stage 1.2: RightsManagementService handles Public Domain and Creative Commons categories', () => {
  const pdMeta = rightsManagementService.createInitialRightsMetadata('charlie_chaplin_1915.mp4', 'public_domain');
  assert.equal(pdMeta.rightsStatus, 'public_domain');
  assert.match(pdMeta.sourceReference || '', /Public Domain/i);

  const ccMeta = rightsManagementService.createInitialRightsMetadata('nasa_moon_walk.mp4', 'creative_commons', {
    attributionRequirements: 'Credit: NASA / Public Commons',
  });
  assert.equal(ccMeta.rightsStatus, 'licensed');
  assert.equal(ccMeta.attributionRequirements, 'Credit: NASA / Public Commons');
});

test('Stage 1.3: ProvenanceManifestService generates structured manifest and exports JSON and CSV', () => {
  const mockShots: MovieTimelineShot[] = [
    {
      shotId: 'shot_1',
      timelineStart: 0.0,
      timelineEnd: 3.0,
      duration: 3.0,
      sourceFile: 'C:/assets/ep1.mp4',
      sourceStart: 12.0,
      sourceEnd: 15.0,
      sceneId: 'sc_001',
      matchScore: 92,
      confidence: 0.92,
      isLowConfidence: false,
      isUnmatched: false,
      isDuplicate: false,
      isScreenshot: false,
      rightsStatus: 'restricted',
      assetCategory: 'movie_source',
      rightsMetadata: {
        rightsStatus: 'restricted',
        sourceFilename: 'ep1.mp4',
        sourceReference: 'Warner Bros Television',
        attributionRequirements: 'Footage (c) WBTV',
        usageRestrictions: 'Third-party commercial media',
      },
    },
    {
      shotId: 'shot_2',
      timelineStart: 3.0,
      timelineEnd: 6.5,
      duration: 3.5,
      sourceFile: 'C:/assets/stock_city.mp4',
      sourceStart: 0.0,
      sourceEnd: 3.5,
      sceneId: 'repl_stock1',
      matchScore: 95,
      confidence: 0.95,
      isLowConfidence: false,
      isUnmatched: false,
      isDuplicate: false,
      isScreenshot: false,
      rightsStatus: 'licensed',
      assetCategory: 'licensed_stock',
      rightsMetadata: {
        rightsStatus: 'licensed',
        sourceFilename: 'stock_city.mp4',
        sourceReference: 'Storyblocks Editorial License',
        licenseDetails: 'Standard Stock Video License #SB-9981',
      },
    },
    {
      shotId: 'shot_3',
      timelineStart: 6.5,
      timelineEnd: 9.5,
      duration: 3.0,
      sourceFile: 'C:/assets/cc_archive.mp4',
      sourceStart: 5.0,
      sourceEnd: 8.0,
      sceneId: 'repl_cc1',
      matchScore: 88,
      confidence: 0.88,
      isLowConfidence: false,
      isUnmatched: false,
      isDuplicate: false,
      isScreenshot: true,
      presentationType: 'screenshot',
      rightsStatus: 'public_domain',
      assetCategory: 'public_domain',
      rightsMetadata: {
        rightsStatus: 'public_domain',
        sourceFilename: 'cc_archive.mp4',
        sourceReference: 'National Archives Public Domain',
      },
    },
  ];

  const mockProject: MovieExplanationProject = {
    projectId: 'test_project_prov_001',
    name: 'Mentalist Ep 1 Explanation',
    createdAt: new Date().toISOString(),
    status: 'timeline_ready',
    timeline: {
      timelineRevision: 1,
      totalDuration: 9.5,
      shots: mockShots,
      pacingMetrics: {
        totalShots: 3,
        averageShotDuration: 3.17,
        subThreeSecondShots: 0,
        subThreeSecondShotRatio: 0,
        maxShotDuration: 3.5,
        targetPacingMode: '3.0s_strict',
      },
    },
    script: {
      language: 'bn',
      segments: [
        {
          segmentId: 'seg_1',
          sentenceIndex: 0,
          text: 'প্যাট্রিক জেন যখন ক্রাইম সিনে পৌঁছায় তখন সবকিছু বদলে যায়।',
          cleanScript: 'প্যাট্রিক জেন যখন ক্রাইম সিনে পৌঁছায় তখন সবকিছু বদলে যায়।',
          voiceoverStart: 0.0,
          voiceoverEnd: 9.5,
          voiceoverDuration: 9.5,
          visualIntent: 'Mentalist protagonist arrives at crime scene',
          narrativeRole: 'setup',
        },
      ],
      fullScript: 'প্যাট্রিক জেন যখন ক্রাইম সিনে পৌঁছায় তখন সবকিছু বদলে যায়।',
      totalEstimatedDuration: 9.5,
    },
  };

  const manifest = provenanceManifestService.generateProvenanceManifest(mockProject);
  assert.equal(manifest.totalShots, 3);
  assert.equal(manifest.projectId, 'test_project_prov_001');
  assert.equal(manifest.rightsSummary.restricted, 1);
  assert.equal(manifest.rightsSummary.licensed, 1);
  assert.equal(manifest.rightsSummary.publicDomain, 1);
  assert.equal(manifest.rightsSummary.flagged, 1);
  assert.ok(manifest.attributionsList.includes('Footage (c) WBTV'));

  // Verify JSON export
  const jsonOutput = provenanceManifestService.exportManifestAsJson(mockProject);
  const parsed = JSON.parse(jsonOutput);
  assert.equal(parsed.projectId, 'test_project_prov_001');
  assert.equal(parsed.shots.length, 3);
  assert.equal(parsed.shots[0].timelineStartFormatted, '00:00:00.000');
  assert.equal(parsed.shots[0].timelineEndFormatted, '00:00:03.000');

  // Verify CSV export
  const csvOutput = provenanceManifestService.exportManifestAsCsv(mockProject);
  assert.match(csvOutput, /"Shot #","Timeline Start","Timeline End"/);
  assert.match(csvOutput, /"ep1\.mp4"/);
  assert.match(csvOutput, /"stock_city\.mp4"/);
  assert.match(csvOutput, /"Warner Bros Television"/);
  assert.match(csvOutput, /"Storyblocks Editorial License"/);
});

test('Stage 1.4: RightsManagementService scans directory and creates ingested assets', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mex_prov_test_'));
  const testFile1 = path.join(tmpDir, 'archive_shot_1.png');
  const testFile2 = path.join(tmpDir, 'public_clip.jpg');
  fs.writeFileSync(testFile1, 'fake png data');
  fs.writeFileSync(testFile2, 'fake jpg data');

  const assets = await rightsManagementService.scanAndIngestAssetFolder(tmpDir, 'public_domain', {
    sourceReference: 'Open Archives Collection',
  });

  assert.equal(assets.length, 2);
  assert.equal(assets[0].assetCategory, 'public_domain');
  assert.equal(assets[0].rightsMetadata?.rightsStatus, 'public_domain');
  assert.equal(assets[0].rightsMetadata?.sourceReference, 'Open Archives Collection');

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

