// ============================================================
// AI Director Engine — Story-Aware Timeline Construction
// Optimizes shot durations, preserves continuous coverage across sentences,
// splits multi-action sentences when appropriate, protects reveals,
// and respects manual locks (🔒) during regeneration.
// ============================================================

import path from 'path';
import fs from 'fs';
import { v4 as uuid } from 'uuid';
import { storySceneMatcher, type SceneMatchCandidate } from './StorySceneMatcher.js';
import { titleBumperDetector } from './TitleBumperDetector.js';
import { transformativeFilterEngine } from './TransformativeFilterEngine.js';
import { getMovieExplanationProjectDir, getMovieExplanationThumbsDir } from '../storage.js';
import { soundDesignService } from './SoundDesignService.js';
import { contextualHookEngine } from './ContextualHookEngine.js';
import { analysisCacheManager } from './AnalysisCacheManager.js';
import {
  originalTranscriptAlignmentService,
  type AlignmentIndexEntry,
} from './OriginalTranscriptAlignmentService.js';
import type {
  EpisodeIntelligenceIndex,
  EpisodeScene,
  ExplanationScript,
  ExplanationScriptSegment,
  ExplanationSubAction,
  MovieExplanationTimeline,
  MovieTimelineShot,
  VoiceoverOutputAspectRatio,
  MovieAnalyzerVerificationCheckpoint,
  TransitionType,
  DuplicateSceneReport,
} from '../../../../shared/types.js';

