// ============================================================
// Script Alignment Engine — Voiceover & Transcript Synchronization
// Parses plain TXT/SRT/VTT, transcribes voiceover with word-level timing,
// aligns text to voiceover audio, and enriches narrative segments.
// ============================================================

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { v4 as uuid } from 'uuid';
import { transcribeAudio } from '../transcription.js';
import { extractMetadata } from '../ffmpeg.js';
import { analysisCacheManager } from './AnalysisCacheManager.js';
import { voiceoverSilenceService } from './VoiceoverSilenceService.js';
import type {
  ExplanationScript,
  ExplanationScriptSegment,
  ExplanationSubAction,
  NarrativeStageType,
  WordTimestamp,
  TranscriptSegment,
  SilenceHandlingSettings,
} from '../../../../shared/types.js';

const NON_CHARACTER_WORDS = new Set([
  'the', 'and', 'but', 'for', 'nor', 'yet', 'so', 'after', 'although', 'as', 'because', 'before',
  'even', 'if', 'once', 'since', 'that', 'though', 'unless', 'until', 'when', 'whenever', 'where',
  'wherever', 'while', 'our', 'their', 'this', 'that', 'these', 'those', 'what', 'which', 'who',
  'whom', 'whose', 'how', 'why', 'with', 'from', 'into', 'during', 'including', 'until', 'against',
  'among', 'throughout', 'despite', 'towards', 'upon', 'concerning', 'about', 'meanwhile', 'earlier',
  'later', 'suddenly', 'eventually', 'finally', 'instead', 'however', 'moreover', 'furthermore',
  'therefore', 'little', 'much', 'some', 'any', 'every', 'all', 'both', 'each', 'either', 'neither',
  'one', 'two', 'three', 'four', 'first', 'second', 'third', 'last', 'next', 'many', 'few', 'several',
  'he', 'she', 'they', 'it', 'we', 'you', 'his', 'her', 'their', 'its', 'my', 'your',
  // Bengali common stop words and pronouns
  'এই', 'সেই', 'একটি', 'একটা', 'করে', 'ছিল', 'হয়', 'যে', 'এবং', 'কিন্তু', 'বা', 'না', 'থেকে', 'দিয়ে',
  'জন্য', 'মতো', 'হয়ে', 'তার', 'তাদের', 'তাকে', 'তিনি', 'সে', 'এখানে', 'সেখানে', 'তখন', 'এখন', 'পর',
  'পরে', 'তারপর', 'আবার', 'অনেক', 'কিছু', 'কোনো', 'সব', 'সবাই', 'পুরো', 'মধ্যে', 'উপর', 'নিচে', 'সাথে',
  'নিয়ে', 'বলে', 'বলা', 'হলো', 'হবে', 'গেলে', 'আগে', 'কী', 'কেন', 'কিভাবে', 'কোথায়', 'কখন'
]);

