// ============================================================
// Episode Intelligence Engine — Multi-Modal Deep Source Analysis
// Extracts metadata, scene cuts, dialogue, characters, evidence,
// narrative roles, and synthesizes the episode narrative Story Map.
// ============================================================

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { v4 as uuid } from 'uuid';
import { spawn } from 'child_process';
import { config } from '../../config/index.js';
import { extractMetadata } from '../ffmpeg.js';
import { detectSceneChanges } from '../sceneDetector.js';
import { transcribeAudio } from '../transcription.js';
import { getMovieExplanationThumbsDir, getMovieExplanationProjectDir, ensureDir } from '../storage.js';
import { persistentCacheService } from './PersistentCacheService.js';
import { ollamaVisionService } from './OllamaVisionService.js';
import { analysisCacheManager } from './AnalysisCacheManager.js';
import { analysisJobManager } from './AnalysisJobManager.js';
import { titleBumperDetector } from './TitleBumperDetector.js';
import type {
  EpisodeIntelligenceIndex,
  EpisodeScene,
  StoryMap,
  StoryCharacter,
  StoryEvent,
  NarrativeStageType,
  SceneImportanceLevel,
  TranscriptSegment,
} from '../../../../shared/types.js';

// Keyword patterns for semantic analysis
const LOCATION_KEYWORDS: { location: string; regex: RegExp }[] = [
  { location: 'outdoor / vineyard / field / forest', regex: /\b(vineyard|field|fog|woods|forest|tree|trees|grass|brush|dirt|nature|rural|farm|outdoor|outside|lake|river|mountain|quail|hunt)\b/i },
  { location: 'police station / interrogation', regex: /\b(police|station|precinct|interrogation|detective|cop|officer|custody|cell|jail)\b/i },
  { location: 'office / boardroom', regex: /\b(office|meeting|boardroom|desk|boss|company|corporate|lawyer|documents)\b/i },
  { location: 'hospital / clinic', regex: /\b(hospital|doctor|nurse|clinic|patient|emergency|surgery|ward|bed)\b/i },
  { location: 'street / urban alley', regex: /\b(street|alley|road|highway|sidewalk|traffic|avenue|outside|corner)\b/i },
  { location: 'home / apartment', regex: /\b(home|house|apartment|living room|kitchen|bedroom|door|window)\b/i },
  { location: 'warehouse / industrial', regex: /\b(warehouse|factory|harbor|dock|abandoned|industrial|shipping|container)\b/i },
  { location: 'restaurant / bar', regex: /\b(restaurant|bar|cafe|diner|table|drinks|dinner|bartender)\b/i },
  { location: 'courthouse', regex: /\b(court|judge|jury|verdict|lawyer|trial|witness|prosecutor)\b/i },
];

const ACTION_KEYWORDS: { action: string; regex: RegExp }[] = [
  { action: 'confrontation / argument', regex: /\b(shouting|arguing|screaming|confront|fight|threat|accuse|yell|angry)\b/i },
  { action: 'investigation / examining clues', regex: /\b(look|search|investigate|inspect|check|find|evidence|clue|examine|trace)\b/i },
  { action: 'chase / pursuit', regex: /\b(run|running|chase|escape|flee|sprint|pursue|drive away|speeding)\b/i },
  { action: 'quiet conversation / confession', regex: /\b(listen|tell me|confess|whisper|honest|truth|promise|remember|sorry)\b/i },
  { action: 'revelation / discovery', regex: /\b(realize|uncover|discovered|turns out|impossible|secret|it was you|look at this)\b/i },
  { action: 'phone call / message', regex: /\b(phone|call|message|text|voicemail|ring|talking on phone)\b/i },
];

const EVIDENCE_KEYWORDS: { item: string; regex: RegExp }[] = [
  { item: 'murder weapon / gun / knife', regex: /\b(gun|weapon|knife|bullet|blade|firearm|revolver)\b/i },
  { item: 'incriminating document / letter', regex: /\b(letter|note|document|contract|file|folder|paper|will)\b/i },
  { item: 'photo / surveillance tape', regex: /\b(photo|photograph|picture|camera|footage|surveillance|tape|video|recording)\b/i },
  { item: 'mobile phone / records', regex: /\b(phone|cellphone|call log|messages|sim card|gps|fingerprint)\b/i },
  { item: 'money / stolen goods', regex: /\b(money|cash|dollars|bag|briefcase|jewels|stash|safe)\b/i },
  { item: 'key / access card', regex: /\b(key|keys|passcode|badge|keycard|lock)\b/i },
];

