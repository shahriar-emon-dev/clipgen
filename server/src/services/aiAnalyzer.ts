// ============================================================
// AI Analyzer — LLM-based Highlight Scoring
// Only called for pre-filtered candidates (cost control)
// ============================================================

import { config } from '../config/index.js';
import type { RawCandidate } from './highlightDetector.js';
import type { TranscriptSegment } from '../../../shared/types.js';

export interface AIAnalysisResult {
  score: number;
  hook: number;
  emotion: number;
  value: number;
  storyCompleteness: number;
  shortsP: number;
  reason: string;
  recommendedStart: number;
  recommendedEnd: number;
}

/**
 * Use LLM to score and refine highlight candidates.
 * Only called for top N candidates to control costs.
 */
export async function analyzeHighlightsWithAI(
  candidates: RawCandidate[],
  allSegments: TranscriptSegment[],
  maxCandidates: number = 15,
  onProgress?: (percent: number, detail: string) => void
): Promise<Map<number, AIAnalysisResult>> {
  // Only analyze top candidates (cost control)
  const topCandidates = candidates.slice(0, maxCandidates);
  const results = new Map<number, AIAnalysisResult>();

  if (topCandidates.length === 0) return results;

  if (onProgress) {
    onProgress(10, `Sending top ${topCandidates.length} highlight moments to AI model (${config.aiModel})...`);
  }

  // Process in batches of 3 to avoid rate limits
  const batchSize = 3;
  for (let i = 0; i < topCandidates.length; i += batchSize) {
    const batch = topCandidates.slice(i, i + batchSize);
    const promises = batch.map((candidate, batchIdx) =>
      analyzeSingleCandidate(candidate, allSegments, i + batchIdx)
    );

    const batchResults = await Promise.allSettled(promises);

    for (let j = 0; j < batchResults.length; j++) {
      const result = batchResults[j];
      if (result.status === 'fulfilled' && result.value) {
        results.set(i + j, result.value);
      }
    }

    const processed = Math.min(topCandidates.length, i + batch.length);
    const pct = Math.round((processed / topCandidates.length) * 100);
    if (onProgress) {
      onProgress(pct, `Scored moment ${processed} of ${topCandidates.length} with AI (${pct}%)`);
    }
  }

  if (onProgress) {
    onProgress(100, `Completed AI scoring for ${results.size} candidates`);
  }

  return results;
}

async function analyzeSingleCandidate(
  candidate: RawCandidate,
  allSegments: TranscriptSegment[],
  candidateIndex: number
): Promise<AIAnalysisResult | null> {
  // Get context: 30 seconds before and after
  const contextBefore = allSegments
    .filter(s => s.endTime >= candidate.startTime - 30 && s.endTime < candidate.startTime)
    .map(s => s.text)
    .join(' ')
    .substring(0, 200);

  const contextAfter = allSegments
    .filter(s => s.startTime > candidate.endTime && s.startTime <= candidate.endTime + 30)
    .map(s => s.text)
    .join(' ')
    .substring(0, 200);

  const prompt = buildAnalysisPrompt(candidate, contextBefore, contextAfter);

  try {
    const response = await callLLM(prompt);
    return parseAIResponse(response, candidate);
  } catch (err) {
    console.warn(`AI analysis failed for candidate ${candidateIndex}:`, err);
    return null;
  }
}

