import fs from 'fs';
import path from 'path';
import { movieExplanationRenderer } from '../services/movieExplanation/MovieExplanationRenderer.js';
import { extractMetadata } from '../services/ffmpeg.js';

async function main() {
  const projectId = 'test_legacy_e01ae453-b0d1-4699-88c3-8bf959adf26b';
  const statePath = fs.existsSync(path.resolve('data/movie_explanation', projectId, 'state.json'))
    ? path.resolve('data/movie_explanation', projectId, 'state.json')
    : path.resolve('server/data/movie_explanation', projectId, 'state.json');
  const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));

  console.log('--- STARTING OPENING 120-SECOND PREVIEW RENDER ---');
  console.log(`Project: ${state.projectName} (${projectId})`);
  console.log(`Source Video: ${state.originalVideo.filePath}`);
  console.log(`Voiceover: ${state.voiceoverAudio.filePath}`);
  console.log(`Timeline shots count: ${state.timeline.shots.length}`);

  const t0 = Date.now();
  const result = await movieExplanationRenderer.renderOpeningPreviewVideo(
    projectId,
    state.timeline,
    state.voiceoverAudio.filePath,
    120,
    (progress, stage, detail) => {
      console.log(`[${progress}%] [${stage}] ${detail || ''}`);
    }
  );

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\nRender completed in ${elapsed}s!`);
  console.log(`Output: ${result.outputPath}`);
  console.log(`File Size: ${(result.fileSize / (1024 * 1024)).toFixed(2)} MB`);
  console.log(`Duration: ${result.duration.toFixed(2)}s`);

  // Validate with ffprobe
  const meta = await extractMetadata(result.outputPath);
  console.log(`\nFFprobe Validation:`);
  console.log(`  Duration: ${meta.duration.toFixed(2)}s`);
  console.log(`  Resolution: ${meta.width}x${meta.height}`);
  console.log(`  FPS: ${meta.fps}`);
  console.log(`  Video Codec: ${meta.codec}`);
  console.log(`  Audio Codec: ${meta.audioCodec}`);

  // Copy to final video folder
  const finalFolder = 'E:/Animation Auto-Sync Studio/clipping/final video';
  if (!fs.existsSync(finalFolder)) {
    fs.mkdirSync(finalFolder, { recursive: true });
  }

  const finalVideoDest = path.join(finalFolder, 'The_Mentalist_S01E02_Opening_Preview_120s.mp4');
  fs.copyFileSync(result.outputPath, finalVideoDest);
  console.log(`\nSuccessfully saved preview to: ${finalVideoDest}`);
}

main().catch((err) => {
  console.error('Preview render failed:', err);
  process.exit(1);
});