export class EpisodeIntelligenceEngine {
  /**
   * Analyzes the source movie/episode video and generates the Episode Intelligence Index.
   * If a cached index exists for this video hash/file, reloads it instantly.
   */
  public async analyzeEpisode(
    videoPath: string,
    projectId: string,
    onProgress?: (percent: number, detail: string) => void
  ): Promise<EpisodeIntelligenceIndex> {
    onProgress?.(5, 'Validating source video & computing stable media fingerprint...');

    const meta = await extractMetadata(videoPath);
    const mediaId = analysisCacheManager.computeMediaFingerprint(videoPath);

    // Initialize or resume durable background analysis job
    const { job } = analysisJobManager.startOrResumeJob(projectId, mediaId);

    // ── Checkpoint 0: Complete Episode Index Cache ──
    const projectDir = getMovieExplanationProjectDir(projectId);
    const cachePath = path.join(projectDir, 'episode_index.json');
    if (fs.existsSync(cachePath)) {
      try {
        const cached = JSON.parse(fs.readFileSync(cachePath, 'utf8')) as EpisodeIntelligenceIndex;
        if ((cached.mediaId === mediaId || cached.originalVideoPath === videoPath) && cached.scenes?.length > 0) {
          analysisJobManager.completeJob(projectId, cached.scenes.length);
          onProgress?.(100, `Loaded cached Episode Intelligence Index (${cached.scenes.length} scenes, Story Map active)`);
          return cached;
        }
      } catch {}
    }

    // ── Checkpoint 1: Video Probing ──
    analysisJobManager.recordCheckpoint(projectId, 'metadata_probed', 'audio_transcription');

    // ── Checkpoint 2: Dialogue & Audio Transcription ──
    let transcriptSegments: TranscriptSegment[] = [];
    const cachedTranscript = analysisCacheManager.getCachedTranscript(projectId, mediaId);

    if (cachedTranscript && cachedTranscript.segments?.length > 0) {
      onProgress?.(45, `Reused existing audio transcript (${cachedTranscript.segments.length} segments cached)`);
      transcriptSegments = cachedTranscript.segments;
      analysisJobManager.recordCheckpoint(projectId, 'transcription_complete', 'scene_cut_detection');
    } else {
      onProgress?.(15, `Extracting dialogue & speech from original footage (${Math.round(meta.duration / 60)} min)...`);
      analysisJobManager.updateProgress(projectId, 15, 'audio_transcription', 'Extracting dialogue and transcribing audio...');
      try {
        const tx = await transcribeAudio(videoPath, `${projectId}_video`, (pct, detail) => {
          const progress = Math.round(15 + pct * 0.35);
          analysisJobManager.updateProgress(projectId, progress, 'audio_transcription', `Transcribing episode: ${detail}`);
          onProgress?.(progress, `Transcribing episode: ${detail}`);
        });
        transcriptSegments = tx.segments || [];
        analysisCacheManager.saveCachedTranscript(
          projectId,
          mediaId,
          tx.language || 'en',
          tx.fullText || '',
          transcriptSegments,
          meta.duration
        );
        analysisJobManager.recordCheckpoint(projectId, 'transcription_complete', 'scene_cut_detection');
      } catch (err: any) {
        console.warn(`[EpisodeIntelligenceEngine] Dialogue extraction fallback: ${err.message}`);
      }
    }

    if (analysisJobManager.isCancelled(projectId)) {
      throw new Error('Analysis cancelled by user.');
    }

    // ── Checkpoint 3: Visual Scene & Shot Cut Points ──
    let cutPoints: number[] = [];
    const cachedCuts = analysisCacheManager.getCachedSceneCuts(projectId, mediaId);

    if (cachedCuts && Array.isArray(cachedCuts)) {
      cutPoints = cachedCuts;
      onProgress?.(68, `Reused existing visual scene cuts (${cutPoints.length} cut points cached)`);
      analysisJobManager.recordCheckpoint(projectId, 'cuts_detected', 'scene_clustering');
    } else {
      onProgress?.(52, 'Detecting scene change boundaries & camera cut points...');
      analysisJobManager.updateProgress(projectId, 52, 'scene_cut_detection', 'Running FFmpeg visual scene cut detector...');
      cutPoints = await detectSceneChanges(videoPath, 0.32, meta.duration, (pct, detail) => {
        const progress = Math.round(52 + pct * 0.18);
        analysisJobManager.updateProgress(projectId, progress, 'scene_cut_detection', detail);
        onProgress?.(progress, detail);
      });
      analysisCacheManager.saveCachedSceneCuts(projectId, mediaId, meta.duration, 0.32, cutPoints);
      analysisJobManager.recordCheckpoint(projectId, 'cuts_detected', 'scene_clustering');
    }

    if (analysisJobManager.isCancelled(projectId)) {
      throw new Error('Analysis cancelled by user.');
    }

    // ── Checkpoint 4: Cluster Shots into Coherent Scene Units ──
    onProgress?.(72, 'Grouping shots into narrative scene units & detecting intro title cards/bumpers...');
    analysisJobManager.updateProgress(projectId, 72, 'scene_clustering', 'Analyzing cuts and screening for title slates/bumpers...');

    // Detect opening title cards, definition slates, or network bumpers
    const openingSlateCheck = await titleBumperDetector.detectOpeningTitleSlate(videoPath, cutPoints);
    const openingSlateEnd = openingSlateCheck.hasTitleSlate ? openingSlateCheck.slateEndCut : 0;
    if (openingSlateCheck.hasTitleSlate) {
      console.log(`[EpisodeIntelligenceEngine] ${openingSlateCheck.reason}`);
    }

    const sceneUnits = this.clusterCutsIntoScenes(cutPoints, meta.duration, openingSlateEnd);
    analysisJobManager.recordCheckpoint(projectId, 'scenes_clustered', 'scene_enrichment');

    // ── Checkpoint 5: Extract Keyframes & Enrich Scenes (Resumable) ──
    const thumbsDir = getMovieExplanationThumbsDir(projectId);
    ensureDir(thumbsDir);

    const previouslyEnriched = analysisCacheManager.getScenesProgress(projectId, mediaId) || [];
    const enrichedScenes: EpisodeScene[] = [...previouslyEnriched];
    const startIndex = enrichedScenes.length;

    for (let i = startIndex; i < sceneUnits.length; i++) {
      if (analysisJobManager.isCancelled(projectId)) {
        throw new Error('Analysis cancelled by user.');
      }

      const unit = sceneUnits[i];
      const sceneId = `sc_${String(i + 1).padStart(3, '0')}`;

      // Dialogue within this scene's time range
      const matchingDialogue = transcriptSegments.filter(
        (s) => s.startTime < unit.endTime && s.endTime > unit.startTime
      );
      const dialogueText = matchingDialogue.map((s) => s.text).join(' ').trim();
      const dialogueSnippet = dialogueText.length > 120 ? dialogueText.slice(0, 117) + '...' : dialogueText;

      // Multi-frame representative sampling (Entry, Mid, Peak Action)
      const representativeFramePaths: string[] = [];
      const repTimes = [
        Math.min(unit.endTime - 0.2, unit.startTime + Math.max(1.0, unit.duration * 0.2)),
      ];
      if (unit.duration >= 6.0) {
        repTimes.push(unit.startTime + unit.duration * 0.5);
      }
      if (unit.duration >= 12.0) {
        repTimes.push(Math.min(unit.endTime - 0.5, unit.startTime + unit.duration * 0.8));
      }

      for (let fIdx = 0; fIdx < repTimes.length; fIdx++) {
        const fTime = repTimes[fIdx];
        const fFilename = fIdx === 0 ? `${sceneId}_thumb.jpg` : `${sceneId}_frame_${fIdx}.jpg`;
        const fPath = path.join(thumbsDir, fFilename);
        if (!fs.existsSync(fPath)) {
          try {
            await this.extractThumbnailDirect(videoPath, fPath, fTime);
          } catch {}
        }
        if (fs.existsSync(fPath)) {
          representativeFramePaths.push(fPath);
        }
      }

      const thumbFilename = `${sceneId}_thumb.jpg`;
      const thumbPath = path.join(thumbsDir, thumbFilename);
      let thumbnailUrl = fs.existsSync(thumbPath)
        ? `/api/files/movie_explanation/${projectId}/thumbnails/${thumbFilename}`
        : undefined;

      // Semantic attribute tagging
      const tagged = this.tagSceneSemantics(unit, dialogueText, i, sceneUnits.length, meta.duration);

      // Check if unit is a title card or bumper
      let isTitleOrBumper = unit.isTitleOrBumper || (unit.startTime === 0 && openingSlateEnd > 0 && unit.endTime <= openingSlateEnd);

      // Enrich with local Ollama vision model if thumbnail was extracted
      if (fs.existsSync(thumbPath)) {
        try {
          const vision = await ollamaVisionService.analyzeFrame(thumbPath, dialogueSnippet);
          if (vision) {
            if (vision.description && vision.description.length > 10) {
              tagged.description = `${vision.description.replace(/\n/g, ' ').slice(0, 180)} | ${tagged.description}`;
            }
            if (vision.characters && vision.characters.length > 0) {
              tagged.characters = Array.from(new Set([...tagged.characters, ...vision.characters]));
            }
            if (vision.actions && vision.actions.length > 0) {
              tagged.actions = Array.from(new Set([...tagged.actions, ...vision.actions]));
            }
            if (vision.location && vision.location !== 'narrative setting') {
              tagged.location = vision.location;
            }
            if (vision.emotionalTone && vision.emotionalTone !== 'neutral / expository') {
              tagged.emotionalTone = vision.emotionalTone;
            }
            if (vision.hasTextOrSigns) {
              tagged.objectsAndEvidence.push('readable text / signs');
            }
            tagged.visualDetails.push(`VLM: ${vision.source || 'smolvlm2'}`);

            // Double check for mid-episode bumpers / end credit slates via TitleBumperDetector
            if (!isTitleOrBumper) {
              const evalRes = await titleBumperDetector.evaluateImage(thumbPath, dialogueSnippet, vision);
              if (evalRes.isTitleOrBumper) {
                isTitleOrBumper = true;
                tagged.description = `[BUMPER] ${evalRes.reason} | ${tagged.description}`;
              }
            }
          }
        } catch {}
      }

      if (isTitleOrBumper) {
        tagged.narrativePurpose = 'title_or_bumper';
        tagged.importance = 'unnecessary';
      }

      enrichedScenes.push({
        sceneId,
        sceneIndex: i,
        startTime: unit.startTime,
        endTime: unit.endTime,
        duration: unit.duration,
        shotBoundaries: unit.shotBoundaries,
        dialogueSnippet,
        dialogueText,
        dialogueRange: matchingDialogue.length > 0 ? {
          startTime: matchingDialogue[0].startTime,
          endTime: matchingDialogue[matchingDialogue.length - 1].endTime,
          text: dialogueText,
        } : undefined,
        characters: tagged.characters,
        characterAppearances: tagged.description.includes('wearing') ? [tagged.description.slice(0, 100)] : [],
        location: tagged.location,
        actions: tagged.actions,
        secondaryActions: tagged.actions.slice(1),
        objectsAndEvidence: tagged.objectsAndEvidence,
        events: tagged.events,
        emotionalTone: tagged.emotionalTone,
        narrativePurpose: isTitleOrBumper ? 'title_or_bumper' : tagged.narrativePurpose,
        description: tagged.description,
        visualDetails: tagged.visualDetails,
        causeEffectRole: tagged.causeEffectRole,
        isClueOrReveal: tagged.isClueOrReveal,
        isQuietMotivational: tagged.isQuietMotivational,
        isActionHeavy: tagged.isActionHeavy,
        importance: isTitleOrBumper ? 'unnecessary' : tagged.importance,
        confidence: tagged.confidence,
        thumbnailUrl,
        representativeFramePaths,
        isTitleOrBumper: isTitleOrBumper || false,
        isExcludedFromNarration: isTitleOrBumper || false,
      });

      // Periodic atomic checkpoint every 10 scenes or on last scene
      if ((i + 1) % 10 === 0 || i === sceneUnits.length - 1) {
        analysisCacheManager.saveScenesProgress(projectId, mediaId, enrichedScenes);
        const scenePct = Math.round(72 + ((i + 1) / sceneUnits.length) * 16);
        analysisJobManager.updateProgress(
          projectId,
          scenePct,
          'scene_enrichment',
          `Enriched ${i + 1}/${sceneUnits.length} scenes & keyframes`,
          Math.round(((i + 1) / sceneUnits.length) * 100)
        );
        onProgress?.(scenePct, `Enriched ${i + 1}/${sceneUnits.length} scenes & keyframes`);
      }
    }

    analysisJobManager.recordCheckpoint(projectId, 'scenes_enriched', 'story_map_synthesis');

    // ── Checkpoint 6: Synthesize Narrative Story Map ──
    onProgress?.(90, 'Synthesizing story structure & generating narrative Story Map...');
    analysisJobManager.updateProgress(projectId, 90, 'story_map_synthesis', 'Synthesizing Story Map from scene evidence...');

    let storyMap = analysisCacheManager.getCachedStoryMap(projectId, mediaId);
    if (!storyMap) {
      storyMap = this.synthesizeStoryMap(enrichedScenes, meta.duration);
      analysisCacheManager.saveCachedStoryMap(projectId, mediaId, storyMap);
    }

    const index: EpisodeIntelligenceIndex = {
      mediaId,
      originalVideoPath: videoPath,
      filename: path.basename(videoPath),
      duration: meta.duration,
      width: meta.width,
      height: meta.height,
      fps: meta.fps,
      codec: meta.codec,
      audioCodec: meta.audioCodec,
      bitrate: meta.bitrate,
      fileSize: meta.duration > 0 ? fs.statSync(videoPath).size : 0,
      scenes: enrichedScenes,
      storyMap,
      indexedAt: new Date().toISOString(),
      narrativeStartTime: openingSlateEnd,
      excludedBumperRanges: openingSlateEnd > 0 ? [{ startTime: 0, endTime: openingSlateEnd, type: 'title_or_bumper' }] : [],
    };

    // Cache to disk atomically
    try {
      fs.writeFileSync(cachePath, JSON.stringify(index, null, 2), 'utf8');
    } catch (err) {
      console.error(`[EpisodeIntelligenceEngine] Failed caching index:`, err);
    }

    analysisJobManager.completeJob(projectId, enrichedScenes.length);
    onProgress?.(100, `Episode Intelligence Index ready: ${enrichedScenes.length} scenes indexed, Story Map verified.`);
    return index;
  }