// Keyword matching for narration stage classification
const SCRIPT_STAGE_RULES: { stage: NarrativeStageType; regex: RegExp; multiShotLikely: boolean }[] = [
  { stage: 'opening', regex: /\b(in the beginning|the movie begins|the episode starts|we open on|the story opens|it all starts)\b|(গল্পের শুরুতে|সিনেমাটি শুরু হয়|শুরুতেই|গল্পটি শুরু)/i, multiShotLikely: false },
  { stage: 'character_introduction', regex: /\b(meet|introduced to|he is a|she is a|a young man named|a detective named|our protagonist)\b|(পরিচয় করিয়ে দেওয়া|নামের এক|যার নাম|তার নাম|আমাদের প্রধান চরিত্র)/i, multiShotLikely: false },
  { stage: 'setup', regex: /\b(meanwhile|living in|working as|preparing for|before this happened|normal life|daily routine)\b|(স্বাভাবিক জীবন|প্রস্তুতি|আগে ঘটেছিল|দৈনন্দিন)/i, multiShotLikely: false },
  { stage: 'conflict', regex: /\b(suddenly|trouble begins|conflict arises|attacked|threatened|refuses to|confronts|argument breaks out)\b|(হঠাৎ|বিপদ শুরু|ঝামেলা|আক্রমণ|হুমকি|তর্ক|মারামারি|সংঘাত)/i, multiShotLikely: true },
  { stage: 'investigation', regex: /\b(investigating|searching for|looking through|trying to find|piecing together|following the trail)\b|(তদন্ত|খুঁজতে|অনুসন্ধান|রহস্য উদঘাটন|ক্লু)/i, multiShotLikely: true },
  { stage: 'clue', regex: /\b(notices a|finds a clue|discovers a piece of|evidence shows|left behind|traces of|hidden away)\b|(প্রমাণ|সুরাগ|চিহ্ন|লুকিয়ে রাখা|পাওয়া যায়)/i, multiShotLikely: false },
  { stage: 'rising_tension', regex: /\b(running out of time|stakes get higher|danger grows|trapped|nowhere to hide|suspense builds)\b|(বিপদ বাড়ছে|সময় শেষ|ফাঁদে|লুকানোর জায়গা নেই|উত্তেজনা)/i, multiShotLikely: true },
  { stage: 'turning_point', regex: /\b(everything changes|a major turning point|decides to|takes a stand|makes the choice|crosses the line)\b|(সব বদলে গেল|টার্নিং পয়েন্ট|সিদ্ধান্ত নেয়|বাধ্য হয়)/i, multiShotLikely: false },
  { stage: 'reveal', regex: /\b(reveals that|the truth comes out|turns out that|uncovers the secret|was actually|the real killer was|identity revealed)\b|(সত্য উন্মোচিত|আসল সত্য|জানা যায়|রহস্য ফাঁস|আসল খুনি)/i, multiShotLikely: false },
  { stage: 'reaction', regex: /\b(in disbelief|shocked by|heartbroken|furious|stunned|grieving|cannot believe)\b|(বিশ্বাস করতে পারে না|স্তব্ধ|হতবাক|ভেঙে পড়ে|রেগে যায়)/i, multiShotLikely: false },
  { stage: 'climax_setup', regex: /\b(prepares for the final|heading towards the showdown|the confrontation is inevitable|the final battle nears)\b|(চূড়ান্ত প্রস্ততি|মুখোমুখি লড়াইয়ের প্রস্তুতি|চূড়ান্ত যুদ্ধের দিকে)/i, multiShotLikely: true },
  { stage: 'climax', regex: /\b(the final showdown|climactic confrontation|fights back|defeats|the explosion|the final arrest|life and death battle)\b|(চূড়ান্ত লড়াই|মরণপণ যুদ্ধ|পরাজিত|বিস্ফোরণ|গ্রেফতার|শেষ মুহূর্তে)/i, multiShotLikely: true },
  { stage: 'consequence', regex: /\b(in the aftermath|as a result|cost him|consequences of|survivors|left behind)\b|(এর ফলস্বরূপ|পরিণতি|ফলাফল|পেছনে ফেলে)/i, multiShotLikely: false },
  { stage: 'resolution', regex: /\b(in the end|finally at peace|the case is closed|justice is served|moves on|the episode ends|closing scene)\b|(অবশেষে|শেষ পর্যন্ত|কেস বন্ধ|বিচার পেল|গল্পের ইতি|সমাপ্তি)/i, multiShotLikely: false },
  { stage: 'transition', regex: /\b(later on|the next morning|a few days later|soon after|meanwhile in|at the same time)\b|(পরের দিন|কয়েকদিন পর|কিছুক্ষণ পর|এদিকে|একই সময়ে|এরপর)/i, multiShotLikely: false },
];

export class ScriptAlignmentEngine {
  /**
   * Aligns the explanation script with the uploaded explanation voiceover audio.
   */
  public async alignScriptAndVoiceover(
    scriptRawText: string,
    voiceoverAudioPath: string,
    projectId: string,
    onProgress?: (percent: number, detail: string) => void
  ): Promise<ExplanationScript> {
    onProgress?.(5, 'Extracting audio duration & computing audio fingerprint...');

    // 1. Get audio metadata & fingerprint
    const audioMeta = await extractMetadata(voiceoverAudioPath);
    const voiceDuration = audioMeta.duration;

    if (!voiceDuration || voiceDuration <= 0) {
      throw new Error('Voiceover audio has invalid duration or is unreadable.');
    }

    const voiceoverFingerprint = analysisCacheManager.computeMediaFingerprint(voiceoverAudioPath);
    const scriptHash = crypto.createHash('sha256').update(scriptRawText.trim()).digest('hex');

    // Check full script alignment cache (rejecting legacy corrupt 0.8s clumping caches)
    const cachedAlignment = analysisCacheManager.getCachedScriptAlignment(projectId, scriptHash, voiceoverFingerprint);
    const hasCorruptClumping = cachedAlignment &&
      cachedAlignment.segments &&
      cachedAlignment.segments.length > 20 &&
      cachedAlignment.segments.filter((s) => Math.abs(s.duration - 0.8) < 0.05).length > 20;

    if (cachedAlignment && !hasCorruptClumping) {
      onProgress?.(100, `Loaded cached Script-Voiceover alignment (${cachedAlignment.segments.length} segments)`);
      return cachedAlignment;
    }

    onProgress?.(20, `Transcribing explanation voiceover (${Math.round(voiceDuration)}s) for acoustic alignment...`);

    // 2. Check cached voiceover transcript or transcribe
    let txSegments: TranscriptSegment[] = [];
    let txFullText = '';

    const cachedVoiceTx = analysisCacheManager.getCachedTranscript(projectId, voiceoverFingerprint);
    if (cachedVoiceTx && cachedVoiceTx.segments?.length > 0) {
      txSegments = cachedVoiceTx.segments;
      txFullText = cachedVoiceTx.fullText;
      onProgress?.(60, `Reused existing voiceover acoustic transcript (${txSegments.length} segments cached)`);
    } else {
      const isBengali = /[\u0980-\u09FF]/.test(scriptRawText);
      const txOptions = isBengali
        ? { language: 'bn', initialPrompt: 'বাংলা অনুবাদ এবং ভয়েসওভার স্ক্রিপ্ট।' }
        : undefined;

      const txResult = await transcribeAudio(
        voiceoverAudioPath,
        `${projectId}_voiceover`,
        (pct, detail) => {
          onProgress?.(Math.round(20 + pct * 0.45), `Voiceover acoustic alignment: ${detail}`);
        },
        txOptions
      );
      txSegments = txResult.segments || [];
      txFullText = txResult.fullText || '';
      analysisCacheManager.saveCachedTranscript(
        projectId,
        voiceoverFingerprint,
        txResult.language || (isBengali ? 'bn' : 'en'),
        txFullText,
        txSegments,
        voiceDuration
      );
    }

    onProgress?.(70, 'Detecting format & parsing explanation script text...');

    // 3. Parse input script text (detect SRT / VTT vs Plain Text)
    const detectedFormat = this.detectFormat(scriptRawText);
    const parsedSegments = this.parseScriptToSegments(scriptRawText, detectedFormat, txSegments, voiceDuration);

    onProgress?.(85, 'Aligning narrative segments to voiceover timing & checking correspondence...');

    // 4. Validate script-to-voiceover correspondence
    const alignmentValidation = this.validateCorrespondence(parsedSegments, txFullText, voiceDuration);

    // 5. Enrich narrative segments (visual intent, multi-shot necessity, character extraction)
    const enrichedSegments = this.enrichSegments(parsedSegments, txSegments);

    const alignedScript: ExplanationScript = {
      rawText: scriptRawText,
      format: detectedFormat,
      segments: enrichedSegments,
      alignmentConfidence: alignmentValidation.confidence,
      mismatchWarning: alignmentValidation.warning,
      isAlignedToVoiceover: true,
    };

    analysisCacheManager.saveCachedScriptAlignment(projectId, scriptHash, voiceoverFingerprint, alignedScript);
    onProgress?.(100, `Script-Voiceover alignment complete: ${enrichedSegments.length} narration segments synchronized.`);

    return alignedScript;
  }

