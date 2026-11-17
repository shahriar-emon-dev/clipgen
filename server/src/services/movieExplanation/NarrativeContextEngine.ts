// ============================================================
// NarrativeContextEngine
// Maintains contextual story memory across sequential narration beats.
// Resolves pronouns, maintains character & location continuity,
// and detects deliberate flashbacks vs linear story progression.
// ============================================================

import type {
  ExplanationScriptSegment,
  EpisodeScene,
} from '../../../../shared/types.js';

export interface NarrativeContextWindow {
  previousSegment?: ExplanationScriptSegment;
  currentSegment: ExplanationScriptSegment;
  nextSegment?: ExplanationScriptSegment;
  lastSelectedScene?: EpisodeScene;
  activeCharacters: string[];
  activeLocation?: string;
  isFlashbackOrPastReference: boolean;
  resolvedPronouns: Record<string, string>; // e.g. "he" -> "Jeremy", "তার" -> "রোজমেরি"
}

export class NarrativeContextEngine {
  private static readonly FLASHBACK_PATTERNS = [
    /\b(earlier|before|remember|flashback|in the past|years ago|memory|originally)\b/i,
    /(আগে|অতীতে|স্মৃতি|ফ্ল্যাশব্যাক|বছর আগে|মনে পড়ে|আসল ঘটনা)/,
  ];

  private static readonly PRONOUN_PATTERNS = [
    /\b(he|him|his|she|her|hers|they|them|their)\b/i,
    /(তার|তাঁকে|তিনি|সে|তাদের|উনার)/,
  ];

  /**
   * Build narrative context window for the current segment
   */
  public buildContextWindow(
    segments: ExplanationScriptSegment[],
    currentIndex: number,
    lastSelectedScene?: EpisodeScene,
    recentCharacterRoster: string[] = []
  ): NarrativeContextWindow {
    const current = segments[currentIndex];
    const prev = currentIndex > 0 ? segments[currentIndex - 1] : undefined;
    const next = currentIndex < segments.length - 1 ? segments[currentIndex + 1] : undefined;

    // Detect flashback or past reference
    const fullWindowText = `${prev?.text || ''} ${current.text} ${next?.text || ''}`;
    const isFlashback = NarrativeContextEngine.FLASHBACK_PATTERNS.some((p) => p.test(fullWindowText));

    // Active characters from current or recent segments
    const activeCharacters = new Set<string>();
    if (current.referencedCharacters) {
      current.referencedCharacters.forEach((c) => activeCharacters.add(c));
    }
    if (activeCharacters.size === 0 && prev?.referencedCharacters) {
      prev.referencedCharacters.forEach((c) => activeCharacters.add(c));
    }
    if (activeCharacters.size === 0 && recentCharacterRoster.length > 0) {
      recentCharacterRoster.slice(-2).forEach((c) => activeCharacters.add(c));
    }

    // Resolve pronouns to the most recently established active character
    const resolvedPronouns: Record<string, string> = {};
    const primaryChar = Array.from(activeCharacters)[0];

    if (primaryChar && NarrativeContextEngine.PRONOUN_PATTERNS.some((p) => p.test(current.text))) {
      resolvedPronouns['he'] = primaryChar;
      resolvedPronouns['she'] = primaryChar;
      resolvedPronouns['সে'] = primaryChar;
      resolvedPronouns['তার'] = primaryChar;
      resolvedPronouns['তিনি'] = primaryChar;
    }

    return {
      previousSegment: prev,
      currentSegment: current,
      nextSegment: next,
      lastSelectedScene,
      activeCharacters: Array.from(activeCharacters),
      activeLocation: lastSelectedScene?.location,
      isFlashbackOrPastReference: isFlashback,
      resolvedPronouns,
    };
  }

  /**
   * Checks if consecutive shots should preserve visual continuity
   * or allow a natural scene cut.
   */
  public evaluateShotContinuity(
    context: NarrativeContextWindow,
    candidateScene: EpisodeScene
  ): { scoreBonus: number; reason?: string } {
    if (!context.lastSelectedScene) {
      return { scoreBonus: 5, reason: 'Initial scene establishment' };
    }

    const prev = context.lastSelectedScene;

    // If narration describes the exact same ongoing event with resolved pronouns
    if (context.activeCharacters.length > 0 && prev.characters) {
      const sharesCharacter = context.activeCharacters.some((c) =>
        prev.characters?.some((sc) => sc.toLowerCase().includes(c.toLowerCase()))
      );
      if (sharesCharacter && prev.location === candidateScene.location) {
        return {
          scoreBonus: 10,
          reason: `Narrative continuity: Continues ${context.activeCharacters[0]} in ${candidateScene.location}`,
        };
      }
    }

    // If flashback is detected, do not penalize out-of-order chronology
    if (context.isFlashbackOrPastReference) {
      return {
        scoreBonus: 8,
        reason: 'Flashback / narrative recall mode: Non-linear scene ordering preserved',
      };
    }

    return { scoreBonus: 0 };
  }
}

export const narrativeContextEngine = new NarrativeContextEngine();

