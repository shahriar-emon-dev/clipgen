import fs from 'fs';
import path from 'path';
import { aiDirectorEngine } from '../services/movieExplanation/AIDirectorEngine.js';
import { movieExplanationQualityGate } from '../services/movieExplanation/MovieExplanationQualityGate.js';

async function main() {
  const statePath = path.resolve('server/data/movie_explanation/test_legacy_e01ae453-b0d1-4699-88c3-8bf959adf26b/state.json');
  const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));

  console.log('Generating new timeline with repaired AI Director & StorySceneMatcher...');
  const newTimeline = aiDirectorEngine.generateTimeline(
    state.episodeIndex,
    state.script,
    state.timeline?.outputAspectRatio || '16:9'
  );

  console.log('New timeline shots count:', newTimeline.shots.length);
  console.log('Total duration:', newTimeline.duration);

  console.log('\n--- FIRST 15 SHOTS (OPENING 120s) ---');
  for (let i = 0; i < Math.min(15, newTimeline.shots.length); i++) {
    const sh = newTimeline.shots[i];
    console.log(
      `Shot #${i}: ${sh.shotId} | Scene ${sh.sceneId} | Source: ${sh.sourceStart.toFixed(1)}s - ${sh.sourceEnd.toFixed(1)}s | VO: ${sh.timelineStart.toFixed(1)}s - ${sh.timelineEnd.toFixed(1)}s (${sh.duration.toFixed(1)}s) | Score: ${sh.matchScore}%`
    );
    console.log(`   Description: ${sh.sceneDescription?.slice(0, 80)}...`);
  }

  const qualityReport = movieExplanationQualityGate.evaluateTimeline(
    newTimeline,
    state.voiceoverAudio?.duration || newTimeline.duration,
    state.episodeIndex
  );
  console.log('\n--- QUALITY GATE REPORT ---');
  console.log('Passed:', qualityReport.passed);
  console.log('Overall Score:', qualityReport.overallReadinessScore + '/100');
  console.log('Coverage:', qualityReport.visualCoveragePercent + '%');
  console.log('Strong Matches (>=75%):', qualityReport.strongMatchesCount);
  console.log('Low Confidence Shots:', qualityReport.lowConfidenceCount);
  console.log('Checks Summary:');
  for (const chk of qualityReport.checks) {
    console.log(`  [${chk.status.toUpperCase()}] ${chk.name}: ${chk.details}`);
  }

  // Save the updated timeline and quality report to state.json
  state.timeline = newTimeline;
  state.qualityReport = qualityReport;
  state.timelineRevision = (state.timelineRevision || 1) + 1;
  state.updatedAt = new Date().toISOString();
  state.exportStatus = 'outdated';
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf8');
  console.log('\nSuccessfully saved new timeline (Rev ' + state.timelineRevision + ') to state.json!');
}

main().catch(console.error);
