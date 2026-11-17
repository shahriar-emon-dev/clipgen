// ============================================================
// Original Transcript Alignment Service
// Connects voiceover explanation beats to original movie transcript
// segments and anchors candidate scenes with ground-truth dialogue timing.
// ============================================================

import type {
  TranscriptSegment,
  EpisodeScene,
  EpisodeIntelligenceIndex,
  ExplanationScriptSegment,
} from '../../../../shared/types.js';

export interface TranscriptAlignmentAnchor {
  voiceoverSegmentId: string;
  originalTranscriptSegmentId: string;
  movieSceneId: string;
  movieTimestampStart: number;
  movieTimestampEnd: number;
  dialogueSnippet: string;
  matchedConcepts: string[];
  confidence: number; // 0.0 to 1.0
  reason: string;
}

export interface AlignmentIndexEntry {
  segment: TranscriptSegment;
  sceneId: string;
  sceneIndex: number;
  cleanTokens: Set<string>;
  characters: string[];
}

export class OriginalTranscriptAlignmentService {
  // Cross-lingual concept bridge for Bengali narration to English movie transcript terms
  private static readonly BENGALI_TO_ENGLISH_CONCEPTS: Record<string, string[]> = {
    'খুন': ['murder', 'kill', 'killed', 'killer', 'victim', 'dead', 'death'],
    'লাশ': ['body', 'corpse', 'victim'],
    'স্বামী': ['husband'],
    'স্ত্রী': ['wife', 'mrs'],
    'মা': ['mother', 'mom'],
    'বাবা': ['father', 'dad'],
    'মেয়ে': ['daughter', 'girl'],
    'ছেলে': ['son', 'boy'],
    'ভাই': ['brother'],
    'বোন': ['sister'],
    'ফটোগ্রাফি': ['photography', 'photographer', 'photo', 'camera', 'studio'],
    'ফটোগ্রাফার': ['photographer', 'photography', 'photo'],
    'টাকা': ['money', 'million', 'will', 'dollar', 'financed', 'cash'],
    'সম্পত্তি': ['estate', 'money', 'will', 'property', 'wealth', 'wealthy'],
    'ধনী': ['wealthy', 'rich', 'million'],
    'বিধবা': ['widow', 'widows'],
    'গ্লাস': ['glass', 'broken'],
    'ভাঙা': ['broken', 'break'],
    'রক্ত': ['blood', 'bloody'],
    'গাড়ি': ['car', 'vehicle', 'plate', 'driver'],
    'পুলিশ': ['police', 'cbi', 'officer', 'detective', 'agent', 'investigation'],
    'তদন্ত': ['investigation', 'case', 'alibi', 'suspect', 'evidence'],
    'সন্দেহ': ['suspect', 'suspicious', 'doubt'],
    'অলৌকিক': ['psychic', 'spirits', 'channel', 'dead'],
    'আত্মা': ['soul', 'spirit', 'ghost', 'psychic'],
    'যোগাযোগ': ['contact', 'channel', 'psychic'],
    'মিথ্যা': ['lie', 'liar', 'con', 'fake', 'scam', 'fraud'],
    'প্রতারক': ['con artist', 'parasite', 'fake', 'fraud'],
    'জেল': ['jail', 'prison', 'arrest'],
    'গ্রেপ্তার': ['arrest', 'caught'],
    'অস্ত্র': ['weapon', 'gun', 'knife'],
    'বিষ': ['poison'],
    'প্রেমিক': ['lover', 'boyfriend'],
    'ভালোবাসা': ['love', 'relationship'],
    'অফিস': ['office', 'boardroom', 'desk'],
    'হাসপাতাল': ['hospital', 'doctor'],
  };

  private static readonly CHARACTER_NAME_MAP: Record<string, string> = {
    'প্যাট্রিক': 'Patrick',
    'জেন': 'Jane',
    'লিসবন': 'Lisbon',
    'টেরিজা': 'Teresa',
    'রোজমেরি': 'Rosemary',
    'জেরেমি': 'Jeremy',
    'ট্রাভিস': 'Travis',
    'ক্লেয়ার': 'Claire',
    'ক্রিস্টিনা': 'Kristina',
    'চো': 'Cho',
    'রিগসবাই': 'Rigsby',
    'ভ্যান পেল্ট': 'Van Pelt',
  };

  /**
   * Pre-indexes original movie transcript segments and associates each with its containing scene.
   */
  public buildTranscriptSceneIndex(
    transcriptSegments: TranscriptSegment[],
    scenes: EpisodeScene[]
  ): AlignmentIndexEntry[] {
    if (!transcriptSegments || transcriptSegments.length === 0 || !scenes || scenes.length === 0) {
      return [];
    }

    const indexed: AlignmentIndexEntry[] = [];

    for (const seg of transcriptSegments) {
      // Find scene containing seg.startTime
      const midPoint = (seg.startTime + seg.endTime) / 2;
      let matchedScene = scenes.find((s) => midPoint >= s.startTime && midPoint <= s.endTime);
      if (!matchedScene) {
        matchedScene = scenes.find((s) => seg.startTime >= s.startTime && seg.startTime <= s.endTime);
      }
      if (!matchedScene) {
        // Fallback to nearest scene by start time
        let closest = scenes[0];
        let minDiff = Math.abs(scenes[0].startTime - seg.startTime);
        for (const s of scenes) {
          const diff = Math.abs(s.startTime - seg.startTime);
          if (diff < minDiff) {
            minDiff = diff;
            closest = s;
          }
        }
        matchedScene = closest;
      }

      const cleanTokens = new Set(
        seg.text
          .toLowerCase()
          .replace(/[^a-z0-9\s]/g, ' ')
          .split(/\s+/)
          .filter((t) => t.length >= 3)
      );

      // Detect character mentions in segment text
      const characters: string[] = [];
      const segLower = seg.text.toLowerCase();
      ['patrick', 'jane', 'lisbon', 'teresa', 'rosemary', 'jeremy', 'travis', 'claire', 'kristina', 'cho', 'rigsby'].forEach((name) => {
        if (segLower.includes(name)) characters.push(name);
      });

      indexed.push({
        segment: seg,
        sceneId: matchedScene.sceneId,
        sceneIndex: matchedScene.sceneIndex ?? 0,
        cleanTokens,
        characters,
      });
    }

    return indexed;
  }