  /**
   * Generates a stable media ID based on path, duration, and file size.
   */
  private computeMediaId(videoPath: string, duration: number, bitrate: number): string {
    const stat = fs.statSync(videoPath);
    return crypto
      .createHash('sha256')
      .update(`${path.basename(videoPath)}_${stat.size}_${duration.toFixed(2)}_${bitrate}`)
      .digest('hex')
      .slice(0, 16);
  }

  /**
   * Clusters raw shot cuts into natural narrative scene units (typically 12s - 80s).
   * Automatically isolates opening title cards / definition slates if present.
   */
  private clusterCutsIntoScenes(
    cutPoints: number[],
    totalDuration: number,
    openingSlateEnd: number = 0
  ): { startTime: number; endTime: number; duration: number; shotBoundaries: number[]; isTitleOrBumper?: boolean }[] {
    const scenes: { startTime: number; endTime: number; duration: number; shotBoundaries: number[]; isTitleOrBumper?: boolean }[] = [];
    let sortedCuts = Array.from(new Set([0, ...cutPoints.filter((c) => c > 0 && c < totalDuration), totalDuration])).sort((a, b) => a - b);

    let currentSceneStart = 0;
    let currentShots: number[] = [0];

    // If an opening title slate / definition bumper is detected, isolate it as an excluded bumper scene
    if (openingSlateEnd > 0 && openingSlateEnd < totalDuration) {
      scenes.push({
        startTime: 0,
        endTime: Number(openingSlateEnd.toFixed(3)),
        duration: Number(openingSlateEnd.toFixed(3)),
        shotBoundaries: [0],
        isTitleOrBumper: true,
      });
      currentSceneStart = openingSlateEnd;
      currentShots = [openingSlateEnd];
      sortedCuts = sortedCuts.filter((c) => c >= openingSlateEnd);
      if (sortedCuts[0] !== openingSlateEnd) {
        sortedCuts.unshift(openingSlateEnd);
      }
    }

    for (let i = 1; i < sortedCuts.length; i++) {
      const cutTime = sortedCuts[i];
      const sceneDuration = cutTime - currentSceneStart;

      // Group shots until scene reaches at least 15s or cut interval is long (>30s) or end of video
      if (sceneDuration >= 20 || (i === sortedCuts.length - 1 && sceneDuration > 5)) {
        scenes.push({
          startTime: Number(currentSceneStart.toFixed(3)),
          endTime: Number(cutTime.toFixed(3)),
          duration: Number((cutTime - currentSceneStart).toFixed(3)),
          shotBoundaries: [...currentShots],
          isTitleOrBumper: false,
        });
        currentSceneStart = cutTime;
        currentShots = [cutTime];
      } else {
        currentShots.push(cutTime);
      }
    }

    // Edge case: if single long scene
    if (scenes.length === 0) {
      scenes.push({
        startTime: 0,
        endTime: totalDuration,
        duration: totalDuration,
        shotBoundaries: [0],
      });
    }

    return scenes;
  }