function buildAnalysisPrompt(
  candidate: RawCandidate,
  contextBefore: string,
  contextAfter: string
): string {
  return `You are an expert YouTube Shorts analyst. Analyze this video segment and determine if it would make an engaging 30-second-or-less Short.

SEGMENT TRANSCRIPT (${candidate.startTime.toFixed(1)}s - ${candidate.endTime.toFixed(1)}s):
"${candidate.transcriptText}"

CONTEXT BEFORE: "${contextBefore}"
CONTEXT AFTER: "${contextAfter}"

PRE-COMPUTED SIGNAL SCORES:
- Hook Strength: ${candidate.scores.hook}/100
- Emotional Intensity: ${candidate.scores.emotion}/100
- Curiosity/Surprise: ${candidate.scores.curiosity}/100
- Content/Information Value: ${candidate.scores.contentValue}/100
- Story Completeness: ${candidate.scores.story}/100
- Audio Energy: ${candidate.scores.audio}/100

Analyze this segment for its potential as a YouTube Short. Consider:
1. Does it have a strong opening that would hook viewers immediately?
2. Is there emotional resonance or intensity?
3. Does it deliver clear value (information, entertainment, insight)?
4. Does the thought feel complete, or does it cut off abruptly?
5. Would this work as a standalone 30-second clip?

Also suggest the OPTIMAL start and end timestamps (within the given range ±5 seconds) for the best possible 30-second clip. Find natural sentence boundaries.

Respond ONLY with valid JSON in this exact format:
{
  "score": <0-100 overall score>,
  "hook": <0-100>,
  "emotion": <0-100>,
  "value": <0-100>,
  "story_completeness": <0-100>,
  "shorts_potential": <0-100>,
  "reason": "<1-2 sentence explanation>",
  "recommended_start": <float seconds>,
  "recommended_end": <float seconds>
}`;
}

async function callLLM(prompt: string): Promise<string> {
  if (config.aiProvider === 'openai') {
    return callOpenAI(prompt);
  }

  // Fallback to OpenAI
  return callOpenAI(prompt);
}

async function callOpenAI(prompt: string): Promise<string> {
  const { default: OpenAI } = await import('openai');
  const openai = new OpenAI({
    apiKey: config.openaiApiKey,
    ...(config.openaiBaseUrl ? { baseURL: config.openaiBaseUrl } : {}),
  });

  const response = await openai.chat.completions.create({
    model: config.aiModel,
    messages: [
      {
        role: 'system',
        content: 'You are a YouTube Shorts optimization expert. Always respond with valid JSON only. No markdown, no code blocks, just raw JSON.',
      },
      { role: 'user', content: prompt },
    ],
    max_tokens: config.aiMaxTokens,
    temperature: 0.3, // Low temperature for consistent scoring
    response_format: { type: 'json_object' },
  });

  return response.choices[0]?.message?.content || '';
}

function parseAIResponse(
  response: string,
  candidate: RawCandidate
): AIAnalysisResult | null {
  try {
    // Strip any markdown code blocks if present
    let cleaned = response.trim();
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }

    const data = JSON.parse(cleaned);

    // Validate required fields
    const score = clampScore(data.score);
    const hook = clampScore(data.hook);
    const emotion = clampScore(data.emotion);
    const value = clampScore(data.value);
    const storyCompleteness = clampScore(data.story_completeness);
    const shortsP = clampScore(data.shorts_potential);

    // Validate timestamps
    let recommendedStart = parseFloat(data.recommended_start);
    let recommendedEnd = parseFloat(data.recommended_end);

    if (isNaN(recommendedStart) || recommendedStart < 0) {
      recommendedStart = candidate.startTime;
    }
    if (isNaN(recommendedEnd) || recommendedEnd <= recommendedStart) {
      recommendedEnd = candidate.endTime;
    }

    // Enforce max duration
    if (recommendedEnd - recommendedStart > config.maxShortDuration) {
      recommendedEnd = recommendedStart + config.maxShortDuration;
    }

    const reason = typeof data.reason === 'string' ? data.reason.substring(0, 500) : '';

    return {
      score,
      hook,
      emotion,
      value,
      storyCompleteness,
      shortsP,
      reason,
      recommendedStart,
      recommendedEnd,
    };
  } catch (err) {
    console.warn('Failed to parse AI response:', err);
    return null;
  }
}

function clampScore(value: unknown): number {
  const num = Number(value);
  if (isNaN(num)) return 50;
  return Math.max(0, Math.min(100, Math.round(num)));
}
