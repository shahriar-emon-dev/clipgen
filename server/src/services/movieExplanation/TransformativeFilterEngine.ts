// ============================================================
// Transformative Filter Engine — Professional Cinematic Visual Enhancement
// Generates dynamic, narrative-aware, visually lossless transformations
// for cinematic color grading, micro-framing, and visual polish
// while preserving pristine 1080p/4K cinema quality.
// ============================================================

import type {
  MovieTimelineShot,
  EpisodeScene,
  VoiceoverOutputAspectRatio,
  TransformativeEditingSettings,
} from '../../../../shared/types.js';

export interface AppliedInvisibleTransforms {
  cropFactor: number;
  colorGradeName: string;
  speedShift: number;
  isMirrored: boolean;
  isKenBurnsStill: boolean;
  hasJumpCut: boolean;
  fullFiltergraph: string;
}

// Professional subtle color grades enhancing visual mood and tone
// while maintaining natural skin tones (<5% shift)
export const CINEMATIC_COLOR_PRESETS = [
  {
    name: 'warm_cinematic',
    filter: 'eq=contrast=1.03:brightness=0.01:saturation=1.05,colorbalance=rs=0.02:gs=0.008:bs=-0.012',
  },
  {
    name: 'cool_mystery',
    filter: 'eq=contrast=1.035:brightness=0.008:saturation=1.03,colorbalance=rs=-0.012:gs=0.006:bs=0.022',
  },
  {
    name: 'dynamic_contrast',
    filter: 'eq=contrast=1.045:brightness=0.012:saturation=1.055,colorbalance=rs=0.008:gs=0.005:bs=-0.005',
  },
  {
    name: 'filmic_soft',
    filter: 'eq=contrast=1.025:brightness=0.015:saturation=1.04,colorbalance=rs=0.015:gs=0.01:bs=-0.008',
  },
  {
    name: 'golden_hour',
    filter: 'eq=contrast=1.03:brightness=0.01:saturation=1.06,colorbalance=rs=0.025:gs=0.01:bs=-0.018',
  },
  {
    name: 'noir_crisp',
    filter: 'eq=contrast=1.04:brightness=0.005:saturation=1.02,colorbalance=rs=-0.005:gs=0.005:bs=0.01',
  },
];

// Keywords indicating visible letters, signage, or documents that must NOT be mirrored
const TEXT_SIGN_REGEX = /\b(text|sign|signs|document|letter|note|newspaper|book|screen|computer|phone|cellphone|subtitles|credits|headline|poster|billboard|card|badge|license|clock|writing|written|folder)\b/i;

export class TransformativeFilterEngine {
  /**
   * Detects whether a scene contains readable text, signs, documents, or screens.
   * If detected or uncertain, returns true so intelligent mirroring is disabled.
   */
  public detectTextOrReadableSigns(scene?: EpisodeScene, shot?: MovieTimelineShot): boolean {
    if (shot?.hasTextOrSigns !== undefined) {
      return shot.hasTextOrSigns;
    }
    if (!scene) {
      return false;
    }

    // Check objects and evidence
    for (const obj of scene.objectsAndEvidence || []) {
      if (TEXT_SIGN_REGEX.test(obj)) return true;
    }

    // Check actions and visual details
    for (const act of scene.actions || []) {
      if (TEXT_SIGN_REGEX.test(act)) return true;
    }
    for (const vis of scene.visualDetails || []) {
      if (TEXT_SIGN_REGEX.test(vis)) return true;
    }

    // Check description
    if (scene.description && TEXT_SIGN_REGEX.test(scene.description)) {
      return true;
    }

    return false;
  }

