// ============================================================
// AudioEnhancementEngine — Speech Clarity & Loudness Normalization
// Broadcast-standard EBU R128 volume leveling & voice equalization.
// ============================================================

export interface AudioFilterConfig {
  normalizeLoudness?: boolean;
  enhanceVoice?: boolean;
  targetLUFS?: number; // default -16 LUFS
}

export class AudioEnhancementEngine {
  /**
   * Generates FFmpeg audio filter string for speech clarity and EBU R128 normalization.
   */
  public getAudioFilterChain(options: AudioFilterConfig = {}): string {
    const filters: string[] = [];

    // Step 1: Voice Optimization (clean low-end rumble <80Hz and extreme sibilance >14kHz)
    if (options.enhanceVoice !== false) {
      filters.push('highpass=f=80', 'lowpass=f=14000');
    }

    // Step 2: EBU R128 Dual-Pass Loudness Normalization filter
    // Target: -16 LUFS (standard for YouTube/web streaming), True Peak -1.5 dB, Loudness Range 11
    if (options.normalizeLoudness !== false) {
      const lufs = options.targetLUFS || -16;
      filters.push(`loudnorm=I=${lufs}:TP=-1.5:LRA=11`);
    }

    return filters.join(',');
  }
}