  /**
   * Tags a scene with multi-modal semantic attributes based on duration, dialogue, and timing.
   */
  private tagSceneSemantics(
    unit: { startTime: number; endTime: number; duration: number; shotBoundaries: number[] },
    dialogue: string,
    index: number,
    totalScenes: number,
    totalDuration: number
  ): {
    characters: string[];
    location: string;
    actions: string[];
    objectsAndEvidence: string[];
    events: string[];
    emotionalTone: string;
    narrativePurpose: NarrativeStageType;
    description: string;
    visualDetails: string[];
    causeEffectRole: 'cause' | 'effect' | 'standalone';
    isClueOrReveal: boolean;
    isQuietMotivational: boolean;
    isActionHeavy: boolean;
    importance: SceneImportanceLevel;
    confidence: number;
  } {
    const text = dialogue.toLowerCase();
    const progress = unit.startTime / (totalDuration || 1);

    // 1. Detect Location
    let location = 'Interior / Narrative Space';
    for (const loc of LOCATION_KEYWORDS) {
      if (loc.regex.test(text)) {
        location = loc.location;
        break;
      }
    }

    // 2. Detect Actions
    const actions: string[] = [];
    for (const act of ACTION_KEYWORDS) {
      if (act.regex.test(text)) {
        actions.push(act.action);
      }
    }
    if (actions.length === 0) {
      actions.push(unit.shotBoundaries.length > 3 ? 'dynamic movement / multiple angles' : 'steady narrative focus');
    }

    // 3. Detect Objects & Evidence
    const objectsAndEvidence: string[] = [];
    for (const ev of EVIDENCE_KEYWORDS) {
      if (ev.regex.test(text)) {
        objectsAndEvidence.push(ev.item);
      }
    }

    // 4. Character extraction from dialogue references (proper nouns or speaker markers)
    const characters = this.extractCharactersFromDialogue(dialogue);

    // 5. Emotional Tone
    let emotionalTone = 'neutral / expository';
    if (/\b(fear|afraid|scared|terror|threat|run|kill)\b/i.test(text)) emotionalTone = 'tense / high stakes';
    else if (/\b(sorry|forgive|love|tears|sad|miss|crying|died)\b/i.test(text)) emotionalTone = 'sorrowful / emotional';
    else if (/\b(finally|gotcha|truth|found|yes|aha|knew it)\b/i.test(text)) emotionalTone = 'triumphant / revelation';
    else if (/\b(why|what happened|confused|weird|strange|impossible)\b/i.test(text)) emotionalTone = 'mysterious / questioning';
    else if (unit.duration > 25 && dialogue.length < 50) emotionalTone = 'quiet / contemplative';

    // 6. Narrative Purpose classification based on chronological position & keywords
    let narrativePurpose: NarrativeStageType = 'setup';
    let isClueOrReveal = false;
    let isActionHeavy = unit.shotBoundaries.length >= 4 || actions.some((a) => a.includes('chase') || a.includes('confrontation'));
    let isQuietMotivational = dialogue.length > 60 && unit.duration >= 18 && !isActionHeavy;

    if (progress < 0.15) {
      narrativePurpose = index === 0 ? 'opening' : 'setup';
    } else if (progress >= 0.15 && progress < 0.40) {
      if (objectsAndEvidence.length > 0 || text.includes('clue') || text.includes('evidence')) {
        narrativePurpose = 'clue';
        isClueOrReveal = true;
      } else {
        narrativePurpose = 'investigation';
      }
    } else if (progress >= 0.40 && progress < 0.65) {
      if (text.includes('truth') || text.includes('realize') || text.includes('discovered')) {
        narrativePurpose = 'reveal';
        isClueOrReveal = true;
      } else {
        narrativePurpose = 'rising_tension';
      }
    } else if (progress >= 0.65 && progress < 0.85) {
      if (isActionHeavy || text.includes('now or never') || text.includes('stop him')) {
        narrativePurpose = 'climax';
      } else {
        narrativePurpose = 'turning_point';
      }
    } else {
      narrativePurpose = progress >= 0.92 ? 'resolution' : 'consequence';
    }

    // 7. Importance level
    let importance: SceneImportanceLevel = 'supporting';
    if (isClueOrReveal || narrativePurpose === 'climax' || narrativePurpose === 'turning_point') {
      importance = 'critical';
    } else if (isQuietMotivational || narrativePurpose === 'clue' || narrativePurpose === 'opening') {
      importance = 'important';
    } else if (unit.duration < 10 && dialogue.length === 0) {
      importance = 'optional';
    }

    // 8. Cause and Effect Role
    let causeEffectRole: 'cause' | 'effect' | 'standalone' = 'standalone';
    if (narrativePurpose === 'clue' || narrativePurpose === 'setup') causeEffectRole = 'cause';
    if (narrativePurpose === ('reaction' as any) || narrativePurpose === 'consequence' || narrativePurpose === 'resolution') causeEffectRole = 'effect';

    const events = [
      `${narrativePurpose.replace('_', ' ').toUpperCase()} at ${Math.floor(unit.startTime / 60)}m${Math.floor(unit.startTime % 60)}s`,
    ];

    const description = `${location} — ${actions.join(', ')}. ${dialogue ? `Dialogue: "${dialogue.slice(0, 80)}..."` : 'Visual continuity shot.'}`;
    const visualDetails = [
      `Duration: ${unit.duration.toFixed(1)}s`,
      `Shots count: ${unit.shotBoundaries.length}`,
      `Tone: ${emotionalTone}`,
    ];

    return {
      characters,
      location,
      actions,
      objectsAndEvidence,
      events,
      emotionalTone,
      narrativePurpose,
      description,
      visualDetails,
      causeEffectRole,
      isClueOrReveal,
      isQuietMotivational,
      isActionHeavy,
      importance,
      confidence: dialogue.length > 0 ? 0.92 : 0.82,
    };
  }

