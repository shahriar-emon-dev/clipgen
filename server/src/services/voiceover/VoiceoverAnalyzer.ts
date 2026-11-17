// ============================================================
// Voiceover Analyzer — Transcription & Narration Intelligence
// Domain-agnostic semantic understanding across sentences & clauses
// ============================================================

import { v4 as uuid } from 'uuid';
import type {
  NarrationSegment,
  NarrativePurpose,
  VoiceoverSegmentType,
  WordTimestamp,
  TranscriptSegment,
} from '../../../../shared/types.js';
import { transcribeAudio } from '../transcription.js';
import { aiProviderService } from './aiProvider.js';

// Common narrative purpose classification keywords (supporting English & Bengali)
const PURPOSE_RULES: { purpose: NarrativePurpose; regex: RegExp; priority: 'high' | 'medium' | 'low' }[] = [
  { purpose: 'hook', regex: /\b(never|secret|nobody|truth|actually|shocking|unbelievable|imagine|listen|here's the thing)\b|(কখনও|গোপন|রহস্য|আসল সত্য|চমকপ্রদ|বিশ্বাস করতে পারবেন না|শুনুন|আসল ঘটনা)/i, priority: 'high' },
  { purpose: 'establishing_shot', regex: /\b(arrived in|welcome to|in the heart of|situated in|located|overlooking|nestled|landscape|skyline|city of|from above)\b|(পৌঁছায়|স্বাগতম|শহরের|প্রকৃতি|দৃশ্য|উপর থেকে|অবস্থিত)/i, priority: 'high' },
  { purpose: 'location_introduction', regex: /\b(reached the|entered the|stepped into|across the|approaching the|found themselves in)\b|(প্রবেশ করে|পা রাখে|এসে পৌঁছায়|ভেতরে যায়)/i, priority: 'high' },
  { purpose: 'character_introduction', regex: /\b(meet|born in|a young|he was|she was|known as|legendary|pioneer)\b|(পরিচিত হন|জন্ম|এক তরুণ|তার নাম|পরিচিত ছিলেন)/i, priority: 'medium' },
  { purpose: 'contrast', regex: /\b(but|however|instead|despite|although|on the other hand|in reality|yet|meanwhile)\b|(কিন্তু|তবে|পরিবর্তে|সত্ত্বেও|যদিও|অপরদিকে|অন্যদিকে|অথচ)/i, priority: 'high' },
  { purpose: 'action', regex: /\b(ran|running|escaped|sprinted|jumped|attacked|cut inside|dribbled|accelerated|chased|struck)\b|(দৌড়ে|দৌড়াচ্ছে|পালালো|লাফ দিল|আক্রমণ করল|ধাওয়া করল|মারল)/i, priority: 'high' },
  { purpose: 'climax', regex: /\b(finally|suddenly|at last|the moment of truth|everything changed|the turning point|explosion|game winner)\b|(অবশেষে|হঠাৎ|সব বদলে গেল|টার্নিং পয়েন্ট|বিস্ফোরণ|চূড়ান্ত মুহূর্তে)/i, priority: 'high' },
  { purpose: 'reveal', regex: /\b(uncovered|revealed|turns out|discovered|showed that|exposed)\b|(উন্মোচিত|ফাঁস|দেখা গেল|আবিষ্কৃত|প্রকাশ্যে এলো)/i, priority: 'medium' },
  { purpose: 'consequence', regex: /\b(as a result|because of this|left behind|devastated|cost them|led to|impacted)\b|(এর ফলে|কারণে|ফেলে রেখে|ধ্বংস|ক্ষতি)/i, priority: 'medium' },
  { purpose: 'explanation', regex: /\b(because|explains|means that|in order to|how it works|the process|system)\b|(কারণ|ব্যাখ্যা করে|এর মানে|যেভাবে কাজ করে|পদ্ধতি)/i, priority: 'medium' },
  { purpose: 'emotional_beat', regex: /\b(heartbreaking|devastating|tears|joy|ecstatic|sorrow|pride|grief|love|fear)\b|(হৃদয়বিদারক|কান্না|আনন্দ|দুঃখ|গর্ব|ভালোবাসা|ভয়)/i, priority: 'high' },
  { purpose: 'conclusion', regex: /\b(in conclusion|to wrap up|that's why|the legacy|looking back|in the end|forever)\b|(পরিশেষে|উপসংহারে|শেষ পর্যন্ত|চিরতরে)/i, priority: 'medium' },
];

const CONTRAST_WORDS = ['but', 'however', 'instead', 'despite', 'although', 'while', 'yet', 'meanwhile', 'conversely', 'কিন্তু', 'তবে', 'পরিবর্তে', 'সত্ত্বেও', 'যদিও'];
const CHRONOLOGY_WORDS = ['first', 'then', 'later', 'after', 'before', 'finally', 'eventually', 'next morning', 'years later', 'soon after', 'প্রথমে', 'তারপর', 'পরে', 'অবশেষে', 'পরের দিন'];

export interface NarrationIntelligenceResult {
  language: string;
  fullText: string;
  duration: number;
  segments: NarrationSegment[];
  summary: {
    totalSegments: number;
    sentenceCount: number;
    wordCount: number;
    primaryDomainHint: string;
  };
}

export class VoiceoverAnalyzer {
  /**
   * Transcribes voiceover audio and derives domain-agnostic semantic intelligence.
   */
  public async analyzeVoiceover(
    audioPath: string,
    projectId: string,
    onProgress?: (percent: number, detail: string) => void
  ): Promise<NarrationIntelligenceResult> {
    onProgress?.(5, 'Transcribing voiceover with word-level alignment...');

    // 1. Re-use existing transcription engine (faster-whisper local with fallback)
    const tx = await transcribeAudio(audioPath, projectId, (pct, detail) => {
      onProgress?.(Math.round(5 + pct * 0.55), detail);
    });

    onProgress?.(65, 'Performing natural narration boundary segmentation...');

    // 2. Intelligent Narration Segmentation (not blind 5s splits)
    const rawSegments = this.segmentNarration(tx.segments, tx.duration);

    onProgress?.(80, 'Extracting semantic concepts, actions, entities & narrative intent...');

    // 3. Multi-level Narration Semantic Enrichment
    const enrichedSegments = await this.enrichSegmentsSemantic(rawSegments, tx.fullText);

    // Compute summary & domain hint
    const wordCount = tx.fullText.split(/\s+/).filter(Boolean).length;
    const domainHint = this.inferDomainHint(enrichedSegments);

    onProgress?.(100, `Narration analyzed: ${enrichedSegments.length} segments, ${wordCount} words, domain inferred: ${domainHint}`);

    return {
      language: tx.language || 'en',
      fullText: tx.fullText,
      duration: tx.duration,
      segments: enrichedSegments,
      summary: {
        totalSegments: enrichedSegments.length,
        sentenceCount: tx.segments.length,
        wordCount,
        primaryDomainHint: domainHint,
      },
    };
  }

  /**
   * Intelligently segment narration into natural thought/sentence/clause boundaries.
   * If a sentence is long (>7.5s) and contains natural clauses (commas, semicolons, conjunctions),
   * subdivide into clause-level visual opportunities while preserving word-level timing!
   */
  public segmentNarration(
    sentenceSegments: TranscriptSegment[],
    totalDuration: number
  ): NarrationSegment[] {
    const narrationSegments: NarrationSegment[] = [];
    let currentParagraphIndex = 0;
    let lastEndTime = 0;

    for (let sIdx = 0; sIdx < sentenceSegments.length; sIdx++) {
      const sentence = sentenceSegments[sIdx];
      const text = (sentence.text || '').trim();
      if (!text) continue;

      // Detect natural paragraph pauses (>1.8s pause between sentences)
      if (sIdx > 0 && sentence.startTime - lastEndTime > 1.8) {
        currentParagraphIndex++;
      }
      lastEndTime = sentence.endTime;

      const duration = Math.max(0.5, sentence.endTime - sentence.startTime);
      const words = sentence.wordTimestamps || [];

      // If sentence duration is > 7.5s and has multiple natural clauses, subdivide at clause boundaries
      const shouldSubdivide = duration > 7.5 && text.includes(',') && words.length >= 8;

      if (!shouldSubdivide || words.length === 0) {
        // Single sentence segment
        narrationSegments.push({
          segmentId: `seg_${String(narrationSegments.length + 1).padStart(3, '0')}`,
          start: Number(sentence.startTime.toFixed(3)),
          end: Number(sentence.endTime.toFixed(3)),
          duration: Number(duration.toFixed(3)),
          text,
          sentenceIndex: sIdx,
          paragraphIndex: currentParagraphIndex,
          type: 'sentence',
          entities: [],
          visualConcepts: [],
          narrativePurpose: 'explanation',
          visualPriority: 'medium',
          storyImportance: 50,
          wordTimestamps: words,
        });
      } else {
        // Subdivide into clauses using punctuation & word timestamps
        const clausePieces = this.subdivideSentenceIntoClauses(sentence, sIdx, currentParagraphIndex);
        for (const piece of clausePieces) {
          piece.segmentId = `seg_${String(narrationSegments.length + 1).padStart(3, '0')}`;
          narrationSegments.push(piece);
        }
      }
    }

    // Safety check: ensure 100% time coverage without accidental zero-length segments
    if (narrationSegments.length === 0 && totalDuration > 0) {
      narrationSegments.push({
        segmentId: 'seg_001',
        start: 0,
        end: totalDuration,
        duration: totalDuration,
        text: 'Narration audio track',
        sentenceIndex: 0,
        paragraphIndex: 0,
        type: 'thought',
        entities: [],
        visualConcepts: [],
        narrativePurpose: 'explanation',
        visualPriority: 'medium',
        storyImportance: 50,
      });
    }

    return narrationSegments;
  }

  /**
   * Splits a long sentence into meaningful sub-clauses based on comma/semicolon boundaries.
   */
  private subdivideSentenceIntoClauses(
    sentence: TranscriptSegment,
    sentenceIndex: number,
    paragraphIndex: number
  ): NarrationSegment[] {
    const words = sentence.wordTimestamps || [];
    const results: NarrationSegment[] = [];

    let currentClauseWords: WordTimestamp[] = [];
    let clauseStart = sentence.startTime;

    for (let w = 0; w < words.length; w++) {
      const wordObj = words[w];
      currentClauseWords.push(wordObj);

      const hasPunctuation = /[,;—\-\u0964]/.test(wordObj.word);
      const isConjunction = /\b(and|but|or|while|because|then)\b/i.test(wordObj.word) || /(এবং|ও|কিন্তু|অথবা|বা|কারণ|তখন|এরপর|তারপর|যেহেতু)/.test(wordObj.word);
      const isFarEnough = (wordObj.end - clauseStart) >= 3.0; // at least 3 seconds
      const isNotLast = w < words.length - 3;

      if ((hasPunctuation || isConjunction) && isFarEnough && isNotLast) {
        const clauseEnd = wordObj.end;
        const clauseText = currentClauseWords.map(c => c.word).join(' ').trim();

        results.push({
          segmentId: '',
          start: Number(clauseStart.toFixed(3)),
          end: Number(clauseEnd.toFixed(3)),
          duration: Number((clauseEnd - clauseStart).toFixed(3)),
          text: clauseText,
          sentenceIndex,
          paragraphIndex,
          type: 'clause',
          entities: [],
          visualConcepts: [],
          narrativePurpose: 'action',
          visualPriority: 'medium',
          storyImportance: 50,
          wordTimestamps: [...currentClauseWords],
        });

        clauseStart = clauseEnd;
        currentClauseWords = [];
      }
    }

    // Remainder
    if (currentClauseWords.length > 0) {
      const clauseEnd = sentence.endTime;
      const clauseText = currentClauseWords.map(c => c.word).join(' ').trim();
      results.push({
        segmentId: '',
        start: Number(clauseStart.toFixed(3)),
        end: Number(clauseEnd.toFixed(3)),
        duration: Number((clauseEnd - clauseStart).toFixed(3)),
        text: clauseText,
        sentenceIndex,
        paragraphIndex,
        type: 'clause',
        entities: [],
        visualConcepts: [],
        narrativePurpose: 'action',
        visualPriority: 'medium',
        storyImportance: 50,
        wordTimestamps: currentClauseWords,
      });
    }

    return results.length > 0 ? results : [{
      segmentId: '',
      start: sentence.startTime,
      end: sentence.endTime,
      duration: sentence.endTime - sentence.startTime,
      text: sentence.text,
      sentenceIndex,
      paragraphIndex,
      type: 'sentence',
      entities: [],
      visualConcepts: [],
      narrativePurpose: 'explanation',
      visualPriority: 'medium',
      storyImportance: 50,
      wordTimestamps: words,
    }];
  }

  /**
   * Derive structured semantic intelligence for every narration segment.
   * Leverages deterministic rule extraction + optional local/cloud LLM enrichment.
   */
  private async enrichSegmentsSemantic(
    segments: NarrationSegment[],
    fullContext: string
  ): Promise<NarrationSegment[]> {
    // 1. Fast deterministic semantic analysis for all segments
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const prevSeg = i > 0 ? segments[i - 1] : undefined;
      const nextSeg = i < segments.length - 1 ? segments[i + 1] : undefined;

      this.applyDeterministicSemantics(seg, prevSeg, nextSeg);
    }

    // 2. Optional LLM batch refinement if Ollama / OpenAI is available
    const activeProvider = await aiProviderService.getActiveProvider();
    if (activeProvider.name !== 'local_deterministic') {
      try {
        await this.enrichWithLLM(segments, fullContext);
      } catch (err: any) {
        console.warn('[VoiceoverAnalyzer] LLM enrichment skipped, using deterministic semantics:', err.message);
      }
    }

    return segments;
  }

  /**
   * High-accuracy deterministic semantic parsing across all 5 levels.
   */
  public applyDeterministicSemantics(
    seg: NarrationSegment,
    prev?: NarrationSegment,
    next?: NarrationSegment
  ): void {
    const text = seg.text;
    const lower = text.toLowerCase();

    // ── Entities Extraction ──
    const capitalizedWords = text.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g) || [];
    const stopWords = new Set(['The', 'A', 'An', 'In', 'On', 'At', 'To', 'And', 'But', 'Or', 'After', 'Before', 'We', 'They', 'He', 'She', 'It']);
    const entities = Array.from(new Set(
      capitalizedWords.filter(w => !stopWords.has(w) && w.length > 2)
    ));
    seg.entities = entities;

    // ── Location & Environment Detection (English & Bengali) ──
    const locationMatch = lower.match(/\b(tokyo|paris|london|new york|city|airport|hotel|coast|beach|mountain|valley|desert|forest|stadium|field|office|garage|factory|headquarters|temple|hospital|classroom|harbor|river|skyline|downtown|street)\b/);
    if (locationMatch) {
      seg.location = locationMatch[1];
    } else {
      const bnLoc = lower.match(/(শহর|নগর|বিমানবন্দর|হোটেল|সৈকত|সমুদ্র|পাহাড়|উপত্যকা|মরুভূমি|জঙ্গল|বন|মাঠ|অফিস|কারখানা|হাসপাতাল|নদী|রাস্তা|বাড়ি|ঘর|রুম)/);
      if (bnLoc) {
        const bnLocMap: Record<string, string> = {
          'শহর': 'city', 'নগর': 'city', 'বিমানবন্দর': 'airport', 'হোটেল': 'hotel',
          'সৈকত': 'beach', 'সমুদ্র': 'beach', 'পাহাড়': 'mountain', 'উপত্যকা': 'valley',
          'মরুভূমি': 'desert', 'জঙ্গল': 'forest', 'বন': 'forest', 'মাঠ': 'field',
          'অফিস': 'office', 'কারখানা': 'factory', 'হাসপাতাল': 'hospital', 'নদী': 'river',
          'রাস্তা': 'street', 'বাড়ি': 'house', 'ঘর': 'room', 'রুম': 'room'
        };
        seg.location = bnLocMap[bnLoc[1]] || bnLoc[1];
      } else if (prev?.location && !lower.includes('instead') && !lower.includes('left') && !lower.includes('পরিবর্তে')) {
        // Location continuity from previous segment
        seg.location = prev.location;
      }
    }

    // ── Time & Era Detection (English & Bengali) ──
    const timeMatch = lower.match(/\b(sunset|sunrise|night|evening|morning|noon|dawn|dusk|golden hour|early 1900s|1980s|centuries ago|years later|nowadays|future)\b/);
    if (timeMatch) {
      seg.time = timeMatch[1];
    } else {
      const bnTime = lower.match(/(সূর্যাস্ত|সূর্যোদয়|রাত|সন্ধ্যা|সকাল|দুপুর|ভোর|ভবিষ্যত)/);
      if (bnTime) {
        const bnTimeMap: Record<string, string> = {
          'সূর্যাস্ত': 'sunset', 'সূর্যোদয়': 'sunrise', 'রাত': 'night', 'সন্ধ্যা': 'evening',
          'সকাল': 'morning', 'দুপুর': 'noon', 'ভোর': 'dawn', 'ভবিষ্যত': 'future'
        };
        seg.time = bnTimeMap[bnTime[1]];
      }
    }

    // ── Action Detection (English & Bengali) ──
    const actionMatch = lower.match(/\b(arrived|arrival|escaped|left|crossed|walking|running|driving|flying|climbing|celebrating|cutting inside|defending|passing|scoring|building|struggling|working|demolishing|exploring|discovering)\b/);
    if (actionMatch) {
      seg.action = actionMatch[1];
    } else {
      const bnAction = lower.match(/(পৌঁছাল|পালিয়ে|পালালো|হাঁটছে|দৌড়াচ্ছে|দৌড়ে|ড্রাইভ|উড়ছে|লড়াই|যুদ্ধ|কাজ করছে|খুঁজছে|আবিষ্কার)/);
      if (bnAction) {
        const bnActionMap: Record<string, string> = {
          'পৌঁছাল': 'arrived', 'পালিয়ে': 'escaped', 'পালালো': 'escaped', 'হাঁটছে': 'walking',
          'দৌড়াচ্ছে': 'running', 'দৌড়ে': 'running', 'ড্রাইভ': 'driving', 'উড়ছে': 'flying',
          'লড়াই': 'fighting', 'যুদ্ধ': 'fighting', 'কাজ করছে': 'working', 'খুঁজছে': 'exploring',
          'আবিষ্কার': 'discovering'
        };
        seg.action = bnActionMap[bnAction[1]];
      }
    }

    // ── Visual Concepts Extraction ──
    const concepts = new Set<string>();
    if (seg.location) concepts.add(seg.location);
    if (seg.time) concepts.add(seg.time);
    if (seg.action) concepts.add(seg.action);

    const visualKeywords = [
      'glowing', 'crowded', 'quiet', 'enormous', 'tiny', 'cracked soil', 'dry field', 'drought',
      'drone', 'aerial', 'wide', 'close-up', 'foggy', 'rain', 'sunny', 'dark', 'industrial',
      'technology', 'startup', 'ancient', 'modern', 'struggle', 'victory', 'celebration',
    ];
    for (const kw of visualKeywords) {
      if (lower.includes(kw)) concepts.add(kw);
    }
    const bnVisualMap: Record<string, string> = {
      'বৃষ্টি': 'rain', 'রোদ': 'sunny', 'অন্ধকার': 'dark', 'কুয়াশা': 'foggy',
      'শান্ত': 'quiet', 'ভিড়': 'crowded', 'বিশাল': 'enormous', 'জয়': 'victory',
      'উৎসব': 'celebration', 'লড়াই': 'struggle', 'আধুনিক': 'modern', 'প্রাচীন': 'ancient'
    };
    for (const [bnWord, enConcept] of Object.entries(bnVisualMap)) {
      if (lower.includes(bnWord)) concepts.add(enConcept);
    }
    seg.visualConcepts = Array.from(concepts);

    // ── Contrast Detection (Section 36) ──
    for (const cw of CONTRAST_WORDS) {
      const reg = new RegExp(`\\b${cw}\\b`, 'i');
      if (reg.test(text)) {
        seg.hasContrast = true;
        seg.contrastWord = cw;
        break;
      }
    }

    // ── Chronology Detection (Section 21) ──
    for (const ch of CHRONOLOGY_WORDS) {
      const reg = new RegExp(`\\b${ch}\\b`, 'i');
      if (reg.test(text)) {
        seg.chronologyMarker = ch;
        break;
      }
    }

    // ── Narrative Purpose (Section 14) ──
    let chosenPurpose: NarrativePurpose = 'explanation';
    let chosenPriority: 'high' | 'medium' | 'low' = 'medium';

    for (const rule of PURPOSE_RULES) {
      if (rule.regex.test(text)) {
        chosenPurpose = rule.purpose;
        chosenPriority = rule.priority;
        break;
      }
    }

    // First segment defaults to hook or establishing_shot
    if (seg.sentenceIndex === 0 && chosenPurpose === 'explanation') {
      chosenPurpose = seg.location ? 'establishing_shot' : 'hook';
      chosenPriority = 'high';
    }

    seg.narrativePurpose = chosenPurpose;
    seg.visualPriority = chosenPriority;

    // ── Emotion Detection (Section 35) ──
    const emotionMatch = lower.match(/\b(wonder|excitement|joy|fear|terror|struggle|hardship|devastation|loss|hope|determination|mystery|calm|peace|chaos|triumph)\b/);
    if (emotionMatch) {
      seg.emotion = emotionMatch[1];
    } else if (chosenPurpose === 'hook') {
      seg.emotion = 'curiosity';
    } else if (chosenPurpose === 'climax') {
      seg.emotion = 'intensity';
    } else {
      seg.emotion = 'neutral';
    }

    // ── Story Importance Score (0-100) ──
    let score = 50;
    if (chosenPurpose === 'hook' || chosenPurpose === 'climax') score += 35;
    else if (chosenPurpose === 'establishing_shot' || chosenPurpose === 'reveal') score += 20;
    if (seg.hasContrast) score += 15;
    if (seg.action) score += 10;
    seg.storyImportance = Math.min(100, score);
  }

  /**
   * Optional LLM-based structured semantic enrichment in small batches.
   */
  private async enrichWithLLM(
    segments: NarrationSegment[],
    _fullContext: string
  ): Promise<void> {
    const batchSize = 6;
    for (let b = 0; b < segments.length; b += batchSize) {
      const batch = segments.slice(b, b + batchSize);
      const prompt = `You are an AI Film Director. Analyze these narration segments for video editing visual intent.
If the narration is in Bengali (or any non-English language), understand the story meaning and output the entities, location, action, visualConcepts, and emotion in English so they match video footage tags.
Segments:
${JSON.stringify(batch.map((s, idx) => ({ id: s.segmentId, text: s.text, index: idx })))}

Return JSON with key "enrichments" containing an array for each segment with:
{
  "id": string,
  "entities": string[],
  "location": string,
  "action": string,
  "visualConcepts": string[],
  "narrativePurpose": "hook" | "establishing_shot" | "explanation" | "action" | "transition" | "climax" | "contrast" | "conclusion",
  "emotion": string,
  "visualPriority": "high" | "medium" | "low"
}`;

      const res = await aiProviderService.executeStructured<{ enrichments: any[] }>(
        {
          systemPrompt: 'You are an AI Visual Director. Output only valid JSON.',
          userPrompt: prompt,
          jsonMode: true,
        },
        (data) => (Array.isArray(data?.enrichments) ? data : null),
        () => ({ enrichments: [] })
      );

      for (const item of res.enrichments) {
        const seg = batch.find(s => s.segmentId === item.id);
        if (seg) {
          if (Array.isArray(item.entities) && item.entities.length > 0) seg.entities = item.entities;
          if (item.location) seg.location = item.location;
          if (item.action) seg.action = item.action;
          if (Array.isArray(item.visualConcepts) && item.visualConcepts.length > 0) {
            seg.visualConcepts = Array.from(new Set([...seg.visualConcepts, ...item.visualConcepts]));
          }
          if (item.narrativePurpose) seg.narrativePurpose = item.narrativePurpose;
          if (item.emotion) seg.emotion = item.emotion;
          if (item.visualPriority) seg.visualPriority = item.visualPriority;
        }
      }
    }
  }

  /**
   * Infer broad domain hint automatically (domain-agnostic).
   */
  private inferDomainHint(segments: NarrationSegment[]): string {
    const combined = segments.map(s => s.text).join(' ').toLowerCase();

    if (/\b(goal|defender|ball|stadium|match|scored|penalty|referee|tournament|championship|coach)\b/.test(combined)) return 'Sports & Football';
    if (/\b(flight|airport|hotel|tokyo|city|coast|traveled|journey|explore|monument|island)\b/.test(combined)) return 'Travel & Exploration';
    if (/\b(crops|farmer|drought|soil|agriculture|harvest|cattle|nature|wildlife|species)\b/.test(combined)) return 'Nature & Agriculture';
    if (/\b(company|startup|founder|revenue|market|business|employees|scale|technology|garage)\b/.test(combined)) return 'Business & Technology';
    if (/\b(century|1900s|empire|war|history|ancient|industrial|revolution|dynasty)\b/.test(combined)) return 'History & Documentary';
    if (/\b(lesson|concept|how to|system|science|formula|experiment|theory)\b/.test(combined)) return 'Education & Science';

    return 'General Storytelling';
  }
}

export const voiceoverAnalyzer = new VoiceoverAnalyzer();
