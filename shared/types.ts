// ============================================================
// AI Shorts Generator — Shared Types
// ============================================================

// ── Enums & Status Types ──

export type ProjectStatus =
  | 'created'
  | 'uploading'
  | 'uploaded'
  | 'processing'
  | 'analyzed'
  | 'generating'
  | 'completed'
  | 'error';

export type ProcessingStage =
  | 'validating'
  | 'extracting_metadata'
  | 'extracting_audio'
  | 'transcribing'
  | 'detecting_scenes'
  | 'analyzing_audio'
  | 'chunking'
  | 'detecting_highlights'
  | 'scoring_highlights'
  | 'ranking'
  | 'completed'
  | 'failed';

export type JobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export type ShortStatus = 'pending' | 'rendering' | 'completed' | 'failed';

export type CopyrightRiskLevel = 'low' | 'medium' | 'high';

export type ReframeMode = 'center' | 'face' | 'speaker' | 'action' | 'blur_fill' | 'auto' | 'fit';

export type CaptionPosition = 'top' | 'center' | 'bottom';

export type TranscriptionProvider = 'openai' | 'local';

export type AIProvider = 'openai' | 'anthropic' | 'google';

// ── User ──

export interface User {
  id: string;
  email: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

// ── Project ──

export interface Project {
  id: string;
  userId: string;
  name: string;
  description?: string;
  status: ProjectStatus;
  videoCount: number;
  shortCount: number;
  createdAt: string;
  updatedAt: string;
}

// ── Video ──

export interface Video {
  id: string;
  projectId: string;
  filename: string;
  originalFilename: string;
  filePath: string;
  fileSize: number;
  duration: number;
  width: number;
  height: number;
  fps: number;
  codec: string;
  audioCodec?: string;
  audioTracks?: number;
  bitrate?: number;
  aspectRatio?: string;
  pixelFormat?: string;
  audioSampleRate?: number;
  audioChannels?: number;
  colorSpace?: string;
  thumbnailUrl?: string;
  status: 'uploading' | 'ready' | 'processing' | 'error';
  createdAt: string;
}

export interface VideoMetadata {
  duration: number;
  videoDuration?: number;
  audioDuration?: number;
  width: number;
  height: number;
  fps: number;
  codec: string;
  audioCodec: string;
  audioTracks: number;
  bitrate: number;
  aspectRatio?: string;
  pixelFormat?: string;
  audioSampleRate?: number;
  audioChannels?: number;
  colorSpace?: string;
}

// ── Processing ──

export interface ProcessingJob {
  id: string;
  projectId: string;
  status: JobStatus;
  currentStage: ProcessingStage | null;
  progress: number;
  stageProgress?: number;
  stageDetail?: string;
  stagesCompleted: ProcessingStage[];
  error: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

export interface ProcessingUpdate {
  jobId: string;
  projectId: string;
  stage: ProcessingStage;
  progress: number;
  stageProgress?: number;
  stageDetail?: string;
  message: string;
  stagesCompleted: ProcessingStage[];
}

// ── Transcript ──

export interface Transcript {
  id: string;
  projectId: string;
  language: string;
  fullText: string;
  duration: number;
  segments: TranscriptSegment[];
  createdAt: string;
}

export interface TranscriptSegment {
  id: string;
  transcriptId: string;
  startTime: number;
  endTime: number;
  text: string;
  confidence: number;
  wordTimestamps?: WordTimestamp[];
}

export interface WordTimestamp {
  word: string;
  start: number;
  end: number;
}

// ── Scene ──

export interface Scene {
  id: string;
  projectId: string;
  sceneIndex: number;
  startTime: number;
  endTime: number;
  duration: number;
  thumbnailPath?: string;
  isBumper?: boolean;
}

// ── Highlight Candidate ──

export interface HighlightCandidate {
  id: string;
  projectId: string;
  title?: string;
  startTime: number;
  endTime: number;
  duration: number;
  transcriptText: string;

  // Scores (0–100)
  scoreTotal: number;
  scoreHook: number;
  scoreEmotion: number;
  scoreInformation: number;
  scoreSurprise: number;
  scoreStory: number;
  scoreVisual: number;
  scoreAudio: number;
  scoreShortsP: number;

  // AI & Multi-Signal Analysis
  aiReason: string;
  aiRecommendedStart: number;
  aiRecommendedEnd: number;
  whySelected?: string[];
  confidence?: 'High' | 'Medium' | 'Low';

  // Smart Framing & Computer Vision Data
  framingMode?: ReframeMode;
  cropOffsetX?: number;
  cropTrajectory?: { time: number; x: number }[];
  visualComposition?: {
    subjectVisibility: number;
    motionQuality: number;
    framing: number;
  };