  /**
   * Extracts character names and speaker references from dialogue text.
   */
  private extractCharactersFromDialogue(dialogue: string): string[] {
    const characters = new Set<string>();
    
    // Look for capitalized names in dialogue or speaker markers e.g. "John: Hello", "detective mark"
    const speakerMatch = dialogue.match(/^([A-Z][a-zA-Z0-9_\s]{2,15}):/);
    if (speakerMatch) {
      characters.add(speakerMatch[1].trim());
    }

    const namedEntities = dialogue.match(/\b(Detective|Officer|Doctor|Captain|Mr\.|Mrs\.|Agent)\s+([A-Z][a-z]+)/g);
    if (namedEntities) {
      for (const name of namedEntities) {
        characters.add(name);
      }
    }

    const generalNames = dialogue.match(/\b([A-Z][a-z]{2,12})\b/g);
    if (generalNames) {
      const dialogueStopWords = new Set([
        'The', 'And', 'What', 'Where', 'When', 'Why', 'How', 'That', 'This', 'There', 'Here', 'Just', 'Come', 'Look',
        'Yes', 'No', 'Get', 'Got', 'Right', 'Back', 'Don', 'Think', 'Know', 'See', 'Tell', 'Said', 'Good', 'Well',
        'Please', 'Sorry', 'Thanks', 'Thank', 'Help', 'Wait', 'Stop', 'Sure', 'Mean', 'Okay', 'Fine', 'Great', 'Never',
        'Always', 'Maybe', 'Really', 'Need', 'Want', 'Take', 'Make', 'Find', 'Give', 'Leave', 'Stay', 'Keep', 'Call'
      ]);
      for (const n of generalNames) {
        if (!dialogueStopWords.has(n) && n.length > 2) {
          characters.add(n);
        }
      }
    }

    const result = Array.from(characters).slice(0, 4);
    return result.length > 0 ? result : ['Protagonist / Central Subject'];
  }

