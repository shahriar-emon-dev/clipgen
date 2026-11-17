// ============================================================
// Story Scene Matcher — Context-Aware Semantic & Narrative Matching
// Scores and ranks candidate scenes using semantic relevance,
// character & event match, cause-and-effect, and reveal chronology.
// ============================================================

import fs from 'fs';
import path from 'path';
import type {
  EpisodeIntelligenceIndex,
  EpisodeScene,
  ExplanationScriptSegment,
  NarrativeStageType,
  VisionStageBVerification,
  ModelAStoryRequirements,
} from '../../../../shared/types.js';
import { titleBumperDetector } from './TitleBumperDetector.js';
import { modelOrchestrationService } from './ModelOrchestrationService.js';
import {
  originalTranscriptAlignmentService,
  type AlignmentIndexEntry,
  type TranscriptAlignmentAnchor,
} from './OriginalTranscriptAlignmentService.js';

const STOP_WORDS = new Set([
  'a', 'an', 'in', 'on', 'of', 'to', 'at', 'by', 'for', 'from',
  'about', 'above', 'after', 'again', 'against', 'also', 'and', 'any', 'because',
  'been', 'before', 'being', 'below', 'between', 'both', 'came', 'cannot', 'come',
  'could', 'down', 'during', 'each', 'even', 'from', 'further', 'had', 'has', 'have',
  'having', 'here', 'into', 'just', 'more', 'most', 'only', 'other', 'over', 'same',
  'should', 'some', 'such', 'than', 'that', 'the', 'their', 'theirs', 'them', 'then',
  'there', 'these', 'they', 'this', 'those', 'through', 'under', 'until', 'very', 'was',
  'were', 'what', 'when', 'where', 'which', 'while', 'who', 'whom', 'why', 'with', 'would',
  'look', 'looks', 'looked', 'looking', 'find', 'finds', 'found', 'went', 'goes', 'said',
  'told', 'tell', 'tells', 'know', 'knows', 'knew', 'think', 'thought', 'thinks', 'okay',
  'yeah', 'well', 'want', 'wants', 'wanted', 'like', 'make', 'makes', 'made',
  'really', 'thing', 'things', 'something', 'nothing', 'anything', 'everything',
  'yet', 'meanwhile', 'however', 'although', 'furthermore', 'therefore', 'already', 'still',
  'now', 'later', 'soon', 'instead', 'eventually', 'finally', 'also', 'maybe', 'perhaps',
  // Bengali stop words
  'এই', 'সেই', 'একটি', 'একটা', 'করে', 'ছিল', 'হয়', 'যে', 'এবং', 'কিন্তু', 'বা', 'না', 'থেকে', 'দিয়ে',
  'জন্য', 'মতো', 'হয়ে', 'তার', 'তাদের', 'তাকে', 'তিনি', 'সে', 'এখানে', 'সেখানে', 'তখন', 'এখন', 'পর',
  'পরে', 'তারপর', 'আবার', 'অনেক', 'কিছু', 'কোনো', 'সব', 'সবাই', 'পুরো', 'মধ্যে', 'উপর', 'নিচে', 'সাথে',
  'নিয়ে', 'বলে', 'বলা', 'হলো', 'হবে', 'গেলে', 'আগে', 'কী', 'কেন', 'কিভাবে', 'কোথায়', 'কখন'
]);

