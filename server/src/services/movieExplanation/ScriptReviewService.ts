// ============================================================
// Script Review Service — Original Commentary & Script Assessment
// Evaluates commentary depth, third-party footage reliance,
// hook/climax coherence, and suggests original visual alternatives.
// ============================================================

import type {
  ExplanationScript,
  MovieExplanationTimeline,
  ScriptReviewReport,
  ScriptSuggestion,
} from '../../../../shared/types.js';

export const SCRIPT_REVIEW_DISCLAIMER =
  'Creative & Risk-Awareness Review: This analysis evaluates narrative pacing, commentary depth, and visual dependence. ' +
  'It does not constitute legal advice, judicial fair use certification, or a guarantee of third-party platform acceptance.';

export class ScriptReviewService {
  /**
   * Conducts a comprehensive AI review of the explanation script and timeline visual plan.
   */
  public reviewScript(
    script: ExplanationScript,
    timeline?: MovieExplanationTimeline
  ): ScriptReviewReport {
    const segments = script.segments || [];
    const suggestions: ScriptSuggestion[] = [];

    // Aggregate narration text
    const fullText = segments.map((s) => s.text).join(' ');
    const words = fullText.split(/\s+/).filter((w) => w.length > 0);
    const totalWords = words.length;
    const estReadingTimeSec = Math.round(totalWords / 2.5); // ~150 wpm = 2.5 wps

    // ── 1. Original Commentary vs Pure Plot Retelling Assessment ──
    // Analytical / Interpretive keywords that signify commentary, criticism, and explanation
    const analyticalKeywords = [
      'because', 'symbol', 'subtext', 'motive', 'psychology', 'reveals', 'underlying',
      'theme', 'represents', 'foreshadow', 'contrast', 'intention', 'irony', 'metaphor',
      'critique', 'director', 'audience', 'moral', 'dilemma', 'tactic', 'deduction',
      'manipulat', 'deception', 'subtle', 'meaning', 'lesson', 'significance', 'struggle'
    ];

    // Plot narration keywords (mere action descriptions)
    const plotActionKeywords = [
      'then', 'goes', 'went', 'walks', 'comes', 'enters', 'sees', 'says', 'said',
      'tells', 'told', 'looks', 'runs', 'takes', 'puts', 'finds', 'opens', 'stands'
    ];

    let analyticalHitCount = 0;
    let plotActionHitCount = 0;

    for (const w of words) {
      const lower = w.toLowerCase().replace(/[^a-z]/g, '');
      if (analyticalKeywords.some((k) => lower.startsWith(k))) {
        analyticalHitCount++;
      } else if (plotActionKeywords.includes(lower)) {
        plotActionHitCount++;
      }
    }

    const analyticalRatio = totalWords > 0 ? (analyticalHitCount * 10) / (totalWords * 0.1) : 0;
    const originalInsightScore = Math.max(25, Math.min(95, Math.round(40 + analyticalHitCount * 3.5 - plotActionHitCount * 0.5)));

    if (originalInsightScore < 55) {
      suggestions.push({
        id: 'sug_insight_depth',
        type: 'commentary_depth',
        severity: 'caution',
        title: 'Deepen Original Critical Commentary',
        description: 'The script leans heavily toward describing on-screen plot events ("then he did X, she said Y") rather than explaining character motives, psychological subtext, or thematic meaning.',
        suggestedImprovement: 'Add 2–3 analytical observations explaining WHY characters act the way they do, or how subtle clues were planted early on.',
      });
    } else {
      suggestions.push({
        id: 'sug_insight_strong',
        type: 'commentary_depth',
        severity: 'praise',
        title: 'Meaningful Original Analysis Present',
        description: `Strong critical commentary detected (${analyticalHitCount} interpretive keywords). The narration provides insightful context beyond raw plot summary.`,
      });
    }

    // ── 2. Third-Party Footage Dependence & Long Spans ──
    const shots = timeline?.shots || [];
    const totalDuration = timeline?.duration || (segments[segments.length - 1]?.voiceoverEnd || 1);
    let thirdPartyDuration = 0;
    const longThirdPartySpans: Array<{ startSec: number; endSec: number; durationSec: number; recommendation: string }> = [];

    let currentThirdPartySpanStart = -1;
    let currentThirdPartySpanDuration = 0;

    for (const shot of shots) {
      const isThirdParty = shot.rightsStatus === 'restricted' || shot.rightsStatus === 'unverified' || !shot.rightsStatus;
      if (isThirdParty) {
        thirdPartyDuration += shot.duration;
        if (currentThirdPartySpanStart < 0) {
          currentThirdPartySpanStart = shot.timelineStart;
        }
        currentThirdPartySpanDuration += shot.duration;
      } else {
        if (currentThirdPartySpanDuration >= 25.0) {
          longThirdPartySpans.push({
            startSec: Number(currentThirdPartySpanStart.toFixed(1)),
            endSec: Number((currentThirdPartySpanStart + currentThirdPartySpanDuration).toFixed(1)),
            durationSec: Number(currentThirdPartySpanDuration.toFixed(1)),
            recommendation: 'Replace a section of this span with a character relationship chart, timeline infographic, or suspect diagram.',
          });
        }
        currentThirdPartySpanStart = -1;
        currentThirdPartySpanDuration = 0;
      }
    }

    if (currentThirdPartySpanDuration >= 25.0) {
      longThirdPartySpans.push({
        startSec: Number(currentThirdPartySpanStart.toFixed(1)),
        endSec: Number((currentThirdPartySpanStart + currentThirdPartySpanDuration).toFixed(1)),
        durationSec: Number(currentThirdPartySpanDuration.toFixed(1)),
        recommendation: 'Consider breaking this unbroken stretch of movie clips with an original evidence diagram or motion graphic.',
      });
    }

    const footageDependenceRatio = totalDuration > 0
      ? Number((thirdPartyDuration / totalDuration).toFixed(2))
      : 1.0;

    if (longThirdPartySpans.length > 0) {
      suggestions.push({
        id: 'sug_long_spans',
        type: 'footage_dependence',
        severity: 'caution',
        title: `${longThirdPartySpans.length} Extended Third-Party Footage Span(s) Detected`,
        description: `Found continuous stretches of TV footage up to ${longThirdPartySpans[0].durationSec}s without original visual breaks.`,
        suggestedImprovement: 'Insert original diagrams, clue timelines, or suspect relationship maps to reduce reliance on broadcast footage.',
        suggestedVisualAlternative: 'diagram',
      });
    }

    // ── 3. Hook & Opening Engagement (First 90s) ──
    const openingSegments = segments.filter((s) => s.voiceoverStart < 90.0);
    const openingText = openingSegments.map((s) => s.text).join(' ').toLowerCase();
    let hookQualityScore = 70;

    const hasStrongQuestionOrPremise = /\?|mystery|murder|bizarre|shocking|secret|mastermind|dead|who/i.test(openingText);
    const hasSluggishFiller = /\bin this video|today we will look at|hello guys|welcome back|don't forget to subscribe\b/i.test(openingText);

    if (hasStrongQuestionOrPremise) hookQualityScore += 15;
    if (hasSluggishFiller) hookQualityScore -= 20;
    hookQualityScore = Math.max(30, Math.min(98, hookQualityScore));

    if (hasSluggishFiller) {
      suggestions.push({
        id: 'sug_hook_filler',
        type: 'hook_pacing',
        severity: 'caution',
        title: 'Remove Opening Channel Filler',
        description: 'Opening narration includes generic introductory phrases that slow down audience retention.',
        suggestedImprovement: 'Start immediately with the inciting incident or central mystery question in sentence 1.',
      });
    }

    // ── 4. Climax & Resolution Coherence (Last 15% of Script) ──
    const climaxThreshold = totalDuration * 0.85;
    const climaxSegments = segments.filter((s) => s.voiceoverStart >= climaxThreshold);
    const climaxText = climaxSegments.map((s) => s.text).join(' ').toLowerCase();
    let climaxCoherenceScore = 75;

    const hasResolutionAnalysis = /\b(truth|unsettling|lesson|reveals|consequence|justice|killer|guilty|confess|fate|escapes)\b/i.test(climaxText);
    if (hasResolutionAnalysis) climaxCoherenceScore += 18;
    climaxCoherenceScore = Math.max(40, Math.min(96, climaxCoherenceScore));

    if (!hasResolutionAnalysis && climaxSegments.length > 0) {
      suggestions.push({
        id: 'sug_climax_coherence',
        type: 'climax_coherence',
        severity: 'recommendation',
        title: 'Clarify Climax & Resolution Takeaway',
        description: 'The closing narration ends abruptly without fully resolving the character payoff or philosophical lesson.',
        suggestedImprovement: 'Conclude with a memorable final thought that explains the overarching consequence or theme.',
      });
    }

    // ── 5. Repetition & Redundancy Analysis ──
    let redundancyScore = 88;
    const phraseOccurrences = new Map<string, number>();

    for (const seg of segments) {
      const phrases = seg.text.toLowerCase().match(/\b[a-z]{4,}\s+[a-z]{4,}\b/g) || [];
      for (const p of phrases) {
        if (!/in the|of the|to the|at the|on the|he was|she was|it was/i.test(p)) {
          phraseOccurrences.set(p, (phraseOccurrences.get(p) || 0) + 1);
        }
      }
    }

    const repeatedPhrases = Array.from(phraseOccurrences.entries()).filter(([_, count]) => count >= 4);
    if (repeatedPhrases.length > 0) {
      redundancyScore -= repeatedPhrases.length * 6;
      suggestions.push({
        id: 'sug_repetition',
        type: 'redundancy',
        severity: 'recommendation',
        title: 'Vary Repeated Vocabulary',
        description: `Phrases like "${repeatedPhrases[0][0]}" appear ${repeatedPhrases[0][1]} times across the narration.`,
        suggestedImprovement: 'Use synonyms or rephrase sentences to keep dialogue rhythm fresh and varied.',
      });
    }

    // ── Overall Commentary Readiness Score ──
    const overallScore = Math.round(
      originalInsightScore * 0.35 +
      (1.0 - Math.min(1.0, footageDependenceRatio)) * 100 * 0.20 +
      hookQualityScore * 0.20 +
      climaxCoherenceScore * 0.15 +
      redundancyScore * 0.10
    );

    return {
      overallScore: Math.max(30, Math.min(98, overallScore)),
      originalInsightScore,
      footageDependenceRatio,
      hookQualityScore,
      climaxCoherenceScore,
      redundancyScore: Math.max(40, Math.min(99, redundancyScore)),
      totalNarrationWords: totalWords,
      estimatedReadingTimeSec: estReadingTimeSec,
      longThirdPartySpans,
      suggestions,
      reviewedAt: new Date().toISOString(),
      disclaimer: SCRIPT_REVIEW_DISCLAIMER,
    };
  }
}

export const scriptReviewService = new ScriptReviewService();
