import type { ScoringWeights, CaptionStyle, PipelineConfig, LongFormSettings, SafeScaleFactor, LongFormTargetDuration } from './types.js';
export declare const PIPELINE_STAGES: readonly ["validating", "extracting_metadata", "extracting_audio", "transcribing", "detecting_scenes", "analyzing_audio", "chunking", "detecting_highlights", "scoring_highlights", "ranking", "completed"];
export declare const PIPELINE_STAGE_LABELS: Record<string, string>;
export declare const PIPELINE_STAGE_PROGRESS: Record<string, number>;
export declare const PIPELINE_STAGE_RANGES: Record<string, [number, number]>;
export declare const DEFAULT_SCORING_WEIGHTS: ScoringWeights;
export declare const SUPPORTED_VIDEO_EXTENSIONS: string[];
export declare const SUPPORTED_VIDEO_MIMES: string[];
export declare const MAX_UPLOAD_SIZE: number;
export declare const MAX_VIDEO_DURATION = 3600;
export declare const DEFAULT_PIPELINE_CONFIG: PipelineConfig;
export declare const DEFAULT_CAPTION_STYLE: CaptionStyle;
export declare const CAPTION_STYLE_PRESETS: Record<string, Partial<CaptionStyle>>;
export declare const QUALITY_PRESETS: {
    draft: {
        crf: string;
        videoBitrate: string;
        audioBitrate: string;
    };
    standard: {
        crf: string;
        videoBitrate: string;
        audioBitrate: string;
    };
    high: {
        crf: string;
        videoBitrate: string;
        audioBitrate: string;
    };
    maximum: {
        crf: string;
        videoBitrate: string;
        audioBitrate: string;
    };
};
export declare const HOOK_KEYWORDS: string[];
export declare const EMOTION_KEYWORDS: string[];
export declare const SURPRISE_KEYWORDS: string[];
export declare const QUESTION_STARTERS: string[];
export declare const STRONG_OPENING_PATTERNS: RegExp[];
export declare const CONCLUSION_PATTERNS: RegExp[];
export declare const STORY_MARKERS: RegExp[];
export declare const DEFAULT_LONG_FORM_SETTINGS: LongFormSettings;
export declare const TARGET_DURATION_RANGES: Record<LongFormTargetDuration, {
    minSeconds: number;
    maxSeconds: number;
    targetSeconds: number;
    label: string;
}>;
export declare const SAFE_SCALE_PRESETS: {
    value: SafeScaleFactor;
    label: string;
    description: string;
}[];
export declare const TRANSITION_PRESETS: {
    id: string;
    label: string;
    description: string;
}[];
export declare const SUPPORTED_VOICEOVER_EXTENSIONS: string[];
export declare const DEFAULT_MATCHING_WEIGHTS: {
    semanticScore: number;
    actionScore: number;
    entityScore: number;
    environmentScore: number;
    narrativeScore: number;
    continuityScore: number;
    durationScore: number;
    qualityScore: number;
    varietyScore: number;
};
export declare const VOICEOVER_MATCHING_MODES: {
    id: import('./types.js').VoiceoverMatchingMode;
    label: string;
    description: string;
}[];
//# sourceMappingURL=constants.d.ts.map