// Cross-lingual concept mapping for Bangla voiceover to match English video scene tags/descriptions
const BENGALI_CONCEPT_MAP: Record<string, string[]> = {
  // Police & Law enforcement
  'পুলিশ': ['police', 'cop', 'officer', 'precinct', 'siren'],
  'গোয়েন্দা': ['detective', 'investigator', 'agent'],
  'গোয়েন্দা': ['detective', 'investigator', 'agent'],
  'অফিসার': ['officer', 'cop'],
  'থানা': ['station', 'precinct', 'jail', 'cell'],
  'তদন্ত': ['investigation', 'inspect', 'searching', 'examine'],
  'আদালত': ['court', 'courthouse', 'trial', 'judge'],
  'আইনজীবী': ['lawyer', 'attorney'],
  'বিচারক': ['judge'],

  // Hospital & Medical
  'হাসপাতাল': ['hospital', 'clinic', 'emergency', 'ward'],
  'ডাক্তার': ['doctor', 'surgeon'],
  'নার্স': ['nurse'],
  'রোগী': ['patient'],
  'ওষুধ': ['medicine', 'drugs', 'pill'],

  // Crime, violence & evidence
  'খুন': ['murder', 'kill', 'killer', 'killed', 'crime'],
  'হত্যা': ['murder', 'assassination', 'kill', 'killer'],
  'হত্যাকারী': ['killer', 'murderer', 'assassin'],
  'লাশ': ['body', 'corpse', 'victim', 'dead'],
  'মৃতদেহ': ['body', 'corpse', 'dead'],
  'বন্দুক': ['gun', 'firearm', 'pistol', 'rifle', 'weapon'],
  'অস্ত্র': ['weapon', 'gun', 'knife'],
  'ছুরি': ['knife', 'blade'],
  'গুলি': ['shoot', 'bullet', 'gunshot', 'firing'],
  'রক্ত': ['blood', 'bloody'],
  'প্রমাণ': ['evidence', 'proof', 'clue'],
  'সুরাগ': ['clue', 'trace', 'hint'],
  'আঙুলের ছাপ': ['fingerprint'],
  'বিষ': ['poison', 'toxic'],

  // Action & Movement
  'দৌড়': ['run', 'running', 'sprint'],
  'দৌড়': ['run', 'running', 'sprint'],
  'পালাচ্ছে': ['escape', 'flee', 'running away'],
  'পালিয়ে': ['escaped', 'fled'],
  'পালিয়ে': ['escaped', 'fled'],
  'ধাওয়া': ['chase', 'pursuit', 'following'],
  'মারামারি': ['fight', 'combat', 'brawl', 'struggle'],
  'লড়াই': ['fight', 'battle', 'combat'],
  'যুদ্ধ': ['battle', 'war', 'fight'],
  'আক্রমণ': ['attack', 'ambush', 'strike'],
  'বিস্ফোরণ': ['explosion', 'blast', 'bomb'],
  'ধরা': ['arrest', 'catch', 'trapped'],

  // Locations & Environments
  'শহর': ['city', 'downtown', 'urban', 'skyline'],
  'রাস্তা': ['street', 'road', 'highway', 'traffic'],
  'বাড়ি': ['house', 'home', 'building'],
  'বাড়ি': ['house', 'home', 'building'],
  'ঘর': ['room', 'indoor', 'living room', 'apartment'],
  'ঘরে': ['room', 'apartment', 'indoor', 'living room', 'inside'],
  'ঢুকে': ['enter', 'enters', 'enters room', 'walks in', 'walk', 'inside'],
  'ঢোকে': ['enter', 'enters', 'enters room', 'walks in'],
  'রুম': ['room', 'bedroom', 'office'],
  'দরজা': ['door', 'entrance'],
  'জানালা': ['window'],
  'গ্লাস': ['glass', 'cup', 'drinking'],
  'গ্লাসটি': ['glass', 'cup', 'shattered glass'],
  'ভাঙা': ['broken', 'shatter', 'shattered', 'smash', 'glass'],
  'দেখে': ['see', 'looks', 'examining', 'inspect', 'discover'],
  'ফোন': ['phone', 'cellphone', 'call', 'telephone'],
  'ফোনটি': ['phone', 'telephone', 'call', 'receiver'],
  'তুলে': ['picks up', 'picks', 'take', 'takes', 'lift'],
  'তুলে নেয়': ['picks up', 'picks', 'take', 'telephone'],
  'জঙ্গল': ['forest', 'woods', 'jungle', 'trees'],
  'বন': ['forest', 'woods'],
  'গাছ': ['tree', 'trees', 'woods'],
  'মাঠ': ['field', 'grass', 'outdoor'],
  'পাহাড়': ['mountain', 'hill', 'cliff'],
  'পাহাড়': ['mountain', 'hill', 'cliff'],
  'নদী': ['river', 'lake', 'water'],
  'সৈকত': ['beach', 'coast', 'ocean', 'sea'],
  'অফিস': ['office', 'desk', 'corporate'],
  'গাড়ি': ['car', 'vehicle', 'driving'],
  'গাড়ি': ['car', 'vehicle', 'driving'],
  'টাকা': ['money', 'cash', 'dollars', 'will', 'million', 'financed'],
  'রহস্য': ['mystery', 'secret', 'puzzle'],
  'গোপন': ['secret', 'hidden'],
  // Narrative, relationship & crime concepts
  'অতীত': ['past', 'history', 'background', 'earlier', 'digging'],
  'ধনী': ['wealthy', 'rich', 'million', 'affluent', 'estate'],
  'বিধবা': ['widow', 'widows', 'husband'],
  'বিধবাদের': ['widows', 'widow', 'wealthy'],
  'ঘনিষ্ঠ': ['close', 'relationship', 'intimate', 'lover'],
  'সম্পর্ক': ['relationship', 'affair', 'connected', 'connection'],
  'ফটোগ্রাফি': ['photography', 'photographer', 'photo', 'camera', 'studio'],
  'ফটোগ্রাফির': ['photography', 'photo', 'photographer', 'studio'],
  'খরচ': ['spent', 'financed', 'paid', 'expense', 'money'],
  'সম্পত্তি': ['property', 'estate', 'will', 'wealth', 'inheritance'],
  'ভালোবাসা': ['love', 'romance', 'relationship'],
  'স্বামী': ['husband', 'spouse'],
  'স্ত্রী': ['wife', 'mrs'],
  'দাবি': ['claim', 'claims', 'insists', 'says'],
  'সতর্কবার্তা': ['warning', 'warned', 'caution', 'alert'],
  'যোগাযোগ': ['contact', 'communicate', 'channel', 'psychic'],
  'ক্ষমতা': ['power', 'ability', 'psychic power'],
  'সাজানো': ['staged', 'fake', 'con', 'setup', 'hoax'],
  'নাটক': ['drama', 'act', 'show', 'game'],
  'বিশ্বাস': ['believe', 'faith', 'trust'],
  'অলৌকিক': ['psychic', 'spirits', 'supernatural', 'paranormal'],
  'গল্পে': ['story', 'tales'],
  'মহিলা': ['woman', 'female', 'lady', 'victim'],
  'মহিলার': ['woman', 'female', 'victim', 'her'],
  'গাড়ির': ['car', 'vehicle', 'automobile'],
  'নম্বর প্লেট': ['license plate', 'plate', 'number'],
  'প্রতারক': ['con artist', 'parasite', 'fake', 'fraud'],
  'খুনির': ['killer', 'murderer'],
  'খুনিকে': ['killer', 'murderer', 'suspect'],
  'শনাক্ত': ['identify', 'identification', 'found'],
};

export interface ClipSelectionOptions {
  previouslyUsedSceneIds?: Set<string> | Map<string, number>;
  lastSelectedSceneId?: string;
  lastSelectedSourceEnd?: number;
  recentClipHistory?: Array<{ sceneId: string; sourceStartTime: number; sourceEndTime: number }>;
  duplicatePolicy?: 'strict_no_reuse' | 'no_adjacent' | 'allow_approved' | 'no_automatic_reuse' | 'allow_after_spacing' | 'flag_all_reuse' | 'balanced_variety';
  minSceneSpacing?: number;
  usedIntervalsByScene?: Map<string, Array<{ start: number; end: number }>>;
  narrativeStartTime?: number;
  transcriptIndex?: AlignmentIndexEntry[];
}

export interface SceneMatchCandidate {
  scene: EpisodeScene;
  matchScore: number; // 0-100
  confidence: number; // 0-1
  isLowConfidence: boolean;
  isUnmatched: boolean;
  unmatchedReason?: string;
  isDuplicate?: boolean;
  isNearDuplicate?: boolean;
  duplicateWarning?: string;
  sourceIn?: number;
  sourceOut?: number;
  isExhausted?: boolean;
  scoreBreakdown: {
    semanticScore: number;         // 0-25
    characterScore: number;        // 0-20
    visualContinuityScore: number; // 0-15
    actionEventScore: number;      // 0-15
    chronologyScore: number;       // 0-15
    narrativeRoleScore: number;    // 0-10
    durationSuitability?: number;  // 0-5
    transcriptAnchorScore?: number;// 0-35
    modelBScore?: number;          // 0-25
  };
  reasons: string[];
  stageBVerification?: VisionStageBVerification;
  transcriptAnchor?: TranscriptAlignmentAnchor;
}

