// ============================================================
// Audio Composite Engine — Professional Audio Post-Production Pipeline
// Assembles studio-quality layered audio for movie explanations:
// Step 1: Clean voiceover isolation and pristine level control.
// Step 2: High-fidelity master narration track as primary anchor.
// Step 3: Subtle ambient cinematic bed / score backing.
// Step 4: Contextual cut-point sound textures and transition accents.
// ============================================================

import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { config } from '../../config/index.js';
import type {
  MovieTimelineShot,
  TransformativeEditingSettings,
  TimelineAudioLayer,
} from '../../../../shared/types.js';

export class AudioCompositeEngine {
  /**
   * Generates a fully mastered, composite audio track combining:
   * 1. Authoritative voiceover (The Anchor)
   * 2. Atmospheric ambient cinematic bed (The Mask)
   * 3. Cut-point transition textures / swooshes (The Texture)
   * Delivers pristine broadcast-grade studio sound with balanced dynamic range.
   */
  public async buildCompositeAudio(
    voiceoverAudioPath: string,
    shots: MovieTimelineShot[],
    duration: number,
    outputPath: string,
    tempDir: string,
    settings?: TransformativeEditingSettings,
    audioLayers?: TimelineAudioLayer[]
  ): Promise<string> {
    const audioMixing = settings?.audioMixing ?? {
      sourceMovieVolume: 0.0,
      voiceoverVolume: 1.0,
      bgmVolume: 0.10,
      enableAmbientCinematicBed: true,
      enableCutSoundEffects: true,
      sfxVolume: 0.12,
    };

    const voVol = audioMixing.voiceoverVolume ?? 1.0;
    const bgmVol = audioMixing.bgmVolume ?? 0.10;
    const sfxVol = audioMixing.sfxVolume ?? 0.12;
    const enableAmbient = audioMixing.enableAmbientCinematicBed !== false && bgmVol > 0.001;
    const enableSFX = audioMixing.enableCutSoundEffects !== false && sfxVol > 0.001;
    const enableVoiceEq = (audioMixing as any).enableVoiceClarityEq !== false;
    const enableLoudnorm = (audioMixing as any).enableLoudnessNormalization !== false;
    const enableLimiter = (audioMixing as any).enableMasterLimiter !== false;

    // Check if voiceover exists
    if (!fs.existsSync(voiceoverAudioPath)) {
      throw new Error(`Master voiceover audio file missing: ${voiceoverAudioPath}`);
    }

    const hasRealAudioLayers = audioLayers && audioLayers.some((l) => !l.isMuted && l.sourceFilePath && fs.existsSync(l.sourceFilePath));

    // If both ambient bed and cut SFX are disabled and no audio layers exist, simply normalize/copy voiceover
    if (!enableAmbient && !enableSFX && !hasRealAudioLayers) {
      return voiceoverAudioPath;
    }

    const dur = Math.max(1.0, Number(duration.toFixed(3)));

    // ── Generate Step 4 Texture Cut Points ──
    const cutTimestamps: number[] = [];
    if (enableSFX && shots && shots.length > 1) {
      let lastCutTime = 0;
      for (let i = 1; i < shots.length; i++) {
        const cutTime = shots[i].timelineStart;
        // Space cut sound effects at least 3.0s apart to keep mix subtle & clean
        if (cutTime - lastCutTime >= 3.0 && cutTime < dur - 0.5) {
          cutTimestamps.push(Number(cutTime.toFixed(2)));
          lastCutTime = cutTime;
        }
      }
    }

    // Build FFmpeg command to compose audio
    // Input 0: Voiceover audio
    const customBgm = audioMixing.bgmTrackUrl && fs.existsSync(audioMixing.bgmTrackUrl)
      ? audioMixing.bgmTrackUrl
      : null;

    const filterComplexParts: string[] = [];
    const inputs: string[] = ['-i', voiceoverAudioPath];
    let inputIndex = 1;

    // Voice Enhancement Chain: High-Pass, Boxy De-Mud EQ, Presence Clarity, Compression
    const mixLabels: string[] = ['[vo_clean]'];
    const voiceChain: string[] = [`volume=${voVol.toFixed(2)}`];
    if (enableVoiceEq) {
      voiceChain.push(
        'highpass=f=80',
        'equalizer=f=300:width_type=q:width=1.5:g=-2.0',
        'equalizer=f=3200:width_type=q:width=1.8:g=2.5',
        'acompressor=threshold=-18dB:ratio=2.5:attack=10:release=80'
      );
    }
    voiceChain.push('aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo');
    filterComplexParts.push(`[0:a]${voiceChain.join(',')}[vo_clean]`);

    // Step 3 (The Mask / Creative BGM): Ambient Cinematic Background Track
    if (enableAmbient) {
      const fadeIn = Math.max(0.5, audioMixing.bgmFadeInDuration ?? 1.5);
      const fadeOut = Math.max(1.0, audioMixing.bgmFadeOutDuration ?? 2.5);
      const fadeOutStart = Math.max(0, dur - fadeOut);

      if (customBgm) {
        inputs.push('-stream_loop', '-1', '-i', customBgm);
        // Apply looping, trimming, fade-in, fade-out, and volume
        filterComplexParts.push(
          `[${inputIndex}:a]atrim=0:${dur},asetpts=PTS-STARTPTS,` +
          `afade=t=in:ss=0:d=${fadeIn.toFixed(1)},afade=t=out:st=${fadeOutStart.toFixed(1)}:d=${fadeOut.toFixed(1)},` +
          `volume=${bgmVol.toFixed(2)},aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo[bgm_raw]`
        );

        // Optional ducking under voiceover
        if (audioMixing.ducking?.enabled !== false && voVol > 0.1) {
          filterComplexParts.push(
            `[bgm_raw][vo_clean]sidechaincompress=threshold=0.12:ratio=3.5:attack=120:release=400[bgm_clean]`
          );
        } else {
          filterComplexParts.push(`[bgm_raw]anull[bgm_clean]`);
        }

        mixLabels.push('[bgm_clean]');
        inputIndex++;
      } else if (audioMixing.enableAmbientCinematicBed) {
        // Procedurally synthesized warm cinematic ambient bed
        const ambientLavfi = `anoisesrc=d=${dur}:c=pink:r=48000:a=0.015,lowpass=f=260,highpass=f=40,volume=${bgmVol.toFixed(3)}`;
        inputs.push('-f', 'lavfi', '-i', ambientLavfi);
        filterComplexParts.push(
          `[${inputIndex}:a]afade=t=in:ss=0:d=${fadeIn.toFixed(1)},afade=t=out:st=${fadeOutStart.toFixed(1)}:d=${fadeOut.toFixed(1)},` +
          `aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo[bgm_clean]`
        );
        mixLabels.push('[bgm_clean]');
        inputIndex++;
      }
    }

    // Contextual SFX & Timeline Audio Layers (Real local audio files)
    const activeLayers = (audioLayers || []).filter(
      (l) => !l.isMuted && l.sourceFilePath && fs.existsSync(l.sourceFilePath)
    );

    if (activeLayers.length > 0) {
      for (let idx = 0; idx < activeLayers.length; idx++) {
        const layer = activeLayers[idx];
        const delayMs = Math.max(0, Math.round(layer.timelineStart * 1000));
        const layerVol = Math.max(0.01, layer.volume || 0.15);
        const layerFadeIn = layer.fadeInDuration || 0.05;
        const layerFadeOut = layer.fadeOutDuration || 0.15;
        const layerDur = Math.max(0.2, layer.duration);
        const fadeOutStart = Math.max(0, layerDur - layerFadeOut);

        inputs.push('-i', layer.sourceFilePath!);
        filterComplexParts.push(
          `[${inputIndex}:a]atrim=0:${layerDur.toFixed(3)},asetpts=PTS-STARTPTS,` +
          `afade=t=in:ss=0:d=${layerFadeIn.toFixed(2)},afade=t=out:st=${fadeOutStart.toFixed(2)}:d=${layerFadeOut.toFixed(2)},` +
          `adelay=${delayMs}|${delayMs},volume=${layerVol.toFixed(3)},` +
          `aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo[layer_${idx}]`
        );
        mixLabels.push(`[layer_${idx}]`);
        inputIndex++;
      }
    } else if (enableSFX && cutTimestamps.length > 0) {
      // Fallback: procedural swoosh sound bed for cut points if no audioLayers are mapped
      const sfxStreamLabels: string[] = [];
      const sfxTakeCount = Math.min(12, cutTimestamps.length); // Max 12 cuts for efficiency

      for (let s = 0; s < sfxTakeCount; s++) {
        const cutMs = Math.round(cutTimestamps[s] * 1000);
        const sfxLavfi = `anoisesrc=d=0.35:c=brown:a=0.035,bandpass=f=550:w=320,afade=t=in:ss=0:d=0.12,afade=t=out:st=0.12:d=0.23,adelay=${cutMs}|${cutMs},volume=${sfxVol.toFixed(3)}`;
        inputs.push('-f', 'lavfi', '-i', sfxLavfi);
        filterComplexParts.push(`[${inputIndex}:a]aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo[sfx_${s}]`);
        sfxStreamLabels.push(`[sfx_${s}]`);
        inputIndex++;
      }

      if (sfxStreamLabels.length === 1) {
        mixLabels.push(sfxStreamLabels[0]);
      } else if (sfxStreamLabels.length > 1) {
        filterComplexParts.push(`${sfxStreamLabels.join('')}amix=inputs=${sfxStreamLabels.length}:duration=longest:dropout_transition=0[sfx_all]`);
        mixLabels.push('[sfx_all]');
      }
    }

    // Master amix combining Voiceover + Ambient Bed + Cut SFX + Layers
    const masterBusChain: string[] = [
      `${mixLabels.join('')}amix=inputs=${mixLabels.length}:duration=first:dropout_transition=2`,
      'volume=1.0',
    ];
    if (enableLoudnorm) {
      masterBusChain.push('loudnorm=I=-14:LRA=7:TP=-1.5');
    }
    if (enableLimiter) {
      masterBusChain.push('alimiter=limit=-1.0dB:attack=5:release=50');
    }
    masterBusChain.push('aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo');
    filterComplexParts.push(`${masterBusChain.join(',')}[final_audio]`);

    const fullFilter = filterComplexParts.join(';');

    const args = [
      '-y',
      ...inputs,
      '-filter_complex', fullFilter,
      '-map', '[final_audio]',
      '-c:a', 'aac',
      '-b:a', '320k', // Studio-grade master bitrate
      '-ar', '48000',
      '-t', dur.toFixed(3),
      outputPath,
    ];

    return new Promise((resolve, reject) => {
      const proc = spawn(config.ffmpegPath, args);
      let stderr = '';

      proc.stderr.on('data', (d) => { stderr += d.toString(); });
      proc.on('close', (code) => {
        if (code === 0 && fs.existsSync(outputPath)) {
          resolve(outputPath);
        } else {
          // Fallback gracefully to raw voiceover if composite filter hits an edge case
          console.warn(`[AudioCompositeEngine] Composite audio failed (code ${code}), falling back to master voiceover. Error: ${stderr.slice(-300)}`);
          resolve(voiceoverAudioPath);
        }
      });
      proc.on('error', (err) => {
        console.warn('[AudioCompositeEngine] Process error, falling back to voiceover:', err);
        resolve(voiceoverAudioPath);
      });
    });
  }
}

export const audioCompositeEngine = new AudioCompositeEngine();