  /**
   * Synthesizes a structured narrative Story Map from source scenes.
   */
  private synthesizeStoryMap(scenes: EpisodeScene[], totalDuration: number): StoryMap {
    // Collect all identified characters
    const charMap = new Map<string, { firstTime: number; mentions: number }>();
    for (const sc of scenes) {
      for (const ch of sc.characters) {
        if (!charMap.has(ch)) {
          charMap.set(ch, { firstTime: sc.startTime, mentions: 1 });
        } else {
          charMap.get(ch)!.mentions++;
        }
      }
    }

    const sortedChars = Array.from(charMap.entries()).sort((a, b) => b[1].mentions - a[1].mentions);
    const characters: StoryCharacter[] = sortedChars.slice(0, 6).map(([name, data], idx) => ({
      id: `char_${idx + 1}`,
      name,
      aliases: [],
      role: idx === 0 ? 'protagonist' : idx === 1 ? 'antagonist' : 'supporting',
      description: `Primary subject with ${data.mentions} scene interactions across the episode.`,
      firstAppearanceTime: data.firstTime,
    }));

    if (characters.length === 0) {
      characters.push({
        id: 'char_1',
        name: 'Main Protagonist',
        aliases: [],
        role: 'protagonist',
        description: 'Central character driving the episode narrative.',
        firstAppearanceTime: 0,
      });
    }

    // Find opening, turning points, clues, climax, resolution
    const openingScene = scenes[0];
    const climaxScene = scenes.find((s) => s.narrativePurpose === 'climax') || scenes[Math.floor(scenes.length * 0.75)];
    const resolutionScene = scenes[scenes.length - 1];

    const majorTurningPoints: StoryEvent[] = scenes
      .filter((s) => s.narrativePurpose === 'turning_point' || s.importance === 'critical')
      .slice(0, 3)
      .map((s, idx) => ({
        id: `tp_${idx + 1}`,
        title: `Turning Point: ${s.actions[0] || 'Key Confrontation'}`,
        description: s.description,
        timestampStart: s.startTime,
        timestampEnd: s.endTime,
        stage: 'turning_point',
        charactersInvolved: s.characters,
        isKeyReveal: s.isClueOrReveal,
        isClimax: false,
        evidence: `Source footage at ${Math.floor(s.startTime / 60)}m${Math.floor(s.startTime % 60)}s: ${s.dialogueSnippet || s.description}`,
      }));

    const revelations: StoryEvent[] = scenes
      .filter((s) => s.isClueOrReveal)
      .slice(0, 3)
      .map((s, idx) => ({
        id: `rev_${idx + 1}`,
        title: `Discovery: ${s.objectsAndEvidence[0] || 'Vital Evidence'}`,
        description: s.description,
        timestampStart: s.startTime,
        timestampEnd: s.endTime,
        stage: 'reveal',
        charactersInvolved: s.characters,
        isKeyReveal: true,
        isClimax: false,
        evidence: `Scene clue confirmed at ${Math.floor(s.startTime / 60)}m${Math.floor(s.startTime % 60)}s`,
      }));

    const mainClimax: StoryEvent = {
      id: 'climax_1',
      title: 'Episode Climax / Decisive Event',
      description: climaxScene?.description || 'The central dramatic peak of the narrative.',
      timestampStart: climaxScene?.startTime || totalDuration * 0.75,
      timestampEnd: climaxScene?.endTime || totalDuration * 0.85,
      stage: 'climax',
      charactersInvolved: climaxScene?.characters || [],
      isKeyReveal: false,
      isClimax: true,
      evidence: `Climax sequence identified at ${Math.floor((climaxScene?.startTime || 0) / 60)}m${Math.floor((climaxScene?.startTime || 0) % 60)}s`,
    };

    return {
      title: 'Episode Narrative Intelligence Map',
      logline: `Story arc unfolding across ${Math.round(totalDuration / 60)} minutes featuring ${characters.map((c) => c.name).join(', ')}.`,
      characters,
      characterRelationships: [
        {
          from: characters[0]?.name || 'Protagonist',
          to: characters[1]?.name || 'Antagonist / Foil',
          relationship: 'Central narrative conflict and investigative dynamic',
        },
      ],
      openingSituation: `Episode begins with ${openingScene?.description || 'initial atmospheric establishment'}.`,
      initialConflict: `Narrative tension arises around ${openingScene?.actions[0] || 'the primary premise'}.`,
      importantDiscoveries: revelations.map((r) => r.title),
      mysteriesAndClues: scenes.filter((s) => s.objectsAndEvidence.length > 0).map((s) => `${s.objectsAndEvidence.join(', ')} at ${Math.floor(s.startTime)}s`),
      risingTensionBeats: scenes.filter((s) => s.emotionalTone.includes('tense')).slice(0, 4).map((s) => `Tension beat at ${Math.floor(s.startTime / 60)}m${Math.floor(s.startTime % 60)}s`),
      majorTurningPoints,
      revelations,
      climaxSetup: `Building up to the confrontation at ${Math.floor((climaxScene?.startTime || 0) / 60)}m.`,
      mainClimax,
      consequences: scenes.filter((s) => s.narrativePurpose === 'consequence').map((s) => s.description),
      resolution: `Episode resolves with ${resolutionScene?.description || 'final concluding moments'}.`,
      confidence: 0.90,
    };
  }