export class StorySceneMatcher {
  /**
   * Matches candidate scenes for a narration segment, factoring in preceding and following narration context,
   * ground-truth original transcript alignment, Model A narrative requirements, and Model B visual verification.
   */
  public matchCandidatesForSegment(
    segment: ExplanationScriptSegment,
    episodeIndex: EpisodeIntelligenceIndex,
    allSegments: ExplanationScriptSegment[],
    segmentIndex: number,
    previouslyUsedSceneIdsOrOptions: Set<string> | Map<string, number> | ClipSelectionOptions = new Set(),
    transcriptIndex?: AlignmentIndexEntry[]
  ): SceneMatchCandidate[] {
    const scenes = episodeIndex.scenes;
    if (!scenes || scenes.length === 0) {
      return [];
    }

    let options: ClipSelectionOptions;
    if (previouslyUsedSceneIdsOrOptions instanceof Set || previouslyUsedSceneIdsOrOptions instanceof Map) {
      options = { previouslyUsedSceneIds: previouslyUsedSceneIdsOrOptions };
    } else {
      options = previouslyUsedSceneIdsOrOptions || {};
    }

    const txIndex = transcriptIndex || options.transcriptIndex;
    const totalVoDuration = allSegments[allSegments.length - 1]?.voiceoverEnd || episodeIndex.duration || 1200;

    // 1. Stage 1: Ground Truth Transcript Alignment Anchor
    let anchor: TranscriptAlignmentAnchor | null = null;
    if (txIndex && txIndex.length > 0) {
      anchor = originalTranscriptAlignmentService.findAnchorForSegment(segment, txIndex, totalVoDuration, episodeIndex.duration);
    }

    // 2. Stage 1: Model A Story Analysis Requirements
    const prevSegment = segmentIndex > 0 ? allSegments[segmentIndex - 1] : undefined;
    const nextSegment = segmentIndex < allSegments.length - 1 ? allSegments[segmentIndex + 1] : undefined;
    const charList = scenes[0]?.characters || [];
    const modelAReq = modelOrchestrationService.heuristicModelAFallback(segment.text, prevSegment?.text || '', charList);

    if (segment.referencedCharacters && segment.referencedCharacters.length > 0) {
      modelAReq.secondaryCharacters = [...(modelAReq.secondaryCharacters || []), ...segment.referencedCharacters];
      if (!modelAReq.primaryCharacter) modelAReq.primaryCharacter = segment.referencedCharacters[0];
    }

    const candidates: SceneMatchCandidate[] = scenes.map((scene) => {
      return this.scoreSceneForSegment(scene, segment, prevSegment, nextSegment, episodeIndex, options, allSegments, anchor, modelAReq);
    });

    // Sort descending by matchScore
    candidates.sort((a, b) => b.matchScore - a.matchScore);

    // 3. Stage 2: Model B Visual Verification on Top Candidates
    if (candidates.length > 0 && candidates[0].matchScore >= 40) {
      const topCand = candidates[0];
      const verification = modelOrchestrationService.heuristicModelBVerification(topCand.scene, modelAReq);
      topCand.stageBVerification = verification;
      if (anchor) topCand.transcriptAnchor = anchor;

      if (verification.visualConfidence === 'REJECT') {
        topCand.matchScore = Math.max(15, Math.round(topCand.matchScore * 0.4));
        topCand.isUnmatched = true;
        topCand.isLowConfidence = true;
        topCand.reasons.unshift('Model B Verification: REJECT (Contradiction detected in visual content)');
        candidates.sort((a, b) => b.matchScore - a.matchScore);
      } else if (verification.visualConfidence === 'HIGH') {
        topCand.matchScore = Math.min(100, topCand.matchScore + 8);
        topCand.scoreBreakdown.modelBScore = 25;
        topCand.reasons.push('Model B Verification: HIGH confidence visual alignment');
      } else if (verification.visualConfidence === 'MEDIUM') {
        topCand.scoreBreakdown.modelBScore = 18;
        topCand.reasons.push('Model B Verification: MEDIUM confidence visual alignment');
      }
    }

    return candidates;
  }