  // Metadata
  rank: number;
  isSelected: boolean;
  isSuppressed: boolean;
  createdAt: string;
}

// ── Scoring Weights ──

export interface ScoringWeights {
  hook: number;
  contentValue: number;
  curiosity: number;
  emotion: number;
  story: number;
  payoff: number;
  pacing: number;
  visual: number;
  audio: number;
  shortsP: number;
}

// ── Short ──

export interface Short {
  id: string;
  projectId: string;
  highlightId: string;
  title?: string;
  startTime: number;
  endTime: number;
  duration: number;
  filePath: string | null;
  fileSize: number | null;
  width: number;
  height: number;
  captionsEnabled: boolean;
  captionStyle: CaptionStyle | null;
  reframeMode: ReframeMode;
  framingMode?: ReframeMode;
  cropOffsetX?: number;
  status: ShortStatus;
  renderProgress: number;
  error: string | null;
  thumbnailUrl?: string;
  createdAt: string;
  updatedAt: string;
}

// ── Caption Style ──

export interface CaptionStyle {
  fontFamily: string;
  fontSize: number;
  fontColor: string;
  backgroundColor: string;
  backgroundOpacity: number;
  outlineColor: string;
  outlineWidth: number;
  position: CaptionPosition;
  maxWordsPerLine: number;
  uppercase: boolean;
}

// ── Export ──

export interface Export {
  id: string;
  shortId: string;
  format: string;
  filePath: string;
  fileSize: number;
  createdAt: string;
}

// ── Copyright Check ──

export interface CopyrightCheck {
  id: string;
  projectId: string;
  riskLevel: CopyrightRiskLevel;
  details: CopyrightFinding[];
  checkedAt: string;
}

export interface CopyrightFinding {
  type: 'music' | 'speech' | 'visual';
  description: string;
  startTime: number;
  endTime: number;
  confidence: number;
}

// ── Processing Log ──

export interface ProcessingLog {
  id: number;
  projectId: string;
  jobId: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  stage: string;
  message: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

// ── Pipeline Config ──

export interface PipelineConfig {
  maxVideoDuration: number;
  maxUploadSize: number;
  maxShortsCount: number;
  maxShortDuration: number;
  minShortDuration: number;
  analysisChunkSize: number;
  chunkOverlap: number;
  outputWidth: number;
  outputHeight: number;
  outputFps: number;
  outputFormat: string;
  scoringWeights: ScoringWeights;
  transcriptionProvider: TranscriptionProvider;
  aiProvider: AIProvider;
  aiModel: string;
}

// ── Audio Analysis ──

export interface AudioAnalysisResult {
  volumeLevels: AudioLevel[];
  silenceRegions: TimeRange[];
  energyPeaks: AudioPeak[];
  averageVolume: number;
}

export interface AudioLevel {
  time: number;
  volume: number; // dB
}

export interface AudioPeak {
  time: number;
  energy: number;
  type: 'spike' | 'sustained' | 'silence_break';
}

export interface TimeRange {
  start: number;
  end: number;
}

// ── API Types ──

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  total: number;
  page: number;
  limit: number;
}

export interface CreateProjectRequest {
  name: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  name: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface GenerateShortRequest {
  highlightId: string;
  captionsEnabled?: boolean;
  captionStyle?: Partial<CaptionStyle>;
  reframeMode?: ReframeMode;
}

export interface UpdateShortRequest {
  startTime?: number;
  endTime?: number;
  captionsEnabled?: boolean;
  captionStyle?: Partial<CaptionStyle>;
  reframeMode?: ReframeMode;
}

export interface UpdateHighlightRequest {
  startTime?: number;
  endTime?: number;
  isSelected?: boolean;
  isSuppressed?: boolean;
  aiReason?: string;
  title?: string;
  framingMode?: ReframeMode;
  cropOffsetX?: number;
}

export interface AudioWaveformData {
  projectId: string;
  duration: number;
  peaks: number[]; // Normalized 0.0 - 1.0 peak heights (typically 400 - 1000 samples)
  pointsPerSecond: number;
}

export interface AppSettings {
  pipelineConfig: PipelineConfig;
  transcriptionProvider: TranscriptionProvider;
  aiProvider: AIProvider;
  aiModel: string;
}

// ── WebSocket Message Types ──

export interface WSMessage {
  type: 'processing_update' | 'short_progress' | 'longform_progress' | 'voiceover_progress' | 'error' | 'connected' | 'movie_analyzer_progress';
  payload: unknown;
}

export interface WSProcessingUpdate {
  type: 'processing_update';
  payload: ProcessingUpdate;
}

export interface WSShortProgress {
  type: 'short_progress';
  payload: {
    shortId: string;
    progress: number;
    status: ShortStatus;
  };
}

export interface WSLongFormProgress {
  type: 'longform_progress';
  payload: {
    compilationId: string;
    projectId: string;
    progress: number;
    stage: string;
    detail?: string;
    status: 'draft' | 'analyzing' | 'rendering' | 'completed' | 'failed';
  };
}

// ============================================================
// AI Long-Form Compilation Studio — Types
// ============================================================

export type LongFormTargetDuration = '3-5' | '5-7' | '7-10' | 'custom';

export type LongFormEditStyle = 'narrative' | 'best_moments' | 'chronological' | 'dynamic';

export type TransitionType = 'cut' | 'crossfade' | 'dissolve' | 'fade_black' | 'fade_white' | 'wipe';

export type SafeScaleFactor = 1.0 | 1.10 | 1.20 | 1.26 | 1.28;

export interface LongFormSettings {
  targetDuration: LongFormTargetDuration;
  customDurationSeconds?: number;
  aspectRatio: '16:9';
  outputWidth: number;
  outputHeight: number;
  outputFps: number;
  editStyle: LongFormEditStyle;
  safeEdgeCleanup: boolean;
  maxScaleFactor: SafeScaleFactor;
  smartScaling: boolean;
  captionsEnabled: boolean;
  captionStyle?: Partial<CaptionStyle>;
  transitionType: TransitionType;
  transitionDuration: number;
  audioEnhancement: boolean;
  normalizeLoudness: boolean; // EBU R128
  removeDeadSilences: boolean;
  includeIntro: boolean;
  introTitle?: string;
  includeOutro: boolean;
}

export interface TimelineSegment {
  id: string;
  sourceStart: number;
  sourceEnd: number;
  duration: number;
  title: string;
  summary: string;
  speaker?: string;
  importanceScore: number;
  energyScore: number;
  storyRole: 'hook' | 'setup' | 'buildup' | 'climax' | 'resolution' | 'highlight';
  cropOffsetX?: number; // 0..1 (horizontal focal centroid in 16:9)
  scaleFactor: number; // 1.0 .. 1.28
  transitionIn: TransitionType;
  transitionOut: TransitionType;
  isEnabled: boolean;
  order: number;
  thumbnailUrl?: string;
  isBumper?: boolean;
}

export interface LongFormQualityCheckItem {
  id: string;
  name: string;
  status: 'pass' | 'fail' | 'warn' | 'auto_fixed';
  details: string;
}

export interface LongFormQualityReport {
  passed: boolean;
  targetDuration: number;
  actualDuration: number;
  durationDiffPercent: number;
  checks: LongFormQualityCheckItem[];
  autoFixesApplied: string[];
  timestamp: string;
}

export interface LongFormCompilation {
  id: string;
  projectId: string;
  title: string;
  status: 'draft' | 'analyzing' | 'rendering' | 'completed' | 'failed';
  progress: number;
  stage: string;
  detail?: string;
  settings: LongFormSettings;
  timeline: TimelineSegment[];
  estimatedDuration: number;
  actualDuration?: number;
  filePath?: string | null;
  fileSize?: number | null;
  downloadUrl?: string;
  qualityReport?: LongFormQualityReport | null;
  error?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GenerateTimelineRequest {
  targetDuration?: LongFormTargetDuration;
  customDurationSeconds?: number;
  editStyle?: LongFormEditStyle;
  safeEdgeCleanup?: boolean;
  maxScaleFactor?: SafeScaleFactor;
  smartScaling?: boolean;
  captionsEnabled?: boolean;
  transitionType?: TransitionType;
  audioEnhancement?: boolean;
  includeIntro?: boolean;
  introTitle?: string;
  includeOutro?: boolean;
}

export interface UpdateTimelineRequest {
  timeline?: TimelineSegment[];
  settings?: Partial<LongFormSettings>;
  title?: string;
}

export type VideoEncodingProfileType =
  | 'FAST_CUT'
  | 'QUALITY_CUT'
  | 'SOURCE_PRESERVE'
  | 'SHORTS_HIGH_QUALITY'
  | 'LONG_FORM_HIGH_QUALITY'
  | 'LOSSLESS_BLUR_HIGH_QUALITY'
  | 'SMART_REFRAME_HIGH_QUALITY'
  | 'PREVIEW_OPTIMIZED';

export interface QualityValidationReport {
  sourceResolution: string;
  outputResolution: string;
  sourceFps: number;
  outputFps: number;
  sourceBitrate: number;
  outputBitrate: number;
  sourceCodec: string;
  outputCodec: string;
  resolutionPreserved: boolean;
  fpsPreserved: boolean;
  unexpectedDownscale: boolean;
  unexpectedBitrateDrop: boolean;
  qualityWarnings: string[];
}

// ============================================================
// Voiceover → Auto Video (AI Visual Director) — Types
// ============================================================

export type VoiceoverSegmentType = 'sentence' | 'clause' | 'thought';

export type NarrativePurpose =
  | 'hook'
  | 'introduction'
  | 'establishing_shot'
  | 'character_introduction'
  | 'location_introduction'
  | 'explanation'
  | 'action'
  | 'transition'
  | 'comparison'
  | 'contrast'
  | 'evidence'
  | 'example'
  | 'emotional_beat'
  | 'reaction'
  | 'climax'
  | 'reveal'
  | 'consequence'
  | 'conclusion'
  | 'outro';

export type VoiceoverMatchingMode =
  | 'balanced'
  | 'maximum_semantic'
  | 'cinematic'
  | 'fast_pacing'
  | 'minimal_cuts'
  | 'maximum_variety';

export type VoiceoverOutputAspectRatio = '16:9' | '9:16' | '1:1' | 'custom';

export interface NarrationSegment {
  segmentId: string;
  start: number;
  end: number;
  duration: number;
  text: string;
  sentenceIndex: number;
  paragraphIndex: number;
  type: VoiceoverSegmentType;
  entities: string[];
  location?: string;
  time?: string;
  action?: string;
  visualConcepts: string[];
  narrativePurpose: NarrativePurpose;
  emotion?: string;
  visualPriority: 'high' | 'medium' | 'low';
  storyImportance: number;
  hasContrast?: boolean;
  contrastWord?: string;
  chronologyMarker?: string;
  wordTimestamps?: WordTimestamp[];
}

export interface FootageVisualSegment {
  subSegmentId: string;
  clipId: string;
  start: number;
  end: number;
  duration: number;
  subjects: string[];          // Level 1: Objects (person, car, mountain, building, animal, ...)
  actions: string[];           // Level 2: Actions (walking, running, driving, talking, celebrating, ...)
  environment: string[];       // Level 3: Environment (airport, city, beach, forest, office, street, ...)
  shotCharacteristics: string[];// Level 4: Shot types (wide shot, close-up, aerial, drone, handheld, static, ...)
  semanticConcepts: string[];  // Level 5: Concepts (freedom, danger, wealth, struggle, success, ...)
  emotion?: string;
  timeOfDay?: string;          // daytime, sunset, night, golden hour
  weather?: string;
  cameraMovement?: string;
  motionIntensity: number;     // 0-100
  keyframeUrl?: string;
  embedding?: number[];
  isBumper?: boolean;
}

export interface FootageAsset {
  clipId: string;
  projectId: string;
  originalFilename: string;
  filename: string;
  sourceFile: string;          // Direct pointer to original source media to preserve pristine quality!
  fileSize: number;
  duration: number;
  width: number;
  height: number;
  fps: number;
  codec: string;
  pixelFormat?: string;
  audioCodec?: string;
  audioSampleRate?: number;
  bitrate?: number;
  visualSegments: FootageVisualSegment[];
  visualTags: string[];
  qualityScore: number;        // 0-100 based on sharpness, resolution, bitrate, corruption check
  usageCount: number;
  matchCount: number;
  analysisStatus: 'pending' | 'analyzing' | 'analyzed' | 'failed';
  error?: string;
  thumbnailUrl?: string;
  isBumper?: boolean;
  createdAt: string;
}

export interface VisualFootageIndex {
  projectId: string;
  totalClips: number;
  totalDuration: number;
  totalSegments: number;
  clips: FootageAsset[];
  indexedAt: string;
}

export interface CandidateScoreBreakdown {
  semanticScore: number;
  actionScore: number;
  entityScore: number;
  environmentScore: number;
  narrativeScore: number;
  continuityScore: number;
  durationScore: number;
  qualityScore: number;
  varietyScore: number;
  reusePenalty: number;
  overallScore: number;
}

export interface VisualMatchCandidate {
  clipId: string;
  subSegmentId: string;
  sourceStart: number;
  sourceEnd: number;
  duration: number;
  score: CandidateScoreBreakdown;
  isLowConfidence: boolean;
  reasons: string[];
  thumbnailUrl?: string;
  clipFilename?: string;
}

export interface VoiceoverTimelineShot {
  shotId: string;
  clipId: string;
  clipFilename: string;
  sourceFile: string;          // Original source file!
  sourceStart: number;
  sourceEnd: number;
  timelineStart: number;
  timelineEnd: number;
  duration: number;
  matchScore: number;          // 0-100
  confidence: number;          // 0-1
  isLowConfidence: boolean;
  reasons: string[];
  transition: TransitionType;
  transitionDuration: number;
  transitionOut?: TransitionType;
  transitionOutDuration?: number;
  isLocked: boolean;           // 🔒 Manual lock protecting against AI regeneration
  isManualOverride: boolean;   // User manually replaced or trimmed
  framingMode: ReframeMode;    // 'action' | 'blur_fill' | 'center'
  cropOffsetX?: number;
  scaleFactor?: number;
  thumbnailUrl?: string;
}

export interface VoiceoverTimelineSegment {
  segmentId: string;
  voiceStart: number;
  voiceEnd: number;
  duration: number;
  text: string;
  narrativePurpose: NarrativePurpose;
  shots: VoiceoverTimelineShot[];
}

export interface VoiceoverTimeline {
  timelineId: string;
  projectId: string;
  voiceoverId: string;
  duration: number;
  segments: VoiceoverTimelineSegment[];
  matchingMode: VoiceoverMatchingMode;
  outputAspectRatio: VoiceoverOutputAspectRatio;
  outputWidth: number;
  outputHeight: number;
  outputFps: number;
  captionsEnabled: boolean;
  captionStyle?: Partial<CaptionStyle>;
  backgroundMusicUrl?: string;
  musicVolume?: number;
  duckMusicUnderNarration?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface VoiceoverQualityCheckItem {
  id: string;
  name: string;
  status: 'pass' | 'fail' | 'warn' | 'auto_fixed';
  details: string;
  metricValue?: string | number;
}

export interface VoiceoverQualityReport {
  productionReadinessScore: number;
  passed: boolean;
  voiceoverDuration: number;
  visualCoveragePercent: number;
  strongMatchesCount: number;
  goodMatchesCount: number;
  lowConfidenceCount: number;
  clipReuseCount: number;
  unusedClipsCount: number;
  timelineGapsCount: number;
  qualityWarningsCount: number;
  sourceResolutionPreserved: boolean;
  sourceFpsPreserved: boolean;
  checks: VoiceoverQualityCheckItem[];
  timestamp: string;
}

export interface VoiceoverProjectState {
  projectId: string;
  voiceover?: {
    id: string;
    filename: string;
    originalFilename: string;
    filePath: string;
    duration: number;
    format: string;
    sampleRate: number;
    channels: number;
    status: 'ready' | 'transcribing' | 'transcribed' | 'failed';
    error?: string;
  };
  transcription?: {
    language: string;
    fullText: string;
    segments: NarrationSegment[];
    wordCount: number;
  };
  footageIndex: FootageAsset[];
  timeline?: VoiceoverTimeline;
  qualityReport?: VoiceoverQualityReport;
  status: 'setup' | 'analyzing' | 'timeline_ready' | 'rendering' | 'completed' | 'failed';
  renderProgress: number;
  renderStage: string;
  renderDetail?: string;
  renderedVideoPath?: string;
  renderedVideoUrl?: string;
  renderedFileSize?: number;
  createdAt: string;
  updatedAt: string;
}

export interface WSVoiceoverProgress {
  type: 'voiceover_progress';
  payload: {
    projectId: string;
    progress: number;
    stage: string;
    detail?: string;
    status: 'setup' | 'analyzing' | 'timeline_ready' | 'rendering' | 'completed' | 'failed';
  };
}

// ============================================================
// Movie & Series Explanation Studio — Shared Types
// ============================================================

export type NarrativeStageType =
  | 'opening'
  | 'setup'
  | 'character_introduction'
  | 'conflict'
  | 'investigation'
  | 'clue'
  | 'rising_tension'
  | 'turning_point'
  | 'reveal'
  | 'reaction'
  | 'climax_setup'
  | 'climax'
  | 'consequence'
  | 'resolution'
  | 'transition'
  | 'title_or_bumper';

export type SceneImportanceLevel = 'critical' | 'important' | 'supporting' | 'optional' | 'unnecessary';

export interface StoryCharacter {
  id: string;
  name: string;
  aliases: string[];
  role: 'protagonist' | 'antagonist' | 'supporting' | 'mentor' | 'witness' | 'minor';
  description: string;
  firstAppearanceTime: number;
}

export interface StoryEvent {
  id: string;
  title: string;
  description: string;
  timestampStart: number;
  timestampEnd: number;
  stage: NarrativeStageType;
  charactersInvolved: string[];
  isKeyReveal: boolean;
  isClimax: boolean;
  setupForEventId?: string;
  payoffForEventId?: string;
  evidence: string;
}

export interface StoryMap {
  title?: string;
  logline?: string;
  characters: StoryCharacter[];
  characterRelationships: Array<{ from: string; to: string; relationship: string }>;
  openingSituation: string;
  initialConflict: string;
  importantDiscoveries: string[];
  mysteriesAndClues: string[];
  risingTensionBeats: string[];
  majorTurningPoints: StoryEvent[];
  revelations: StoryEvent[];
  climaxSetup: string;
  mainClimax: StoryEvent;
  consequences: string[];
  resolution: string;
  confidence: number;
}

// ── Rights & Licensing Management (Requirement 1, 2 & 3) ──

export type AssetRightsStatus =
  | 'clean'                  // Clean rights status
  | 'owned'                  // User-owned original graphics, diagrams, or self-shot footage
  | 'licensed'               // Licensed commercial stock / third-party asset with usage rights
  | 'permission_granted'     // Written or explicit permission granted by copyright holder
  | 'public_domain'          // In the public domain or CC0
  | 'public_domain_verified' // Verified public domain status
  | 'unverified'             // Ingested media requiring rights review
  | 'unreviewed'             // Alias for unverified
  | 'restricted'             // Known studio / broadcast media with identified restrictions
  | 'uncertain';             // Ambiguous or unconfirmed rights

export type VisualAssetCategory =
  | 'movie_source'       // Ingested movie/series footage
  | 'licensed_stock'     // Licensed B-roll or stock video
  | 'original_graphic'   // Diagrams, charts, title cards, motion graphics
  | 'user_created'       // Screen recording, facecam, custom animation
  | 'public_domain'      // Public-domain / CC0 archival or stock footage
  | 'creative_commons'   // Creative Commons licensed visual asset
  | 'custom_visual';     // General replacement visual asset

export interface AssetRightsMetadata {
  rightsStatus: AssetRightsStatus;
  sourceFilename: string;
  sourceReference?: string;           // Origin, studio, distributor, or author
  sourceUrl?: string;                 // URL of original asset if known
  creatorOrRightsHolder?: string;     // Identified copyright owner
  licenseDetails?: string;            // License key, contract ref, or license terms
  evidenceReference?: string;         // Reference to license file, receipt, or agreement
  evidenceDocumentPath?: string;      // Local path to license PDF, receipt, or agreement
  usageRestrictions?: string;         // Platform, territory, or monetization limitations
  attributionRequirements?: string;   // Required credit line or attribution notice
  commercialUsePermitted?: boolean;   // Whether commercial use is explicitly granted
  notes?: string;                     // User review notes
  verifiedBy?: string;                // User or administrator ID
  lastReviewedAt?: string;            // ISO timestamp of last rights review
  updatedAt?: string;
}

export type ShotAlignmentMode = 'fit_narration' | 'crop_duration' | 'loop' | 'hold';

export interface ShotReplacementSource {
  isReplacement: boolean;
  originalSceneId?: string;
  replacementAssetId?: string;
  assetLabel?: string;
  sourceFilePath: string;
  alignmentMode: ShotAlignmentMode;
  originalNarrationDuration: number;
  actualFootageDuration: number;
  startOffset?: number;
  mediaType: 'video' | 'image' | 'graphic';
}

export interface FlaggedTimelineSection {
  shotId: string;
  segmentId: string;
  timelineStart: number;
  timelineEnd: number;
  duration: number;
  sourceFilename: string;
  rightsStatus: AssetRightsStatus;
  category: VisualAssetCategory;
  reason: string;
  suggestedAction: 'replace_with_graphic' | 'replace_with_licensed' | 'document_permission' | 'review_rights';
}

export interface PreExportRightsReview {
  totalShots: number;
  ownedShotsCount: number;
  licensedShotsCount: number;
  permissionGrantedCount: number;
  publicDomainCount: number;
  unverifiedShotsCount: number;
  restrictedShotsCount: number;
  flaggedShotsCount: number;
  attributions: string[];
  usageRestrictions: string[];
  disclaimer: string;
  flaggedShotIds: string[];
  flaggedSections: FlaggedTimelineSection[];
  userAcknowledged?: boolean;
  acknowledgedAt?: string;
}

export interface ProvenanceShotRecord {
  shotIndex: number;
  shotId: string;
  timelineStart: number;
  timelineEnd: number;
  duration: number;
  timelineStartFormatted: string;
  timelineEndFormatted: string;
  sourceFile: string;
  sourceStart: number;
  sourceEnd: number;
  sourceStartFormatted: string;
  sourceEndFormatted: string;
  sceneId: string;
  presentationType: string;
  assetCategory: VisualAssetCategory;
  rightsStatus: AssetRightsStatus;
  sourceReference: string;
  creatorOrRightsHolder: string;
  licenseDetails: string;
  attribution: string;
  usageRestrictions: string;
  narrationSnippet: string;
  isStillScreenshot: boolean;
  matchScore?: number;
  confidence?: number;
}

export interface ProvenanceManifest {
  manifestVersion: string;
  generatedAt: string;
  projectId: string;
  projectName: string;
  totalShots: number;
  totalDuration: number;
  totalDurationFormatted: string;
  rightsSummary: {
    owned: number;
    licensed: number;
    permissionGranted: number;
    publicDomain: number;
    unverified: number;
    restricted: number;
    flagged: number;
  };
  attributionsList: string[];
  disclaimer: string;
  shots: ProvenanceShotRecord[];
}

// ── Script Review & Commentary Assessment (Section 3) ──

export interface ScriptSuggestion {
  id: string;
  segmentId?: string;
  sentenceIndex?: number;
  type: 'commentary_depth' | 'footage_dependence' | 'hook_pacing' | 'climax_coherence' | 'redundancy' | 'visual_sync';
  severity: 'recommendation' | 'caution' | 'praise';
  title: string;
  description: string;
  suggestedImprovement?: string;
  suggestedVisualAlternative?: 'diagram' | 'timeline_chart' | 'relationship_map' | 'evidence_graphic' | 'licensed_stock';
}

export interface ScriptReviewReport {
  overallScore: number;                 // 0-100 overall commentary readiness score
  originalInsightScore: number;         // 0-100 ratio of original insight/criticism vs raw plot retelling
  footageDependenceRatio: number;       // 0.0-1.0 fraction of timeline relying on raw 3rd-party footage
  hookQualityScore: number;             // 0-100 opening 90-second engagement and analytical framing
  climaxCoherenceScore: number;         // 0-100 coherence of climax and resolution explanation
  redundancyScore: number;              // 0-100 clarity / lack of repetitive filler
  totalNarrationWords: number;
  estimatedReadingTimeSec: number;
  longThirdPartySpans: Array<{
    startSec: number;
    endSec: number;
    durationSec: number;
    recommendation: string;
  }>;
  suggestions: ScriptSuggestion[];
  reviewedAt: string;
  disclaimer: string;
}

export interface EpisodeScene {
  sceneId: string;
  sceneIndex: number;
  startTime: number;
  endTime: number;
  duration: number;
  shotBoundaries: number[];
  sourceFile?: string;
  dialogueSnippet: string;
  dialogueText?: string;
  characters: string[];
  location?: string;
  actions: string[];
  objectsAndEvidence: string[];
  events: string[];
  emotionalTone: string;
  narrativePurpose: NarrativeStageType;
  description: string;
  visualDetails: string[];
  causeEffectRole?: 'cause' | 'effect' | 'standalone';
  isClueOrReveal: boolean;
  isQuietMotivational: boolean;
  isActionHeavy: boolean;
  importance: SceneImportanceLevel;
  confidence: number;
  thumbnailUrl?: string;
  representativeFramePaths?: string[]; // Multi-frame extraction: start, midpoint, peak action
  characterAppearances?: string[]; // Clothing, appearance, visual cues
  secondaryActions?: string[];
  dialogueRange?: { startTime: number; endTime: number; text: string };
  isTitleOrBumper?: boolean;
  isExcludedFromNarration?: boolean;
  rightsMetadata?: AssetRightsMetadata;
  assetCategory?: VisualAssetCategory;
}

export interface EpisodeIntelligenceIndex {
  mediaId: string;
  originalVideoPath: string;
  filename: string;
  duration: number;
  totalDuration?: number; // Compatibility alias
  width: number;
  height: number;
  fps: number;
  codec: string;
  audioCodec: string;
  bitrate: number;
  fileSize: number;
  scenes: EpisodeScene[];
  storyMap: StoryMap;
  indexedAt: string;
  narrativeStartTime?: number;
  excludedBumperRanges?: Array<{ startTime: number; endTime: number; type: string }>;
}

export interface ExplanationSubAction {
  clauseIndex: number;
  clauseText: string;
  actionText: string;
  startTime: number;
  endTime: number;
  subStart?: number;
  subEnd?: number;
  actionConcept?: string;
  duration: number;
  keywords: string[];
}

export interface ExplanationScriptSegment {
  segmentId: string;
  text: string;
  voiceoverStart: number;
  voiceoverEnd: number;
  duration: number;
  sentenceIndex: number;
  paragraphIndex: number;
  mainSubjectOrCharacter?: string;
  referencedCharacters?: string[];
  storyEventOrAction?: string;
  relevantSceneIds?: string[];
  sourceStartTime?: number;
  sourceEndTime?: number;
  selectedShotId?: string;
  selectedSceneId?: string;
  confidenceScore?: number;
  candidateAlternatives?: Array<{
    sceneId: string;
    startTime: number;
    endTime: number;
    score: number;
    reason: string;
  }>;
  presentationType?: 'video_clip' | 'screenshot';
  timelineStart?: number;
  timelineEnd?: number;
  eventsDescribed: string[];
  narrativePurpose: NarrativeStageType;
  emotionalTone?: string;
  visualIntent: string;
  requiresMultiShot: boolean;
  targetShotCount: number;
  subActions?: ExplanationSubAction[];
  associatedStoryEventId?: string;
  wordTimestamps?: WordTimestamp[];
}

export interface ExplanationScript {
  rawText: string;
  format: 'plain' | 'srt' | 'vtt';
  segments: ExplanationScriptSegment[];
  alignmentConfidence: number;
  mismatchWarning?: string;
  isAlignedToVoiceover: boolean;
}

export type MovieScreenshotMotionEffect = 'pan_left_to_right' | 'pan_right_to_left' | 'gentle_zoom_in' | 'gentle_zoom_out' | 'subtle_diagonal';

export interface MovieTimelineShot {
  shotId: string;
  segmentId: string;
  sceneId: string;
  sourceFile: string;
  sourceStart: number;
  sourceEnd: number;
  timelineStart: number;
  timelineEnd: number;
  duration: number;
  matchScore: number;
  confidence: number;
  isLowConfidence: boolean;
  whyThisScene: {
    characterMatch: string;
    actionMatch: string;
    storyContextReason: string;
    chronologyCheck: string;
    emotionalFit: string;
    fullSummary: string;
  };
  transition: TransitionType;
  transitionDuration: number;
  transitionOut?: TransitionType;
  transitionOutDuration?: number;
  isLocked: boolean;
  isManualOverride: boolean;
  framingMode: ReframeMode;
  thumbnailUrl?: string;
  sceneDescription?: string;
  sceneDialogue?: string;
  speedMultiplier?: number;
  isFlipped?: boolean;
  zoomLevel?: number;
  hasTextOrSigns?: boolean;
  isKenBurnsStill?: boolean;
  hasJumpCut?: boolean;
  isUnmatched?: boolean;
  matchStatus?: 'matched' | 'needs_review' | 'unmatched' | 'manually_assigned' | 'manually_approved';
  isDuplicate?: boolean;
  unmatchedReason?: string;
  sentenceText?: string;
  presentationType?: 'video_clip' | 'screenshot';
  motionEffect?: 'pan_left_to_right' | 'pan_right_to_left' | 'gentle_zoom_in' | 'gentle_zoom_out' | 'subtle_diagonal';
  isScreenshot?: boolean;
  screenshotDuration?: number;
  duplicateWarning?: string;
  screenshotCadenceStatus?: string;
  referencedCharacters?: string[];
  storyEvent?: string;
  pacingConstraintMode?: any;
  isStillHold?: boolean;
  stillHoldDuration?: number;
  directorialFraming?: 'close_up' | 'medium' | 'wide' | 'extreme_close_up';
  directorialFramingScale?: number;
  directorialMotion?: 'pan_left_to_right' | 'pan_right_to_left' | 'gentle_zoom_in' | 'gentle_zoom_out' | 'subtle_diagonal';
  isDramaticHold?: boolean;
  rightsStatus?: AssetRightsStatus;
  rightsMetadata?: AssetRightsMetadata;
  assetCategory?: VisualAssetCategory;
  replacementSource?: ShotReplacementSource;
  appliedTransforms?: {
    cropFactor?: number;
    colorGrade?: string;
    speedShift?: number;
    isMirrored?: boolean;
  };
  trackId?: string;
  trackIndex?: number;
  transform?: ClipTransformSettings;
  transformSettings?: ClipTransformSettings;
  colorGrading?: ClipColorGrading;
  filterEffect?: ClipFilterEffect;
  border?: ClipBorderSettings;
  borderSettings?: ClipBorderSettings;
  speedSettings?: ClipSpeedSettings;
  alternatives?: Array<{
    sceneId: string;
    startTime: number;
    endTime: number;
    score: number;
    reason: string;
  }>;
  verificationCheckpoint?: MovieAnalyzerVerificationCheckpoint;
  stageBVerification?: VisionStageBVerification;
}

// ── Manual Editing Controls & Multi-Track Studio Interfaces ──

export interface ClipTransformSettings {
  scale: number; // 10% .. 400% (default 100)
  zoom: number; // 0.5 .. 3.0 (default 1.0)
  positionX: number; // -100% .. +100% (default 0)
  positionY: number; // -100% .. +100% (default 0)
  cropTop: number; // 0 .. 50% (default 0)
  cropBottom: number; // 0 .. 50% (default 0)
  cropLeft: number; // 0 .. 50% (default 0)
  cropRight: number; // 0 .. 50% (default 0)
  rotation: number; // -360 .. 360 deg (default 0)
  fitMode: 'fit' | 'fill' | 'stretch' | 'original';
  keepAspectRatio: boolean;
  horizontalAlign: 'left' | 'center' | 'right';
  verticalAlign: 'top' | 'center' | 'bottom';
  flipHorizontal?: boolean;
  flipVertical?: boolean;
  keyframes?: Array<{
    timeOffset: number;
    scale?: number;
    positionX?: number;
    positionY?: number;
    rotation?: number;
  }>;
}

export interface ClipColorGrading {
  brightness: number; // -1.0 .. 1.0 (default 0.0)
  exposure: number; // -2.0 .. 2.0 (default 0.0)
  contrast: number; // 0.0 .. 2.0 (default 1.0)
  saturation: number; // 0.0 .. 2.0 (default 1.0)
  temperature: number; // -100 .. 100 (warm/cool, default 0)
  tint: number; // -100 .. 100 (green/magenta, default 0)
  highlights?: number; // -100 .. 100 (default 0)
  shadows?: number; // -100 .. 100 (default 0)
  whites?: number; // -100 .. 100 (default 0)
  blacks?: number; // -100 .. 100 (default 0)
  fade?: number; // 0 .. 100 (default 0)
  sharpen: number; // 0 .. 100 (default 0)
  vignette: number; // 0 .. 100 (default 0)
  preset?: string;
  presetName?: string;
}

export type ClipFilterType =
  | 'none'
  | 'cinematic'
  | 'warm'
  | 'cool'
  | 'vintage'
  | 'film'
  | 'bw'
  | 'soft_contrast'
  | 'sharpen'
  | 'blur'
  | 'vignette'
  | 'film_grain'
  | 'glow'
  | 'glitch'
  | 'motion_blur'
  | 'fade';

export interface ClipFilterEffect {
  type: ClipFilterType;
  effectType?: string;
  intensity: number; // 0.0 .. 1.0 (default 0.7)
  duration?: number;
  enabled: boolean;
}

export type ClipBorderStyle =
  | 'none'
  | 'minimal'
  | 'rounded'
  | 'cinematic'
  | 'white'
  | 'black'
  | 'custom'
  | 'gradient';

export interface ClipBorderSettings {
  enabled: boolean;
  style: ClipBorderStyle;
  color: string; // e.g. '#ffffff' or 'rgba(255,255,255,0.9)'
  borderColor?: string;
  backgroundColor?: string;
  secondaryColor?: string; // for gradient
  thickness: number; // 1 .. 40 px (default 4)
  padding: number; // 0 .. 50 px (default 0)
  borderRadius: number; // 0 .. 40 px (default 0)
  shadow: boolean;
  hasShadow?: boolean;
  shadowBlur?: number;
  shadowColor?: string;
  scope?: 'clip' | 'all' | 'canvas' | 'shot';
}

export interface ClipSpeedSettings {
  speedMultiplier?: number; // 0.25 .. 4.0 (default 1.0)
  playbackRate?: number;
  preset?: 'slow_0_5x' | 'slow_0_75x' | 'normal_1x' | 'fast_1_25x' | 'fast_1_5x' | 'fast_2x' | 'custom' | string;
  preservePitch?: boolean;
  maintainPitch?: boolean;
  muteOriginalAudio?: boolean;
}

export interface TimelineTrackDef {
  id: string;
  index: number;
  name: string;
  type:
    | 'main_video'
    | 'video_overlay'
    | 'voiceover'
    | 'clip_audio'
    | 'bgm'
    | 'sfx'
    | 'captions'
    | 'text'
    | 'borders'
    | 'vfx';
  isMuted?: boolean;
  isLocked?: boolean;
  isVisible?: boolean;
  height?: number;
}

export interface TimelineTextOverlay {
  id: string;
  text: string;
  timelineStart: number;
  timelineEnd: number;
  startTime?: number; // Compatibility alias
  duration?: number;
  trackId?: string;
  positionX: number; // 0 .. 100 (%)
  positionY: number; // 0 .. 100 (%)
  fontSize: number; // px
  fontFamily: string;
  fontWeight: 'normal' | '500' | '600' | 'bold' | '800' | '700' | string;
  fontColor: string;
  color?: string; // Compatibility alias
  backgroundColor?: string;
  outlineColor?: string;
  outlineWidth?: number;
  shadowColor?: string;
  shadowBlur?: number;
  opacity: number; // 0.0 .. 1.0
  rotation: number; // deg
  scale?: number;
  alignment?: 'left' | 'center' | 'right' | string;
  animation?: 'none' | 'fade' | 'slide_up' | 'pop' | 'typewriter';
  category?: 'title' | 'caption' | 'callout' | 'lower_third';
}

export interface CaptionStyleSettings {
  visible?: boolean;
  visibility?: boolean; // Compatibility alias
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: string | number;
  fontColor?: string;
  backgroundColor?: string;
  backgroundOpacity?: number;
  outlineColor?: string;
  outlineThickness?: number;
  shadow?: boolean;
  shadowColor?: string;
  shadowBlur?: number;
  align?: 'left' | 'center' | 'right';
  positionY?: number; // 0 .. 100 (% from top, default 90)
  bottomMargin?: number; // px
  maxWidth?: number; // % e.g. 76
  lineSpacing?: number;
  letterSpacing?: number;
  preset?: string;
  animation?: 'none' | 'typewriter' | 'word_by_word' | 'karaoke' | 'fade';
  highlightColor?: string;
}

export interface TimelineCaptionItem {
  id: string;
  text: string;
  startTime: number;
  endTime: number;
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: string | number;
  fontColor?: string;
  outlineColor?: string;
  outlineThickness?: number;
  backgroundColor?: string;
  backgroundOpacity?: number;
  shadow?: boolean;
  align?: 'left' | 'center' | 'right';
  positionY?: number; // 0 .. 100 (default 90 near bottom)
  bottomMargin?: number;
  maxWidth?: number;
  lineSpacing?: number;
  letterSpacing?: number;
  animation?: 'none' | 'typewriter' | 'word_by_word' | 'karaoke' | 'fade';
  highlightColor?: string;
  words?: WordTimestamp[];
}

export interface TimelineAudioLayer {
  id: string;
  trackType: 'voiceover' | 'clip_audio' | 'bgm' | 'sfx';
  name: string;
  sourceUrl?: string;
  sourceFilePath?: string;
  timelineStart: number;
  timelineEnd: number;
  duration: number;
  volume: number; // 0.0 .. 2.0 (default 1.0)
  fadeInDuration?: number;
  fadeOutDuration?: number;
  isMuted?: boolean;
}

export interface GlobalCanvasSettings {
  aspectRatio: VoiceoverOutputAspectRatio;
  backgroundColor: string;
  globalBorder?: ClipBorderSettings;
}

export interface MovieExplanationExportSettings {
  format: 'mp4';
  resolution: '1080p' | '720p' | '4k' | 'source' | 'custom';
  width: number;
  height: number;
  fps: number; // 24, 30, 60 (default 60)
  qualityPreset: 'draft_preview' | 'fast_export' | 'balanced' | 'high_quality' | 'pro_lossless';
  crf: number;
  bitrate?: string;
  burnInSubtitles: boolean;
  exportSrtFile: boolean;
  outputFilename?: string;
  outputFolder?: string;
}

export type CreativePresetType = 'neutral' | 'subtle_cinema' | 'vibrant_commentary' | 'dramatic_contrast' | 'custom';

export interface SilenceHandlingSettings {
  mode: 'preserve_original' | 'remove_leading_silence' | 'smart_trim';
  noiseThresholdDb: number; // e.g. -40dB
  minSilenceDuration: number; // e.g. 0.3s
  leadingSilenceDuration?: number;
  isSilenceRemoved?: boolean;
}

export interface AudioDuckingSettings {
  enabled: boolean;
  duckingDb: number; // e.g. -14dB
  attackMs: number;  // e.g. 100ms
  releaseMs: number; // e.g. 350ms
}

export interface VisionStageAResult {
  visibleSubjects: string[];
  observableAction: string;
  setting: string;
  importantObjects: string[];
  relevantVisualChanges?: string;
  visibleText?: string;
  uncertainty?: string;
  keywords: string[];
  description: string;
  confidence: number;
}

export interface ModelAStoryRequirements {
  segmentId: string;
  narrationText: string;
  primaryCharacter?: string;
  secondaryCharacters?: string[];
  requiredAction: string;
  requiredLocation?: string;
  expectedTone?: string;
  sceneType?: 'dialogue_reaction' | 'action_beat' | 'establishing' | 'flashback' | 'reveal' | 'emotional_reaction' | 'transition';
  shotTypePreference?: 'close_up' | 'medium' | 'wide' | 'reaction' | 'action';
  expectedMovieTimeWindow?: { start: number; end: number };
  originalTranscriptRef?: string;
  searchKeywords: string[];
}

export interface VisionStageBVerification {
  candidateSceneId: string;
  supportsNarration: boolean;
  matchingDetails: string[];
  contradictions: string[];
  isEvidenceInsufficient: boolean;
  calibratedConfidence: number; // 0.0 .. 1.0
  reason: string;
  status: 'verified_match' | 'partial_match' | 'contradicted' | 'insufficient_evidence';
  visualConfidence?: 'HIGH' | 'MEDIUM' | 'LOW' | 'REJECT';
  characterVerified?: boolean;
  actionVerified?: boolean;
  locationVerified?: boolean;
  verifiedFramePath?: string;
}

export interface OpeningVerificationReport {
  openingDuration: number; // e.g. 120s
  hasInitialBlackGap: boolean;
  initialBlackDuration: number;
  firstFrameTimestamp: number;
  isReadyForFullExport: boolean;
  issues: string[];
  warnings: string[];
  narrationUnits: Array<{
    segmentId: string;
    text: string;
    voiceoverStart: number;
    voiceoverEnd: number;
    intendedVisualConcept: string;
    selectedShot: {
      shotId: string;
      sceneId: string;
      sourceStart: number;
      sourceEnd: number;
      thumbnailUrl?: string;
    };
    candidateAlternatives: Array<{
      sceneId: string;
      startTime: number;
      endTime: number;
      thumbnailUrl?: string;
      matchScore: number;
      reason: string;
    }>;
    matchConfidence: number;
    evidenceSummary: string;
    unresolvedIssues?: string[];
    stageBVerification?: VisionStageBVerification;
  }>;
}

export interface RenderOutputValidationResult {
  isValid: boolean;
  outputPath: string;
  fileSize: number;
  duration: number;
  expectedDuration: number;
  durationDelta: number;
  hasInitialBlackGap: boolean;
  initialBlackDuration: number;
  firstFrameSignalStats?: {
    yAvg: number;
    isNearBlack: boolean;
  };
  hasValidVideo: boolean;
  hasValidAudio: boolean;
  audioStartDelta: number;
  streamDetails?: {
    videoCodec?: string;
    audioCodec?: string;
    width?: number;
    height?: number;
    fps?: number;
  };
  issues: string[];
  warnings: string[];
}

export interface TransformativeEditingSettings {
  preset?: CreativePresetType;
  enableFairUsePreset: boolean; // One-click copyright protection preset
  maxShotDuration: number; // 1.0 .. 6.0 seconds (strict cut maximum for pacing: default 3.0s)
  strictClipDurationMode?: boolean; // When true, strictly enforces <= 3.0s shots (default: true)
  minShotDuration: number; // 1.5 .. 3.0 seconds
  minClipDuration?: number; // Alias for minShotDuration (default: 3.0s)
  horizontalFlip: boolean; // Invert left-right
  playbackSpeed: number; // 0.95 .. 1.15x (default 1.00x neutral)
  zoomLevel: number; // 1.0 .. 1.25 (e.g. 1.04x margin crop)
  silenceHandling?: SilenceHandlingSettings;
  colorGrading: {
    enabled: boolean;
    brightness: number; // -0.2 .. +0.2
    contrast: number; // 0.8 .. 1.3
    saturation: number; // 0.7 .. 1.5
    sharpness: number; // 0.0 .. 1.5
    vignette: boolean;
    gamma?: number;
  };
  audioMixing: {
    sourceMovieVolume: number; // 0.0 .. 1.0 (default 0.0: mute movie audio)
    voiceoverVolume: number; // 0.8 .. 1.5 (default 1.0: master voiceover)
    bgmVolume: number; // 0.0 .. 0.5 (default 0.0 if no track)
    bgmTrackUrl?: string;
    bgmFadeInDuration?: number; // seconds
    bgmFadeOutDuration?: number; // seconds
    ducking?: AudioDuckingSettings;
    enableAmbientCinematicBed?: boolean; // Layer low-volume ambient cinematic background bed
    enableCutSoundEffects?: boolean; // Sound effects at cut points
    sfxVolume?: number; // 0.05 .. 0.25 (default 0.12)
  };
  invisibleTransforms?: {
    enabled: boolean; // Master toggle for randomized invisible transforms per clip
    microScaling: boolean; // 2% - 5% randomized crop + Lanczos scaling (The "Breath" effect)
    colorRemapping: boolean; // Randomized subtle color matrix / temperature tilt per clip
    microTemporalShift: boolean; // Subtle 0.98x or 1.02x speed shift per clip
    intelligentMirroring: boolean; // Flip horizontally ONLY if AI detects no text/readable signs
    sixSecondRule: boolean; // Enforce strict 6-second maximum shot duration
    jumpCutIntegration: boolean; // 0.1s micro-cuts to break continuity stream
  };
  framingMode: ReframeMode;
  captionsEnabled: boolean;
  captionStyle?: {
    fontSize: number;
    fontColor: string;
    outlineColor: string;
    alignment: number;
  };
  qualityPreset: 'draft_preview' | 'fast_export' | 'balanced' | 'high_quality' | 'pro_lossless';
  crf?: number; // Visually lossless CRF (default 18)
  encoder?: 'auto' | 'libx264' | 'h264_nvenc' | 'h264_qsv' | 'h264_amf'; // libx264 or hardware accelerated QSV/NVENC/AMF
  encoderPreset?: 'ultrafast' | 'veryfast' | 'fast' | 'medium' | 'slow';
  allowStillHolds?: boolean; // explicit user setting permitting still-image holds
  maxStillHoldDuration?: number; // max duration in seconds for an intentional still hold (default 3.0s)
  screenshotInterval?: number; // Preferred screenshot cadence (default: 4)
  maxConsecutiveVideoClips?: number; // Maximum consecutive video clips before screenshot (default: 5)
  screenshotDuration?: number; // Duration of inserted moving screenshot (default: 5.5s)
  duplicatePolicy?: 'no_automatic_reuse' | 'allow_after_spacing' | 'flag_all_reuse';
}

export interface MovieExplanationClipAsset {
  clipId: string;
  assetId?: string;
  label?: string;
  category?: VisualAssetCategory;
  assetCategory?: VisualAssetCategory;
  mediaType?: 'video' | 'image' | 'graphic';
  filename: string;
  originalFilename: string;
  filePath: string;
  duration: number;
  width: number;
  height: number;
  fps: number;
  thumbnailUrl?: string;
  tags?: string[];
  description?: string;
  characters?: string[];
  actions?: string[];
  emotionalTone?: string;
  analyzedAt?: string;
  fileSize: number;
  isAnalyzed: boolean;
  rightsMetadata?: AssetRightsMetadata;
}

export interface OllamaModelStatus {
  isReachable: boolean;
  version?: string;
  configuredModel: string;
  isModelInstalled: boolean;
  availableModels: string[];
  lastTestedAt?: string;
  statusMessage: string;
}

export interface PipelineStageMetric {
  stageName: string;
  elapsedMs: number;
  speedMultiplier?: number;
  itemsProcessed?: number;
  itemsCached?: number;
  status: 'pending' | 'active' | 'completed' | 'cached' | 'failed';
  detail?: string;
}

export interface DuplicateSceneReport {
  hasDuplicates: boolean;
  duplicateCount: number;
  duplicateIntervalsCount: number;
  duplicateDetails: Array<{
    sceneId: string;
    sourceStart: number;
    sourceEnd: number;
    occurrences: number;
    timelinePositions: number[];
  }>;
}

export interface MovieExplanationTimeline {
  timelineId: string;
  projectId: string;
  duration: number;
  shots: MovieTimelineShot[];
  outputAspectRatio: VoiceoverOutputAspectRatio;
  aspectRatio?: VoiceoverOutputAspectRatio; // Compatibility alias
  outputWidth: number;
  outputHeight: number;
  outputFps: number;
  timelineRevision?: number;
  revision?: number;
  lastExportedRevision?: number;
  transformativeSettings?: TransformativeEditingSettings;
  tracks?: TimelineTrackDef[];
  textOverlays?: TimelineTextOverlay[];
  captions?: TimelineCaptionItem[];
  captionStyle?: CaptionStyleSettings;
  audioLayers?: TimelineAudioLayer[];
  globalCanvas?: GlobalCanvasSettings;
  exportSettings?: MovieExplanationExportSettings;
  duplicateReport?: DuplicateSceneReport;
  verificationCheckpoints?: MovieAnalyzerVerificationCheckpoint[];
  createdAt: string;
  updatedAt: string;
}

export interface MovieQualityCheckItem {
  id: string;
  name: string;
  status: 'pass' | 'fail' | 'warn' | 'auto_fixed';
  details: string;
  metricValue?: string | number;
}

export interface MovieExplanationQualityReport {
  overallReadinessScore: number;
  passed: boolean;
  voiceoverDuration: number;
  timelineDuration: number;
  visualCoveragePercent: number;
  strongMatchesCount: number;
  lowConfidenceCount: number;
  unexplainedEventsCount: number;
  repeatedScenesCount: number;
  chronologyViolationsCount: number;
  sourceResolutionPreserved: boolean;
  sourceFpsPreserved: boolean;
  checks: MovieQualityCheckItem[];
  timestamp: string;
  totalNarrationDuration?: number;
  totalAssignedVideoDuration?: number;
  uniqueScenesCount?: number;
  unmatchedSegmentsCount?: number;
  repeatedScenesToReviewCount?: number;
  longestShotDuration?: number;
  longestShotId?: string;
  stillImageShotsCount?: number;
  sub3SecondClipsCount?: number;
  duplicateReport?: DuplicateSceneReport;
  missingMediaCount?: number;
  timelineGapsCount?: number;
  timelineOverlapsCount?: number;
  actionableErrors?: string[];
  actionableWarnings?: string[];
  rightsReview?: PreExportRightsReview;
  rightsAudit?: PreExportRightsReview;
  validationOutcome?: 'PASS' | 'REVIEW REQUIRED' | 'REVIEW_REQUIRED' | 'BLOCKED';
  blockedReasons?: string[];
  reviewReasons?: string[];
  screenshotCadenceViolationsCount?: number;
  maxDurationViolationsCount?: number;
  duplicateScenesCount?: number;
  nearDuplicateFootageCount?: number;
}

export interface AnalysisJobState {
  jobId: string;
  projectId: string;
  sourceFingerprint: string;
  status: 'idle' | 'running' | 'completed' | 'failed' | 'cancelled';
  currentStage: string;
  overallProgress: number;
  stageProgress: number;
  completedStages: string[];
  lastCheckpoint: string;
  stageDetail?: string;
  error?: string | null;
  startedAt?: string;
  updatedAt: string;
}

export interface MovieExplanationProjectState {
  projectId: string;
  projectName: string;
  name?: string; // Compatibility alias
  status: 'setup' | 'indexing_episode' | 'aligning_script' | 'timeline_ready' | 'rendering' | 'completed' | 'failed';
  inputMode: 'single_video' | 'multi_clips';
  originalVideo?: {
    id: string;
    filename: string;
    originalFilename: string;
    filePath: string;
    duration: number;
    width: number;
    height: number;
    fps: number;
    codec: string;
    audioCodec: string;
    bitrate: number;
    fileSize: number;
    thumbnailUrl?: string;
  };
  uploadedClips?: MovieExplanationClipAsset[];
  replacementAssets?: MovieExplanationClipAsset[];
  rightsAudit?: PreExportRightsReview;
  voiceoverAudio?: {
    id: string;
    filename: string;
    originalFilename: string;
    filePath: string;
    duration: number;
    format: string;
  };
  script?: ExplanationScript;
  episodeIndex?: EpisodeIntelligenceIndex;
  timeline?: MovieExplanationTimeline;
  transformativeSettings?: TransformativeEditingSettings;
  qualityReport?: MovieExplanationQualityReport;
  pipelineMetrics?: Record<string, PipelineStageMetric>;
  renderProgress: number;
  renderStage: string;
  renderDetail?: string;
  renderedVideoPath?: string;
  renderedVideoUrl?: string;
  renderedFileSize?: number;
  openingPreviewVideoPath?: string;
  openingPreviewVideoUrl?: string;
  timelineRevision?: number;
  lastExportedRevision?: number;
  exportStatus?: 'none' | 'up_to_date' | 'outdated' | 'rendering' | 'failed';
  lastExportValidation?: {
    passed: boolean;
    duration: number;
    videoDuration?: number;
    audioDuration?: number;
    fps: number;
    resolution: string;
    fileSize: number;
    verifiedAt: string;
    issues?: string[];
    warnings?: string[];
  };
  scriptReview?: ScriptReviewReport;
  originalTranscript?: {
    id: string;
    filename: string;
    originalFilename: string;
    filePath: string;
    format: 'txt' | 'srt' | 'vtt';
    segments: any[];
    dialogueCount: number;
  };
  matchingEngine?: 'legacy' | 'intelligence';
  exportManifest?: ExportManifest;
  createdAt: string;
  updatedAt: string;
}

export interface ExportManifest {
  manifestId: string;
  projectId: string;
  timelineRevision: number;
  generatedAt: string;
  outputSettings: {
    width: number;
    height: number;
    fps: number;
    aspectRatio: VoiceoverOutputAspectRatio;
    qualityPreset: string;
    crf: number;
    encoder: string;
    preset: string;
  };
  voiceoverAudioPath: string;
  voiceoverDuration: number;
  totalDuration: number;
  shotsCount: number;
  shots: Array<{
    shotIndex: number;
    shotId: string;
    segmentId: string;
    sceneId: string;
    sourcePath: string;
    sourceStart: number;
    sourceEnd: number;
    timelineStart: number;
    timelineEnd: number;
    duration: number;
    transition: TransitionType;
    transitionDuration: number;
    isReplacement: boolean;
    replacementSource?: ShotReplacementSource;
    rightsStatus: AssetRightsStatus;
    appliedTransforms?: any;
  }>;
  validation: {
    isValid: boolean;
    errors: string[];
    warnings: string[];
  };
}

export interface WSMovieExplanationProgress {
  type: 'movie_explanation_progress';
  payload: {
    projectId: string;
    progress: number;
    stage: string;
    detail?: string;
    status: MovieExplanationProjectState['status'];
    metrics?: Record<string, PipelineStageMetric>;
    analysisJob?: AnalysisJobState;
    timelineRevision?: number;
    lastExportedRevision?: number;
    exportStatus?: MovieExplanationProjectState['exportStatus'];
  };
}

// ============================================================
// AI Movie Analyzer & Multilingual Explanation Studio Types
// ============================================================

export type MovieAnalyzerLanguage = 'english' | 'hindi' | 'bangla';
export type MovieAnalyzerHookType = 'mystery' | 'high_stakes' | 'twist' | 'dramatic_conflict' | 'unanswered_question';
export type MovieAnalyzerStage = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface MultilingualScriptParagraph {
  id: string;
  section: 'hook' | 'context' | 'characters' | 'inciting_incident' | 'escalation' | 'reversals' | 'climax' | 'resolution' | 'takeaway';
  text: string;
  estimatedSeconds: number;
  suggestedScenes?: string[];
}

export interface MultilingualExplanationScript {
  language: MovieAnalyzerLanguage;
  title: string;
  hook: {
    text: string;
    durationSeconds: number; // 10–20s
    hookType: MovieAnalyzerHookType;
  };
  paragraphs: MultilingualScriptParagraph[];
  totalEstimatedDurationSeconds: number;
  wordCount: number;
  notes?: string;
  updatedAt?: string;
  isEdited?: boolean;
  isApproved?: boolean;
  approvedAt?: string;
  validation?: {
    isValid: boolean;
    wordCountTargetMet: boolean;
    durationTargetMet: boolean;
    hasMovieSpecificHook: boolean;
    sectionsCount: number;
    warnings?: string[];
  };
  accuracyAudit?: ScriptAccuracyAudit;
}

export interface MovieAnalyzerIndexedScene {
  sceneId: string;
  startTime: number;
  endTime: number;
  duration: number;
  visualDescription: string;
  characters: string[];
  actions: string[];
  setting: string;
  tone: string;
  confidence: number;
  thumbnailUrl?: string;
  relevanceScore?: number;
  isUncertain?: boolean;
  isTitleOrBumper?: boolean;
  isExcludedFromNarration?: boolean;
  isUsedInTimeline?: boolean;
  usageCount?: number;
  stageAResult?: VisionStageAResult;
  detectedObjects?: string[];
}

export interface MovieAnalyzerMatchedShot {
  shotId: string;
  type: 'movie_clip' | 'moving_screenshot';
  sceneId: string;
  sourceStartTime: number;
  sourceEndTime: number;
  duration: number; // <= 3.0s for movie_clip, ~5-6s for moving_screenshot
  motionEffect?: 'slow_pan_lr' | 'slow_pan_rl' | 'gentle_zoom_in' | 'gentle_zoom_out' | 'none';
  narrationText: string;
  timelineStart: number;
  timelineEnd: number;
  thumbnailUrl?: string;
  directorialFraming?: 'close_up' | 'medium' | 'wide' | 'extreme_close_up';
  directorialFramingScale?: number;
  directorialMotion?: 'pan_left_to_right' | 'pan_right_to_left' | 'gentle_zoom_in' | 'gentle_zoom_out' | 'subtle_diagonal';
  isDramaticHold?: boolean;
  rightsStatus?: AssetRightsStatus;
  alternatives?: Array<{
    sceneId: string;
    startTime: number;
    endTime: number;
    score: number;
    reason: string;
  }>;
  verificationCheckpoint?: MovieAnalyzerVerificationCheckpoint;
}

export interface MovieAnalyzerVerificationCheckpoint {
  checkpointIndex: number;
  afterShotIndex: number; // e.g. 5, 10, 15, 20...
  screenshotUrl?: string;
  sourceTimestamp: number;
  sceneId: string;
  verificationStatus: 'verified' | 'flagged' | 'alternative_selected';
  verificationNotes: string;
}

export interface MovieAnalyzerStoryBeat {
  id: string;
  act: 'hook' | 'context' | 'characters' | 'inciting_incident' | 'escalation' | 'reversals' | 'climax' | 'resolution' | 'takeaway';
  title: string;
  startTime: number;
  endTime: number;
  visualEvidence: {
    setting: string;
    action: string;
    subjects: string[];
    objects: string[];
    confidence: number;
  };
  narrativeEvent: string;
  charactersInvolved: string[];
  significance: string;
  matchedSceneIds: string[];
}

export interface MovieAnalyzerStoryOutline {
  title: string;
  narrativeOverview: string;
  coreConflict: string;
  keyCluesAndEvidence: string[];
  beats: MovieAnalyzerStoryBeat[];
  generatedAt: string;
}

export interface MovieAnalyzerProject {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  stage: MovieAnalyzerStage;
  status: 'setup' | 'analyzing' | 'scripting' | 'review' | 'voiceover' | 'matching' | 'ready' | 'error';
  errorMessage?: string;
  video?: {
    id: string;
    filename: string;
    originalFilename: string;
    filePath: string;
    url: string;
    duration: number;
    width: number;
    height: number;
    fps: number;
    codec: string;
    fileSize: number;
    thumbnailUrl?: string;
  };
  transcript?: {
    filename: string;
    filePath?: string;
    rawText: string;
    wordCount: number;
    lineCount: number;
    extractedCharacters: string[];
    keyEvents: string[];
    turningPoints: string[];
    warnings?: string[];
    isTruncated?: boolean;
    truncationNote?: string;
  };
  analysis?: {
    progress: number;
    stageName: string;
    statusMessage: string;
    totalScenes: number;
    indexedScenes: MovieAnalyzerIndexedScene[];
    storyOutline?: MovieAnalyzerStoryOutline;
    analysisMetrics?: {
      framesAnalyzed: number;
      transcriptBeatsProcessed: number;
      visualScenesMapped: number;
      isVisionModelActive: boolean;
      visionModelName?: string;
    };
    completedAt?: string;
  };
  scripts?: {
    targetDurationMinutes: number; // default ~9 (8–10 mins)
    selectedLanguage: MovieAnalyzerLanguage;
    isApproved?: boolean;
    approvedLanguage?: MovieAnalyzerLanguage;
    approvedAt?: string;
    english?: MultilingualExplanationScript;
    hindi?: MultilingualExplanationScript;
    bangla?: MultilingualExplanationScript;
    errors?: Partial<Record<MovieAnalyzerLanguage, string | null>>;
  };
  voiceover?: {
    mode: 'generate' | 'import';
    audioPath?: string;
    audioUrl?: string;
    duration?: number;
    filename?: string;
    status: 'none' | 'generating' | 'ready' | 'error';
    warning?: string;
  };
  matching?: {
    maxClipDuration: number; // strictly 3.0
    enableMovingScreenshots: boolean; // default false
    screenshotInterval: number; // every 5 clips
    matchedShots: MovieAnalyzerMatchedShot[];
    totalTimelineDuration: number;
    pacingRuleViolations: number; // 0 when compliant
    verificationCheckpoints?: MovieAnalyzerVerificationCheckpoint[];
    clipReuseLimitations?: string[];
  };
  handoffProjectId?: string; // pointer to MovieExplanationStudio project
}

export interface WSMovieAnalyzerProgress {
  type: 'movie_analyzer_progress';
  payload: {
    projectId: string;
    progress: number;
    stage: MovieAnalyzerStage;
    stageName: string;
    detail?: string;
    status: MovieAnalyzerProject['status'];
  };
}

// ── Script Quality & Accuracy Audit ──
export interface ScriptAccuracyAudit {
  overallAccuracyScore: number; // 1-10
  sourceFidelityScore: number; // 1-10
  clichéFreeScore: number; // 1-10
  verifiedClaims: string[];
  groundedDeductions: string[];
  flaggedSpeculations: string[];
  repetitionWarnings: string[];
  forbiddenPhrasesFound: string[];
  passedValidation: boolean;
  auditedAt: string;
}

// ── Project Library & Storage Cleanup Types ──
export type ProjectLibraryCategory = 'movie_analyzer' | 'movie_explanation' | 'voiceover' | 'clipping';

export type ProjectLibraryAssetType =
  | 'video'
  | 'transcript'
  | 'script'
  | 'audio'
  | 'thumbnail'
  | 'render'
  | 'clips'
  | 'other';

export interface ProjectLibraryAsset {
  assetId: string;
  type: ProjectLibraryAssetType;
  name: string;
  filename: string;
  relativePath?: string;
  sizeBytes: number;
  formattedSize: string;
  createdAt?: string;
  canDeleteIndividually: boolean;
  metadata?: Record<string, any>;
}

export interface ProjectLibraryItem {
  id: string;
  name: string;
  type: ProjectLibraryCategory;
  typeLabel: string;
  createdAt: string;
  updatedAt: string;
  totalSizeBytes: number;
  formattedTotalSize: string;
  formattedTotalStorage?: string;
  assets: ProjectLibraryAsset[];
  isTrash?: boolean;
  trashedAt?: string;
  stageLabel?: string;
  status?: string;
  previewUrl?: string;
}

export interface ProjectLibraryOverview {
  projects: ProjectLibraryItem[];
  totalProjectsCount: number;
  totalProjects?: number;
  totalAssetsCount: number;
  totalStorageBytes: number;
  formattedTotalStorage: string;
  countsByCategory: Record<ProjectLibraryCategory, number>;
  storageByCategory: Record<ProjectLibraryCategory, number>;
  trashCount: number;
}

export interface ProjectLibraryBulkDeleteRequest {
  items: Array<{
    type: ProjectLibraryCategory;
    projectId: string;
    assetType?: ProjectLibraryAssetType;
    assetId?: string;
  }>;
  permanent?: boolean;
}

export interface ProjectLibraryBulkDeleteResult {
  deletedProjectsCount: number;
  deletedAssetsCount: number;
  freedBytes: number;
  formattedFreedBytes: string;
  errors: string[];
}

export interface ProjectLibraryDeleteAllRequest {
  confirmPhrase: string; // Must match "DELETE ALL"
  scope?: 'all' | 'trash_only' | 'assets_only';
}

export interface ProjectLibraryDeleteAllResult {
  success: boolean;
  deletedProjectsCount: number;
  freedBytes: number;
  formattedFreedBytes: string;
  message: string;
}