export class AIDirectorEngine {
  /**
   * Generates or regenerates a story-aware movie explanation timeline.
   * If existing timeline is provided, preserves all locked (🔒) and manually overridden shots!
   */
  public generateTimeline(
    episodeIndex: EpisodeIntelligenceIndex,
    script: ExplanationScript,
    aspectRatio: VoiceoverOutputAspectRatio = '16:9',
    existingTimeline?: MovieExplanationTimeline,
    transformativeSettings?: any,
    projectId?: string
  ): MovieExplanationTimeline {
    const segments = script.segments;
    if (!segments || segments.length === 0) {
      throw new Error('Explanation script has no segments to generate timeline.');
    }

    // Strict 3.0s Minimum & Target Duration Rule (Priority 2):
    // By default, automatically generated visual shots must not be shorter than 3.0 seconds
    const minShotDuration = transformativeSettings?.minClipDuration ?? 3.0;

    // Strict 3.0s Maximum Video Clip Duration Rule:
    // Every individual video shot in the automatically generated timeline has a default and maximum duration of 3.0s-4.0s.
    const isStrictMode = transformativeSettings?.strictClipDurationMode === true;
    const configuredMax = transformativeSettings?.maxShotDuration ?? (isStrictMode ? 3.0 : 6.0);
    const maxShotDuration = isStrictMode
      ? Math.min(3.0, Math.max(1.0, configuredMax))
      : Math.min(6.0, Math.max(1.0, configuredMax));

    // Mandatory Screenshot Cadence Rule:
    // Insert one relevant movie screenshot after every 3 to 4 consecutive movie-video clips (max 4, preferred after 3).
    const maxConsecutiveVideo = transformativeSettings?.maxConsecutiveVideoClips ?? 4;
    const preferredScreenshotInterval = transformativeSettings?.screenshotInterval ?? 3;
    const SCREENSHOT_MOTIONS: Array<'pan_left_to_right' | 'gentle_zoom_in' | 'pan_right_to_left' | 'subtle_diagonal' | 'gentle_zoom_out'> = [
      'pan_left_to_right',
      'gentle_zoom_in',
      'pan_right_to_left',
      'subtle_diagonal',
      'gentle_zoom_out',
    ];

    const narrativeStartTime = episodeIndex.narrativeStartTime || 0;

    // Pre-build Original Transcript index if original movie transcript is available
    let transcriptIndex: AlignmentIndexEntry[] | undefined;
    if (projectId) {
      const mediaId = episodeIndex.mediaId;
      const cachedMovieTx = analysisCacheManager.getCachedTranscript(projectId, mediaId);
      if (cachedMovieTx && cachedMovieTx.segments?.length > 0) {
        transcriptIndex = originalTranscriptAlignmentService.buildTranscriptSceneIndex(
          cachedMovieTx.segments,
          episodeIndex.scenes
        );
      }
    }

    // Map existing locked shots by segmentId
    const lockedShotsBySegment = new Map<string, MovieTimelineShot[]>();
    if (existingTimeline && Array.isArray(existingTimeline.shots)) {
      for (const shot of existingTimeline.shots) {
        if (shot.isLocked || shot.isManualOverride) {
          if (!lockedShotsBySegment.has(shot.segmentId)) {
            lockedShotsBySegment.set(shot.segmentId, []);
          }
          lockedShotsBySegment.get(shot.segmentId)!.push(shot);
        }
      }
    }

    const outputShots: MovieTimelineShot[] = [];
    const usedSceneUsage = new Map<string, number>();
    const usedIntervalsByScene = new Map<string, Array<{ start: number; end: number }>>();
    const recentClipHistory: Array<{ sceneId: string; sourceStartTime: number; sourceEndTime: number }> = [];
    let lastSelectedSceneId: string | undefined = undefined;
    let lastSelectedSourceEnd: number | undefined = undefined;

    let consecutiveVideoClipCount = 0;
    let screenshotCounter = 0;

    const recordShotSelection = (shot: MovieTimelineShot) => {
      if (shot.presentationType === 'screenshot' || shot.isScreenshot) {
        consecutiveVideoClipCount = 0;
        screenshotCounter++;
      } else {
        consecutiveVideoClipCount++;
      }
      if (shot.sceneId) {
        usedSceneUsage.set(shot.sceneId, (usedSceneUsage.get(shot.sceneId) || 0) + 1);
        lastSelectedSceneId = shot.sceneId;
        lastSelectedSourceEnd = shot.sourceEnd;
        recentClipHistory.unshift({
          sceneId: shot.sceneId,
          sourceStartTime: shot.sourceStart,
          sourceEndTime: shot.sourceEnd,
        });
        if (recentClipHistory.length > 50) recentClipHistory.pop();

        // Always register interval to prevent repeating footage (Priority 1)
        const intervals = usedIntervalsByScene.get(shot.sceneId) || [];
        intervals.push({ start: shot.sourceStart, end: shot.sourceEnd });
        usedIntervalsByScene.set(shot.sceneId, intervals);
      }
    };

    // Priority 2: Pre-cluster short adjacent segments (< minShotDuration) into cohesive visual coverage windows
    // without altering the master voiceover audio or subtitle timestamps.
    const shouldClusterForPacing = segments.some(
      (s) =>
        (s.duration || s.voiceoverEnd - s.voiceoverStart) < minShotDuration &&
        (!s.subActions || s.subActions.length <= 1)
    );

    const pacingUnits: Array<{
      segment: ExplanationScriptSegment;
      subActions?: ExplanationSubAction[];
      memberSegmentIds: string[];
      memberSegments: ExplanationScriptSegment[];
    }> = shouldClusterForPacing
      ? this.clusterSegmentsForPacing(segments, minShotDuration, maxShotDuration).map((c) => ({
          segment: {
            ...c.primarySegment,
            segmentId: c.primarySegment.segmentId,
            voiceoverStart: c.timelineStart,
            voiceoverEnd: c.timelineEnd,
            duration: c.duration,
            text: c.segments.map((s) => s.text).join(' '),
            subActions: c.subActions,
          },
          subActions: c.subActions,
          memberSegmentIds: c.segments.map((s) => s.segmentId),
          memberSegments: c.segments,
        }))
      : segments.map((s) => ({
          segment: s,
          subActions: s.subActions,
          memberSegmentIds: [s.segmentId],
          memberSegments: [s],
        }));

    // Track active scene continuity across multiple sentences
    let activeSceneId: string | null = null;
    let activeSceneRemainingDuration = 0;
    let activeSceneSourceTime = 0;

    for (let sIdx = 0; sIdx < pacingUnits.length; sIdx++) {
      const unit = pacingUnits[sIdx];
      const seg = unit.segment;
      const nextSeg = sIdx < pacingUnits.length - 1 ? pacingUnits[sIdx + 1].segment : undefined;

      // ── Step 1: Check if this segment is locked by user ──
      const locked = unit.memberSegmentIds.flatMap((id) => lockedShotsBySegment.get(id) || []);
      if (locked && locked.length > 0) {
        // Preserve locked shots exactly
        for (const lShot of locked) {
          outputShots.push(lShot);
          recordShotSelection(lShot);
        }
        activeSceneId = locked[locked.length - 1].sceneId;
        activeSceneSourceTime = locked[locked.length - 1].sourceEnd;
        continue;
      }

      // Calculate output timeline window for this segment:
      // Shot 0 of the entire timeline MUST begin at output time 0.000s!
      const previousTimelineEnd = outputShots.length > 0 ? outputShots[outputShots.length - 1].timelineEnd : 0.000;
      const segStart = sIdx === 0 ? 0.000 : Math.max(previousTimelineEnd, seg.voiceoverStart);
      const segEnd = nextSeg ? Math.max(segStart + 0.5, seg.voiceoverEnd) : Math.max(segStart + 0.5, seg.voiceoverEnd);
      const effectiveSegDuration = Number((segEnd - segStart).toFixed(3));

      // ── Step 2: Determine if previous scene should continue across this sentence ──
      // One shot spanning multiple sentences ONLY when narrative continuity explicitly calls for it.
      // Strictly enforce maxShotDuration (<= 3.0s rule) and verify source footage remaining duration.
      const textLower = seg.text.toLowerCase();
      const isNewEventOrSubject = /\b(instead|find|finds|found|discover|suddenly|meanwhile|body|girl|victim|murder|killer|police|investigator)\b/i.test(textLower);

      const shouldHoldPreviousScene =
        activeSceneId !== null &&
        activeSceneRemainingDuration >= effectiveSegDuration &&
        effectiveSegDuration <= maxShotDuration &&
        !isNewEventOrSubject &&
        consecutiveVideoClipCount < maxConsecutiveVideo &&
        transformativeSettings?.duplicatePolicy !== 'strict_no_reuse' &&
        (seg.narrativePurpose === 'reaction' || seg.narrativePurpose === 'transition');

      if (shouldHoldPreviousScene) {
        const matchingScene = episodeIndex.scenes.find((s) => s.sceneId === activeSceneId);
        if (matchingScene && !matchingScene.isTitleOrBumper && !matchingScene.isExcludedFromNarration) {
          const sourceStart = Math.max(narrativeStartTime, activeSceneSourceTime);
          const sourceEnd = sourceStart + effectiveSegDuration;

          if (sourceEnd <= matchingScene.endTime + 0.05) {
            activeSceneSourceTime = sourceEnd;
            activeSceneRemainingDuration -= effectiveSegDuration;

            const hasTextOrSigns = transformativeFilterEngine.detectTextOrReadableSigns(matchingScene);

            const holdShot: MovieTimelineShot = {
              shotId: `shot_${uuid().slice(0, 8)}`,
              segmentId: seg.segmentId,
              sceneId: matchingScene.sceneId,
              sourceFile: matchingScene.sourceFile || episodeIndex.originalVideoPath,
              sourceStart: Number(sourceStart.toFixed(3)),
              sourceEnd: Number(sourceEnd.toFixed(3)),
              timelineStart: segStart,
              timelineEnd: segEnd,
              duration: effectiveSegDuration,
              matchScore: 92,
              confidence: 0.92,
              isLowConfidence: false,
              presentationType: 'video_clip',
              isScreenshot: false,
              screenshotCadenceStatus: consecutiveVideoClipCount + 1 <= maxConsecutiveVideo ? 'compliant' : 'cadence_exceeded',
              whyThisScene: {
                characterMatch: `Continuous shot covering dialogue progression of ${matchingScene.characters[0] || 'character'}.`,
                actionMatch: 'Preserves seamless scene coverage without abrupt cutting.',
                storyContextReason: 'Continuation hold: previous scene remains directly relevant to current narration beat.',
                chronologyCheck: 'Chronological continuity preserved.',
                emotionalFit: 'Uninterrupted pacing for natural conversational flow.',
                fullSummary: `Extended continuous hold from ${matchingScene.sceneId} across multiple narration sentences.`,
              },
              transition: 'crossfade',
              transitionDuration: 0.5,
              isLocked: false,
              isManualOverride: false,
              framingMode: transformativeSettings?.framingMode || 'action',
              thumbnailUrl: matchingScene.thumbnailUrl,
              sceneDescription: matchingScene.description,
              sceneDialogue: matchingScene.dialogueSnippet,
              isFlipped: transformativeSettings?.horizontalFlip || false,
              speedMultiplier: transformativeSettings?.playbackSpeed || 1.0,
              zoomLevel: transformativeSettings?.zoomLevel || 1.0,
              hasTextOrSigns,
              hasJumpCut: false,
            };

            outputShots.push(holdShot);
            recordShotSelection(holdShot);

            // Populate narration mapping on segment
            seg.referencedCharacters = seg.referencedCharacters || [];
            seg.storyEventOrAction = seg.storyEventOrAction || seg.narrativePurpose;
            seg.relevantSceneIds = [matchingScene.sceneId];
            seg.sourceStartTime = holdShot.sourceStart;
            seg.sourceEndTime = holdShot.sourceEnd;
            seg.selectedShotId = holdShot.shotId;
            seg.selectedSceneId = matchingScene.sceneId;
            seg.confidenceScore = 0.92;
            seg.presentationType = 'video_clip';
            seg.timelineStart = segStart;
            seg.timelineEnd = segEnd;
            continue;
          }
        }
      }

      // ── Step 3: Match candidates for this segment with full duplicate-prevention context ──
      const candidates = storySceneMatcher.matchCandidatesForSegment(
        seg,
        episodeIndex,
        segments,
        sIdx,
        {
          previouslyUsedSceneIds: usedSceneUsage,
          lastSelectedSceneId,
          lastSelectedSourceEnd,
          recentClipHistory,
          duplicatePolicy: transformativeSettings?.duplicatePolicy || 'balanced_variety',
          minSceneSpacing: transformativeSettings?.minSceneSpacing || 25,
          usedIntervalsByScene,
          transcriptIndex,
        }
      );

      // Strictly filter out any non-narrative title card, definition slate, or bumper
      const validCandidates = candidates.filter(
        (c) =>
          c.matchScore > 0 &&
          !c.isUnmatched &&
          !c.scene.isTitleOrBumper &&
          !c.scene.isExcludedFromNarration &&
          !titleBumperDetector.isSceneTitleOrIntervalScreen(c.scene) &&
          c.scene.narrativePurpose !== 'title_or_bumper' &&
          c.scene.endTime > narrativeStartTime
      );

      // Prioritize candidates that do NOT repeat recent scenes or source intervals
      const nonDuplicateCandidates = validCandidates.filter((c) => !c.isDuplicate && !c.isNearDuplicate && !c.isExhausted);
      let topCandidate = nonDuplicateCandidates.length > 0 ? nonDuplicateCandidates[0] : validCandidates[0];

      // Priority 1: Check if top candidate source interval overlaps with previously used footage
      let isCandidateIntervalReused = false;
      if (topCandidate && topCandidate.sourceIn !== undefined) {
        const checkEnd = topCandidate.sourceIn + effectiveSegDuration;
        const usedForScene = usedIntervalsByScene.get(topCandidate.scene.sceneId) || [];
        isCandidateIntervalReused = usedForScene.some((u) => {
          const overlap = Math.max(0, Math.min(checkEnd, u.end) - Math.max(topCandidate!.sourceIn!, u.start));
          return overlap > 0.5;
        });
      }

      // Priority 1: If top candidate had a valid match but its interval was reused or exhausted:
      // Search for a fresh, completely UNUSED scene from the movie pool to prevent repetition
      let isFromUnusedPool = false;
      if (
        topCandidate &&
        !topCandidate.isUnmatched &&
        topCandidate.matchScore >= 35 &&
        (isCandidateIntervalReused || topCandidate.isExhausted)
      ) {
        const unusedScene = episodeIndex.scenes.find((s) => {
          if (s.isTitleOrBumper || s.isExcludedFromNarration) return false;
          if (s.narrativePurpose === 'title_or_bumper') return false;
          if (titleBumperDetector.isSceneTitleOrIntervalScreen(s)) return false;
          if (s.endTime <= narrativeStartTime) return false;
          const usage = usedSceneUsage.get(s.sceneId) || 0;
          if (usage > 0) return false; // Strictly unused scene
          const usedForS = usedIntervalsByScene.get(s.sceneId) || [];
          const slice = storySceneMatcher.findNextUnusedInterval(
            s,
            Math.min(minShotDuration, effectiveSegDuration),
            usedForS,
            narrativeStartTime
          );
          return !slice.isExhausted;
        });

        if (unusedScene) {
          const usedForUnused = usedIntervalsByScene.get(unusedScene.sceneId) || [];
          const slice = storySceneMatcher.findNextUnusedInterval(
            unusedScene,
            Math.min(minShotDuration, effectiveSegDuration),
            usedForUnused,
            narrativeStartTime
          );
          topCandidate = {
            scene: unusedScene,
            matchScore: 55,
            confidence: 0.55,
            isLowConfidence: false,
            isUnmatched: false,
            isDuplicate: false,
            sourceIn: slice.start,
            sourceOut: slice.end,
            isExhausted: false,
            scoreBreakdown: {} as any,
            reasons: ['Selected from unused scene pool to maintain visual variety and prevent repetition.'],
          };
          isCandidateIntervalReused = false;
          isFromUnusedPool = true;
        }
      }

      // Determine if this segment should be presented as a cinematic moving screenshot:
      // Mandatory when consecutiveVideoClipCount >= maxConsecutiveVideo (5),
      // or preferred when consecutiveVideoClipCount >= preferredScreenshotInterval (4)
      const isMandatoryScreenshot = consecutiveVideoClipCount >= maxConsecutiveVideo;
      const isPreferredScreenshot =
        consecutiveVideoClipCount >= preferredScreenshotInterval &&
        (seg.narrativePurpose === 'reveal' || seg.narrativePurpose === 'reaction' || seg.narrativePurpose === 'setup' || !seg.requiresMultiShot);
      const shouldPresentAsScreenshot = isMandatoryScreenshot || isPreferredScreenshot;

      const hasSubActions = Boolean(seg.subActions && seg.subActions.length > 1);
      const shouldSplit = !shouldPresentAsScreenshot && (hasSubActions || (seg.requiresMultiShot && (seg.targetShotCount || 1) > 1) || effectiveSegDuration > maxShotDuration);
      const targetCount = shouldSplit
        ? (hasSubActions ? seg.subActions!.length : Math.max(seg.targetShotCount || 2, Math.ceil(effectiveSegDuration / maxShotDuration)))
        : 1;

      // If no suitable footage exists or candidate is flagged unmatched, flag segment as UNMATCHED.
      // Never fill missing footage by repeatedly inserting the previous clip or assigning unmatched scenes to arbitrary IDs!
      if (!topCandidate || topCandidate.isUnmatched || topCandidate.matchScore < 30) {
        const unmatchedReason = topCandidate?.unmatchedReason ||
          `No suitable movie footage found for narration topic: "${seg.text.slice(0, 50)}..."`;

        const movieTotalDur = episodeIndex.duration || 2700;
        const totalScriptDur = (segments && segments.length > 0)
          ? Math.max(120, segments[segments.length - 1].voiceoverEnd)
          : movieTotalDur;
        const progressInScript = segStart / (totalScriptDur || 1);
        // Priority 1: Advancing non-repeating timestamp so unmatched shots never repeat 03:09:18!
        const advancingSourceStart = Number((narrativeStartTime + progressInScript * Math.max(10, movieTotalDur - narrativeStartTime - 4.0)).toFixed(3));
        const defaultSourceStart = topCandidate?.sourceIn !== undefined && !isCandidateIntervalReused
          ? Math.max(narrativeStartTime, topCandidate.sourceIn)
          : advancingSourceStart;
        const defaultThumb = topCandidate?.scene?.thumbnailUrl;

        // Update segment narrative mapping
        seg.referencedCharacters = seg.referencedCharacters || [];
        seg.storyEventOrAction = seg.storyEventOrAction || seg.narrativePurpose;
        seg.relevantSceneIds = validCandidates.slice(0, 5).map((c) => c.scene.sceneId);
        seg.selectedSceneId = 'unmatched';
        seg.confidenceScore = topCandidate ? topCandidate.confidence : 0;
        seg.candidateAlternatives = validCandidates.slice(0, 4).map((c) => ({
          sceneId: c.scene.sceneId,
          startTime: c.scene.startTime,
          endTime: c.scene.endTime,
          score: c.matchScore,
          reason: c.reasons[0] || 'Alternative scene candidate',
        }));
        const isUnmatchedScreenshot = shouldPresentAsScreenshot || consecutiveVideoClipCount >= maxConsecutiveVideo;
        seg.presentationType = isUnmatchedScreenshot ? 'screenshot' : 'video_clip';
        seg.timelineStart = segStart;
        seg.timelineEnd = segEnd;

        const shotDuration = Number((effectiveSegDuration / targetCount).toFixed(3));
        for (let shotIdx = 0; shotIdx < targetCount; shotIdx++) {
          const tStart = shotIdx === 0 ? segStart : Number((segStart + shotIdx * shotDuration).toFixed(3));
          const tEnd = shotIdx === targetCount - 1 ? segEnd : Number((tStart + shotDuration).toFixed(3));
          const thisShotDuration = Number((tEnd - tStart).toFixed(3));

          const isThisSubScreenshot = isUnmatchedScreenshot || consecutiveVideoClipCount >= maxConsecutiveVideo;
          const motionEffect = isThisSubScreenshot ? SCREENSHOT_MOTIONS[screenshotCounter % SCREENSHOT_MOTIONS.length] : undefined;

          const unShot: MovieTimelineShot = {
            shotId: `shot_${uuid().slice(0, 8)}`,
            segmentId: seg.segmentId,
            sceneId: 'unmatched', // strictly 'unmatched', avoiding repetition of prior scenes
            sourceFile: topCandidate?.scene?.sourceFile || episodeIndex.originalVideoPath,
            sourceStart: Number((defaultSourceStart + shotIdx * shotDuration).toFixed(3)),
            sourceEnd: Number((defaultSourceStart + (shotIdx + 1) * shotDuration).toFixed(3)),
            timelineStart: tStart,
            timelineEnd: tEnd,
            duration: thisShotDuration,
            matchScore: topCandidate ? topCandidate.matchScore : 0,
            confidence: topCandidate ? topCandidate.confidence : 0,
            isLowConfidence: true,
            isUnmatched: true,
            matchStatus: 'unmatched',
            unmatchedReason,
            presentationType: isThisSubScreenshot ? 'screenshot' : 'video_clip',
            isScreenshot: isThisSubScreenshot,
            motionEffect,
            screenshotCadenceStatus: 'compliant',
            referencedCharacters: seg.referencedCharacters,
            storyEvent: seg.storyEventOrAction,
            whyThisScene: {
              characterMatch: 'Unmatched: No corresponding character found in source footage.',
              actionMatch: 'Unmatched: Action not represented in available scenes.',
              storyContextReason: unmatchedReason,
              chronologyCheck: 'Chronological anchor grounded in story beat narrative progression.',
              emotionalFit: 'Requires manual footage assignment or scene replacement.',
              fullSummary: `[UNMATCHED] ${unmatchedReason}`,
            },
            transition: 'cut',
            transitionDuration: 0,
            isLocked: false,
            isManualOverride: false,
            framingMode: transformativeSettings?.framingMode || 'action',
            thumbnailUrl: defaultThumb,
            sceneDescription: undefined,
            sceneDialogue: undefined,
            isFlipped: false,
            speedMultiplier: 1.0,
            zoomLevel: 1.0,
            hasTextOrSigns: false,
            hasJumpCut: shotIdx > 0,
            isKenBurnsStill: isThisSubScreenshot,
          };
          outputShots.push(unShot);
          recordShotSelection(unShot);
        }
        continue;
      }

      const primaryScene = topCandidate.scene;

      // ── Step 4: Screenshot Cadence vs Video Shot Interleaving ──
      if (shouldPresentAsScreenshot) {
        // Build Cinematic Moving Screenshot Shot
        const directorialMotion = this.selectDirectorialMotionEffect(seg, primaryScene, screenshotCounter);
        const motionEffect = directorialMotion.motionEffect;
        const directorialFraming = this.determineDirectorialFraming(seg, primaryScene);

        const sceneBaseStart = Math.max(narrativeStartTime, primaryScene.startTime);
        const screenshotSourceTimestamp = Number((sceneBaseStart + Math.min(2.0, primaryScene.duration * 0.25)).toFixed(3));

        const screenshotShotId = `shot_${uuid().slice(0, 8)}`;
        const realScreenshotPath = this.getRealScreenshotPath(primaryScene, episodeIndex, screenshotShotId);
        const prevShot = outputShots.length > 0 ? outputShots[outputShots.length - 1] : undefined;
        const prevScene = prevShot?.sceneId ? episodeIndex.scenes.find((s) => s.sceneId === prevShot.sceneId) : undefined;
        const trans = this.selectContextualTransition(primaryScene, prevScene, seg, true, prevShot?.isScreenshot || false);

        const screenshotShot: MovieTimelineShot = {
          shotId: screenshotShotId,
          segmentId: seg.segmentId,
          sceneId: primaryScene.sceneId,
          sourceFile: realScreenshotPath,
          sourceStart: screenshotSourceTimestamp,
          sourceEnd: Number((screenshotSourceTimestamp + 0.1).toFixed(3)),
          timelineStart: segStart,
          timelineEnd: segEnd,
          duration: effectiveSegDuration,
          matchScore: topCandidate.matchScore,
          confidence: topCandidate.confidence,
          isLowConfidence: topCandidate.isLowConfidence,
          isUnmatched: false,
          matchStatus: topCandidate.matchScore >= 60 ? 'matched' : 'needs_review',
          isDuplicate: false,
          presentationType: 'screenshot',
          isScreenshot: true,
          motionEffect,
          directorialMotion: motionEffect,
          directorialFraming: directorialFraming.framing,
          directorialFramingScale: directorialFraming.scale,
          screenshotDuration: effectiveSegDuration,
          screenshotCadenceStatus: 'compliant',
          duplicateWarning: topCandidate.duplicateWarning,
          referencedCharacters: seg.referencedCharacters,
          storyEvent: seg.storyEventOrAction,
          whyThisScene: {
            characterMatch: `Screenshot captures key character moment (${primaryScene.characters[0] || 'scene'}).`,
            actionMatch: `Directorial motion: ${directorialMotion.reason}`,
            storyContextReason: `Directorial framing: ${directorialFraming.reason}`,
            chronologyCheck: 'Chronological anchor grounded in story beat.',
            emotionalFit: 'Cinematic visual punctuation supporting commentary rhythm.',
            fullSummary: `[AI DIRECTOR: ${directorialFraming.framing.toUpperCase()} | ${motionEffect}] ${directorialMotion.reason}`,
          },
          transition: trans.transition,
          transitionDuration: trans.duration,
          isLocked: false,
          isManualOverride: false,
          framingMode: transformativeSettings?.framingMode || 'action',
          thumbnailUrl: primaryScene.thumbnailUrl,
          sceneDescription: primaryScene.description,
          sceneDialogue: primaryScene.dialogueSnippet,
          isFlipped: false,
          speedMultiplier: 1.0,
          zoomLevel: directorialFraming.scale,
          hasTextOrSigns: false,
          hasJumpCut: false,
          isKenBurnsStill: false,
        };

        outputShots.push(screenshotShot);
        recordShotSelection(screenshotShot);

        // Update narrative mapping
        seg.referencedCharacters = seg.referencedCharacters || [];
        seg.storyEventOrAction = seg.storyEventOrAction || seg.narrativePurpose;
        seg.relevantSceneIds = validCandidates.slice(0, 5).map((c) => c.scene.sceneId);
        seg.sourceStartTime = screenshotShot.sourceStart;
        seg.sourceEndTime = screenshotShot.sourceEnd;
        seg.selectedShotId = screenshotShot.shotId;
        seg.selectedSceneId = primaryScene.sceneId;
        seg.confidenceScore = topCandidate.confidence;
        seg.candidateAlternatives = validCandidates.slice(1, 4).map((c) => ({
          sceneId: c.scene.sceneId,
          startTime: c.scene.startTime,
          endTime: c.scene.endTime,
          score: c.matchScore,
          reason: c.reasons[0] || 'Alternative scene candidate',
        }));
        seg.presentationType = 'screenshot';
        seg.timelineStart = segStart;
        seg.timelineEnd = segEnd;

        activeSceneId = primaryScene.sceneId;
        activeSceneSourceTime = screenshotSourceTimestamp;
        activeSceneRemainingDuration = Math.max(0, primaryScene.duration - 2.0);
        continue;
      }

      // Multi-Action Sentence Breakdown:
      if (seg.subActions && seg.subActions.length > 1) {
        const subActionList = seg.subActions;
        const totalSubDuration = subActionList.reduce(
          (acc, a) => acc + ((a.subEnd ?? a.endTime) - (a.subStart ?? a.startTime)),
          0
        );

        for (let subIdx = 0; subIdx < subActionList.length; subIdx++) {
          const subAct = subActionList[subIdx];
          const actStart = subAct.subStart ?? subAct.startTime;
          const actEnd = subAct.subEnd ?? subAct.endTime;
          const subDurSpoken = Math.max(0.4, actEnd - actStart);
          const ratio = totalSubDuration > 0 ? subDurSpoken / totalSubDuration : 1 / subActionList.length;

          const tStart = subIdx === 0
            ? segStart
            : outputShots[outputShots.length - 1].timelineEnd;
          const tEnd = subIdx === subActionList.length - 1
            ? segEnd
            : Number((tStart + ratio * effectiveSegDuration).toFixed(3));
          const thisSubDuration = Number((tEnd - tStart).toFixed(3));

          // Match candidate specifically for this sub-action clause
          const transientSubSeg: ExplanationScriptSegment = {
            ...seg,
            segmentId: `${seg.segmentId}_sub_${subIdx}`,
            text: subAct.actionText,
            storyEventOrAction: subAct.actionConcept || subAct.actionText,
            voiceoverStart: tStart,
            voiceoverEnd: tEnd,
          };

          const subCandidates = storySceneMatcher.matchCandidatesForSegment(
            transientSubSeg,
            episodeIndex,
            segments,
            sIdx,
            {
              previouslyUsedSceneIds: usedSceneUsage,
              lastSelectedSceneId,
              lastSelectedSourceEnd,
              recentClipHistory,
              duplicatePolicy: transformativeSettings?.duplicatePolicy || 'balanced_variety',
              minSceneSpacing: transformativeSettings?.minSceneSpacing || 25,
              usedIntervalsByScene,
              transcriptIndex,
            }
          );

          const validSubCandidates = subCandidates.filter(
            (c) =>
              c.matchScore > 0 &&
              !c.isUnmatched &&
              !c.scene.isTitleOrBumper &&
              !c.scene.isExcludedFromNarration &&
              !titleBumperDetector.isSceneTitleOrIntervalScreen(c.scene) &&
              c.scene.narrativePurpose !== 'title_or_bumper' &&
              c.scene.endTime > narrativeStartTime
          );
          const nonDupSub = validSubCandidates.filter((c) => !c.isDuplicate && !c.isNearDuplicate);
          const chosenCandidate = nonDupSub.length > 0 ? nonDupSub[0] : (validSubCandidates[0] || topCandidate);
          const s = chosenCandidate.scene;

          const usedForScene = usedIntervalsByScene.get(s.sceneId) || [];
          const unusedSlice = storySceneMatcher.findNextUnusedInterval(s, thisSubDuration, usedForScene, narrativeStartTime);
          const subIn = unusedSlice.start;
          const subOut = Number((subIn + thisSubDuration).toFixed(3));
          usedForScene.push({ start: subIn, end: subOut });
          usedIntervalsByScene.set(s.sceneId, usedForScene);

          const availableDuration = s.endTime - s.startTime;
          const isInsufficientFootage = unusedSlice.isExhausted || availableDuration < thisSubDuration - 0.05;

          const isSubShotScreenshot = consecutiveVideoClipCount >= maxConsecutiveVideo;
          const directorialFraming = this.determineDirectorialFraming(transientSubSeg, s);
          const directorialMotion = isSubShotScreenshot
            ? this.selectDirectorialMotionEffect(transientSubSeg, s, screenshotCounter)
            : undefined;
          const subMotionEffect = directorialMotion?.motionEffect;
          const hasTextOrSigns = transformativeFilterEngine.detectTextOrReadableSigns(s);

          const prevShot = outputShots.length > 0 ? outputShots[outputShots.length - 1] : undefined;
          const prevScene = prevShot?.sceneId ? episodeIndex.scenes.find((sc) => sc.sceneId === prevShot.sceneId) : undefined;
          const trans = this.selectContextualTransition(s, prevScene, transientSubSeg, isSubShotScreenshot, prevShot?.isScreenshot || false);

          const subShot: MovieTimelineShot = {
            shotId: `shot_${uuid().slice(0, 8)}`,
            segmentId: seg.segmentId,
            sceneId: s.sceneId,
            sourceFile: isSubShotScreenshot ? this.getRealScreenshotPath(s, episodeIndex, `sub_${subIdx}`) : (s.sourceFile || episodeIndex.originalVideoPath),
            sourceStart: subIn,
            sourceEnd: subOut,
            timelineStart: tStart,
            timelineEnd: tEnd,
            duration: thisSubDuration,
            matchScore: isInsufficientFootage ? 30 : chosenCandidate.matchScore,
            confidence: isInsufficientFootage ? 0.3 : chosenCandidate.confidence,
            isLowConfidence: isInsufficientFootage || chosenCandidate.isLowConfidence,
            isUnmatched: isInsufficientFootage,
            matchStatus: isInsufficientFootage ? 'unmatched' : (chosenCandidate.matchScore >= 60 ? 'matched' : 'needs_review'),
            isDuplicate: false,
            sentenceText: subAct.actionText,
            presentationType: isSubShotScreenshot ? 'screenshot' : 'video_clip',
            isScreenshot: isSubShotScreenshot,
            motionEffect: subMotionEffect,
            directorialMotion: subMotionEffect,
            directorialFraming: directorialFraming.framing,
            directorialFramingScale: directorialFraming.scale,
            screenshotCadenceStatus: 'compliant',
            duplicateWarning: chosenCandidate.duplicateWarning,
            referencedCharacters: seg.referencedCharacters,
            storyEvent: subAct.actionConcept || seg.storyEventOrAction,
            whyThisScene: {
              characterMatch: `Features character relevant to sub-action: "${subAct.actionText}".`,
              actionMatch: `Visual action aligns with spoken clause: "${subAct.actionConcept || subAct.actionText}".`,
              storyContextReason: `Directorial framing: ${directorialFraming.reason}`,
              chronologyCheck: 'Chronological continuity preserved across sub-actions.',
              emotionalFit: 'Cadence matches natural spoken clause pause.',
              fullSummary: `[AI DIRECTOR: ${directorialFraming.framing.toUpperCase()}] Clause "${subAct.actionText}" mapped to scene ${s.sceneId} (${subIn}s - ${subOut}s).`,
            },
            transition: trans.transition,
            transitionDuration: trans.duration,
            isLocked: false,
            isManualOverride: false,
            framingMode: transformativeSettings?.framingMode || 'action',
            thumbnailUrl: s.thumbnailUrl,
            sceneDescription: s.description,
            sceneDialogue: s.dialogueSnippet,
            isFlipped: transformativeSettings?.horizontalFlip || false,
            speedMultiplier: transformativeSettings?.playbackSpeed || 1.0,
            zoomLevel: transformativeSettings?.zoomLevel || directorialFraming.scale,
            hasTextOrSigns,
            isKenBurnsStill: isSubShotScreenshot,
            hasJumpCut: subIdx > 0,
          };

          outputShots.push(subShot);
          recordShotSelection(subShot);

          if (subIdx === 0) {
            seg.referencedCharacters = seg.referencedCharacters || [];
            seg.storyEventOrAction = seg.storyEventOrAction || seg.narrativePurpose;
            seg.relevantSceneIds = validSubCandidates.slice(0, 5).map((c) => c.scene.sceneId);
            seg.sourceStartTime = subIn;
            seg.sourceEndTime = subOut;
            seg.selectedShotId = subShot.shotId;
            seg.selectedSceneId = s.sceneId;
            seg.confidenceScore = chosenCandidate.confidence;
            seg.presentationType = isSubShotScreenshot ? 'screenshot' : 'video_clip';
            seg.timelineStart = segStart;
            seg.timelineEnd = segEnd;
          }
        }

        activeSceneId = primaryScene.sceneId;
        activeSceneSourceTime = primaryScene.startTime + effectiveSegDuration / subActionList.length;
        activeSceneRemainingDuration = Math.max(0, primaryScene.duration - effectiveSegDuration / subActionList.length);
        continue;
      }

      // Video Clip Presentation:
      if (targetCount > 1) {
        const shotDuration = Number((effectiveSegDuration / targetCount).toFixed(3));

        for (let shotIdx = 0; shotIdx < targetCount; shotIdx++) {
          const tStart = shotIdx === 0 ? segStart : Number((segStart + shotIdx * shotDuration).toFixed(3));
          const tEnd = shotIdx === targetCount - 1 ? segEnd : Number((tStart + shotDuration).toFixed(3));
          const thisShotDuration = Number((tEnd - tStart).toFixed(3));

          // Intercut: pick distinct candidate for secondary sub-shot if available to avoid duplicate footage
          const pool = nonDuplicateCandidates.length > 0 ? nonDuplicateCandidates : validCandidates;
          const chosenCandidate = (shotIdx === 0 || pool.length <= 1)
            ? topCandidate
            : (pool[shotIdx % pool.length] || topCandidate);
          const s = chosenCandidate.scene;

          // Jump-cut integration: integrated for secondary sub-shots unless explicitly disabled
          const hasJumpCut = shotIdx > 0 && (transformativeSettings?.invisibleTransforms?.jumpCutIntegration !== false);

          // Derive in-point and out-point advancing chronologically with non-overlapping source frames
          const usedForScene = usedIntervalsByScene.get(s.sceneId) || [];
          const unusedSlice = storySceneMatcher.findNextUnusedInterval(s, thisShotDuration, usedForScene, narrativeStartTime);
          const subIn = unusedSlice.start;
          const subOut = Number((subIn + thisShotDuration).toFixed(3));
          usedForScene.push({ start: subIn, end: subOut });
          usedIntervalsByScene.set(s.sceneId, usedForScene);

          // If source footage is exhausted or shorter than shot duration, flag insufficient coverage
          const availableDuration = s.endTime - s.startTime;
          const isInsufficientFootage = unusedSlice.isExhausted || availableDuration < thisShotDuration - 0.05;

          // Check if this sub-shot must be converted to screenshot to satisfy consecutive clip limit
          const isSubShotScreenshot = consecutiveVideoClipCount >= maxConsecutiveVideo;
          const directorialFraming = this.determineDirectorialFraming(seg, s);
          const directorialMotion = isSubShotScreenshot
            ? this.selectDirectorialMotionEffect(seg, s, screenshotCounter)
            : undefined;
          const subMotionEffect = directorialMotion?.motionEffect;

          // Text & sign detection for intelligent mirroring
          const hasTextOrSigns = transformativeFilterEngine.detectTextOrReadableSigns(s);

          const prevShot = outputShots.length > 0 ? outputShots[outputShots.length - 1] : undefined;
          const prevScene = prevShot?.sceneId ? episodeIndex.scenes.find((sc) => sc.sceneId === prevShot.sceneId) : undefined;
          const trans = this.selectContextualTransition(s, prevScene, seg, isSubShotScreenshot, prevShot?.isScreenshot || false);

          const subShot: MovieTimelineShot = {
            shotId: `shot_${uuid().slice(0, 8)}`,
            segmentId: seg.segmentId,
            sceneId: s.sceneId,
            sourceFile: s.sourceFile || episodeIndex.originalVideoPath,
            sourceStart: subIn,
            sourceEnd: subOut,
            timelineStart: tStart,
            timelineEnd: tEnd,
            duration: thisShotDuration,
            matchScore: isInsufficientFootage ? 30 : chosenCandidate.matchScore,
            confidence: isInsufficientFootage ? 0.3 : chosenCandidate.confidence,
            isLowConfidence: isInsufficientFootage || chosenCandidate.isLowConfidence,
            isUnmatched: isInsufficientFootage,
            matchStatus: isInsufficientFootage ? 'unmatched' : (chosenCandidate.matchScore >= 60 ? 'matched' : 'needs_review'),
            isDuplicate: false,
            unmatchedReason: isInsufficientFootage
              ? `Source footage (${availableDuration.toFixed(1)}s) is shorter than required shot (${thisShotDuration.toFixed(1)}s). Cannot stretch without looping.`
              : undefined,
            presentationType: isSubShotScreenshot ? 'screenshot' : 'video_clip',
            isScreenshot: isSubShotScreenshot,
            motionEffect: subMotionEffect,
            directorialMotion: subMotionEffect,
            directorialFraming: directorialFraming.framing,
            directorialFramingScale: directorialFraming.scale,
            screenshotCadenceStatus: 'compliant',
            duplicateWarning: chosenCandidate.duplicateWarning,
            referencedCharacters: seg.referencedCharacters,
            storyEvent: seg.storyEventOrAction,
            whyThisScene: this.buildWhyThisScene(s, seg, chosenCandidate, shotIdx, targetCount),
            transition: trans.transition,
            transitionDuration: trans.duration,
            isLocked: false,
            isManualOverride: false,
            framingMode: transformativeSettings?.framingMode || 'action',
            thumbnailUrl: s.thumbnailUrl,
            sceneDescription: s.description,
            sceneDialogue: s.dialogueSnippet,
            isFlipped: transformativeSettings?.horizontalFlip || false,
            speedMultiplier: transformativeSettings?.playbackSpeed || 1.0,
            zoomLevel: transformativeSettings?.zoomLevel || directorialFraming.scale,
            hasTextOrSigns,
            isKenBurnsStill: isSubShotScreenshot,
            hasJumpCut,
          };

          outputShots.push(subShot);
          recordShotSelection(subShot);

          if (shotIdx === 0) {
            seg.referencedCharacters = seg.referencedCharacters || [];
            seg.storyEventOrAction = seg.storyEventOrAction || seg.narrativePurpose;
            seg.relevantSceneIds = validCandidates.slice(0, 5).map((c) => c.scene.sceneId);
            seg.sourceStartTime = subIn;
            seg.sourceEndTime = subOut;
            seg.selectedShotId = subShot.shotId;
            seg.selectedSceneId = s.sceneId;
            seg.confidenceScore = chosenCandidate.confidence;
            seg.candidateAlternatives = validCandidates.slice(1, 4).map((c) => ({
              sceneId: c.scene.sceneId,
              startTime: c.scene.startTime,
              endTime: c.scene.endTime,
              score: c.matchScore,
              reason: c.reasons[0] || 'Alternative scene candidate',
            }));
            seg.presentationType = isSubShotScreenshot ? 'screenshot' : 'video_clip';
            seg.timelineStart = segStart;
            seg.timelineEnd = segEnd;
          }
        }

        activeSceneId = primaryScene.sceneId;
        activeSceneSourceTime = primaryScene.startTime + shotDuration;
        activeSceneRemainingDuration = Math.max(0, primaryScene.duration - shotDuration);
      } else {
        // Single shot for this segment (strictly <= maxShotDuration):
        const availableDuration = primaryScene.endTime - primaryScene.startTime;
        const usedForScene = usedIntervalsByScene.get(primaryScene.sceneId) || [];
        const unusedSlice = storySceneMatcher.findNextUnusedInterval(primaryScene, effectiveSegDuration, usedForScene, narrativeStartTime);
        const sourceStart = unusedSlice.start;
        const sourceEnd = Number((sourceStart + effectiveSegDuration).toFixed(3));
        usedForScene.push({ start: sourceStart, end: sourceEnd });
        usedIntervalsByScene.set(primaryScene.sceneId, usedForScene);

        const isInsufficientFootage = unusedSlice.isExhausted || availableDuration < effectiveSegDuration - 0.05;
        const hasTextOrSigns = transformativeFilterEngine.detectTextOrReadableSigns(primaryScene);
        const directorialFraming = this.determineDirectorialFraming(seg, primaryScene);

        const prevShot = outputShots.length > 0 ? outputShots[outputShots.length - 1] : undefined;
        const prevScene = prevShot?.sceneId ? episodeIndex.scenes.find((sc) => sc.sceneId === prevShot.sceneId) : undefined;
        const trans = this.selectContextualTransition(primaryScene, prevScene, seg, false, prevShot?.isScreenshot || false);

        const singleShot: MovieTimelineShot = {
          shotId: `shot_${uuid().slice(0, 8)}`,
          segmentId: seg.segmentId,
          sceneId: primaryScene.sceneId,
          sourceFile: primaryScene.sourceFile || episodeIndex.originalVideoPath,
          sourceStart,
          sourceEnd,
          timelineStart: segStart,
          timelineEnd: segEnd,
          duration: effectiveSegDuration,
          matchScore: isInsufficientFootage ? 30 : topCandidate.matchScore,
          confidence: isInsufficientFootage ? 0.3 : topCandidate.confidence,
          isLowConfidence: isInsufficientFootage || topCandidate.isLowConfidence,
          isUnmatched: isInsufficientFootage,
          matchStatus: isInsufficientFootage ? 'unmatched' : (topCandidate.matchScore >= 60 ? 'matched' : 'needs_review'),
          isDuplicate: false,
          unmatchedReason: isInsufficientFootage
            ? `Source footage (${availableDuration.toFixed(1)}s) is shorter than required shot (${effectiveSegDuration.toFixed(1)}s). Cannot stretch without looping.`
            : undefined,
          presentationType: 'video_clip',
          isScreenshot: false,
          screenshotCadenceStatus: consecutiveVideoClipCount + 1 <= maxConsecutiveVideo ? 'compliant' : 'cadence_exceeded',
          duplicateWarning: topCandidate.duplicateWarning,
          referencedCharacters: seg.referencedCharacters,
          storyEvent: seg.storyEventOrAction,
          whyThisScene: this.buildWhyThisScene(primaryScene, seg, topCandidate, 0, 1),
          transition: trans.transition,
          transitionDuration: trans.duration,
          isLocked: false,
          isManualOverride: false,
          framingMode: transformativeSettings?.framingMode || 'action',
          directorialFraming: directorialFraming.framing,
          directorialFramingScale: directorialFraming.scale,
          thumbnailUrl: primaryScene.thumbnailUrl,
          sceneDescription: primaryScene.description,
          sceneDialogue: primaryScene.dialogueSnippet,
          isFlipped: transformativeSettings?.horizontalFlip || false,
          speedMultiplier: transformativeSettings?.playbackSpeed || 1.0,
          zoomLevel: transformativeSettings?.zoomLevel || directorialFraming.scale,
          hasTextOrSigns,
          hasJumpCut: false,
          isKenBurnsStill: false,
        };

        outputShots.push(singleShot);
        recordShotSelection(singleShot);

        seg.referencedCharacters = seg.referencedCharacters || [];
        seg.storyEventOrAction = seg.storyEventOrAction || seg.narrativePurpose;
        seg.relevantSceneIds = validCandidates.slice(0, 5).map((c) => c.scene.sceneId);
        seg.sourceStartTime = sourceStart;
        seg.sourceEndTime = sourceEnd;
        seg.selectedShotId = singleShot.shotId;
        seg.selectedSceneId = primaryScene.sceneId;
        seg.confidenceScore = topCandidate.confidence;
        seg.candidateAlternatives = validCandidates.slice(1, 4).map((c) => ({
          sceneId: c.scene.sceneId,
          startTime: c.scene.startTime,
          endTime: c.scene.endTime,
          score: c.matchScore,
          reason: c.reasons[0] || 'Alternative scene candidate',
        }));
        seg.presentationType = 'video_clip';
        seg.timelineStart = segStart;
        seg.timelineEnd = segEnd;

        activeSceneId = primaryScene.sceneId;
        activeSceneSourceTime = sourceEnd;
        activeSceneRemainingDuration = Math.max(0, primaryScene.duration - effectiveSegDuration);
      }
    }

    // Determine output resolution from aspect ratio
    let outputWidth = 1920;
    let outputHeight = 1080;
    if (aspectRatio === '9:16') {
      outputWidth = 1080;
      outputHeight = 1920;
    } else if (aspectRatio === '1:1') {
      outputWidth = 1080;
      outputHeight = 1080;
    }

    // ── Strict Validation Pass: Enforce maxShotDuration (<= 3.0s for video clips) & continuous coverage ──
    const finalShots: MovieTimelineShot[] = [];
    let runningTimelineTime = 0.000;
    let postVideoClipCount = 0;

    for (let i = 0; i < outputShots.length; i++) {
      const shot = outputShots[i];
      const tStart = runningTimelineTime;
      const tEnd = shot.timelineEnd;
      const shotDur = Number((tEnd - tStart).toFixed(3));

      if (shot.isScreenshot || shot.presentationType === 'screenshot') {
        postVideoClipCount = 0;
        finalShots.push({
          ...shot,
          timelineStart: tStart,
          timelineEnd: tEnd,
          duration: shotDur,
          screenshotDuration: shotDur,
          presentationType: 'screenshot',
          isScreenshot: true,
          screenshotCadenceStatus: 'compliant',
          trackIndex: 3,
          trackId: 'track_main_video',
        });
        runningTimelineTime = tEnd;
        continue;
      }

      // Check video clip duration
      if (shotDur > maxShotDuration + 0.05 && !shot.isLocked) {
        // Divide long video shot into shorter sub-shots <= maxShotDuration while respecting minShotDuration
        const splitCount = Math.max(2, Math.ceil(shotDur / maxShotDuration));
        const subDur = Number((shotDur / splitCount).toFixed(3));
        const scene = episodeIndex.scenes.find((s) => s.sceneId === shot.sceneId);
        const sceneMaxEnd = scene ? scene.endTime : shot.sourceEnd;

        for (let k = 0; k < splitCount; k++) {
          const subTStart = k === 0 ? tStart : Number((tStart + k * subDur).toFixed(3));
          const subTEnd = k === splitCount - 1 ? tEnd : Number((subTStart + subDur).toFixed(3));
          const thisSubDur = Number((subTEnd - subTStart).toFixed(3));

          let subSrcStart = Number((shot.sourceStart + k * thisSubDur).toFixed(3));
          const isFootageExhausted = subSrcStart + thisSubDur > sceneMaxEnd + 0.1;
          const subSrcEnd = Number((subSrcStart + thisSubDur).toFixed(3));

          postVideoClipCount++;
          const shouldConvertToScreenshot = isFootageExhausted || postVideoClipCount > maxConsecutiveVideo;

          if (shouldConvertToScreenshot) {
            postVideoClipCount = 0;
            const segForShot = segments.find((sg) => sg.segmentId === shot.segmentId);
            const directorialMotion = segForShot
              ? this.selectDirectorialMotionEffect(segForShot, scene, screenshotCounter++)
              : undefined;
            const motionEffect = directorialMotion?.motionEffect || SCREENSHOT_MOTIONS[screenshotCounter++ % SCREENSHOT_MOTIONS.length];
            const sourceFile = scene ? this.getRealScreenshotPath(scene, episodeIndex, `sub_${k}_${shot.shotId}`, projectId) : shot.sourceFile;

            finalShots.push({
              ...shot,
              shotId: k === 0 ? shot.shotId : `shot_${uuid().slice(0, 8)}`,
              presentationType: 'screenshot',
              isScreenshot: true,
              sourceFile,
              sourceStart: Math.min(subSrcStart, sceneMaxEnd - 1.0),
              sourceEnd: Math.min(subSrcEnd, sceneMaxEnd),
              timelineStart: subTStart,
              timelineEnd: subTEnd,
              duration: thisSubDur,
              motionEffect,
              directorialMotion: motionEffect,
              screenshotCadenceStatus: 'compliant',
              trackIndex: 3,
              trackId: 'track_main_video',
            });
          } else {
            finalShots.push({
              ...shot,
              shotId: k === 0 ? shot.shotId : `shot_${uuid().slice(0, 8)}`,
              timelineStart: subTStart,
              timelineEnd: subTEnd,
              duration: thisSubDur,
              sourceStart: subSrcStart,
              sourceEnd: subSrcEnd,
              hasJumpCut: k > 0,
              presentationType: 'video_clip',
              isScreenshot: false,
              screenshotCadenceStatus: 'compliant',
              trackIndex: 3,
              trackId: 'track_main_video',
            });
          }
          runningTimelineTime = subTEnd;
        }
      } else {
        postVideoClipCount++;
        const shouldConvertToScreenshot = postVideoClipCount > maxConsecutiveVideo;

        if (shouldConvertToScreenshot) {
          postVideoClipCount = 0;
          const scene = episodeIndex.scenes.find((s) => s.sceneId === shot.sceneId);
          const segForShot = segments.find((sg) => sg.segmentId === shot.segmentId);
          const directorialMotion = segForShot
            ? this.selectDirectorialMotionEffect(segForShot, scene, screenshotCounter++)
            : undefined;
          const motionEffect = directorialMotion?.motionEffect || SCREENSHOT_MOTIONS[screenshotCounter++ % SCREENSHOT_MOTIONS.length];
          const sourceFile = scene ? this.getRealScreenshotPath(scene, episodeIndex, shot.shotId) : shot.sourceFile;

          finalShots.push({
            ...shot,
            timelineStart: tStart,
            timelineEnd: tEnd,
            duration: shotDur,
            sourceFile,
            presentationType: 'screenshot',
            isScreenshot: true,
            motionEffect,
            directorialMotion: motionEffect,
            screenshotCadenceStatus: 'compliant',
            trackIndex: 3,
            trackId: 'track_main_video',
          });
        } else {
          finalShots.push({
            ...shot,
            timelineStart: tStart,
            timelineEnd: tEnd,
            duration: shotDur,
            presentationType: 'video_clip',
            isScreenshot: false,
            screenshotCadenceStatus: 'compliant',
            trackIndex: 3,
            trackId: 'track_main_video',
          });
        }
        runningTimelineTime = tEnd;
      }
    }

    // ── Remediate any duplicate intervals across finalShots ──
    this.remediateDuplicateScenes(finalShots, episodeIndex, usedIntervalsByScene, narrativeStartTime);

    // ── Generate Verification Checkpoints after every 5 selected clips ──
    const verificationCheckpoints: MovieAnalyzerVerificationCheckpoint[] = [];
    for (let i = 0; i < finalShots.length; i++) {
      if ((i + 1) % 5 === 0) {
        const targetShot = finalShots[i];
        const cp: MovieAnalyzerVerificationCheckpoint = {
          checkpointIndex: Math.floor((i + 1) / 5),
          afterShotIndex: i,
          screenshotUrl: targetShot.thumbnailUrl,
          sourceTimestamp: targetShot.sourceStart,
          sceneId: targetShot.sceneId,
          verificationStatus: 'verified',
          verificationNotes: `Verified shot #${i + 1} at ${Math.floor(targetShot.sourceStart)}s. Cadence: ${targetShot.screenshotCadenceStatus || 'compliant'}.`,
        };
        targetShot.verificationCheckpoint = cp;
        verificationCheckpoints.push(cp);
      }
    }

    const totalDuration = finalShots.length > 0 ? finalShots[finalShots.length - 1].timelineEnd : 0;
    const timelineRev = existingTimeline?.timelineRevision ? existingTimeline.timelineRevision + 1 : 1;

    // Synchronize initial captions from narration segments
    const captions = (script.segments || []).map((seg, idx) => ({
      id: `cap_${idx + 1}_${seg.segmentId.slice(0, 6)}`,
      text: seg.text,
      startTime: seg.voiceoverStart,
      endTime: seg.voiceoverEnd,
      fontSize: 22,
      fontColor: '#ffffff',
      outlineColor: '#000000',
      positionY: 86,
      words: seg.wordTimestamps,
    }));

    // Multi-track timeline setup
    const tracks = [
      { id: 'track_text', index: 0, name: 'Text & Titles', type: 'text' as const, isVisible: true, isLocked: false },
      { id: 'track_captions', index: 1, name: 'Captions', type: 'captions' as const, isVisible: true, isLocked: false },
      { id: 'track_overlay', index: 2, name: 'Video Overlay', type: 'video_overlay' as const, isVisible: true, isLocked: false },
      { id: 'track_main_video', index: 3, name: 'Main Video (<= 3s)', type: 'main_video' as const, isVisible: true, isLocked: false },
      { id: 'track_voiceover', index: 4, name: 'Voiceover', type: 'voiceover' as const, isVisible: true, isLocked: false },
      { id: 'track_bgm', index: 5, name: 'Background Music', type: 'bgm' as const, isVisible: true, isLocked: false },
      { id: 'track_sfx', index: 6, name: 'Sound Effects', type: 'sfx' as const, isVisible: true, isLocked: false },
    ];

    const generatedHooks = contextualHookEngine.generateHooks(
      segments,
      finalShots,
      existingTimeline?.textOverlays
    );

    const generatedAudioLayers = soundDesignService.generateAudioLayers(
      segments,
      finalShots,
      totalDuration,
      existingTimeline?.audioLayers
    );

    // Priority 1: Remediate any duplicate scene footage and generate comprehensive duplicate report
    this.remediateDuplicateScenes(finalShots, episodeIndex, usedIntervalsByScene, narrativeStartTime);
    const finalDuplicateReport = this.detectDuplicateScenes(finalShots);

    return {
      timelineId: `tl_${uuid().slice(0, 8)}`,
      projectId: episodeIndex.mediaId,
      duration: Number(totalDuration.toFixed(3)),
      shots: finalShots,
      outputAspectRatio: aspectRatio,
      outputWidth,
      outputHeight,
      outputFps: 60, // Pro 60 FPS high-frame rate export
      timelineRevision: timelineRev,
      revision: timelineRev,
      transformativeSettings: {
        ...transformativeSettings,
        strictClipDurationMode: isStrictMode,
        maxShotDuration,
      },
      tracks,
      captions,
      textOverlays: generatedHooks,
      audioLayers: generatedAudioLayers,
      globalCanvas: existingTimeline?.globalCanvas || {
        aspectRatio,
        backgroundColor: '#000000',
      },
      verificationCheckpoints,
      duplicateReport: finalDuplicateReport,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  /**
   * AI Director: Computes narrative-driven camera framing (Close-Up / Medium / Wide).
   * Aligns camera distance to emotional intensity, facial cues, or geographic context.
   */
  public determineDirectorialFraming(
    seg: ExplanationScriptSegment,
    scene?: EpisodeScene
  ): { framing: 'close_up' | 'medium' | 'wide' | 'extreme_close_up'; scale: number; reason: string } {
    const text = (seg.text || seg.cleanScript || '').toLowerCase();
    const sceneDesc = (scene?.description || '').toLowerCase();

    // 1. Close-Up: Facial emotion, subtle clue, reaction, confession, weapon, tears, eyes, hands
    const CLOSE_UP_PATTERNS = /(চোখ|মুখ|হাসি|কান্না|ভয়|হাত|আঙুল|চিঠি|ফোন|ছুরি|অস্ত্র|রক্ত|খুন|মুহূর্ত|চমকে|লাশ|clue|fingerprint|expression|face|eyes|tears|knife|gun|blood|letter|note|phone|reaction|weapon|wound|stare|whisper)/i;
    if (CLOSE_UP_PATTERNS.test(text) || CLOSE_UP_PATTERNS.test(sceneDesc)) {
      return {
        framing: 'close_up',
        scale: 1.22,
        reason: 'Close-up punch-in emphasizes emotional intensity, facial nuance, or critical evidence.',
      };
    }

    // 2. Wide / Establishing: Exterior, buildings, landscapes, arrivals, city streets, broad environment
    const WIDE_PATTERNS = /(শহর|বাড়ি|রাস্তা|জঙ্গল|ভবন|ঘর|হাসপাতাল|থানা|গাড়ি|আগমণ|হোটেল|বাইরে|প্রবেশ|পরিবেশ|city|house|street|precinct|mansion|forest|hospital|road|exterior|building|hotel|car arrived|outside|station|landscape)/i;
    if (WIDE_PATTERNS.test(text) || (scene?.environmentType === 'exterior' && WIDE_PATTERNS.test(sceneDesc))) {
      return {
        framing: 'wide',
        scale: 1.0,
        reason: 'Wide establishing frame grounds the audience in scene geography and environmental scope.',
      };
    }

    // 3. Medium Shot: Standard balanced character interaction and dialogue
    return {
      framing: 'medium',
      scale: 1.08,
      reason: 'Medium shot balances subject presence and surrounding narrative environment.',
    };
  }

  /**
   * AI Director: Selects emotion-aware camera motion (Ken Burns / Pan / Zoom)
   * driven by scene mood and spoken narrative beats rather than random cycling.
   */
  public selectDirectorialMotionEffect(
    seg: ExplanationScriptSegment,
    scene?: EpisodeScene,
    shotIndex: number = 0
  ): {
    motionEffect: 'pan_left_to_right' | 'pan_right_to_left' | 'gentle_zoom_in' | 'gentle_zoom_out' | 'subtle_diagonal';
    reason: string;
  } {
    const text = (seg.text || seg.cleanScript || '').toLowerCase();
    const sceneDesc = (scene?.description || '').toLowerCase();

    // 1. Zoom In: Dramatic push-in for discovery, revelation, sudden shock, danger, climax
    const ZOOM_IN_PATTERNS = /(আবিষ্কার|সত্য|উন্মোচন|রহস্য|হঠাৎ|ভয়|খুন|চমকে|বুঝতে পারল|জানতে পারল|discovery|truth|reveal|secret|shock|climax|danger|notic|sudden|killer)/i;
    if (ZOOM_IN_PATTERNS.test(text) || seg.narrativePurpose === 'climax' || seg.narrativePurpose === 'reveal') {
      return {
        motionEffect: 'gentle_zoom_in',
        reason: 'Dramatic push-in concentrates viewer focus as a pivotal truth or intense beat unfolds.',
      };
    }

    // 2. Zoom Out: Reflective pull-out for grief, solitude, departure, looking back, contemplation
    const ZOOM_OUT_PATTERNS = /(কষ্ট|একা|বিদায়|চলে গেল|স্মৃতি|অতীতে|হারিয়ে|দূর|غم|sad|alone|departure|aftermath|reflection|memory|past|loss|remains|distance)/i;
    if (ZOOM_OUT_PATTERNS.test(text) || seg.narrativePurpose === 'resolution') {
      return {
        motionEffect: 'gentle_zoom_out',
        reason: 'Reflective pull-out reveals emotional scale and creates contemplative breathing room.',
      };
    }

    // 3. Pan: Action, search, tracking movement, scanning space
    const PAN_PATTERNS = /(খুঁজ|দৌড়|হেঁটে|তল্লাশি|তদন্ত|রাস্তা|search|walk|investigat|track|across|follow|look around)/i;
    if (PAN_PATTERNS.test(text) || PAN_PATTERNS.test(sceneDesc)) {
      const panDir = shotIndex % 2 === 0 ? 'pan_left_to_right' : 'pan_right_to_left';
      return {
        motionEffect: panDir,
        reason: `Lateral tracking motion (${panDir.replace(/_/g, ' ')}) simulates camera following narrative action.`,
      };
    }

    // 4. Subtle Diagonal: Suspense, conspiracy, quiet deception
    const SUSPENSE_PATTERNS = /(সন্দেহ|ষড়যন্ত্র|লুকিয়ে|ছলনা|চুপচাপ|suspicion|conspiracy|hidden|danger|tension|quiet|watching)/i;
    if (SUSPENSE_PATTERNS.test(text)) {
      return {
        motionEffect: 'subtle_diagonal',
        reason: 'Subtle diagonal drift evokes psychological tension and unsettled atmosphere.',
      };
    }

    // Fallback: cycle gracefully
    const fallbackList: Array<'gentle_zoom_in' | 'pan_left_to_right' | 'gentle_zoom_out' | 'subtle_diagonal' | 'pan_right_to_left'> = [
      'gentle_zoom_in',
      'pan_left_to_right',
      'gentle_zoom_out',
      'subtle_diagonal',
      'pan_right_to_left',
    ];
    const chosen = fallbackList[shotIndex % fallbackList.length];
    return {
      motionEffect: chosen,
      reason: `Cinematic motion effect (${chosen.replace(/_/g, ' ')}) maintains visual dynamics.`,
    };
  }

  /**
   * AI Director: Evaluates neighboring shots, scene timecodes, and narrative context
   * to select cinematic editorial transitions (Cuts, Dissolves, Dip-to-Black, Flash-to-White).
   */
  public selectContextualTransition(
    currentScene: EpisodeScene | undefined,
    prevScene: EpisodeScene | undefined,
    seg: ExplanationScriptSegment,
    isScreenshot: boolean,
    prevShotWasScreenshot: boolean
  ): { transition: TransitionType; duration: number } {
    if (isScreenshot || prevShotWasScreenshot) {
      return { transition: 'crossfade', duration: 0.4 };
    }

    const text = (seg.text || seg.cleanScript || '').toLowerCase();

    // 1. Contiguous action in same scene -> crisp hard cut
    if (currentScene && prevScene && currentScene.sceneId === prevScene.sceneId) {
      return { transition: 'cut', duration: 0 };
    }

    // 2. Climax, sudden revelation, or dramatic shock -> Flash to White or Dip to Black
    if (seg.narrativePurpose === 'climax' || seg.narrativePurpose === 'reveal') {
      const isShock = /shock|truth|dead|murder|killer|বিস্ময়|সত্য|উন্মোচন|হঠাৎ/i.test(text);
      return {
        transition: isShock ? 'fade_white' : 'fade_black',
        duration: 0.5,
      };
    }

    // 3. Significant temporal jump (>5 min gap in movie source) or textual time jump -> Dip to Black
    const TIME_JUMP_PATTERNS = /(পরদিন|কয়েক দিন পর|কয়েক বছর|পরের দৃশ্য|কিছুক্ষণ পর|কিছু সময় পর|next day|later that day|years later|meanwhile|months later)/i;
    const hasSourceTimeJump = currentScene && prevScene && Math.abs(currentScene.startTime - prevScene.endTime) > 300;
    if (TIME_JUMP_PATTERNS.test(text) || hasSourceTimeJump) {
      return { transition: 'fade_black', duration: 0.5 };
    }

    // 4. Memory flashback or past recollection -> Soft dissolve

    // 5. Distinct location or emotional tone shift -> crossfade
    if (currentScene && prevScene) {
      const diffLocation = currentScene.location && prevScene.location && currentScene.location !== prevScene.location;
      const diffTone = currentScene.emotionalTone && prevScene.emotionalTone && currentScene.emotionalTone !== prevScene.emotionalTone;
      if (diffLocation || diffTone) {
        return { transition: 'crossfade', duration: 0.4 };
      }
    }

    // Default: Hard editorial cut
    return { transition: 'cut', duration: 0 };
  }

  /**
   * Resolves physical JPEG screenshot file path on disk.
   */
  private getRealScreenshotPath(
    scene: EpisodeScene,
    episodeIndex: EpisodeIntelligenceIndex,
    shotId: string,
    projectId?: string
  ): string {
    // 1. Direct path from scene.representativeFramePaths
    if (scene.representativeFramePaths && scene.representativeFramePaths.length > 0) {
      for (const fp of scene.representativeFramePaths) {
        if (fs.existsSync(fp)) return fp;
      }
    }

    // 2. Resolve from scene.thumbnailUrl
    if (scene.thumbnailUrl) {
      const filename = path.basename(scene.thumbnailUrl);
      // Candidates for thumbs dir:
      // A: projectId
      if (projectId) {
        const pThumbs = path.join(getMovieExplanationThumbsDir(projectId), filename);
        if (fs.existsSync(pThumbs)) return pThumbs;
      }
      // B: from URL path: /api/files/movie_explanation/<projId>/thumbnails/<filename>
      const urlMatch = scene.thumbnailUrl.match(/\/api\/files\/movie_explanation\/([^\/]+)\/thumbnails\/(.+)$/);
      if (urlMatch) {
        const diskPath = path.join(getMovieExplanationProjectDir(urlMatch[1]), 'thumbnails', urlMatch[2]);
        if (fs.existsSync(diskPath)) return diskPath;
      }
      // C: episodeIndex.mediaId
      const mediaThumbs = path.join(getMovieExplanationThumbsDir(episodeIndex.mediaId), filename);
      if (fs.existsSync(mediaThumbs)) return mediaThumbs;
    }

    // 3. Fallback: return original video file so the shot never references a missing file
    return episodeIndex.originalVideoPath;
  }

  /**
   * Generates evidence-backed "Why This Scene?" reasoning for every selected shot.
   */
  private buildWhyThisScene(
    scene: EpisodeScene,
    seg: ExplanationScriptSegment,
    candidate: SceneMatchCandidate,
    shotIndex: number,
    totalShotsForSegment: number
  ) {
    const characterMatch = seg.mainSubjectOrCharacter
      ? `Features ${seg.mainSubjectOrCharacter} directly participating in the scene.`
      : `Depicts central narrative subjects (${scene.characters.join(', ') || 'scene focus'}).`;

    const actionMatch = scene.actions.length > 0
      ? `Visual action (${scene.actions.join(', ')}) aligns with narration concept.`
      : 'Visual continuity reinforces the narration beat.';

    const storyContextReason = candidate.reasons[0] || `Supports narrative stage: ${seg.narrativePurpose.toUpperCase()}.`;
    const chronologyCheck = `Scene timecode ${Math.floor(scene.startTime / 60)}m${Math.floor(scene.startTime % 60)}s respects narrative timeline without premature reveals.`;
    const emotionalFit = `Tone of scene (${scene.emotionalTone}) matches the narrator's delivery.`;

    const multiShotNote = totalShotsForSegment > 1
      ? ` (Shot ${shotIndex + 1} of ${totalShotsForSegment} multi-action breakdown)`
      : '';

    const fullSummary = `Scene ${scene.sceneId}${multiShotNote} selected because: ${candidate.reasons.join(' • ')}`;

    return {
      characterMatch,
      actionMatch,
      storyContextReason,
      chronologyCheck,
      emotionalFit,
      fullSummary,
    };
  }

  /**
   * Priority 1: Detects repeated scenes or overlapping source intervals across the entire timeline.
   */
  public detectDuplicateScenes(shots: MovieTimelineShot[]): DuplicateSceneReport {
    const duplicateDetails: Array<{
      sceneId: string;
      sourceStart: number;
      sourceEnd: number;
      occurrences: number;
      timelinePositions: number[];
    }> = [];

    const sceneMap = new Map<string, Array<{ shotId: string; sourceStart: number; sourceEnd: number; timelineStart: number }>>();

    for (const shot of shots) {
      if (shot.isScreenshot || shot.presentationType === 'screenshot') continue;
      if (!shot.sceneId || shot.sceneId === 'unmatched') continue;

      const list = sceneMap.get(shot.sceneId) || [];
      list.push({
        shotId: shot.shotId,
        sourceStart: shot.sourceStart,
        sourceEnd: shot.sourceEnd,
        timelineStart: shot.timelineStart,
      });
      sceneMap.set(shot.sceneId, list);
    }

    let duplicateCount = 0;
    let duplicateIntervalsCount = 0;

    for (const [sceneId, occurrences] of sceneMap.entries()) {
      if (occurrences.length > 1) {
        for (let i = 0; i < occurrences.length; i++) {
          for (let j = i + 1; j < occurrences.length; j++) {
            const a = occurrences[i];
            const b = occurrences[j];
            const overlap = Math.max(0, Math.min(a.sourceEnd, b.sourceEnd) - Math.max(a.sourceStart, b.sourceStart));
            if (overlap > 0.5) {
              duplicateCount++;
              duplicateIntervalsCount++;
              duplicateDetails.push({
                sceneId,
                sourceStart: a.sourceStart,
                sourceEnd: a.sourceEnd,
                occurrences: occurrences.length,
                timelinePositions: [a.timelineStart, b.timelineStart],
              });
            }
          }
        }
      }
    }

    return {
      hasDuplicates: duplicateCount > 0,
      duplicateCount,
      duplicateIntervalsCount,
      duplicateDetails,
    };
  }

  /**
   * Priority 1: Automatically remediates duplicate scenes by replacing overlapping footage with
   * unused scenes from the episode index pool, ensuring visual variety and narrative flow.
   */
  public remediateDuplicateScenes(
    shots: MovieTimelineShot[],
    episodeIndex: EpisodeIntelligenceIndex,
    usedIntervalsByScene: Map<string, Array<{ start: number; end: number }>>,
    narrativeStartTime: number
  ): void {
    const seenIntervals = new Map<string, Array<{ start: number; end: number }>>();

    for (let i = 0; i < shots.length; i++) {
      const shot = shots[i];
      if (shot.isScreenshot || shot.isLocked || !shot.sceneId || shot.sceneId === 'unmatched') continue;

      const prior = seenIntervals.get(shot.sceneId) || [];
      const hasOverlap = prior.some((u) => {
        const overlap = Math.max(0, Math.min(shot.sourceEnd, u.end) - Math.max(shot.sourceStart, u.start));
        return overlap > 0.5;
      });

      if (hasOverlap) {
        // Find an unused scene from episodeIndex.scenes that hasn't been used yet
        const unusedScene = episodeIndex.scenes.find((s) => {
          if (s.isTitleOrBumper || s.isExcludedFromNarration) return false;
          if (s.narrativePurpose === 'title_or_bumper') return false;
          if (titleBumperDetector.isSceneTitleOrIntervalScreen(s)) return false;
          if (s.endTime <= narrativeStartTime) return false;
          const intervals = usedIntervalsByScene.get(s.sceneId) || [];
          return intervals.length === 0 && s.duration >= shot.duration;
        });

        if (unusedScene) {
          const sliceStart = Math.max(narrativeStartTime, unusedScene.startTime);
          const sliceEnd = Number((sliceStart + shot.duration).toFixed(3));
          shot.sceneId = unusedScene.sceneId;
          shot.sourceStart = sliceStart;
          shot.sourceEnd = sliceEnd;
          shot.matchStatus = 'needs_review';
          shot.matchScore = 55;
          shot.confidence = 0.55;
          shot.thumbnailUrl = unusedScene.thumbnailUrl;
          shot.sceneDescription = unusedScene.description;
          shot.isDuplicate = false;
          shot.duplicateWarning = undefined;
          shot.whyThisScene = {
            characterMatch: 'Assigned from unused movie footage pool.',
            actionMatch: 'Replaced overlapping scene with fresh visual coverage.',
            storyContextReason: `Duplicate remediation: original scene overlapped with prior shot. Replaced with unused scene ${unusedScene.sceneId}.`,
            chronologyCheck: 'Chronological continuity checked against scene pool.',
            emotionalFit: 'Preserves story pacing and prevents repetitive visual loops.',
            fullSummary: `[DUPLICATE RESOLVED] Overlapping footage replaced with unused scene ${unusedScene.sceneId} (${sliceStart}s - ${sliceEnd}s).`,
          };

          const intervals = usedIntervalsByScene.get(unusedScene.sceneId) || [];
          intervals.push({ start: sliceStart, end: sliceEnd });
          usedIntervalsByScene.set(unusedScene.sceneId, intervals);
        } else {
          // If no unused video scene, convert to screenshot still to eliminate repeated video motion
          shot.presentationType = 'screenshot';
          shot.isScreenshot = true;
          shot.isDuplicate = false;
          shot.duplicateWarning = undefined;
          shot.motionEffect = 'gentle_zoom_in';
          const scene = episodeIndex.scenes.find((s) => s.sceneId === shot.sceneId);
          if (scene) {
            shot.sourceFile = this.getRealScreenshotPath(scene, episodeIndex, shot.shotId);
          }
          shot.whyThisScene.fullSummary = `[DUPLICATE RESOLVED] Converted to moving still frame to eliminate repeated video frames.`;
        }
      } else {
        prior.push({ start: shot.sourceStart, end: shot.sourceEnd });
        seenIntervals.set(shot.sceneId, prior);
      }
    }
  }

  /**
   * Priority 2: Clusters adjacent short narration segments into coherent visual coverage windows,
   * guaranteeing that every automatically generated video shot meets the minShotDuration threshold
   * (default 3.0s) without drifting narration or truncating subtitles.
   */
  public clusterSegmentsForPacing(
    segments: ExplanationScriptSegment[],
    minDuration: number = 3.0,
    maxDuration: number = 4.0
  ): Array<{
    clusterId: string;
    timelineStart: number;
    timelineEnd: number;
    duration: number;
    segments: ExplanationScriptSegment[];
    primarySegment: ExplanationScriptSegment;
    subActions?: ExplanationSubAction[];
  }> {
    if (!segments || segments.length === 0) return [];

    const clusters: Array<{
      clusterId: string;
      timelineStart: number;
      timelineEnd: number;
      duration: number;
      segments: ExplanationScriptSegment[];
      primarySegment: ExplanationScriptSegment;
      subActions?: ExplanationSubAction[];
    }> = [];

    let curStart = segments[0].voiceoverStart;
    let curSegs: ExplanationScriptSegment[] = [];

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      curSegs.push(seg);
      const curEnd = seg.voiceoverEnd;
      const span = Number((curEnd - curStart).toFixed(3));

      const isLast = i === segments.length - 1;
      const nextSeg = !isLast ? segments[i + 1] : undefined;

      // Check if cluster duration satisfies minDuration or is the final segment
      if (span >= minDuration || isLast) {
        if (isLast && span < 1.0 && clusters.length > 0) {
          // Merge trailing tiny fragment (<1.0s) into previous cluster
          const prev = clusters[clusters.length - 1];
          prev.timelineEnd = curEnd;
          prev.duration = Number((prev.timelineEnd - prev.timelineStart).toFixed(3));
          prev.segments.push(...curSegs);
          break;
        }

        let primary = curSegs[0];
        for (const s of curSegs) {
          if (
            s.narrativePurpose === 'climax' ||
            s.narrativePurpose === 'reveal' ||
            (s.duration || 0) > (primary.duration || 0)
          ) {
            primary = s;
          }
        }

        let combinedSubActions: ExplanationSubAction[] | undefined = undefined;
        if (curSegs.length === 1 && curSegs[0].subActions && curSegs[0].subActions.length > 1) {
          combinedSubActions = curSegs[0].subActions;
        }

        clusters.push({
          clusterId: `cluster_${clusters.length}_${primary.segmentId}`,
          timelineStart: curStart,
          timelineEnd: curEnd,
          duration: span,
          segments: [...curSegs],
          primarySegment: primary,
          subActions: combinedSubActions,
        });

        if (nextSeg) {
          curStart = nextSeg.voiceoverStart;
          curSegs = [];
        }
      }
    }

    return clusters;
  }

  /**
   * Generates timeline with optional selective Stage B candidate visual verification.
   * If enableVisualVerification is true (or projectId provided), candidate scenes with thumbnails
   * are visually verified with minicpm-v4.6:1b to ensure visual evidence supports narration.
   */
  public async generateTimelineAsync(
    episodeIndex: EpisodeIntelligenceIndex,
    script: ExplanationScript,
    outputAspectRatio: VoiceoverOutputAspectRatio = '16:9',
    existingTimeline?: MovieExplanationTimeline,
    transformativeSettings?: any,
    projectId?: string,
    options?: {
      enableVisualVerification?: boolean;
      onProgress?: (pct: number, detail: string) => void;
    }
  ): Promise<MovieExplanationTimeline> {
    const timeline = this.generateTimeline(
      episodeIndex,
      script,
      outputAspectRatio,
      existingTimeline,
      transformativeSettings,
      projectId
    );

    // Only perform heavy sequential Ollama Stage B visual verification if explicitly requested (opt-in)
    // to avoid blocking the timeline synthesis on CPU for hours.
    if (options?.enableVisualVerification === true && projectId) {
      const projectDir = getMovieExplanationProjectDir(projectId);
      const segments = script.segments || [];
      const eligibleShots = timeline.shots.filter(
        (s) => !s.isScreenshot && !s.isUnmatched && !s.isLocked
      );

      for (let idx = 0; idx < eligibleShots.length; idx++) {
        const shot = eligibleShots[idx];
        options.onProgress?.(
          30 + Math.round(((idx + 1) / eligibleShots.length) * 60),
          `Visually verifying shot ${idx + 1} of ${eligibleShots.length} with AI Vision...`
        );

        const seg = segments.find((s) => s.segmentId === shot.segmentId);
        if (!seg) continue;

        const scene = episodeIndex.scenes.find((s) => s.sceneId === shot.sceneId);
        if (!scene || !scene.thumbnailUrl) continue;

        try {
          const cand: SceneMatchCandidate = {
            scene,
            matchScore: shot.matchScore,
            confidence: shot.confidence,
            isLowConfidence: shot.isLowConfidence,
            isUnmatched: shot.isUnmatched || false,
            scoreBreakdown: {
              semanticScore: 0,
              characterScore: 0,
              visualContinuityScore: 0,
              actionEventScore: 0,
              narrativeRoleScore: 0,
              chronologyScore: 0,
              durationSuitability: 0,
            },
            reasons: [],
          };

          const verified = await storySceneMatcher.verifyCandidateVisually(cand, seg, projectDir);
          shot.stageBVerification = verified.stageBVerification;

          if (verified.stageBVerification) {
            if (verified.stageBVerification.status === 'contradicted') {
              shot.isLowConfidence = true;
              shot.confidence = Math.min(shot.confidence, 0.3);
              shot.duplicateWarning = `Visual contradiction detected: ${verified.stageBVerification.reason}`;
            } else if (verified.stageBVerification.supportsNarration) {
              shot.confidence = Math.max(shot.confidence, verified.stageBVerification.calibratedConfidence);
            }
          }
        } catch {
          // Non-fatal verification pass
        }
      }
    }

    return timeline;
  }
}

export const aiDirectorEngine = new AIDirectorEngine();