  /**
   * AI Director: Selects a cinematic color grade preset based on scene narrative mood and emotional tags.
   */
  public selectSceneAwareColorPreset(
    scene?: EpisodeScene,
    shot?: MovieTimelineShot,
    fallbackIndex: number = 0
  ): { name: string; filter: string } {
    const desc = `${scene?.description || ''} ${shot?.sceneDescription || ''} ${scene?.emotionalTone || ''}`.toLowerCase();

    // 1. Crime / Mystery / Investigation / Night
    if (/investigat|crime|police|murder|killer|clue|night|dark|mystery|রহস্য|তদন্ত|খুন|রাত/i.test(desc)) {
      return CINEMATIC_COLOR_PRESETS[1]; // cool_mystery
    }
    // 2. Thriller / Dynamic Conflict / Action / Shock
    if (/fight|action|chase|explosion|shock|danger|conflict|বিস্ফোরণ|মারামারি|আঘাত/i.test(desc)) {
      return CINEMATIC_COLOR_PRESETS[2]; // dynamic_contrast
    }
    // 3. Warm Drama / Friendship / Romance / Personal
    if (/warm|love|friend|family|romance|conversation|স্মৃতি|ভালোবাসা|বন্ধু/i.test(desc)) {
      return CINEMATIC_COLOR_PRESETS[0]; // warm_cinematic
    }
    // 4. Sunset / Resolution / Triumph
    if (/sunset|golden|resolution|victory|hope|সকাল|আলো|আশা/i.test(desc)) {
      return CINEMATIC_COLOR_PRESETS[4]; // golden_hour
    }
    // 5. Gritty Noir / Interrogation
    if (/noir|interrogat|shadow|cell|jail|কারাগার|অন্ধকার/i.test(desc)) {
      return CINEMATIC_COLOR_PRESETS[5]; // noir_crisp
    }

    // Default fallback
    const idx = Math.abs(fallbackIndex) % CINEMATIC_COLOR_PRESETS.length;
    return CINEMATIC_COLOR_PRESETS[idx];
  }