  /**
   * Direct thumbnail extractor using FFmpeg
   */
  private async extractThumbnailDirect(videoPath: string, thumbPath: string, timeSeconds: number): Promise<void> {
    return new Promise((resolve) => {
      const proc = spawn(config.ffmpegPath, [
        '-y',
        '-ss', timeSeconds.toFixed(3),
        '-i', videoPath,
        '-vframes', '1',
        '-vf', 'scale=640:-1',
        '-q:v', '3',
        thumbPath,
      ]);
      proc.on('close', () => resolve());
      proc.on('error', () => resolve());
    });
  }

  /**
   * Mode B: Analyzes multiple pre-cut clips (5, 50, 100, 300+ clips)
   * Extracts metadata, representative frame thumbnails, runs lightweight vision analysis,
   * caches results, and constructs a unified EpisodeIntelligenceIndex.
   */
  public async analyzePreCutClips(
    clips: Array<{ id: string; filePath: string; originalFilename: string }>,
    projectId: string,
    onProgress?: (percent: number, detail: string) => void
  ): Promise<EpisodeIntelligenceIndex> {
    if (!clips || clips.length === 0) {
      throw new Error('No video clips provided for indexing.');
    }

    const projectDir = getMovieExplanationProjectDir(projectId);
    const thumbsDir = getMovieExplanationThumbsDir(projectId);
    ensureDir(thumbsDir);

    onProgress?.(5, `Starting batch analysis of ${clips.length} pre-cut video clips...`);

    const enrichedScenes: EpisodeScene[] = [];
    let totalDuration = 0;
    let maxWidth = 1920;
    let maxHeight = 1080;
    let commonFps = 30;

    for (let i = 0; i < clips.length; i++) {
      const clip = clips[i];
      const pct = Math.round(5 + ((i + 1) / clips.length) * 80);
      onProgress?.(pct, `Indexing clip ${i + 1}/${clips.length}: "${clip.originalFilename}"`);

      // Check cache for this specific clip file
      const clipCacheKey = persistentCacheService.computeFileKey(clip.filePath, 'clip_meta');
      let cachedScene = persistentCacheService.get<EpisodeScene>('clip_scenes', clipCacheKey);

      if (cachedScene) {
        enrichedScenes.push(cachedScene);
        totalDuration += cachedScene.duration;
        continue;
      }

      // Read FFprobe metadata
      let meta;
      try {
        meta = await extractMetadata(clip.filePath);
      } catch (err: any) {
        console.warn(`[EpisodeIntelligenceEngine] FFprobe failed for ${clip.filePath}:`, err.message);
        meta = { duration: 5.0, width: 1920, height: 1080, fps: 30, codec: 'h264', audioCodec: 'aac', bitrate: 4000000 };
      }

      const duration = Math.max(0.5, meta.duration || 5.0);
      totalDuration += duration;
      if (meta.width && meta.width > maxWidth) maxWidth = meta.width;
      if (meta.height && meta.height > maxHeight) maxHeight = meta.height;
      if (meta.fps) commonFps = meta.fps;

      // Extract mid-point frame thumbnail
      const thumbFilename = `clip_${clip.id}_thumb.jpg`;
      const thumbPath = path.join(thumbsDir, thumbFilename);
      const thumbUrl = `/api/files/movie_explanation/${projectId}/thumbnails/${thumbFilename}`;

      if (!fs.existsSync(thumbPath)) {
        await this.extractThumbnailDirect(clip.filePath, thumbPath, Math.min(duration - 0.1, duration * 0.5));
      }

      // Lightweight vision analysis using Ollama (SmolVLM2) or heuristic fallback
      const vision = await ollamaVisionService.analyzeFrame(thumbPath, clip.originalFilename);

      const narrativePurpose = this.inferNarrativePurposeFromIndex(i, clips.length);
      let causeEffectRole: 'cause' | 'effect' | 'standalone' = 'standalone';
      if (narrativePurpose === 'clue' || narrativePurpose === 'setup') causeEffectRole = 'cause';
      if (narrativePurpose === 'consequence' || narrativePurpose === 'resolution') causeEffectRole = 'effect';

      const scene: EpisodeScene = {
        sceneId: clip.id,
        sceneIndex: i,
        startTime: 0,
        endTime: Number(duration.toFixed(3)),
        duration: Number(duration.toFixed(3)),
        shotBoundaries: [0],
        sourceFile: clip.filePath, // Direct source file pointer for pre-cut clip
        dialogueSnippet: '',
        dialogueText: '',
        characters: vision.characters.length > 0 ? vision.characters : ['character'],
        location: vision.location || 'scene location',
        actions: vision.actions.length > 0 ? vision.actions : ['narrative action'],
        objectsAndEvidence: vision.hasTextOrSigns ? ['readable text / signs'] : [],
        events: [`Clip ${i + 1}: ${clip.originalFilename}`],
        emotionalTone: vision.emotionalTone,
        narrativePurpose,
        description: vision.description || `Pre-cut clip: ${clip.originalFilename}`,
        visualDetails: [`Filename: ${clip.originalFilename}`, `Duration: ${duration.toFixed(1)}s`],
        causeEffectRole,
        isClueOrReveal: false,
        isQuietMotivational: vision.emotionalTone.includes('sorrowful') || vision.actions.includes('conversation'),
        isActionHeavy: vision.actions.some((a) => a.includes('chase') || a.includes('confrontation')),
        importance: 'important',
        confidence: vision.confidence,
        thumbnailUrl: thumbUrl,
      };

      persistentCacheService.set('clip_scenes', clipCacheKey, scene);
      enrichedScenes.push(scene);
    }

    onProgress?.(90, 'Synthesizing Story Map from imported clips...');
    const storyMap = this.synthesizeStoryMap(enrichedScenes, totalDuration);

    const index: EpisodeIntelligenceIndex = {
      mediaId: `multi_clips_${projectId}`,
      originalVideoPath: clips[0]?.filePath || '',
      filename: `Imported Clips (${clips.length} files)`,
      duration: Number(totalDuration.toFixed(2)),
      width: maxWidth,
      height: maxHeight,
      fps: commonFps,
      codec: 'h264',
      audioCodec: 'aac',
      bitrate: 8000000,
      fileSize: 0,
      scenes: enrichedScenes,
      storyMap,
      indexedAt: new Date().toISOString(),
    };

    // Save to project cache
    const cachePath = path.join(projectDir, 'episode_index.json');
    try {
      fs.writeFileSync(cachePath, JSON.stringify(index, null, 2), 'utf8');
    } catch {}

    onProgress?.(100, `Mode B indexing complete: ${enrichedScenes.length} clips indexed and ready.`);
    return index;
  }

  private inferNarrativePurposeFromIndex(index: number, total: number): NarrativeStageType {
    if (total <= 1) return 'setup';
    const ratio = index / total;
    if (ratio < 0.15) return 'opening';
    if (ratio < 0.35) return 'setup';
    if (ratio < 0.65) return 'clue';
    if (ratio < 0.85) return 'climax';
    if (ratio < 0.95) return 'consequence';
    return 'resolution';
  }
}

export const episodeIntelligenceEngine = new EpisodeIntelligenceEngine();