  /**
   * Finds the best matching original movie transcript anchor for a given voiceover narration segment.
   */
  public findAnchorForSegment(
    voSeg: ExplanationScriptSegment,
    transcriptIndex: AlignmentIndexEntry[],
    totalVoDuration: number,
    movieDuration: number
  ): TranscriptAlignmentAnchor | null {
    if (!transcriptIndex || transcriptIndex.length === 0) return null;

    const voText = voSeg.text;
    const voLower = voText.toLowerCase();

    // 1. Extract character cues (English or Bengali)
    const targetCharacters: string[] = [];
    if (voSeg.referencedCharacters && voSeg.referencedCharacters.length > 0) {
      targetCharacters.push(...voSeg.referencedCharacters.map((c) => c.toLowerCase()));
    }
    for (const [bnName, enName] of Object.entries(OriginalTranscriptAlignmentService.CHARACTER_NAME_MAP)) {
      if (voText.includes(bnName) && !targetCharacters.includes(enName.toLowerCase())) {
        targetCharacters.push(enName.toLowerCase());
      }
    }

    // 2. Extract salient concepts (cross-lingual & direct)
    const searchConcepts = new Set<string>();
    for (const [bnWord, enTerms] of Object.entries(OriginalTranscriptAlignmentService.BENGALI_TO_ENGLISH_CONCEPTS)) {
      if (voText.includes(bnWord)) {
        enTerms.forEach((t) => searchConcepts.add(t.toLowerCase()));
      }
    }

    // Direct English words if voiceover has English tokens
    voLower
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 4)
      .forEach((w) => searchConcepts.add(w));

    // Target chronological position in movie
    const voProgress = totalVoDuration > 0 ? voSeg.voiceoverStart / totalVoDuration : 0;
    const targetMovieTime = voProgress * movieDuration;

    let bestEntry: AlignmentIndexEntry | null = null;
    let highestScore = 0;
    let bestMatchedConcepts: string[] = [];

    for (const entry of transcriptIndex) {
      let score = 0;
      const matchedHere: string[] = [];

      // A. Character overlap (Up to 40 pts)
      for (const char of targetCharacters) {
        if (entry.characters.some((c) => c.includes(char) || char.includes(c)) || entry.segment.text.toLowerCase().includes(char)) {
          score += 25;
          matchedHere.push(`Character: ${char}`);
          break;
        }
      }

      // B. Concept keyword overlap (Up to 45 pts)
      let conceptHits = 0;
      for (const concept of searchConcepts) {
        if (entry.cleanTokens.has(concept) || entry.segment.text.toLowerCase().includes(concept)) {
          conceptHits++;
          matchedHere.push(concept);
        }
      }
      if (conceptHits > 0) {
        score += Math.min(45, conceptHits * 15);
      }

      // C. Chronological distance penalty / bonus (Up to 15 pts)
      const timeDiff = Math.abs(entry.segment.startTime - targetMovieTime);
      const timeWindow = Math.max(120, movieDuration * 0.25);
      if (timeDiff <= timeWindow) {
        const proximityRatio = 1 - timeDiff / timeWindow;
        score += Math.round(proximityRatio * 15);
      } else {
        // Mild penalty for huge chronological divergence
        score -= Math.min(20, Math.round(((timeDiff - timeWindow) / movieDuration) * 30));
      }

      if (score > highestScore) {
        highestScore = score;
        bestEntry = entry;
        bestMatchedConcepts = matchedHere;
      }
    }

    if (!bestEntry || highestScore < 30) {
      return null;
    }

    const confidence = Math.min(0.98, Number((highestScore / 85).toFixed(2)));

    return {
      voiceoverSegmentId: voSeg.segmentId,
      originalTranscriptSegmentId: bestEntry.segment.id,
      movieSceneId: bestEntry.sceneId,
      movieTimestampStart: bestEntry.segment.startTime,
      movieTimestampEnd: bestEntry.segment.endTime,
      dialogueSnippet: bestEntry.segment.text.slice(0, 120),
      matchedConcepts: bestMatchedConcepts,
      confidence,
      reason: `Original movie dialogue match at ${Math.round(bestEntry.segment.startTime)}s: "${bestEntry.segment.text.slice(0, 70)}..." (${bestMatchedConcepts.slice(0, 3).join(', ')})`,
    };
  }
}

export const originalTranscriptAlignmentService = new OriginalTranscriptAlignmentService();