  /**
   * Builds the complete FFmpeg video filtergraph for an individual shot slice.
   * Dynamically randomizes combinations of invisible transforms:
   * 1. Dynamic Micro-Scaling (2% - 5% crop with Lanczos scaling)
   * 2. Professional Color Remapping (subtle LUT / color matrix shift)
   * 3. Micro-Temporal Shifting (0.98x - 1.02x setpts)
   * 4. Intelligent Mirroring (hflip only when text-free)
   * 5. Ken Burns Still Pan/Zoom (for still-frame breath)
   */
  public buildShotFiltergraph(
    shot: MovieTimelineShot,
    index: number,
    aspectRatio: VoiceoverOutputAspectRatio,
    outW: number,
    outH: number,
    outFps: number,
    settings?: Partial<TransformativeEditingSettings>,
    scene?: EpisodeScene
  ): AppliedInvisibleTransforms {
    const filters: string[] = [];
    const isExplicitNeutral = settings?.preset === 'neutral';
    const isCreativePreset = settings?.preset && settings.preset !== 'neutral';
    const isFairUseEnabled = isExplicitNeutral ? false : (settings?.enableFairUsePreset ?? true);

    const invisible = settings?.invisibleTransforms ?? {
      enabled: isFairUseEnabled,
      microScaling: isFairUseEnabled,
      colorRemapping: isFairUseEnabled,
      microTemporalShift: isFairUseEnabled,
      intelligentMirroring: isFairUseEnabled,
      sixSecondRule: true,
      jumpCutIntegration: true,
    };

    const isEnabled = isExplicitNeutral ? false : (invisible.enabled ?? isFairUseEnabled);

    // Deterministic pseudo-random seed per shot index
    const seed = (index * 9301 + 49297) % 233280;

    // ── 1. Dynamic Micro-Scaling (The "Breath" Effect) ──
    let cropFactor = 1.0;
    if (isEnabled && (invisible.microScaling ?? false)) {
      const cropPercent = 0.02 + ((seed % 31) / 1000); // 0.020 .. 0.051
      cropFactor = Number((1.0 - cropPercent).toFixed(4));
    } else if (shot.zoomLevel && shot.zoomLevel > 1.001) {
      cropFactor = Number((1.0 / shot.zoomLevel).toFixed(4));
    } else if (settings?.zoomLevel && settings.zoomLevel > 1.001) {
      cropFactor = Number((1.0 / settings.zoomLevel).toFixed(4));
    }

    // ── 2. Unified Framing, Screenshot Motion & Scaling ──
    const isScreenshot = Boolean(shot.isScreenshot || shot.presentationType === 'screenshot');
    const motion = shot.motionEffect || 'gentle_zoom_in';

    if (isScreenshot) {
      // Cinematic Screenshot Motion System:
      // Preserves original aspect ratio without black borders by pre-scaling with a 12% safety margin.
      // Supports pan_left_to_right, pan_right_to_left, gentle_zoom_in, gentle_zoom_out, and subtle_diagonal.
      const padW = Math.round(outW * 1.12);
      const padH = Math.round(outH * 1.12);
      const freezePrefix = /\.(jpg|jpeg|png|webp|svg)$/i.test(shot.sourceFile || '')
        ? ''
        : 'trim=start_frame=0:end_frame=1,loop=loop=-1:size=1:start=0,';

      let motionFilter = '';
      if (motion === 'pan_left_to_right') {
        motionFilter = `${freezePrefix}scale=${padW}:${padH}:force_original_aspect_ratio=increase,crop=${padW}:${padH},zoompan=z='1.08':x='if(lte(on,1),0,min(x+0.6,iw-iw/zoom))':y='(ih-ih/zoom)/2':d=1:s=${outW}x${outH}:fps=${outFps}`;
      } else if (motion === 'pan_right_to_left') {
        motionFilter = `${freezePrefix}scale=${padW}:${padH}:force_original_aspect_ratio=increase,crop=${padW}:${padH},zoompan=z='1.08':x='if(lte(on,1),iw-iw/zoom,max(0,x-0.6))':y='(ih-ih/zoom)/2':d=1:s=${outW}x${outH}:fps=${outFps}`;
      } else if (motion === 'gentle_zoom_out') {
        motionFilter = `${freezePrefix}scale=${padW}:${padH}:force_original_aspect_ratio=increase,crop=${padW}:${padH},zoompan=z='if(lte(zoom,1.0),1.10,max(1.0,zoom-0.0007))':x='(iw-iw/zoom)/2':y='(ih-ih/zoom)/2':d=1:s=${outW}x${outH}:fps=${outFps}`;
      } else if (motion === 'subtle_diagonal') {
        motionFilter = `${freezePrefix}scale=${padW}:${padH}:force_original_aspect_ratio=increase,crop=${padW}:${padH},zoompan=z='min(zoom+0.0005,1.08)':x='if(lte(on,1),0,min(x+0.4,iw-iw/zoom))':y='if(lte(on,1),0,min(y+0.25,ih-ih/zoom))':d=1:s=${outW}x${outH}:fps=${outFps}`;
      } else {
        // default gentle_zoom_in
        motionFilter = `${freezePrefix}scale=${padW}:${padH}:force_original_aspect_ratio=increase,crop=${padW}:${padH},zoompan=z='min(zoom+0.0008,1.10)':x='(iw-iw/zoom)/2':y='(ih-ih/zoom)/2':d=1:s=${outW}x${outH}:fps=${outFps}`;
      }

      filters.push(motionFilter);
    } else {
      const scaleFlags = (settings?.qualityPreset === 'draft_preview' || settings?.qualityPreset === 'fast_export') ? 'bicubic' : 'lanczos';
      const framingMode = shot.framingMode || settings?.framingMode || 'action';

      if (aspectRatio === '9:16') {
        if (framingMode === 'blur_fill') {
          filters.push(
            `split[bg][fg];` +
            `[bg]crop=iw*${cropFactor}:ih*${cropFactor},scale=${outW}:${outH}:force_original_aspect_ratio=increase,crop=${outW}:${outH},boxblur=20:4,setsar=1[bg_blurred];` +
            `[fg]crop=iw*${cropFactor}:ih*${cropFactor},scale=${outW}:${outH}:force_original_aspect_ratio=decrease,setsar=1[fg_scaled];` +
            `[bg_blurred][fg_scaled]overlay=(W-w)/2:(H-h)/2`
          );
        } else {
          filters.push(
            `crop=min(iw\\,ih*(${outW}/${outH})*${cropFactor}):min(ih\\,iw*(${outH}/${outW})*${cropFactor}),` +
            `scale=${outW}:${outH}:flags=${scaleFlags},setsar=1`
          );
        }
      } else if (aspectRatio === '1:1') {
        filters.push(
          `crop=min(iw\\,ih)*${cropFactor}:min(iw\\,ih)*${cropFactor},` +
          `scale=${outW}:${outH}:flags=${scaleFlags},setsar=1`
        );
      } else {
        // 16:9 standard cinematic
        if (cropFactor < 0.999) {
          filters.push(
            `crop=iw*${cropFactor}:ih*${cropFactor},` +
            `scale=${outW}:${outH}:flags=${scaleFlags},setsar=1`
          );
        } else {
          filters.push(
            `scale=${outW}:${outH}:force_original_aspect_ratio=decrease,pad=${outW}:${outH}:(ow-iw)/2:(oh-ih)/2:black,setsar=1`
          );
        }
      }
    }

    // ── 3. Creative & Professional Color Remapping & Per-Shot Grading ──
    let colorGradeName = 'neutral';
    if (shot.colorGrading) {
      colorGradeName = shot.colorGrading.preset || 'manual_grade';
      const cg = shot.colorGrading;
      const brightness = cg.brightness ?? 0.0;
      const exposure = cg.exposure ?? 0.0;
      const contrast = cg.contrast ?? 1.0;
      const saturation = cg.saturation ?? 1.0;
      const temp = cg.temperature ?? 0;
      const tint = cg.tint ?? 0;
      const effectiveBright = brightness + exposure * 0.08;

      if (Math.abs(contrast - 1.0) > 0.01 || Math.abs(effectiveBright) > 0.005 || Math.abs(saturation - 1.0) > 0.01) {
        filters.push(`eq=contrast=${contrast.toFixed(2)}:brightness=${effectiveBright.toFixed(2)}:saturation=${saturation.toFixed(2)}`);
      }
      if (Math.abs(temp) > 1 || Math.abs(tint) > 1) {
        const rs = (temp * 0.0015).toFixed(3);
        const bs = (-temp * 0.0015).toFixed(3);
        const gs = (tint * 0.0015).toFixed(3);
        filters.push(`colorbalance=rs=${rs}:bs=${bs}:gs=${gs}`);
      }
      if (cg.sharpen && cg.sharpen > 0) {
        const shAmount = Math.min(2.0, (cg.sharpen / 50)).toFixed(2);
        filters.push(`unsharp=5:5:${shAmount}:5:5:0.0`);
      }
      if (cg.vignette && cg.vignette > 0) {
        filters.push('vignette=PI/4');
      }
    } else if (settings?.preset === 'subtle_cinema') {
      colorGradeName = 'subtle_cinema';
      filters.push('eq=contrast=1.04:brightness=0.01:saturation=1.06,colorbalance=rs=0.015:gs=0.005:bs=-0.008');
    } else if (settings?.preset === 'vibrant_commentary') {
      colorGradeName = 'vibrant_commentary';
      filters.push('eq=contrast=1.06:brightness=0.015:saturation=1.12,colorbalance=rs=0.01:gs=0.008:bs=0.01');
    } else if (settings?.preset === 'dramatic_contrast') {
      colorGradeName = 'dramatic_contrast';
      filters.push('eq=contrast=1.10:brightness=-0.005:saturation=1.04');
    } else if (isEnabled && (invisible.colorRemapping ?? false)) {
      const presetIndex = (index + (seed % 6)) % CINEMATIC_COLOR_PRESETS.length;
      const selected = this.selectSceneAwareColorPreset(scene, shot, presetIndex);
      colorGradeName = selected.name;
      filters.push(selected.filter);
    } else if (settings?.colorGrading?.enabled) {
      const contrast = settings.colorGrading.contrast ?? 1.0;
      const brightness = settings.colorGrading.brightness ?? 0.0;
      const saturation = settings.colorGrading.saturation ?? 1.0;
      const gamma = settings.colorGrading.gamma ?? 1.0;
      if (Math.abs(contrast - 1.0) > 0.01 || Math.abs(brightness) > 0.005 || Math.abs(saturation - 1.0) > 0.01 || Math.abs(gamma - 1.0) > 0.01) {
        filters.push(`eq=contrast=${contrast}:brightness=${brightness}:saturation=${saturation}:gamma=${gamma}`);
      }
      if (settings.colorGrading.vignette) {
        filters.push('vignette=PI/4');
      }
    }

    // ── 3b. Visual Filter & Practical Effects ──
    if (shot.filterEffect?.enabled && shot.filterEffect.type !== 'none') {
      const fx = shot.filterEffect;
      if (fx.type === 'cinematic') {
        filters.push('eq=contrast=1.08:brightness=0.01:saturation=1.1,colorbalance=rs=0.02:bs=-0.01');
      } else if (fx.type === 'vintage') {
        filters.push('eq=contrast=0.95:saturation=0.75,colorbalance=rs=0.05:gs=0.02:bs=-0.05');
      } else if (fx.type === 'film') {
        filters.push('eq=contrast=1.05:brightness=0.02:saturation=1.05,noise=alls=10:allf=t+u');
      } else if (fx.type === 'bw') {
        filters.push('hue=s=0,eq=contrast=1.1');
      } else if (fx.type === 'warm') {
        filters.push('colorbalance=rs=0.04:gs=0.01:bs=-0.03');
      } else if (fx.type === 'cool') {
        filters.push('colorbalance=rs=-0.03:gs=0.01:bs=0.04');
      } else if (fx.type === 'soft_contrast') {
        filters.push('eq=contrast=0.9:saturation=0.95');
      } else if (fx.type === 'sharpen') {
        filters.push('unsharp=5:5:1.2:5:5:0.0');
      } else if (fx.type === 'blur') {
        filters.push('boxblur=4:1');
      } else if (fx.type === 'vignette') {
        filters.push('vignette=PI/3');
      } else if (fx.type === 'film_grain') {
        filters.push('noise=alls=14:allf=t+u');
      } else if (fx.type === 'glow') {
        filters.push('gblur=sigma=2:steps=1');
      } else if (fx.type === 'glitch') {
        filters.push('rgbashift=rh=4:bv=-4');
      }
    }

    // ── 3c. Border, Frame & Canvas Design ──
    const borderObj = shot.border || (shot as any).borderSettings;
    if (borderObj && (borderObj.enabled !== false) && borderObj.style !== 'none') {
      const rawCol = borderObj.color || borderObj.borderColor || 'white';
      const col = rawCol.startsWith('#') ? rawCol.replace('#', '0x') : rawCol;
      const thick = Math.max(1, borderObj.thickness || 4);
      filters.push(`drawbox=x=0:y=0:w=iw:h=ih:color=${col}:t=${thick}`);
    }

    // ── 4. Temporal Shifting & Zero-Point PTS Normalization ──
    // ALWAYS reset PTS with PTS-STARTPTS so first frame is strictly 0.000s without black delay
    let speedShift = 1.0;
    const explicitSpeed = shot.speedSettings?.speedMultiplier ?? shot.speedMultiplier;
    if (explicitSpeed && Math.abs(explicitSpeed - 1.0) > 0.005) {
      speedShift = explicitSpeed;
    } else if (settings?.playbackSpeed && Math.abs(settings.playbackSpeed - 1.0) > 0.005) {
      speedShift = settings.playbackSpeed;
    } else if (isEnabled && (invisible.microTemporalShift ?? false)) {
      speedShift = (index % 2 === 0) ? 0.98 : 1.02;
    }

    if (Math.abs(speedShift - 1.0) > 0.002) {
      const ptsFactor = (1.0 / speedShift).toFixed(4);
      filters.push(`setpts=(PTS-STARTPTS)*${ptsFactor}`);
    } else {
      // Standard neutral speed: frame-accurate zero-point PTS reset
      filters.push('setpts=PTS-STARTPTS');
    }

    // ── 5. Horizontal Flip (Explicit User Control or Intelligent Safe Mirror) ──
    const hasTextOrSigns = this.detectTextOrReadableSigns(scene, shot);
    let isMirrored = false;
    if (shot.isFlipped !== undefined) {
      isMirrored = shot.isFlipped;
    } else if (settings?.horizontalFlip) {
      isMirrored = true;
    } else if (isEnabled && (invisible.intelligentMirroring ?? false)) {
      if (!hasTextOrSigns && (index % 5 === 1 || index % 5 === 3)) {
        isMirrored = true;
      }
    }

    if (isMirrored) {
      filters.push('hflip');
    }

    // ── 6. Still Frame Ken Burns Effect (Slow Zoom) ──
    // Strictly limited to intentional still-image holds under an explicit user setting.
    // Moving video must NEVER have zoompan applied (which freezes video into a slow still zoom).
    const isKenBurnsStill = !!(shot.isStillHold && shot.isKenBurnsStill && settings?.allowStillHolds);
    if (isKenBurnsStill) {
      filters.push(`zoompan=z='min(zoom+0.0012,1.06)':d=1:s=${outW}x${outH}:fps=${outFps}`);
    }

    // ── 7. Contextual Transition Rendering (fade_black, fade_white, crossfade) ──
    const transIn = shot.transition;
    const transInDur = Math.max(0.15, Math.min(shot.duration * 0.4, shot.transitionDuration || 0.4));
    if (transIn === 'fade_black') {
      filters.push(`fade=t=in:st=0:d=${transInDur.toFixed(2)}:c=black`);
    } else if (transIn === 'fade_white') {
      filters.push(`fade=t=in:st=0:d=${transInDur.toFixed(2)}:c=white`);
    } else if (transIn === 'crossfade' || transIn === 'dissolve') {
      filters.push(`fade=t=in:st=0:d=${transInDur.toFixed(2)}`);
    }

    const transOut = shot.transitionOut;
    const transOutDur = Math.max(0.15, Math.min(shot.duration * 0.4, shot.transitionOutDuration || shot.transitionDuration || 0.4));
    if (transOut === 'fade_black') {
      const outStart = Math.max(0, shot.duration - transOutDur);
      filters.push(`fade=t=out:st=${outStart.toFixed(2)}:d=${transOutDur.toFixed(2)}:c=black`);
    } else if (transOut === 'fade_white') {
      const outStart = Math.max(0, shot.duration - transOutDur);
      filters.push(`fade=t=out:st=${outStart.toFixed(2)}:d=${transOutDur.toFixed(2)}:c=white`);
    } else if (transOut === 'crossfade' || transOut === 'dissolve') {
      const outStart = Math.max(0, shot.duration - transOutDur);
      filters.push(`fade=t=out:st=${outStart.toFixed(2)}:d=${transOutDur.toFixed(2)}`);
    }

    // Ensure fixed framerate output
    filters.push(`fps=${outFps}`);

    return {
      cropFactor,
      colorGradeName,
      speedShift,
      isMirrored,
      isKenBurnsStill,
      hasJumpCut: !!shot.hasJumpCut,
      fullFiltergraph: filters.join(','),
    };
  }
}

export const transformativeFilterEngine = new TransformativeFilterEngine();
