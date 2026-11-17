import { detectBestEncoder } from '../services/movieExplanation/MovieExplanationRenderer.js';

async function main() {
  console.log('Detecting best hardware encoder...');
  const t0 = Date.now();
  const enc = await detectBestEncoder();
  console.log(`Detected in ${Date.now() - t0}ms:`, enc);
}

main().catch(console.error);