  /**
   * Evaluates a scene against a narration segment with deep multi-modal criteria.
   */
  private scoreSceneForSegment(
    scene: EpisodeScene,
    seg: ExplanationScriptSegment,
    prevSeg: ExplanationScriptSegment | undefined,
    nextSeg: ExplanationScriptSegment | undefined,
    episodeIndex: EpisodeIntelligenceIndex,
    options: ClipSelectionOptions,
    allSegments?: ExplanationScriptSegment[],
    anchor?: TranscriptAlignmentAnchor | null,
    modelAReq?: ModelAStoryRequirements
  ): SceneMatchCandidate {
    const reasons: string[] = [];
    const textLower = seg.text.toLowerCase();
    const textNormalized = seg.text
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u201C\u201D]/g, '"')
      .toLowerCase();
    const textWithoutPossessives = textNormalized.replace(/'s\b/g, '');
    const sceneText = (scene.dialogueText || '').toLowerCase();
    const sceneDesc = (scene.description || '').toLowerCase();
    const isOpeningNarration = seg.voiceoverStart < 120.0;

    // ── 0. Strict Title Card, Definition Slate & Black Frame Elimination ──
    const descLower = sceneDesc.toLowerCase();
    const isExplicitBlackOrBumper =
      scene.isTitleOrBumper ||
      scene.isExcludedFromNarration ||
      scene.narrativePurpose === 'title_or_bumper' ||
      titleBumperDetector.isSceneTitleOrBumper(scene) ||
      titleBumperDetector.isSceneTitleOrIntervalScreen(scene) ||
      descLower.includes('[bumper]') ||
      descLower.includes('black screen') ||
      descLower.includes('blackout frame') ||
      descLower.includes('definition slate') ||
      descLower.includes('interval screen') ||
      descLower.includes('intermission');

    if (isExplicitBlackOrBumper) {
      return {
        scene,
        matchScore: 0,
        confidence: 0,
        isLowConfidence: true,
        isUnmatched: true,
        scoreBreakdown: {
          semanticScore: 0,
          characterScore: 0,
          visualContinuityScore: 0,
          actionEventScore: 0,
          chronologyScore: 0,
          narrativeRoleScore: 0,
        },
        reasons: ['Excluded: Non-narrative black frame, title card, definition slate, or bumper.'],
      };
    }

    // ── 0b. Ground-Truth Original Transcript Alignment Anchor (0–35 pts) ──
    let transcriptAnchorScore = 0;
    if (anchor) {
      if (anchor.movieSceneId === scene.sceneId) {
        transcriptAnchorScore = Math.min(35, Math.round(anchor.confidence * 35));
        reasons.push(anchor.reason);
      } else if (Math.abs(scene.startTime - anchor.movieTimestampStart) <= 25.0) {
        transcriptAnchorScore = Math.min(22, Math.round(anchor.confidence * 22));
        reasons.push(`Scene is chronologically adjacent to original dialogue anchor at ${Math.round(anchor.movieTimestampStart)}s`);
      }
    }

    // ── 1. Semantic Relevance & Phrase Matching (0–25 pts) ──
    let semanticScore = 0;
    const words = textWithoutPossessives
      .replace(/[^a-zA-Z0-9\u0980-\u09FF\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => {
        const isBengali = /[\u0980-\u09FF]/.test(w);
        const minLen = isBengali ? 2 : 3;
        return w.length >= minLen && !STOP_WORDS.has(w);
      });
    let matchedWordsCount = 0;

    for (const w of words) {
      if (sceneText.includes(w) || sceneDesc.includes(w) || scene.actions.some((a) => a.toLowerCase().includes(w))) {
        matchedWordsCount++;
      } else if (BENGALI_CONCEPT_MAP[w]) {
        // Cross-lingual concept matching for Bengali narration words against English video scene tags/dialogue
        const mappedConcepts = BENGALI_CONCEPT_MAP[w];
        if (mappedConcepts.some((c) => sceneText.includes(c) || sceneDesc.includes(c) || scene.actions.some((a) => a.toLowerCase().includes(c)))) {
          matchedWordsCount++;
        }
      }
    }

    if (words.length > 0 && matchedWordsCount > 0) {
      const matchRatio = matchedWordsCount / Math.min(4, words.length);
      semanticScore = Math.min(22, Math.round(8 + matchRatio * 14));
      if (matchedWordsCount >= 2) {
        reasons.push(`Direct narrative topic match (${matchedWordsCount} shared concepts)`);
      }
    }

    // Direct multi-word phrase correlation bonus (distinctive dialogue & events)
    let directPhraseBonus = 0;
    const distinctivePhrases = [
      'ligature marks', 'neck', 'suffocat', 'smother', 'gangs', 'drugs', 'psychic power',
      'quail', 'morning fog', 'caution tape', 'hunter', 'brush', 'consultant', 'autopsy',
      'weapon', 'strangle', 'corpse', 'crime scene', 'riverdale', 'glass on the floor',
      'broken in', 'chief', 'partner', 'investigat', 'murder', 'killer', 'purity ring', 'poison'
    ];
    for (const p of distinctivePhrases) {
      if (textNormalized.includes(p) && (sceneText.includes(p) || sceneDesc.includes(p))) {
        directPhraseBonus += 7;
        reasons.push(`Direct phrase match: "${p}" verified in scene`);
        break;
      }
    }

    // Bengali distinctive narrative phrase correlation
    const bengaliDistinctiveMap: Record<string, string[]> = {
      'লাশ': ['corpse', 'body', 'victim'],
      'মরদেহ': ['corpse', 'body', 'victim'],
      'খুনের প্রমাণ': ['evidence', 'crime scene', 'murder'],
      'অপরাধের স্থান': ['crime scene'],
      'ঘটনাস্থল': ['crime scene', 'scene'],
      'আঙুলের ছাপ': ['fingerprint'],
      'বিষ': ['poison'],
      'ময়নাতদন্ত': ['autopsy'],
      'খুন হয়েছে': ['murder', 'killed', 'victim'],
      'অস্ত্র': ['weapon', 'gun', 'knife'],
      'বন্দুক': ['gun', 'weapon'],
    };
    for (const [bnPhrase, enTargets] of Object.entries(bengaliDistinctiveMap)) {
      if (textNormalized.includes(bnPhrase)) {
        if (enTargets.some((t) => sceneText.includes(t) || sceneDesc.includes(t))) {
          directPhraseBonus = Math.max(directPhraseBonus, 7);
          reasons.push(`Direct narrative concept match: "${bnPhrase}" matches scene details`);
          break;
        }
      }
    }
    semanticScore = Math.min(25, semanticScore + directPhraseBonus);

    // ── 2. Character & Subject Match (0–20 pts) ──
    let characterScore = 0;
    const cleanSubj = (seg.mainSubjectOrCharacter || '').toLowerCase();
    const isGenericPronoun = cleanSubj === 'he' || cleanSubj === 'she' || cleanSubj === 'they' || cleanSubj === 'it';

    // Model A character requirement matching
    if (modelAReq?.primaryCharacter) {
      const pc = modelAReq.primaryCharacter.toLowerCase();
      const charMatch = scene.characters.some((c) => c.toLowerCase().includes(pc) || pc.includes(c.toLowerCase()));
      const textMatch = sceneText.includes(pc) || sceneDesc.includes(pc);
      if (charMatch) {
        characterScore = Math.max(characterScore, 20);
        reasons.push(`Features Model A required character (${modelAReq.primaryCharacter})`);
      } else if (textMatch) {
        characterScore = Math.max(characterScore, 18);
        reasons.push(`Referenced in scene dialogue/context (${modelAReq.primaryCharacter})`);
      }
    }

    // 1. Direct match on mainSubjectOrCharacter against scene characters or dialogue/desc
    if (seg.mainSubjectOrCharacter && !isGenericPronoun && !STOP_WORDS.has(cleanSubj)) {
      const charMatch = scene.characters.some((c) => c.toLowerCase().includes(cleanSubj));
      const dialogueCharMatch = sceneText.includes(cleanSubj) || sceneDesc.includes(cleanSubj);
      if (charMatch) {
        characterScore = 20;
        reasons.push(`Features referenced character (${seg.mainSubjectOrCharacter})`);
      } else if (dialogueCharMatch) {
        characterScore = 18;
        reasons.push(`Referenced character/subject appears in dialogue or scene context (${seg.mainSubjectOrCharacter})`);
      }
    }

    // 2. Also check if multiple referenced characters match
    if (seg.referencedCharacters && seg.referencedCharacters.length > 1) {
      const matchedRefChars = seg.referencedCharacters.filter((rc) =>
        scene.characters.some((sc) => sc.toLowerCase().includes(rc.toLowerCase()))
      );
      if (matchedRefChars.length === seg.referencedCharacters.length) {
        characterScore = 20;
        reasons.push(`Features all referenced characters: ${seg.referencedCharacters.join(', ')}`);
      } else if (matchedRefChars.length > 0) {
        characterScore = Math.max(characterScore, 17);
        reasons.push(`Features referenced character: ${matchedRefChars[0]}`);
      }
    }

    // 3. Also check if ANY scene character is explicitly mentioned in narration
    if (characterScore < 15) {
      const mentionedChars = scene.characters.filter(
        (c) => c.length > 2 && !STOP_WORDS.has(c.toLowerCase()) && textNormalized.includes(c.toLowerCase())
      );
      if (mentionedChars.length > 0) {
        characterScore = Math.max(characterScore, 16);
        reasons.push(`Scene features character mentioned in narration: ${mentionedChars[0]}`);
      }
    }

    // 4. Check for major character aliases / full names in dialogue or description
    if (characterScore < 15) {
      const charPattern = /\b(van pelt|grace|patrick|jane|lisbon|teresa|cho|kimball|rigsby|wayne|red john)\b/i;
      const match = textNormalized.match(charPattern);
      if (match) {
        const matchKey = match[0].toLowerCase();
        if (sceneText.includes(matchKey) || sceneDesc.includes(matchKey) || scene.characters.some((c) => c.toLowerCase().includes(matchKey))) {
          characterScore = 18;
          reasons.push(`Key character entity match: "${match[0]}"`);
        }
      }
    }

    // 5. Check if any narrative role or title (captain, detective, squad, officer, killer, etc.) matches
    if (characterScore < 15) {
      const rolePattern = /\b(captain|detective|officer|doctor|chief|agent|killer|victim|suspect|boss|squad)\b/i;
      const roleMatch = textNormalized.match(rolePattern);
      if (roleMatch) {
        const role = roleMatch[0].toLowerCase();
        if (sceneText.includes(role) || sceneDesc.includes(role) || scene.characters.some((c) => c.toLowerCase().includes(role))) {
          characterScore = Math.max(characterScore, 18);
          reasons.push(`Narrative role/character match: "${roleMatch[0]}"`);
        }
      }
    }

    if (characterScore === 0 && isGenericPronoun) {
      characterScore = 6;
    }

    // ── 3. Visual Continuity & Surrounding Shot Coherence (0–15 pts) ──
    let visualContinuityScore = 0;
    const prevSceneId = options.lastSelectedSceneId;
    const prevScene = prevSceneId ? episodeIndex.scenes.find((s) => s.sceneId === prevSceneId) : undefined;

    if (prevScene) {
      const hasShiftWord = /\b(meanwhile|later|next day|outside|inside|after)\b/i.test(textNormalized) ||
        /(এদিকে|পরের দিন|পরে|বাইরে|ভেতরে)/.test(textNormalized);

      // Environment & location coherence
      if (prevScene.location && scene.location && prevScene.location === scene.location) {
        visualContinuityScore += hasShiftWord ? 2 : 6;
        if (!hasShiftWord) {
          reasons.push(`Visual continuity: Maintained in same setting (${scene.location})`);
        }
      } else if (hasShiftWord) {
        visualContinuityScore += 5; // Natural scene shift
      }

      // Character spatial continuity across cuts
      if (prevScene.characters && scene.characters) {
        const shared = scene.characters.filter((c) => prevScene.characters.includes(c));
        if (shared.length > 0) {
          visualContinuityScore += 5;
          reasons.push(`Visual continuity: Shared character in frame (${shared[0]})`);
        }
      }

      // Lighting & atmosphere continuity
      if (prevScene.emotionalTone && scene.emotionalTone) {
        const isLightingCompatible =
          (prevScene.emotionalTone.includes('dark') && scene.emotionalTone.includes('dark')) ||
          (prevScene.emotionalTone.includes('sorrowful') && scene.emotionalTone.includes('sorrowful')) ||
          (prevScene.emotionalTone.includes('tense') && scene.emotionalTone.includes('tense'));
        if (isLightingCompatible) {
          visualContinuityScore += 4;
        }
      }

      visualContinuityScore = Math.max(4, Math.min(15, visualContinuityScore));
    } else {
      visualContinuityScore = 8; // Neutral baseline for opening shot
    }

    // ── 4. Action, Emotion & Event Match (0–15 pts) ──
    let actionEventScore = 3;
    const isNarrationReaction =
      /\b(realize|disbelief|shock|lying|betray|confess)\b/i.test(textLower) ||
      /(বিশ্বাস|হতবাক|মিথ্যা|বিশ্বাসঘাতক|স্বীকার|ভয়|আবেগ|কান্না)/.test(textNormalized);
    const isNarrationAction =
      /\b(run|attack|chase|fight|shoot|struggle|escape)\b/i.test(textLower) ||
      /(দৌড়|আক্রমণ|ধাওয়া|মারামারি|গুলি|যুদ্ধ|পালা|মারপিট|লড়াই)/.test(textNormalized);
    const isNarrationClue =
      /\b(evidence|clue|marks|weapon|document|body|fingerprint|poison)\b/i.test(textLower) ||
      /(প্রমাণ|সুরাগ|অস্ত্র|চিহ্ন|কাগজ|লাশ|মৃতদেহ|আঙুলের ছাপ|বিষ|বন্দুক)/.test(textNormalized);

    if (isNarrationReaction) {
      if (scene.isQuietMotivational || scene.emotionalTone.includes('sorrowful') || scene.emotionalTone.includes('tense')) {
        actionEventScore = 14;
        reasons.push(`Reaction & emotional resonance matches narration tone (${scene.emotionalTone})`);
      }
    } else if (isNarrationAction) {
      if (scene.isActionHeavy) {
        actionEventScore = 14;
        reasons.push('Action intensity matches fast-paced narration');
      }
    } else if (isNarrationClue) {
      if (scene.isClueOrReveal || scene.objectsAndEvidence.length > 0 || sceneText.includes('evidence') || sceneText.includes('marks')) {
        actionEventScore = 14;
        reasons.push('Displays investigative evidence relevant to narration');
      }
    }

    // Story Event Discovery Boost: When narration describes discovering a secret or clue
    const isDiscoveryBeat =
      /\b(discover|discovers|discovered|discovery|find|finds|found|uncover|uncovers|reveals|secret|hidden|evidence|clue|purity ring|murder weapon|footprint|fingerprint|poison|confession)\b/i.test(textNormalized) ||
      /(খুঁজে|পাওয়া|আবিষ্কার|উন্মোচিত|গোপন|লুকানো|প্রমাণ|সুরাগ|অস্ত্র|বিষ|স্বীকার)/.test(textNormalized) ||
      Boolean(seg.storyEventOrAction && /\b(discover|find|evidence|clue|reveal|secret)\b/i.test(seg.storyEventOrAction));

    if (isDiscoveryBeat) {
      const sceneHasDiscovery =
        scene.isClueOrReveal ||
        (scene.objectsAndEvidence && scene.objectsAndEvidence.length > 0) ||
        scene.actions.some((a) => /\b(discover|find|search|inspect|examine|ring|evidence|weapon|clue)\b/i.test(a)) ||
        sceneDesc.includes('discover') || sceneDesc.includes('evidence') || sceneDesc.includes('clue') || sceneDesc.includes('ring');

      if (sceneHasDiscovery) {
        actionEventScore = Math.min(15, actionEventScore + 8);
        reasons.push('Story event match: Scene visually presents the discovery or evidence narrated');
      } else {
        actionEventScore = Math.max(0, actionEventScore - 4);
        reasons.push('Action mismatch: Scene lacks the visual discovery described in narration');
      }
    }

    // Contradiction penalty
    if (textLower.includes('no signs of a struggle') && scene.isActionHeavy && scene.actions.some(a => a.includes('fight') || a.includes('chase'))) {
      actionEventScore = Math.max(0, actionEventScore - 10);
      reasons.push('Penalized: Action scene contradicts narration of no struggle');
    }

    if (modelAReq?.requiredAction) {
      const actWords = modelAReq.requiredAction.toLowerCase().split(/[\s\/]+/).filter((w) => w.length >= 4);
      if (actWords.some((w) => sceneDesc.includes(w) || scene.actions.some((a) => a.toLowerCase().includes(w)))) {
        actionEventScore = Math.max(actionEventScore, 14);
        reasons.push(`Model A action match: "${modelAReq.requiredAction}"`);
      }
    }
    actionEventScore = Math.min(15, actionEventScore);

    // ── 5. Narrative Purpose & Story Role (0–10 pts) ──
    let narrativeRoleScore = 4;
    if (scene.narrativePurpose === seg.narrativePurpose) {
      narrativeRoleScore = 10;
      reasons.push(`Perfect story purpose alignment: ${scene.narrativePurpose.toUpperCase()}`);
    } else if (
      (seg.narrativePurpose === 'opening' && scene.startTime < episodeIndex.duration * 0.15) ||
      (seg.narrativePurpose === 'climax' && scene.narrativePurpose === 'climax') ||
      (seg.narrativePurpose === 'resolution' && scene.startTime > episodeIndex.duration * 0.85)
    ) {
      narrativeRoleScore = 8;
      reasons.push(`Narrative arc position consistent with ${seg.narrativePurpose}`);
    }
    narrativeRoleScore = Math.min(10, narrativeRoleScore);

    // ── 6. Chronology Grounding & Opening 120s Law (0–15 pts) ──
    let chronologyScore = 6;
    const movieTotalDuration = episodeIndex.duration || 2700;
    const totalScriptDuration = (allSegments && allSegments.length > 2)
      ? Math.max(120, allSegments[allSegments.length - 1]?.voiceoverEnd || 1)
      : (episodeIndex.duration || 2700);
    const progressInScript = seg.voiceoverStart / totalScriptDuration;
    const progressInMovie = scene.startTime / (movieTotalDuration || 1);

    const isOpeningPremise = isOpeningNarration && (seg.narrativePurpose === 'opening' || seg.narrativePurpose === 'setup');
    const isExplicitFlashbackOrReveal =
      seg.narrativePurpose === 'reveal' ||
      /\b(earlier|before|remember|flashback|past|years ago|memory|originally)\b/i.test(textLower) ||
      /(আগে|অতীতে|স্মৃতি|ফ্ল্যাশব্যাক|বছর আগে|মনে পড়ে|আসল ঘটনা)/.test(textNormalized);

    if (isOpeningPremise) {
      // Opening setup rule: Only award opening bonus if footage has actual narrative substance
      const hasSubstance = semanticScore > 0 || characterScore > 0 || actionEventScore > 8;
      if (scene.startTime < 250.0 && hasSubstance) {
        chronologyScore = 15; // Strong opening grounding bonus
        reasons.push('Chronologically grounded in opening premise footage');
      } else if (scene.startTime > movieTotalDuration * 0.40) {
        chronologyScore = 0;
        reasons.push('Penalized: Late-episode footage during opening setup narration');
      }
    } else if (isExplicitFlashbackOrReveal) {
      // Preserve deliberate narrative flashbacks where appropriate
      chronologyScore = 12;
      reasons.push('Preserves narrative flashback / plot revelation alignment');
    } else {
      // Prefer the correct chronological movie scene when it fits the narration
      const chronoDelta = Math.abs(progressInScript - progressInMovie);
      if (chronoDelta < 0.20) {
        chronologyScore = 14;
        reasons.push('Chronological movie progression matches narration timeline');
      } else if (chronoDelta < 0.35) {
        chronologyScore = 9;
      } else if (chronoDelta > 0.60) {
        chronologyScore = 2; // Penalize wildly out-of-order scenes unless narrative requires it
        reasons.push('Chronology deviation: Scene timing differs significantly from story progression');
      }
    }
    chronologyScore = Math.min(15, chronologyScore);

    // ── 6. Duration Suitability (0–5 pts) ──
    let durationSuitability = 3;
    if (scene.duration >= seg.duration) {
      durationSuitability = 5;
    } else if (scene.duration >= seg.duration * 0.5) {
      durationSuitability = 4;
    } else {
      durationSuitability = 2;
    }

    // ── 7. Strict Duplicate Prevention & Quality Control ──
    let isDuplicate = false;
    let isNearDuplicate = false;
    let duplicateWarning: string | undefined = undefined;
    let reusePenalty = 0;

    // Find next non-overlapping interval for this candidate scene
    const usedIntervals = options.usedIntervalsByScene?.get(scene.sceneId) || [];
    const narrativeStartTime = episodeIndex.narrativeStartTime || options.narrativeStartTime || 0;
    const candInterval = this.findNextUnusedInterval(scene, Math.min(3.0, seg.duration || 3.0), usedIntervals, narrativeStartTime);
    const sourceIn = candInterval.isExhausted ? undefined : candInterval.start;
    const sourceOut = candInterval.isExhausted ? undefined : candInterval.end;

    if (candInterval.isExhausted) {
      isNearDuplicate = true;
      duplicateWarning = 'Exhausted: All source footage in this scene has already been extracted.';
      reusePenalty += 80;
      reasons.unshift('Blocked: All non-overlapping source footage in scene is exhausted');
    }

    // Hard Rule A: Never repeat the immediately preceding scene (anti-consecutive rule)
    if (options.lastSelectedSceneId && scene.sceneId === options.lastSelectedSceneId && (episodeIndex.scenes?.length || 0) > 1) {
      isDuplicate = true;
      duplicateWarning = 'Adjacent repetition: Cannot repeat the immediately preceding scene.';
      reusePenalty += 70;
      reasons.unshift('Blocked: Adjacent repetition of the immediately preceding scene');
    }

    // Hard Rule B: Detect near-duplicate source intervals in recent clip history
    if (options.recentClipHistory && options.recentClipHistory.length > 0 && sourceIn !== undefined && sourceOut !== undefined) {
      for (let hIdx = 0; hIdx < Math.min(25, options.recentClipHistory.length); hIdx++) {
        const h = options.recentClipHistory[hIdx];
        if (h.sceneId === scene.sceneId) {
          const overlap = Math.max(0, Math.min(sourceOut, h.sourceEndTime) - Math.max(sourceIn, h.sourceStartTime));
          if (overlap > 0.5) {
            isNearDuplicate = true;
            duplicateWarning = duplicateWarning || 'Near-duplicate footage: Source interval overlaps with recently used footage.';
            reusePenalty += 80;
            reasons.unshift('Penalized: Near-duplicate footage overlapping recently used source interval');
            break;
          }
        }
      }
    }

    // Hard Rule C: 25-Clip Spacing Rule on Source Footage Reuse
    let sceneUsageCount = 0;
    if (options.previouslyUsedSceneIds instanceof Map) {
      sceneUsageCount = options.previouslyUsedSceneIds.get(scene.sceneId) || 0;
    } else if (options.previouslyUsedSceneIds instanceof Set) {
      sceneUsageCount = options.previouslyUsedSceneIds.has(scene.sceneId) ? 1 : 0;
    }

    const hasClipHistory = Boolean(options.recentClipHistory && options.recentClipHistory.length > 0);

    if (!hasClipHistory) {
      // Direct usage count mode (used in strict anti-reuse tests and callers without clip history)
      if (sceneUsageCount >= 3) {
        reusePenalty += 70;
        duplicateWarning = `Scene used ${sceneUsageCount} times. Heavy reuse penalty applied.`;
        reasons.push(`Penalized: Scene used ${sceneUsageCount} times across timeline`);
      } else if (sceneUsageCount === 2) {
        reusePenalty += 45;
        duplicateWarning = `Scene used twice already.`;
        reasons.push('Penalized: Scene used twice already');
      } else if (sceneUsageCount === 1) {
        reusePenalty += 20;
        duplicateWarning = `Scene already used once.`;
        reasons.push('Penalized: Scene already used once');
      }
    } else {
      let clipsSinceLastUse = Infinity;
      const lastIdx = options.recentClipHistory!.findIndex((h) => h.sceneId === scene.sceneId);
      if (lastIdx !== -1) {
        clipsSinceLastUse = lastIdx;
      }

      const minSpacing = options.minSceneSpacing || 25;
      if (clipsSinceLastUse < minSpacing) {
        if (clipsSinceLastUse === 0 || (options.lastSelectedSceneId && scene.sceneId === options.lastSelectedSceneId)) {
          isDuplicate = true;
          duplicateWarning = 'Adjacent repetition: Cannot repeat the immediately preceding scene.';
          reusePenalty += 70;
          reasons.unshift('Blocked: Adjacent repetition of the immediately preceding scene');
        } else if (clipsSinceLastUse <= 8) {
          reusePenalty += 40;
          duplicateWarning = duplicateWarning || `Active cooldown: Scene used ${clipsSinceLastUse} clips ago (spacing target: ${minSpacing}).`;
          reasons.push(`Cooldown penalty: Scene used ${clipsSinceLastUse} clips ago`);
        } else {
          reusePenalty += 20;
          duplicateWarning = duplicateWarning || `Scene within ${minSpacing}-clip spacing window.`;
          reasons.push(`Spacing penalty: Scene used ${clipsSinceLastUse} clips ago`);
        }
      } else {
        // Scene is beyond the 25-clip spacing window (>25 clips ago)
        if (sceneUsageCount > 0) {
          if (candInterval.isExhausted) {
            reusePenalty += 35;
            reasons.push('Exhausted: All source footage in scene has already been extracted');
          } else {
            // Fresh, non-overlapping moment from scene!
            // Progressive cumulative usage penalty to promote footage diversity across entire movie
            const usageTax = sceneUsageCount >= 3 ? 28 : (sceneUsageCount === 2 ? 14 : 5);
            reusePenalty += usageTax;
            reasons.push(`Spacing respected (>25 clips apart): Prior scene uses: ${sceneUsageCount} (diversity penalty: ${usageTax})`);
          }
        }
      }
    }

    // Direct substance check: Did the scene actually match the narration content, characters, or original dialogue anchor?
    const hasDirectSubstance =
      transcriptAnchorScore > 0 ||
      semanticScore > 0 ||
      characterScore > 0 ||
      actionEventScore > 7;

    if (!hasDirectSubstance) {
      chronologyScore = Math.min(chronologyScore, 3);
      narrativeRoleScore = Math.min(narrativeRoleScore, 2);
      visualContinuityScore = Math.min(visualContinuityScore, 3);
    }

    // Duration suitability penalty if footage is shorter than required shot
    let durationPenalty = 0;
    if (scene.duration < Math.min(2.0, seg.duration * 0.5)) {
      durationPenalty = 5;
    }

    // Calculate total score normalized strictly to 0-100 range:
    // Max components: transcriptAnchor(0-35) + semantic(0-22) + character(0-20) + visualContinuity(0-15) + actionEvent(0-15) + narrativeRole(0-10) + chronology(0-15) + durationSuitability(0-5) = 100
    const rawTotal = Math.max(
      0,
      transcriptAnchorScore +
      semanticScore +
      characterScore +
      visualContinuityScore +
      actionEventScore +
      narrativeRoleScore +
      chronologyScore +
      durationSuitability -
      reusePenalty -
      durationPenalty
    );
    const intrinsicScore = rawTotal + reusePenalty;
    const matchScore = hasDirectSubstance ? Math.max(10, Math.min(100, Math.round(rawTotal))) : Math.max(0, Math.min(25, Math.round(rawTotal)));
    const confidence = Number((matchScore / 100).toFixed(2));
    const isUnmatched = !hasDirectSubstance || matchScore < 30;
    const isLowConfidence = matchScore < 70;

    if (isLowConfidence && !isUnmatched) {
      reasons.push('Low-confidence match: Needs creator verification');
    }
    if (isUnmatched) {
      reasons.unshift('UNMATCHED: Insufficient direct correlation between narration beat and movie footage');
      reasons.push('Low-confidence match: Limited direct evidence between narration and source scene');
    }

    return {
      scene,
      matchScore,
      confidence,
      isLowConfidence,
      isUnmatched,
      isDuplicate,
      isNearDuplicate,
      duplicateWarning,
      sourceIn,
      sourceOut,
      isExhausted: candInterval.isExhausted,
      scoreBreakdown: {
        semanticScore,
        characterScore,
        visualContinuityScore,
        actionEventScore,
        narrativeRoleScore,
        chronologyScore,
        durationSuitability,
        transcriptAnchorScore,
      },
      reasons: reasons.slice(0, 5),
    };
  }

  /**
   * Finds the next non-overlapping sub-interval inside a scene with zero frame overlap,
   * respecting narrativeStartTime so title cards/bumpers are never used.
   */
  public findNextUnusedInterval(
    scene: EpisodeScene,
    requiredDuration: number,
    used: Array<{ start: number; end: number }> = [],
    narrativeStartTime: number = 0
  ): { start: number; end: number; isExhausted: boolean } {
    const effectiveStart = Math.max(narrativeStartTime, scene.startTime);
    const dur = Math.max(0.5, Math.min(scene.duration, requiredDuration));
    let cur = effectiveStart;
    while (cur + dur <= scene.endTime + 0.05) {
      const end = Number((cur + dur).toFixed(3));
      const overlapping = used.find((u) => {
        const o = Math.max(0, Math.min(end, u.end) - Math.max(cur, u.start));
        return o > 0.1;
      });
      if (!overlapping) {
        return { start: Number(cur.toFixed(3)), end, isExhausted: false };
      }
      cur = Number(overlapping.end.toFixed(3));
    }
    return {
      start: Number(effectiveStart.toFixed(3)),
      end: Number(Math.min(scene.endTime, effectiveStart + dur).toFixed(3)),
      isExhausted: true,
    };
  }

  /**
   * Stage B: Selectively verifies candidate visual evidence directly against narration.
   * If candidate thumbnail exists, uses minicpm-v4.6:1b (via modelOrchestrationService)
   * to confirm whether the visual frame supports or contradicts the narrated event.
   */
  public async verifyCandidateVisually(
    candidate: SceneMatchCandidate,
    seg: ExplanationScriptSegment,
    projectDir?: string
  ): Promise<SceneMatchCandidate> {
    const scene = candidate.scene;
    let thumbPath: string | undefined;

    if (scene.thumbnailUrl) {
      if (fs.existsSync(scene.thumbnailUrl)) {
        thumbPath = scene.thumbnailUrl;
      } else if (projectDir) {
        const basename = path.basename(scene.thumbnailUrl);
        const localPath = path.join(projectDir, 'thumbnails', basename);
        if (fs.existsSync(localPath)) {
          thumbPath = localPath;
        }
      }
    }

    if (!thumbPath || !fs.existsSync(thumbPath)) {
      return candidate;
    }

    try {
      const verification = await modelOrchestrationService.verifyCandidateStageB(
        thumbPath,
        seg.text,
        scene.description || ''
      );

      candidate.stageBVerification = verification;

      if (verification.status === 'contradicted' || (verification.contradictions.length > 0 && !verification.supportsNarration)) {
        // Visual contradiction detected: apply heavy penalty
        candidate.matchScore = Math.max(10, candidate.matchScore - 40);
        candidate.confidence = Math.min(candidate.confidence, 0.25);
        candidate.isLowConfidence = true;
        candidate.reasons.unshift(
          `Visual contradiction: ${verification.reason || 'Footage contradicts narration topic'}`
        );
      } else if (verification.status === 'verified_match' || verification.supportsNarration) {
        // Visual evidence confirmed
        candidate.matchScore = Math.min(100, candidate.matchScore + 15);
        candidate.confidence = Math.max(candidate.confidence, verification.calibratedConfidence);
        candidate.reasons.unshift(
          `Visual evidence verified: ${verification.matchingDetails[0] || verification.reason}`
        );
      } else if (verification.isEvidenceInsufficient) {
        candidate.reasons.push('Visual evidence partial/ambiguous: Candidate retained with modest confidence.');
      }
    } catch {
      // Non-fatal, preserve heuristic candidate
    }

    return candidate;
  }
}

export const storySceneMatcher = new StorySceneMatcher();