  /**
   * Detects whether the input is SRT, VTT, or plain text.
   */
  public detectFormat(raw: string): 'srt' | 'vtt' | 'plain' {
    if (raw.trim().startsWith('WEBVTT')) return 'vtt';
    if (/^\d+\r?\n\d{2}:\d{2}:\d{2}[,\.]\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}[,\.]\d{3}/m.test(raw)) return 'srt';
    return 'plain';
  }

  /**
   * Parses script into structured segments, using acoustic Whisper segments when available.
   */
  private parseScriptToSegments(
    rawText: string,
    format: 'srt' | 'vtt' | 'plain',
    acousticSegments: TranscriptSegment[],
    voiceDuration: number
  ): ExplanationScriptSegment[] {
    if (format === 'srt' || format === 'vtt') {
      return this.parseSubtitles(rawText, format, voiceDuration);
    }

    // Plain text script:
    // Filter out metadata banners, section tags, and divider lines so only spoken narration is processed
    const cleanLines = rawText
      .split(/\r?\n+/)
      .map((l) => l.trim())
      .filter((l) => !this.isScriptMetadataOrNoiseLine(l));

    // Split paragraphs into sentences
    const rawSentences: { text: string; paragraphIndex: number }[] = [];
    cleanLines.forEach((para, pIdx) => {
      // Strip section headers like "#1 [HOOK] (~18s)" from the start of a narration line
      const cleanPara = para.replace(/^#\d+\s*\[[a-z_\s]+\]\s*\(~?\d+s?\)\s*/i, '').trim();
      if (cleanPara.length <= 3 || this.isScriptMetadataOrNoiseLine(cleanPara)) return;

      // Split on sentence punctuation (. ! ? and Bengali । ॥) followed by whitespace or end
      const sMatches = cleanPara.match(/[^.!?\u0964\u0965]+[.!?\u0964\u0965]+(\s|$)|[^.!?\u0964\u0965]+$/g) || [cleanPara];
      sMatches.forEach((s) => {
        const trimmed = s.trim();
        if (trimmed.length > 3 && !this.isScriptMetadataOrNoiseLine(trimmed)) {
          rawSentences.push({ text: trimmed, paragraphIndex: pIdx });
        }
      });
    });

    if (rawSentences.length === 0) {
      // Fallback: use acoustic segments directly, anchoring segment 0 to output time 0.000
      return acousticSegments.map((s, idx) => {
        const start = idx === 0 ? 0.000 : Number(s.startTime.toFixed(3));
        const end = Number(s.endTime.toFixed(3));
        return {
          segmentId: `seg_${String(idx + 1).padStart(3, '0')}`,
          text: s.text.trim(),
          voiceoverStart: start,
          voiceoverEnd: end,
          duration: Number((end - start).toFixed(3)),
          sentenceIndex: idx,
          paragraphIndex: 0,
          eventsDescribed: [],
          narrativePurpose: 'setup',
          visualIntent: 'Establish visual narrative context',
          requiresMultiShot: false,
          targetShotCount: 1,
          wordTimestamps: s.wordTimestamps,
        };
      });
    }

    // Distribute time proportionally across sentences based on character length if Whisper segments are fewer,
    // or map by matching acoustic word boundaries.
    return this.alignSentencesToAcoustic(rawSentences, acousticSegments, voiceDuration);
  }

  /**
   * Identifies whether a script line is non-narration metadata, header, or section delimiter.
   */
  public isScriptMetadataOrNoiseLine(line: string): boolean {
    const trimmed = line.trim();
    if (!trimmed) return true;
    if (/^[=\-*#~_]{3,}$/.test(trimmed)) return true;
    if (/^(movie|series|episode)?\s*explanation\s*script/i.test(trimmed)) return true;
    if (/^(language|target duration|duration|word count|generated with|model|created by|end of script|author|title|pacing verification):/i.test(trimmed)) return true;
    if (/^end of script$/i.test(trimmed)) return true;
    if (/^\[(full narration script|\d+[–\-]\d+s?\s*opening hook|opening hook|hook|context|characters|inciting incident|escalation|reversals|climax|resolution|takeaway)\]$/i.test(trimmed)) return true;
    if (/^#\d+\s*\[[a-z_\s]+\]\s*\(~?\d+s?\)$/i.test(trimmed)) return true;
    return false;
  }

  /**
   * Parses SRT or WebVTT subtitles with native timestamps.
   */
  private parseSubtitles(
    raw: string,
    format: 'srt' | 'vtt',
    voiceDuration: number
  ): ExplanationScriptSegment[] {
    const segments: ExplanationScriptSegment[] = [];
    const blockRegex = format === 'vtt'
      ? /(?:(\d+)\r?\n)?(\d{2}:\d{2}:\d{2}\.\d{3}|\d{2}:\d{2}\.\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}\.\d{3}|\d{2}:\d{2}\.\d{3})[^\r\n]*\r?\n([\s\S]*?)(?=\r?\n\r?\n|\r?\n*$)/g
      : /(\d+)\r?\n(\d{2}:\d{2}:\d{2},\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2},\d{3})\r?\n([\s\S]*?)(?=\r?\n\r?\n|\r?\n*$)/g;

    let match: RegExpExecArray | null;
    let sIdx = 0;

    while ((match = blockRegex.exec(raw)) !== null) {
      const startStr = match[2] || match[1];
      const endStr = match[3] || match[2];
      const text = (match[4] || match[3] || '').replace(/<[^>]+>/g, '').replace(/\r?\n/g, ' ').trim();

      if (!text) continue;

      let start = this.timecodeToSeconds(startStr);
      const end = Math.min(voiceDuration, this.timecodeToSeconds(endStr));
      // Anchor opening subtitle segment to output 0.000s for zero black screen
      if (sIdx === 0 && start > 0) {
        start = 0.000;
      }
      const duration = Math.max(0.5, end - start);

      segments.push({
        segmentId: `seg_${String(sIdx + 1).padStart(3, '0')}`,
        text,
        voiceoverStart: Number(start.toFixed(3)),
        voiceoverEnd: Number(end.toFixed(3)),
        duration: Number(duration.toFixed(3)),
        sentenceIndex: sIdx,
        paragraphIndex: 0,
        eventsDescribed: [],
        narrativePurpose: 'setup',
        visualIntent: 'Subtitle dialogue representation',
        requiresMultiShot: false,
        targetShotCount: 1,
      });
      sIdx++;
    }

    return segments;
  }

  /**
   * Converts timestamp string (00:01:23.456 or 01:23.456) to seconds.
   */
  private timecodeToSeconds(tc: string): number {
    const parts = tc.replace(',', '.').split(':').map(Number);
    if (parts.length === 3) {
      return parts[0] * 3600 + parts[1] * 60 + parts[2];
    } else if (parts.length === 2) {
      return parts[0] * 60 + parts[1];
    }
    return parseFloat(tc) || 0;
  }

  /**
   * Aligns sentence blocks to acoustic transcript segments using exact word-level Whisper acoustic matching,
   * with monotonic utterance & pause boundary alignment fallback when scripts differ in alphabet/transliteration.
   * Preserves sentence boundaries, natural breath pauses, and guarantees 100% time coverage across the full audio track.
   */
  private alignSentencesToAcoustic(
    rawSentences: { text: string; paragraphIndex: number }[],
    acousticSegments: TranscriptSegment[],
    totalDuration: number
  ): ExplanationScriptSegment[] {
    const segments: ExplanationScriptSegment[] = [];

    // Flatten all acoustic words with precise start/end timestamps
    const acousticWords: { clean: string; start: number; end: number; raw: string }[] = [];
    for (const seg of acousticSegments) {
      if (seg.wordTimestamps && seg.wordTimestamps.length > 0) {
        for (const wt of seg.wordTimestamps) {
          const clean = wt.word.toLowerCase().replace(/[^a-z0-9\u0980-\u09FF]/g, '');
          if (clean) acousticWords.push({ clean, start: wt.start, end: wt.end, raw: wt.word });
        }
      } else {
        const words = seg.text.toLowerCase().replace(/[^a-z0-9\u0980-\u09FF\s]/g, '').split(/\s+/).filter(Boolean);
        const durPerWord = (seg.endTime - seg.startTime) / (words.length || 1);
        words.forEach((w, idx) => {
          acousticWords.push({
            clean: w,
            start: seg.startTime + idx * durPerWord,
            end: seg.startTime + (idx + 1) * durPerWord,
            raw: w,
          });
        });
      }
    }

    // Check lexical overlap to determine if direct word-level alignment is viable
    let sampleMatches = 0;
    let sampleWords = 0;
    const acWordSet = new Set(acousticWords.map((w) => w.clean));
    for (let i = 0; i < Math.min(25, rawSentences.length); i++) {
      const words = rawSentences[i].text.toLowerCase().replace(/[^a-z0-9\u0980-\u09FF\s]/g, '').split(/\s+/).filter(Boolean);
      sampleWords += words.length;
      for (const w of words) {
        if (acWordSet.has(w)) sampleMatches++;
      }
    }
    const lexicalMatchRatio = sampleWords > 0 ? sampleMatches / sampleWords : 0;

    // Strategy A: Word-level alignment (when script and acoustic transcript share character set and words)
    if (lexicalMatchRatio >= 0.20 && acousticWords.length > 0) {
      let acIdx = 0;
      const rawAligned: { start: number; end: number }[] = [];

      for (let i = 0; i < rawSentences.length; i++) {
        const sent = rawSentences[i];
        const sentWords = sent.text.toLowerCase().replace(/[^a-z0-9\u0980-\u09FF\s]/g, '').split(/\s+/).filter(Boolean);

        let matchStartAcIdx = acIdx;
        let matchEndAcIdx = acIdx;

        let swIdx = 0;
        while (swIdx < sentWords.length && acIdx < acousticWords.length) {
          if (sentWords[swIdx] === acousticWords[acIdx].clean) {
            if (swIdx === 0) matchStartAcIdx = acIdx;
            matchEndAcIdx = acIdx;
            swIdx++;
            acIdx++;
          } else {
            let found = false;
            for (let look = 1; look <= 6 && acIdx + look < acousticWords.length; look++) {
              if (sentWords[swIdx] === acousticWords[acIdx + look].clean) {
                acIdx += look;
                if (swIdx === 0) matchStartAcIdx = acIdx;
                matchEndAcIdx = acIdx;
                swIdx++;
                acIdx++;
                found = true;
                break;
              }
            }
            if (!found) swIdx++;
          }
        }

        const prevEnd = i > 0 ? rawAligned[i - 1].end : 0;
        const start = acousticWords[matchStartAcIdx] ? acousticWords[matchStartAcIdx].start : prevEnd;
        const spokenEnd = acousticWords[matchEndAcIdx] ? acousticWords[matchEndAcIdx].end : Math.max(start + 1.5, prevEnd + 1.5);
        rawAligned.push({ start, end: spokenEnd });
      }

      for (let i = 0; i < rawSentences.length; i++) {
        const sentence = rawSentences[i];
        const prevEnd = i > 0 ? segments[i - 1].voiceoverEnd : 0;
        const start = i === 0 ? 0 : Math.max(prevEnd, rawAligned[i].start);

        let end = i === rawSentences.length - 1
          ? totalDuration
          : (rawAligned[i + 1] ? rawAligned[i + 1].start : rawAligned[i].end);

        if (end <= start) {
          end = Math.min(totalDuration, start + Math.max(2.0, rawAligned[i].end - rawAligned[i].start));
        }
        if (i === rawSentences.length - 1) end = totalDuration;

        const duration = Math.max(0.5, end - start);
        segments.push({
          segmentId: `seg_${String(i + 1).padStart(3, '0')}`,
          text: sentence.text,
          voiceoverStart: Number(start.toFixed(3)),
          voiceoverEnd: Number(end.toFixed(3)),
          duration: Number(duration.toFixed(3)),
          sentenceIndex: i,
          paragraphIndex: sentence.paragraphIndex,
          eventsDescribed: [],
          narrativePurpose: 'setup',
          visualIntent: 'Visual accompaniment for narration thought',
          requiresMultiShot: false,
          targetShotCount: 1,
        });
      }

      return segments;
    }

    // Strategy B: Monotonic Utterance & Pause Boundary Alignment (Audio Time Anchoring)
    // Ensures human-proportional pacing across actual spoken audio duration when lexical matching is mismatched
    const totalScriptChars = rawSentences.reduce((acc, s) => acc + s.text.length, 0) || 1;
    let currentAcousticIdx = 0;
    let accumulatedScriptChars = 0;

    for (let i = 0; i < rawSentences.length; i++) {
      const sentence = rawSentences[i];
      accumulatedScriptChars += sentence.text.length;
      const targetFraction = accumulatedScriptChars / totalScriptChars;

      let start = i === 0 ? 0 : segments[i - 1].voiceoverEnd;
      let end = totalDuration;

      if (acousticSegments && acousticSegments.length > 0) {
        const startAcIdx = currentAcousticIdx;
        let endAcIdx = currentAcousticIdx;

        while (endAcIdx < acousticSegments.length - 1) {
          const acFraction = acousticSegments[endAcIdx].endTime / totalDuration;
          if (acFraction >= targetFraction) break;
          endAcIdx++;
        }
        currentAcousticIdx = Math.min(acousticSegments.length - 1, endAcIdx + 1);

        const acStart = i === 0 ? 0 : Math.max(start, acousticSegments[startAcIdx].startTime);
        let acEnd = i === rawSentences.length - 1 ? totalDuration : acousticSegments[endAcIdx].endTime;

        if (acEnd <= acStart) {
          const charFraction = sentence.text.length / totalScriptChars;
          acEnd = Math.min(totalDuration, acStart + Math.max(2.0, charFraction * totalDuration));
        }
        start = acStart;
        end = acEnd;
      } else {
        const fraction = sentence.text.length / totalScriptChars;
        const calculatedDuration = Math.max(2.0, fraction * totalDuration);
        end = i === rawSentences.length - 1 ? totalDuration : Math.min(totalDuration, start + calculatedDuration);
      }

      if (i === rawSentences.length - 1) {
        end = totalDuration;
      }

      const duration = Math.max(0.5, end - start);

      segments.push({
        segmentId: `seg_${String(i + 1).padStart(3, '0')}`,
        text: sentence.text,
        voiceoverStart: Number(start.toFixed(3)),
        voiceoverEnd: Number(end.toFixed(3)),
        duration: Number(duration.toFixed(3)),
        sentenceIndex: i,
        paragraphIndex: sentence.paragraphIndex,
        eventsDescribed: [],
        narrativePurpose: 'setup',
        visualIntent: 'Visual accompaniment for narration thought',
        requiresMultiShot: false,
        targetShotCount: 1,
      });
    }

    return segments;
  }

  /**
   * Validates correspondence between explanation transcript and voiceover speech.
   */
  private validateCorrespondence(
    segments: ExplanationScriptSegment[],
    acousticFullText: string,
    voiceDuration: number
  ): { confidence: number; warning?: string } {
    const scriptFullText = segments.map((s) => s.text).join(' ');
    const scriptWords = scriptFullText.toLowerCase().replace(/[^a-z0-9\u0980-\u09FF\s]/g, '').split(/\s+/).filter(Boolean);
    const acousticWords = acousticFullText.toLowerCase().replace(/[^a-z0-9\u0980-\u09FF\s]/g, '').split(/\s+/).filter(Boolean);

    if (scriptWords.length === 0 || acousticWords.length === 0) {
      return { confidence: 0.75 };
    }

    // Calculate word overlap (Jaccard similarity on word sets)
    const scriptSet = new Set(scriptWords);
    const acousticSet = new Set(acousticWords);
    let intersection = 0;

    for (const w of scriptSet) {
      if (acousticSet.has(w)) intersection++;
    }

    const union = new Set([...scriptSet, ...acousticSet]).size;
    const similarity = union > 0 ? intersection / union : 1.0;

    let warning: string | undefined;
    let confidence = Number(Math.max(0.5, Math.min(0.98, similarity * 1.25)).toFixed(2));

    if (similarity < 0.25) {
      confidence = 0.45;
      warning = 'Discrepancy detected: The uploaded script text does not closely match the speech heard in the voiceover audio. Please verify that this transcript matches the voiceover track.';
    } else if (similarity < 0.45) {
      confidence = 0.68;
      warning = 'Partial alignment: Some narration phrases in the script were not clearly detected in the audio. Timestamps have been estimated from voiceover cadence.';
    }

    return { confidence, warning };
  }

  /**
   * Enriches segments with narrative purpose, visual intent, and multi-shot detection.
   */
  private enrichSegments(
    segments: ExplanationScriptSegment[],
    acousticSegments: TranscriptSegment[]
  ): ExplanationScriptSegment[] {
    return segments.map((seg, idx) => {
      const text = seg.text;
      const lower = text.toLowerCase();

      // 1. Stage classification
      let narrativePurpose: NarrativeStageType = 'setup';
      let multiShotLikely = false;

      for (const rule of SCRIPT_STAGE_RULES) {
        if (rule.regex.test(lower)) {
          narrativePurpose = rule.stage;
          multiShotLikely = rule.multiShotLikely;
          break;
        }
      }

      // If no keyword match, infer by chronology position
      if (narrativePurpose === 'setup') {
        const progress = seg.voiceoverStart / (segments[segments.length - 1]?.voiceoverEnd || 1);
        if (progress < 0.1) narrativePurpose = 'opening';
        else if (progress >= 0.7 && progress < 0.88) narrativePurpose = 'climax';
        else if (progress >= 0.88) narrativePurpose = 'resolution';
      }

      // 2. Intelligent Multi-Shot Detection:
      // Decompose sentences with multiple distinct actions into separate visual shots with sub-timing
      const subActions = this.extractSubActionClauses(text, seg.voiceoverStart, seg.voiceoverEnd, seg.wordTimestamps);
      const requiresMultiShot = (seg.duration > 5.0 && subActions.length >= 2) || (seg.duration > 7.5);
      const targetShotCount = subActions.length >= 2
        ? Math.min(3, subActions.length)
        : (requiresMultiShot ? Math.min(3, Math.max(1, Math.floor(seg.duration / 3.0))) : 1);

      // 3. Subject / Character mentioned (Filter out pronouns & non-character words)
      let mainSubjectOrCharacter: string | undefined;
      const referencedCharacters: string[] = [];

      // Bengali character name extraction
      const BENGALI_CHARACTER_MAP: Record<string, string> = {
        'প্যাট্রিক': 'Patrick Jane',
        'জেন': 'Patrick Jane',
        'লিসবন': 'Teresa Lisbon',
        'টেরিজা': 'Teresa Lisbon',
        'রোজমেরি': 'Rosemary Tennant',
        'জেরেমি': 'Jeremy',
        'ট্রাভিস': 'Travis',
        'ক্লেয়ার': 'Claire',
        'ক্রিস্টিনা': 'Kristina',
        'চো': 'Kimball Cho',
        'রিগসবাই': 'Wayne Rigsby',
        'ভ্যান পেল্ট': 'Grace Van Pelt',
      };
      for (const [bnName, enName] of Object.entries(BENGALI_CHARACTER_MAP)) {
        if (text.includes(bnName) && !referencedCharacters.includes(enName)) {
          referencedCharacters.push(enName);
          if (!mainSubjectOrCharacter) mainSubjectOrCharacter = enName;
        }
      }

      const titledMatch = text.match(/\b(Detective|Agent|Officer|Captain|Doctor|Dr\.|Mr\.|Mrs\.|Ms\.|Chief|Inspector)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/);
      if (titledMatch) {
        mainSubjectOrCharacter = titledMatch[0].trim();
        if (!referencedCharacters.includes(mainSubjectOrCharacter)) referencedCharacters.push(mainSubjectOrCharacter);
      } else {
        const wordsAfterStart = text.replace(/^[A-Z][a-z]+\s+/, '');
        const capitalizedMatches = wordsAfterStart.match(/\b[A-Z][a-z]{2,12}\b/g);
        if (capitalizedMatches) {
          for (const w of capitalizedMatches) {
            if (!NON_CHARACTER_WORDS.has(w.toLowerCase())) {
              if (!mainSubjectOrCharacter) mainSubjectOrCharacter = w;
              if (!referencedCharacters.includes(w)) referencedCharacters.push(w);
              break;
            }
          }
        }
      }

      const allCapWords = text.match(/\b([A-Z][a-z]{2,15}(?:\s+[A-Z][a-z]{2,15})?)\b/g) || [];
      for (const w of allCapWords) {
        if (!NON_CHARACTER_WORDS.has(w.toLowerCase()) && !referencedCharacters.includes(w)) {
          referencedCharacters.push(w);
        }
      }

      // 4. Visual Intent synthesis
      const visualIntent = this.synthesizeVisualIntent(text, narrativePurpose, requiresMultiShot);

      // Extract events described & story event
      const storyEventOrAction = `${narrativePurpose.toUpperCase()}: ${text.slice(0, 80)}`;
      const eventsDescribed = [
        `${narrativePurpose.toUpperCase()}: ${text.slice(0, 60)}...`,
      ];

      return {
        ...seg,
        narrativePurpose,
        requiresMultiShot,
        targetShotCount,
        subActions: subActions.length > 0 ? subActions : undefined,
        mainSubjectOrCharacter,
        referencedCharacters,
        storyEventOrAction,
        eventsDescribed,
        visualIntent,
      };
    });
  }

  /**
   * Decomposes a multi-action sentence into distinct clauses with estimated or acoustic sub-timing.
   * Handles English and Bengali sequential action markers.
   * Example: "সে ঘরে ঢুকে ভাঙা গ্লাসটি দেখে এবং ফোনটি তুলে নেয়।"
   * Yields:
   * 1. "সে ঘরে ঢুকে" (Entering room)
   * 2. "ভাঙা গ্লাসটি দেখে" (Observing broken glass)
   * 3. "ফোনটি তুলে নেয়" (Picking up phone)
   */
  public extractSubActionClauses(
    sentenceText: string,
    segStart: number,
    segEnd: number,
    wordTimestamps?: WordTimestamp[]
  ): Array<ExplanationSubAction> {
    const rawParts = sentenceText
      .split(/(?:[,;—\-]|\b(?:and|then|after that|suddenly|while)\b|(?:এবং|ও|তারপর|এরপর|তখন|হঠাৎ|যেখানে)|(?<=(?:ঢুকে|গিয়ে|এসে|দেখে|শুনে|বলে|নিয়ে|ফেলে|বসে|দাঁড়িয়ে))\s+)/i)
      .map((p) => (p || '').trim())
      .filter((p) => p.length >= 3 && !/^(and|then|after that|suddenly|while|এবং|ও|তারপর|এরপর|তখন|হঠাৎ|যেখানে)$/i.test(p));

    if (rawParts.length < 2) {
      return [];
    }

    const maxShots = Math.min(3, rawParts.length);
    const selectedParts = rawParts.slice(0, maxShots);
    const totalChars = selectedParts.reduce((sum, p) => sum + p.length, 0) || 1;
    const totalDur = Math.max(1.0, segEnd - segStart);

    const subActions: Array<ExplanationSubAction> = [];

    let currentStart = segStart;

    for (let i = 0; i < selectedParts.length; i++) {
      const clauseText = selectedParts[i];
      const isLast = i === selectedParts.length - 1;

      // Extract distinct keywords from clause
      const words = clauseText
        .toLowerCase()
        .replace(/[^a-zA-Z0-9\u0980-\u09FF\s]/g, ' ')
        .split(/\s+/)
        .filter((w) => w.length >= 2);

      let cStart = currentStart;
      let cEnd = segEnd;

      if (wordTimestamps && wordTimestamps.length > 0 && words.length > 0) {
        const firstMatch = wordTimestamps.find((wt) => wt.word && words.some((w) => wt.word.toLowerCase().includes(w) || w.includes(wt.word.toLowerCase())));
        const lastMatch = [...wordTimestamps].reverse().find((wt) => wt.word && words.some((w) => wt.word.toLowerCase().includes(w) || w.includes(wt.word.toLowerCase())));

        if (firstMatch && lastMatch && firstMatch.start <= lastMatch.end) {
          cStart = i === 0 ? segStart : Math.max(currentStart, Number(firstMatch.start.toFixed(3)));
          cEnd = isLast ? segEnd : Number(lastMatch.end.toFixed(3));
        } else {
          const charFraction = clauseText.length / totalChars;
          const clauseDur = isLast ? Number((segEnd - currentStart).toFixed(3)) : Number((charFraction * totalDur).toFixed(3));
          cEnd = isLast ? segEnd : Number((currentStart + clauseDur).toFixed(3));
        }
      } else {
        const charFraction = clauseText.length / totalChars;
        const clauseDur = isLast ? Number((segEnd - currentStart).toFixed(3)) : Number((charFraction * totalDur).toFixed(3));
        cEnd = isLast ? segEnd : Number((currentStart + clauseDur).toFixed(3));
      }

      let actionConcept = 'action_beat';
      if (/ঘরে|ঢুকে|এসে|গিয়ে|walk|enter/i.test(clauseText)) {
        actionConcept = 'movement_enter';
      } else if (/গ্লাস|ভাঙা|কাগজ|অস্ত্র|glass|broken|weapon|clue/i.test(clauseText)) {
        actionConcept = 'observation_object';
      } else if (/ফোন|কল|রিং|phone|call/i.test(clauseText)) {
        actionConcept = 'interaction_phone';
      }

      subActions.push({
        clauseIndex: i,
        clauseText,
        actionText: clauseText,
        actionConcept,
        startTime: cStart,
        endTime: cEnd,
        subStart: cStart,
        subEnd: cEnd,
        duration: Number((cEnd - cStart).toFixed(3)),
        keywords: words,
      });

      currentStart = cEnd;
    }

    return subActions;
  }

  /**
   * Synthesizes what visual shot is best suited for this narration.
   */
  private synthesizeVisualIntent(text: string, purpose: NarrativeStageType, multiShot: boolean): string {
    if (multiShot) {
      return 'Multi-shot sequence: Sequential coverage depicting action progression, key object detail, and character reaction.';
    }
    if (purpose === 'clue') {
      return 'Close-up or focused insert on the specific evidence or detail mentioned by narrator.';
    }
    if (purpose === 'reaction') {
      return 'Character reaction shot or emotional close-up communicating the weight of the moment.';
    }
    if (purpose === 'opening') {
      return 'Atmospheric establishing shot introducing the world and initial setting.';
    }
    if (purpose === 'climax') {
      return 'High-intensity dynamic coverage capturing the peak dramatic turning point.';
    }
    return `Narrative visual coverage supporting: "${text.slice(0, 50)}..."`;
  }
}

export const scriptAlignmentEngine = new ScriptAlignmentEngine();
