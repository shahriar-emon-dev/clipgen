export type ProjectStatus = 'created' | 'uploading' | 'uploaded' | 'processing' | 'analyzed' | 'generating' | 'completed' | 'error';
export type ProcessingStage = 'validating' | 'extracting_metadata' | 'extracting_audio' | 'transcribing' | 'detecting_scenes' | 'analyzing_audio' | 'chunking' | 'detecting_highlights' | 'scoring_highlights' | 'ranking' | 'completed' | 'failed';
export type JobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
export type ShortStatus = 'pending' | 'rendering' | 'completed' | 'failed';
export type CopyrightRiskLevel = 'low' | 'medium' | 'high';
export type ReframeMode = 'center' | 'face' | 'speaker' | 'action' | 'blur_fill' | 'auto' | 'fit';
export type CaptionPosition = 'top' | 'center' | 'bottom';
export type TranscriptionProvider = 'openai' | 'local';
export type AIProvider = 'openai' | 'anthropic' | 'google';
export interface User {
    id: string;
    email: string;
    name: string;
    createdAt: string;
    updatedAt: string;
}
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
export interface HighlightCandidate {
    id: string;
    projectId: string;
    title?: string;
    startTime: number;
    endTime: number;
    duration: number;
    transcriptText: string;
    scoreTotal: number;
    scoreHook: number;
    scoreEmotion: number;
    scoreInformation: number;
    scoreSurprise: number;
    scoreStory: number;
    scoreVisual: number;
    scoreAudio: number;
    scoreShortsP: number;
    aiReason: string;
    aiRecommendedStart: number;
    aiRecommendedEnd: number;
    whySelected?: string[];
    confidence?: 'High' | 'Medium' | 'Low';
    framingMode?: ReframeMode;
    cropOffsetX?: number;
    cropTrajectory?: {
        time: number;
        x: number;
    }[];
    visualComposition?: {
        subjectVisibility: number;
        motionQuality: number;
        framing: number;
    };
    rank: number;
    isSelected: boolean;
    isSuppressed: boolean;
    createdAt: string;
}
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
export interface Export {
    id: string;
    shortId: string;
    format: string;
    filePath: string;
    fileSize: number;
    createdAt: string;
}
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
export interface AudioAnalysisResult {
    volumeLevels: AudioLevel[];
    silenceRegions: TimeRange[];
    energyPeaks: AudioPeak[];
    averageVolume: number;
}
export interface AudioLevel {
    time: number;
    volume: number;
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
    peaks: number[];
    pointsPerSecond: number;
}
export interface AppSettings {
    pipelineConfig: PipelineConfig;
    transcriptionProvider: TranscriptionProvider;
    aiProvider: AIProvider;
    aiModel: string;
}
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
    normalizeLoudness: boolean;
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
    cropOffsetX?: number;
    scaleFactor: number;
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
export type VideoEncodingProfileType = 'FAST_CUT' | 'QUALITY_CUT' | 'SOURCE_PRESERVE' | 'SHORTS_HIGH_QUALITY' | 'LONG_FORM_HIGH_QUALITY' | 'LOSSLESS_BLUR_HIGH_QUALITY' | 'SMART_REFRAME_HIGH_QUALITY' | 'PREVIEW_OPTIMIZED';
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
export type VoiceoverSegmentType = 'sentence' | 'clause' | 'thought';
export type NarrativePurpose = 'hook' | 'introduction' | 'establishing_shot' | 'character_introduction' | 'location_introduction' | 'explanation' | 'action' | 'transition' | 'comparison' | 'contrast' | 'evidence' | 'example' | 'emotional_beat' | 'reaction' | 'climax' | 'reveal' | 'consequence' | 'conclusion' | 'outro';
export type VoiceoverMatchingMode = 'balanced' | 'maximum_semantic' | 'cinematic' | 'fast_pacing' | 'minimal_cuts' | 'maximum_variety';
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
    subjects: string[];
    actions: string[];
    environment: string[];
    shotCharacteristics: string[];
    semanticConcepts: string[];
    emotion?: string;
    timeOfDay?: string;
    weather?: string;
    cameraMovement?: string;
    motionIntensity: number;
    keyframeUrl?: string;
    embedding?: number[];
    isBumper?: boolean;
}
export interface FootageAsset {
    clipId: string;
    projectId: string;
    originalFilename: string;
    filename: string;
    sourceFile: string;
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
    qualityScore: number;
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
    sourceFile: string;
    sourceStart: number;
    sourceEnd: number;
    timelineStart: number;
    timelineEnd: number;
    duration: number;
    matchScore: number;
    confidence: number;
    isLowConfidence: boolean;
    reasons: string[];
    transition: TransitionType;
    transitionDuration: number;
    transitionOut?: TransitionType;
    transitionOutDuration?: number;
    isLocked: boolean;
    isManualOverride: boolean;
    framingMode: ReframeMode;
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
export type NarrativeStageType = 'opening' | 'setup' | 'character_introduction' | 'conflict' | 'investigation' | 'clue' | 'rising_tension' | 'turning_point' | 'reveal' | 'reaction' | 'climax_setup' | 'climax' | 'consequence' | 'resolution' | 'transition' | 'title_or_bumper';
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
    characterRelationships: Array<{
        from: string;
        to: string;
        relationship: string;
    }>;
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
export type AssetRightsStatus = 'clean' | 'owned' | 'licensed' | 'permission_granted' | 'public_domain' | 'public_domain_verified' | 'unverified' | 'unreviewed' | 'restricted' | 'uncertain';
export type VisualAssetCategory = 'movie_source' | 'licensed_stock' | 'original_graphic' | 'user_created' | 'public_domain' | 'creative_commons' | 'custom_visual';
export interface AssetRightsMetadata {
    rightsStatus: AssetRightsStatus;
    sourceFilename: string;
    sourceReference?: string;
    sourceUrl?: string;
    creatorOrRightsHolder?: string;
    licenseDetails?: string;
    evidenceReference?: string;
    evidenceDocumentPath?: string;
    usageRestrictions?: string;
    attributionRequirements?: string;
    commercialUsePermitted?: boolean;
    notes?: string;
    verifiedBy?: string;
    lastReviewedAt?: string;
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
    overallScore: number;
    originalInsightScore: number;
    footageDependenceRatio: number;
    hookQualityScore: number;
    climaxCoherenceScore: number;
    redundancyScore: number;
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
    representativeFramePaths?: string[];
    characterAppearances?: string[];
    secondaryActions?: string[];
    dialogueRange?: {
        startTime: number;
        endTime: number;
        text: string;
    };
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
    totalDuration?: number;
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
    excludedBumperRanges?: Array<{
        startTime: number;
        endTime: number;
        type: string;
    }>;
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
export interface ClipTransformSettings {
    scale: number;
    zoom: number;
    positionX: number;
    positionY: number;
    cropTop: number;
    cropBottom: number;
    cropLeft: number;
    cropRight: number;
    rotation: number;
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
    brightness: number;
    exposure: number;
    contrast: number;
    saturation: number;
    temperature: number;
    tint: number;
    highlights?: number;
    shadows?: number;
    whites?: number;
    blacks?: number;
    fade?: number;
    sharpen: number;
    vignette: number;
    preset?: string;
    presetName?: string;
}
export type ClipFilterType = 'none' | 'cinematic' | 'warm' | 'cool' | 'vintage' | 'film' | 'bw' | 'soft_contrast' | 'sharpen' | 'blur' | 'vignette' | 'film_grain' | 'glow' | 'glitch' | 'motion_blur' | 'fade';
export interface ClipFilterEffect {
    type: ClipFilterType;
    effectType?: string;
    intensity: number;
    duration?: number;
    enabled: boolean;
}
export type ClipBorderStyle = 'none' | 'minimal' | 'rounded' | 'cinematic' | 'white' | 'black' | 'custom' | 'gradient';
export interface ClipBorderSettings {
    enabled: boolean;
    style: ClipBorderStyle;
    color: string;
    borderColor?: string;
    backgroundColor?: string;
    secondaryColor?: string;
    thickness: number;
    padding: number;
    borderRadius: number;
    shadow: boolean;
    hasShadow?: boolean;
    shadowBlur?: number;
    shadowColor?: string;
    scope?: 'clip' | 'all' | 'canvas' | 'shot';
}
export interface ClipSpeedSettings {
    speedMultiplier?: number;
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
    type: 'main_video' | 'video_overlay' | 'voiceover' | 'clip_audio' | 'bgm' | 'sfx' | 'captions' | 'text' | 'borders' | 'vfx';
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
    startTime?: number;
    duration?: number;
    trackId?: string;
    positionX: number;
    positionY: number;
    fontSize: number;
    fontFamily: string;
    fontWeight: 'normal' | '500' | '600' | 'bold' | '800' | '700' | string;
    fontColor: string;
    color?: string;
    backgroundColor?: string;
    outlineColor?: string;
    outlineWidth?: number;
    shadowColor?: string;
    shadowBlur?: number;
    opacity: number;
    rotation: number;
    scale?: number;
    alignment?: 'left' | 'center' | 'right' | string;
    animation?: 'none' | 'fade' | 'slide_up' | 'pop' | 'typewriter';
    category?: 'title' | 'caption' | 'callout' | 'lower_third';
}
export interface CaptionStyleSettings {
    visible?: boolean;
    visibility?: boolean;
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
    positionY?: number;
    bottomMargin?: number;
    maxWidth?: number;
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
    positionY?: number;
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
    volume: number;
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
    fps: number;
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
    noiseThresholdDb: number;
    minSilenceDuration: number;
    leadingSilenceDuration?: number;
    isSilenceRemoved?: boolean;
}
export interface AudioDuckingSettings {
    enabled: boolean;
    duckingDb: number;
    attackMs: number;
    releaseMs: number;
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
    expectedMovieTimeWindow?: {
        start: number;
        end: number;
    };
    originalTranscriptRef?: string;
    searchKeywords: string[];
}
export interface VisionStageBVerification {
    candidateSceneId: string;
    supportsNarration: boolean;
    matchingDetails: string[];
    contradictions: string[];
    isEvidenceInsufficient: boolean;
    calibratedConfidence: number;
    reason: string;
    status: 'verified_match' | 'partial_match' | 'contradicted' | 'insufficient_evidence';
    visualConfidence?: 'HIGH' | 'MEDIUM' | 'LOW' | 'REJECT';
    characterVerified?: boolean;
    actionVerified?: boolean;
    locationVerified?: boolean;
    verifiedFramePath?: string;
}
export interface OpeningVerificationReport {
    openingDuration: number;
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
    enableFairUsePreset: boolean;
    maxShotDuration: number;
    strictClipDurationMode?: boolean;
    minShotDuration: number;
    minClipDuration?: number;
    horizontalFlip: boolean;
    playbackSpeed: number;
    zoomLevel: number;
    silenceHandling?: SilenceHandlingSettings;
    colorGrading: {
        enabled: boolean;
        brightness: number;
        contrast: number;
        saturation: number;
        sharpness: number;
        vignette: boolean;
        gamma?: number;
    };
    audioMixing: {
        sourceMovieVolume: number;
        voiceoverVolume: number;
        bgmVolume: number;
        bgmTrackUrl?: string;
        bgmFadeInDuration?: number;
        bgmFadeOutDuration?: number;
        ducking?: AudioDuckingSettings;
        enableAmbientCinematicBed?: boolean;
        enableCutSoundEffects?: boolean;
        sfxVolume?: number;
    };
    invisibleTransforms?: {
        enabled: boolean;
        microScaling: boolean;
        colorRemapping: boolean;
        microTemporalShift: boolean;
        intelligentMirroring: boolean;
        sixSecondRule: boolean;
        jumpCutIntegration: boolean;
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
    crf?: number;
    encoder?: 'auto' | 'libx264' | 'h264_nvenc' | 'h264_qsv' | 'h264_amf';
    encoderPreset?: 'ultrafast' | 'veryfast' | 'fast' | 'medium' | 'slow';
    allowStillHolds?: boolean;
    maxStillHoldDuration?: number;
    screenshotInterval?: number;
    maxConsecutiveVideoClips?: number;
    screenshotDuration?: number;
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
    aspectRatio?: VoiceoverOutputAspectRatio;
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
    name?: string;
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
        durationSeconds: number;
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
    duration: number;
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
    afterShotIndex: number;
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
        targetDurationMinutes: number;
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
        maxClipDuration: number;
        enableMovingScreenshots: boolean;
        screenshotInterval: number;
        matchedShots: MovieAnalyzerMatchedShot[];
        totalTimelineDuration: number;
        pacingRuleViolations: number;
        verificationCheckpoints?: MovieAnalyzerVerificationCheckpoint[];
        clipReuseLimitations?: string[];
    };
    handoffProjectId?: string;
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
export interface ScriptAccuracyAudit {
    overallAccuracyScore: number;
    sourceFidelityScore: number;
    clichéFreeScore: number;
    verifiedClaims: string[];
    groundedDeductions: string[];
    flaggedSpeculations: string[];
    repetitionWarnings: string[];
    forbiddenPhrasesFound: string[];
    passedValidation: boolean;
    auditedAt: string;
}
export type ProjectLibraryCategory = 'movie_analyzer' | 'movie_explanation' | 'voiceover' | 'clipping';
export type ProjectLibraryAssetType = 'video' | 'transcript' | 'script' | 'audio' | 'thumbnail' | 'render' | 'clips' | 'other';
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
    confirmPhrase: string;
    scope?: 'all' | 'trash_only' | 'assets_only';
}
export interface ProjectLibraryDeleteAllResult {
    success: boolean;
    deletedProjectsCount: number;
    freedBytes: number;
    formattedFreedBytes: string;
    message: string;
}
//# sourceMappingURL=types.d.ts.map