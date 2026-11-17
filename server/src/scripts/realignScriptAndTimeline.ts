import fs from 'fs';
import path from 'path';
import { scriptAlignmentEngine } from '../services/movieExplanation/ScriptAlignmentEngine.js';
import { aiDirectorEngine } from '../services/movieExplanation/AIDirectorEngine.js';
import { movieExplanationQualityGate } from '../services/movieExplanation/MovieExplanationQualityGate.js';

async function main() {
  const projectId = 'test_legacy_e01ae453-b0d1-4699-88c3-8bf959adf26b';
  const statePath = path.resolve('server/data/movie_explanation', projectId, 'state.json');
  const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));

  console.log('[1/4] Recomputing script alignment with exact acoustic word timing...');
  const newScript = await scriptAlignmentEngine.alignScriptAndVoiceover(
    state.script.rawText,
    state.voiceoverAudio.filePath,
    projectId,
    (pct, detail) => console.log(`  Alignment [${pct}%]: ${detail}`)
  );

  console.log(`[2/4] Aligned ${newScript.segments.length} segments.`);
  const lastSeg = newScript.segments[newScript.segments.length - 1];
  console.log(`  First segment: 0s -> ${newScript.segments[0].voiceoverEnd}s ("${newScript.segments[0].text}")`);
  console.log(`  Last segment: ${lastSeg.voiceoverStart}s -> ${lastSeg.voiceoverEnd}s ("${lastSeg.text}")`);

  console.log('[3/4] Generating timeline with new aligned script...');
  const newTimeline = aiDirectorEngine.generateTimeline(
    state.episodeIndex,
    newScript,
    state.timeline?.outputAspectRatio || '16:9'
  );

  console.log(`  Timeline shots: ${newTimeline.shots.length}`);
  console.log(`  Timeline duration: ${newTimeline.duration}s (VO duration: ${state.voiceoverAudio.duration}s)`);

  console.log('[4/4] Running Quality Gate evaluation...');
  const qualityReport = movieExplanationQualityGate.evaluateTimeline(
    newTimeline,
    state.voiceoverAudio.duration,
    state.episodeIndex
  );

  console.log(`  Quality Gate Passed: ${qualityReport.passed}`);
  console.log(`  Overall Readiness Score: ${qualityReport.overallReadinessScore}/100`);
  console.log(`  Visual Coverage: ${qualityReport.visualCoveragePercent}%`);
  console.log(`  Checks:`);
  for (const c of qualityReport.checks) {
    console.log(`    [${c.status.toUpperCase()}] ${c.name}: ${c.details}`);
  }

  state.script = newScript;
  state.timeline = newTimeline;
  state.qualityReport = qualityReport;
  state.timelineRevision = (state.timelineRevision || 1) + 1;
  state.exportStatus = 'outdated';
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf8');
  console.log(`\nSuccessfully saved updated state.json (Rev ${state.timelineRevision})!`);
}

main().catch((err) => {
  console.error('Error in realignScriptAndTimeline:', err);
  process.exit(1);
});
