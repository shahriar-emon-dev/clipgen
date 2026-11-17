// ============================================================
// AI Shorts Generator — Shared Constants
// ============================================================
// ── Processing Pipeline Stages (in order) ──
export const PIPELINE_STAGES = [
    'validating',
    'extracting_metadata',
    'extracting_audio',
    'transcribing',
    'detecting_scenes',
    'analyzing_audio',
    'chunking',
    'detecting_highlights',
    'scoring_highlights',
    'ranking',
    'completed',
];
export const PIPELINE_STAGE_LABELS = {
    validating: 'Validating video',
    extracting_metadata: 'Extracting media information',
    extracting_audio: 'Extracting audio track',
    transcribing: 'Generating transcript',
    detecting_scenes: 'Detecting scene changes',
    analyzing_audio: 'Analyzing audio patterns',
    chunking: 'Splitting into analysis chunks',
    detecting_highlights: 'Finding interesting moments',
    scoring_highlights: 'AI scoring best candidates',
    ranking: 'Ranking and selecting top moments',
    completed: 'Analysis complete',
    failed: 'Processing failed',
};
export const PIPELINE_STAGE_PROGRESS = {
    validating: 3,
    extracting_metadata: 8,
    extracting_audio: 15,
    transcribing: 35,
    detecting_scenes: 45,
    analyzing_audio: 55,
    chunking: 60,
    detecting_highlights: 75,
    scoring_highlights: 90,
    ranking: 97,
    completed: 100,
};
// Start and End percentage bounds for smooth sub-progress interpolation
export const PIPELINE_STAGE_RANGES = {
    validating: [0, 5],
    extracting_metadata: [5, 10],
    extracting_audio: [10, 18],
    transcribing: [18, 40],
    detecting_scenes: [40, 55],
    analyzing_audio: [55, 65],
    chunking: [65, 70],
    detecting_highlights: [70, 85],
    scoring_highlights: [85, 95],
    ranking: [95, 99],
    completed: [100, 100],
};
// ── Default Scoring Weights (Master 10-Dimension Model) ──
export const DEFAULT_SCORING_WEIGHTS = {
    hook: 0.20,
    contentValue: 0.15,
    curiosity: 0.10,
    emotion: 0.10,
    story: 0.10,
    payoff: 0.10,
    pacing: 0.10,
    visual: 0.05,
    audio: 0.05,
    shortsP: 0.05,
};
// ── Supported Video Formats ──
export const SUPPORTED_VIDEO_EXTENSIONS = ['.mp4', '.mov', '.webm', '.mkv', '.avi'];
export const SUPPORTED_VIDEO_MIMES = [
    'video/mp4',
    'video/quicktime',
    'video/webm',
    'video/x-matroska',
    'video/avi',
    'video/x-msvideo',
];
// ── File Size Limits ──
export const MAX_UPLOAD_SIZE = 5 * 1024 * 1024 * 1024; // 5GB
export const MAX_VIDEO_DURATION = 3600; // 1 hour (seconds)
// ── Pipeline Defaults ──
export const DEFAULT_PIPELINE_CONFIG = {
    maxVideoDuration: 3600,
    maxUploadSize: MAX_UPLOAD_SIZE,
    maxShortsCount: 10,
    maxShortDuration: 30,
    minShortDuration: 15,
    analysisChunkSize: 120, // seconds
    chunkOverlap: 30, // seconds
    outputWidth: 1080,
    outputHeight: 1920,
    outputFps: 30,
    outputFormat: 'mp4',
    scoringWeights: DEFAULT_SCORING_WEIGHTS,
    transcriptionProvider: 'openai',
    aiProvider: 'openai',
    aiModel: 'gpt-4o-mini',
};
// ── Caption Defaults ──
export const DEFAULT_CAPTION_STYLE = {
    fontFamily: 'Arial',
    fontSize: 52,
    fontColor: '#FFFFFF',
    backgroundColor: '#000000',
    backgroundOpacity: 0.7,
    outlineColor: '#000000',
    outlineWidth: 3,
    position: 'bottom',
    maxWordsPerLine: 6,
    uppercase: false,
};
export const CAPTION_STYLE_PRESETS = {
    classic: {
        fontFamily: 'Arial',
        fontSize: 48,
        fontColor: '#FFFFFF',
        backgroundColor: '#000000',
        backgroundOpacity: 0.6,
        position: 'bottom',
    },
    bold: {
        fontFamily: 'Impact',
        fontSize: 60,
        fontColor: '#FFFFFF',
        backgroundColor: 'transparent',
        backgroundOpacity: 0,
        outlineWidth: 4,
        position: 'center',
        uppercase: true,
    },
    minimal: {
        fontFamily: 'Helvetica',
        fontSize: 40,
        fontColor: '#FFFFFF',
        backgroundColor: 'transparent',
        backgroundOpacity: 0,
        outlineWidth: 2,
        position: 'bottom',
    },
    youtube: {
        fontFamily: 'Roboto',
        fontSize: 56,
        fontColor: '#FFFF00',
        backgroundColor: '#000000',
        backgroundOpacity: 0.8,
        outlineWidth: 0,
        position: 'bottom',
        uppercase: true,
        maxWordsPerLine: 4,
    },
};
// ── Quality Presets ──
export const QUALITY_PRESETS = {
    draft: { crf: '28', videoBitrate: '2000k', audioBitrate: '128k' },
    standard: { crf: '23', videoBitrate: '5000k', audioBitrate: '192k' },
    high: { crf: '18', videoBitrate: '10000k', audioBitrate: '256k' },
    maximum: { crf: '14', videoBitrate: '20000k', audioBitrate: '320k' },
};
// ── Highlight Detection Keywords ──
export const HOOK_KEYWORDS = [
    'nobody', 'never', 'secret', 'mistake', 'truth', 'actually',
    'shocking', 'incredible', 'unbelievable', 'insane', 'crazy',
    'changed everything', 'game changer', 'blew my mind',
    'here\'s the thing', 'listen', 'wait', 'hold on',
    'the biggest', 'the worst', 'the best', 'number one',
    'you won\'t believe', 'stop doing', 'start doing',
];
export const EMOTION_KEYWORDS = [
    'love', 'hate', 'afraid', 'terrified', 'amazing', 'horrible',
    'beautiful', 'disgusting', 'heartbreaking', 'inspiring',
    'devastated', 'ecstatic', 'furious', 'grateful',
    'overwhelmed', 'speechless', 'crying', 'laughing',
];
export const SURPRISE_KEYWORDS = [
    'plot twist', 'unexpected', 'suddenly', 'out of nowhere',
    'turns out', 'nobody knew', 'hidden', 'revealed',
    'discovered', 'found out', 'realized', 'didn\'t expect',
    'surprised', 'shocked', 'mind-blowing',
];
export const QUESTION_STARTERS = [
    'why', 'how', 'what if', 'did you know', 'have you ever',
    'can you', 'would you', 'is it true', 'what\'s the',
];
// ── Transcript Signal Patterns ──
export const STRONG_OPENING_PATTERNS = [
    /^(so|okay|alright|listen|here'?s)/i,
    /^(the (biggest|worst|best|most))/i,
    /^(number \d)/i,
    /^(first|second|third|finally)/i,
    /^(you need to|you have to|you should)/i,
    /^(imagine|picture this|think about)/i,
];
export const CONCLUSION_PATTERNS = [
    /(and that'?s (why|how|what))/i,
    /(so the (lesson|takeaway|point))/i,
    /(in (conclusion|summary))/i,
    /(the bottom line)/i,
    /(that'?s it|that'?s all)/i,
];
export const STORY_MARKERS = [
    /(once upon|one day|so there I was)/i,
    /(it all started|it began|back in)/i,
    /(and then|but then|suddenly)/i,
    /(the moment|at that point)/i,
    /(long story short)/i,
];
// ============================================================
// AI Long-Form Compilation Constants & Presets
// ============================================================
export const DEFAULT_LONG_FORM_SETTINGS = {
    targetDuration: '5-7',
    aspectRatio: '16:9',
    outputWidth: 1920,
    outputHeight: 1080,
    outputFps: 30,
    editStyle: 'narrative',
    safeEdgeCleanup: false,
    maxScaleFactor: 1.10,
    smartScaling: true,
    captionsEnabled: false,
    transitionType: 'cut',
    transitionDuration: 0.6,
    audioEnhancement: true,
    normalizeLoudness: true,
    removeDeadSilences: true,
    includeIntro: false,
    introTitle: '',
    includeOutro: false,
};
export const TARGET_DURATION_RANGES = {
    '3-5': { minSeconds: 180, maxSeconds: 300, targetSeconds: 240, label: '3–5 minutes' },
    '5-7': { minSeconds: 300, maxSeconds: 420, targetSeconds: 360, label: '5–7 minutes' },
    '7-10': { minSeconds: 420, maxSeconds: 600, targetSeconds: 510, label: '7–10 minutes' },
    custom: { minSeconds: 60, maxSeconds: 3600, targetSeconds: 300, label: 'Custom duration' },
};
export const SAFE_SCALE_PRESETS = [
    { value: 1.0, label: '100% (Native)', description: 'Pristine 1:1 framing with zero zoom' },
    { value: 1.10, label: '110% (Subtle)', description: 'Minimal zoom, gently trims extreme edge noise' },
    { value: 1.20, label: '120% (Standard)', description: 'Balanced cleanup for window borders and software UI' },
    { value: 1.26, label: '126% (Action Safe)', description: 'Optimized crop clearing edge watermarks/branding' },
    { value: 1.28, label: '128% (Tight Safe)', description: 'Maximum controlled scale keeping subjects inside 90% safe zone' },
];
export const TRANSITION_PRESETS = [
    { id: 'cut', label: 'Direct Cut', description: 'Instant, crisp editorial cut with anti-click crossfade' },
    { id: 'crossfade', label: 'Crossfade (0.6s)', description: 'Smooth, cinematic blend between scenes' },
    { id: 'dissolve', label: 'Soft Dissolve', description: 'Gentle narrative transition' },
    { id: 'fade_black', label: 'Fade to Black', description: 'Dramatic chapter/scene divider' },
    { id: 'wipe', label: 'Directional Wipe', description: 'Dynamic, high-energy transition' },
];
// ============================================================
// Voiceover → Auto Video Constants
// ============================================================
export const SUPPORTED_VOICEOVER_EXTENSIONS = [
    '.mp3',
    '.wav',
    '.m4a',
    '.aac',
    '.flac',
    '.ogg',
    '.mp4',
    '.mov',
    '.mkv',
];
export const DEFAULT_MATCHING_WEIGHTS = {
    semanticScore: 0.25,
    actionScore: 0.15,
    entityScore: 0.15,
    environmentScore: 0.10,
    narrativeScore: 0.10,
    continuityScore: 0.10,
    durationScore: 0.05,
    qualityScore: 0.05,
    varietyScore: 0.05,
};
export const VOICEOVER_MATCHING_MODES = [
    {
        id: 'balanced',
        label: 'Balanced',
        description: 'Prioritizes semantic accuracy, natural pacing, continuity, and footage variety.',
    },
    {
        id: 'maximum_semantic',
        label: 'Maximum Semantic Match',
        description: 'Prioritizes semantic relevance to narration above all else.',
    },
    {
        id: 'cinematic',
        label: 'Cinematic',
        description: 'Favors longer shot holds, visual continuity, and smooth transitions.',
    },
    {
        id: 'fast_pacing',
        label: 'Fast Pacing',
        description: 'Faster visual rhythm with energetic multi-shot cuts inside dynamic sentences.',
    },
    {
        id: 'minimal_cuts',
        label: 'Minimal Cuts',
        description: 'Minimizes cuts, holding relevant shots across sentences when narration flows.',
    },
    {
        id: 'maximum_variety',
        label: 'Maximum Footage Variety',
        description: 'Strong reuse penalty to showcase the largest variety of your footage library.',
    },
];
//# sourceMappingURL=constants.js.map