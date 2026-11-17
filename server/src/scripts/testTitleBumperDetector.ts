import path from 'path';
import { titleBumperDetector } from '../services/movieExplanation/TitleBumperDetector.js';

async function main() {
  const videoPath = 'E:/Animation Auto-Sync Studio/clipping/server/data/movie_explanation/test_legacy_e01ae453-b0d1-4699-88c3-8bf959adf26b/episode_source/episode_1792604892481_76e62f.mp4';
  const cuts = [16, 27.4, 40.8];

  console.log('Testing detectOpeningTitleSlate...');
  const result = await titleBumperDetector.detectOpeningTitleSlate(videoPath, cuts);
  console.log('Result:', result);

  console.log('\nTesting evaluateImage on source_2s.jpg (Title)...');
  const rTitle = await titleBumperDetector.evaluateImage('C:/Users/ASUS/.gemini/antigravity-ide/brain/22cb875e-70b0-4c54-aff2-e58eec13e1a4/.tempmediaStorage/source_2s.jpg');
  console.log('rTitle:', rTitle);

  console.log('\nTesting evaluateImage on source_16s.jpg (Vineyard)...');
  const rVine = await titleBumperDetector.evaluateImage('C:/Users/ASUS/.gemini/antigravity-ide/brain/22cb875e-70b0-4c54-aff2-e58eec13e1a4/.tempmediaStorage/source_16s.jpg');
  console.log('rVine:', rVine);
}

main().catch(console.error);
