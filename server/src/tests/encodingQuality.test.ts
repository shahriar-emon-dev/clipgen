// ============================================================
// Encoding Quality & Resolution Preservation Tests
// Tests VideoEncodingProfile, source resolution preservation (1080p, 1440p, 4K),
// framerate retention, lossless intermediate buffer args, and stream copy
// ============================================================

import { test } from 'node:test';
import assert from 'node:assert';
import { videoEncodingService } from '../services/encodingProfiles.js';
import { LongFormQualityGate } from '../services/longForm/LongFormQualityGate.js';

test('VideoEncodingService — FAST_CUT selects lossless stream copy', () => {
  const enc = videoEncodingService.getEncodingParameters('FAST_CUT', {
    width: 1920,
    height: 1080,
    fps: 30,
    pixelFormat: 'yuv420p',
  });

  assert.strictEqual(enc.isStreamCopy, true, 'FAST_CUT must be stream copy');
  assert.strictEqual(enc.videoCodec, 'copy');
  assert.strictEqual(enc.audioCodec, 'copy');
  assert.ok(enc.rawArgs.includes('-c') && enc.rawArgs.includes('copy'), 'FFmpeg CLI flags must include -c copy');
});

test('VideoEncodingService — QUALITY_CUT uses visually transparent CRF 17 and 320k audio', () => {
  const enc = videoEncodingService.getEncodingParameters('QUALITY_CUT', {
    width: 1920,
    height: 1080,
    fps: 59.94,
    pixelFormat: 'yuv420p',
  });

  assert.strictEqual(enc.isStreamCopy, false);
  assert.strictEqual(enc.crf, 17, 'QUALITY_CUT must use CRF 17 for master quality');
  assert.strictEqual(enc.preset, 'medium', 'Must use medium preset instead of blurry ultrafast');
  assert.strictEqual(enc.audioBitrate, '320k');
  assert.strictEqual(enc.targetFps, 59.94, 'Source 59.94 FPS must be preserved');
  assert.strictEqual(enc.targetWidth, 1920);
  assert.strictEqual(enc.targetHeight, 1080);
});

test('VideoEncodingService — Native Resolution Preservation (1080p, 1440p, 4K)', () => {
  // 1080p source
  const enc1080 = videoEncodingService.getEncodingParameters('LONG_FORM_HIGH_QUALITY', {
    width: 1920,
    height: 1080,
    fps: 30,
  });
  assert.strictEqual(enc1080.targetWidth, 1920);
  assert.strictEqual(enc1080.targetHeight, 1080);

  // 1440p source
  const enc1440 = videoEncodingService.getEncodingParameters('LONG_FORM_HIGH_QUALITY', {
    width: 2560,
    height: 1440,
    fps: 60,
  });
  assert.strictEqual(enc1440.targetWidth, 2560, '1440p must not be downscaled');
  assert.strictEqual(enc1440.targetHeight, 1440);
  assert.strictEqual(enc1440.targetFps, 60, '60 FPS must be preserved');

  // 4K source
  const enc4k = videoEncodingService.getEncodingParameters('LONG_FORM_HIGH_QUALITY', {
    width: 3840,
    height: 2160,
    fps: 24,
  });
  assert.strictEqual(enc4k.targetWidth, 3840, '4K must not be downscaled to 1080p');
  assert.strictEqual(enc4k.targetHeight, 2160);
  assert.strictEqual(enc4k.targetFps, 24, '24 FPS cinema rate must be preserved');
});

test('VideoEncodingService — Lossless Intermediate Buffer (-qp 0) eliminates double encoding', () => {
  const intermediateArgs = videoEncodingService.getLosslessIntermediateArgs();

  assert.ok(intermediateArgs.includes('-qp') && intermediateArgs.includes('0'), 'Must use -qp 0 for true lossless intermediate');
  assert.ok(intermediateArgs.includes('-preset') && intermediateArgs.includes('ultrafast'), 'Must use ultrafast for zero compute delay');
  assert.ok(intermediateArgs.includes('pcm_s16le'), 'Must use uncompressed PCM audio in intermediate');
});

test('VideoEncodingService — Framerate Sanitizer preserves standard cinema/broadcast rates', () => {
  assert.strictEqual(videoEncodingService.sanitizeFps(23.976), 23.976);
  assert.strictEqual(videoEncodingService.sanitizeFps(24.0), 24);
  assert.strictEqual(videoEncodingService.sanitizeFps(25.0), 25);
  assert.strictEqual(videoEncodingService.sanitizeFps(29.97), 29.97);
  assert.strictEqual(videoEncodingService.sanitizeFps(30.0), 30);
  assert.strictEqual(videoEncodingService.sanitizeFps(50.0), 50);
  assert.strictEqual(videoEncodingService.sanitizeFps(59.94), 59.94);
  assert.strictEqual(videoEncodingService.sanitizeFps(60.0), 60);
});

test('LongFormQualityGate — Source Quality Preservation Check', async () => {
  const gate = new LongFormQualityGate();
  
  // Test non-existent file handling
  const report = await gate.postCheckRenderedFile(
    'non_existent_output.mp4',
    300,
    [],
    [],
    { width: 1920, height: 1080, fps: 30 }
  );

  assert.strictEqual(report.passed, false);
  assert.ok(report.checks.some(c => c.id === 'output_file_exists'));
});
