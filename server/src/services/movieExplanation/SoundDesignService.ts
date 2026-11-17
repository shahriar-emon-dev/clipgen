// ============================================================
// Sound Design Service — Intelligent Local Sound Effect Placement
// Indexes local SFX library and uses narration context (Bangla & English)
// and scene visual actions to place ducked, non-overlapping sound effects.
// ============================================================

import fs from 'fs';
import path from 'path';
import { v4 as uuid } from 'uuid';
import type {
  ExplanationScriptSegment,
  MovieTimelineShot,
  TimelineAudioLayer,
} from '../../../../shared/types.js';

export interface SfxAsset {
  id: string;
  category: string;
  filename: string;
  filePath: string;
  duration: number;
  tags: string[];
  bengaliTriggers: string[];
  englishTriggers: string[];
  defaultVolume: number;
}

export class SoundDesignService {
  private sfxLibrary: SfxAsset[] = [];
  private sfxDir: string;

  constructor() {
    const cwd = process.cwd();
    if (fs.existsSync(path.join(cwd, 'assets/sfx'))) {
      this.sfxDir = path.join(cwd, 'assets/sfx');
    } else {
      this.sfxDir = path.resolve(cwd, 'server/assets/sfx');
    }
    this.initLibrary();
  }

  /**
   * Initializes and indexes available local audio assets.
   */
  public initLibrary(): void {
    if (!fs.existsSync(this.sfxDir)) {
      try {
        fs.mkdirSync(this.sfxDir, { recursive: true });
      } catch {}
    }

    const definitions: Omit<SfxAsset, 'filePath'>[] = [
      {
        id: 'sfx_footsteps',
        category: 'movement',
        filename: 'footsteps.wav',
        duration: 1.5,
        tags: ['footsteps', 'walk', 'step', 'pace', 'movement'],
        bengaliTriggers: ['হাঁটা', 'হেঁটে', 'পা ফেলে', 'ঘরে ঢুকে', 'এগিয়ে যায়', 'ছুটে'],
        englishTriggers: ['walk', 'walks', 'walking', 'stepped', 'enters room', 'running'],
        defaultVolume: 0.14,
      },
      {
        id: 'sfx_door_open',
        category: 'object',
        filename: 'door_open.wav',
        duration: 1.2,
        tags: ['door', 'open', 'entrance', 'creak'],
        bengaliTriggers: ['দরজা খুলল', 'দরজা খোলে', 'দরজা খুলে', 'কপাট'],
        englishTriggers: ['door open', 'opens the door', 'door creaks', 'unlocked'],
        defaultVolume: 0.15,
      },
      {
        id: 'sfx_door_close',
        category: 'object',
        filename: 'door_close.wav',
        duration: 0.8,
        tags: ['door', 'close', 'shut', 'slam'],
        bengaliTriggers: ['দরজা বন্ধ', 'ধাম করে বন্ধ', 'আটকে গেল'],
        englishTriggers: ['door closed', 'door shuts', 'slams door', 'locked'],
        defaultVolume: 0.16,
      },
      {
        id: 'sfx_phone_ring',
        category: 'electronics',
        filename: 'phone_ring.wav',
        duration: 1.8,
        tags: ['phone', 'ring', 'call', 'mobile', 'notification'],
        bengaliTriggers: ['ফোন', 'কল', 'রিং', 'ফোনটি তুলে', 'বার্তা', 'শব্দ'],
        englishTriggers: ['phone', 'rings', 'call', 'calling', 'picks up the phone', 'notification'],
        defaultVolume: 0.12,
      },
      {
        id: 'sfx_impact_hit',
        category: 'action',
        filename: 'impact_hit.wav',
        duration: 0.9,
        tags: ['impact', 'punch', 'hit', 'smash', 'broken', 'shatter'],
        bengaliTriggers: ['আঘাত', 'মারামারি', 'ভাঙা', 'গ্লাস', 'ধ্বংস', 'পড়ে গেল', 'আছাড়'],
        englishTriggers: ['impact', 'punch', 'hit', 'smashes', 'broken glass', 'shattered', 'drop'],
        defaultVolume: 0.15,
      },
      {
        id: 'sfx_whoosh_cinematic',
        category: 'transition',
        filename: 'whoosh_cinematic.wav',
        duration: 1.2,
        tags: ['whoosh', 'swoosh', 'transition', 'fast', 'turn'],
        bengaliTriggers: ['ঘুরে তাকায়', 'হঠাৎ', 'মুহূর্তে', 'ছুটে গেল', 'দ্রুত'],
        englishTriggers: ['whoosh', 'suddenly', 'turns around', 'instant', 'fast motion'],
        defaultVolume: 0.13,
      },
      {
        id: 'sfx_heartbeat_tension',
        category: 'suspense',
        filename: 'heartbeat_tension.wav',
        duration: 2.0,
        tags: ['heartbeat', 'tension', 'fear', 'suspense', 'pulse'],
        bengaliTriggers: ['ভয়', 'আতঙ্ক', 'হৃদস্পন্দন', 'উদ্বেগ', 'শ্বাসরুদ্ধকর'],
        englishTriggers: ['heartbeat', 'tense', 'scared', 'fear', 'suspense', 'danger'],
        defaultVolume: 0.16,
      },
      {
        id: 'sfx_rain_ambience',
        category: 'ambience',
        filename: 'rain_ambience.wav',
        duration: 4.0,
        tags: ['rain', 'weather', 'storm', 'ambience'],
        bengaliTriggers: ['বৃষ্টি', 'ঝড়', 'বৃষ্টির', 'বাদল'],
        englishTriggers: ['rain', 'storm', 'raining', 'weather', 'ambient'],
        defaultVolume: 0.10,
      },
      {
        id: 'sfx_cinematic_reveal',
        category: 'reveal',
        filename: 'cinematic_reveal.wav',
        duration: 2.5,
        tags: ['reveal', 'discovery', 'secret', 'shock', 'truth'],
        bengaliTriggers: ['রহস্য', 'সত্য', 'উন্মোচন', 'চমকে', 'আসল ঘটনা', 'প্রকাশ পায়'],
        englishTriggers: ['reveal', 'truth', 'secret', 'shocked', 'discovers', 'unveiled'],
        defaultVolume: 0.14,
      },
    ];

    this.sfxLibrary = [];
    for (const def of definitions) {
      const fullPath = path.join(this.sfxDir, def.filename);
      if (fs.existsSync(fullPath)) {
        this.sfxLibrary.push({
          ...def,
          filePath: fullPath,
        });
      }
    }
  }

  /**
   * Returns list of indexed SFX assets
   */
  public getAvailableSounds(): SfxAsset[] {
    if (this.sfxLibrary.length === 0) {
      this.initLibrary();
    }
    return this.sfxLibrary;
  }

  /**
   * Intelligently selects and places sound effects across the timeline
   * based on narration meaning, action cues, and visual shot pacing.
   */
  public generateAudioLayers(
    segments: ExplanationScriptSegment[],
    shots: MovieTimelineShot[],
    timelineDuration: number,
    existingLayers?: TimelineAudioLayer[]
  ): TimelineAudioLayer[] {
    if (this.sfxLibrary.length === 0) {
      this.initLibrary();
    }

    // Preserve locked or user-created audio layers
    const preservedLayers = (existingLayers || []).filter(
      (layer) => layer.isMuted !== undefined || layer.trackType === 'voiceover' || layer.trackType === 'bgm'
    );

    const generatedSfxLayers: TimelineAudioLayer[] = [];
    let lastSfxEnd = -1.0;
    const minSpacing = 2.5; // Minimum 2.5s between sound effects to avoid cacophony

    // 1. Scan script segments and sub-actions for semantic audio cues
    for (const seg of segments) {
      const segText = seg.text || '';
      const textLower = segText.toLowerCase();

      // Check sub-actions first for precise timestamp placement
      if (seg.subActions && seg.subActions.length > 0) {
        for (const subAct of seg.subActions) {
          const subText = (subAct.actionText || '').toLowerCase();
          const match = this.findMatchingSfx(subText, subAct.keywords || []);
          const actStart = subAct.subStart ?? subAct.startTime;
          if (match && actStart >= lastSfxEnd + minSpacing && actStart < timelineDuration - 0.5) {
            const start = Number(actStart.toFixed(3));
            const end = Number(Math.min(timelineDuration, start + match.duration).toFixed(3));
            generatedSfxLayers.push({
              id: `sfx_${uuid().slice(0, 8)}`,
              trackType: 'sfx',
              name: `SFX: ${match.category} (${path.basename(match.filename, path.extname(match.filename))})`,
              sourceFilePath: match.filePath,
              timelineStart: start,
              timelineEnd: end,
              duration: match.duration,
              volume: match.defaultVolume,
              fadeInDuration: 0.05,
              fadeOutDuration: 0.15,
            });
            lastSfxEnd = end;
          }
        }
      } else {
        // Evaluate overall segment text
        const match = this.findMatchingSfx(textLower, [seg.storyEventOrAction || '', seg.narrativePurpose || '']);
        const start = Number(seg.voiceoverStart.toFixed(3));
        if (match && start >= lastSfxEnd + minSpacing && start < timelineDuration - 0.5) {
          const end = Number(Math.min(timelineDuration, start + match.duration).toFixed(3));
          generatedSfxLayers.push({
            id: `sfx_${uuid().slice(0, 8)}`,
            trackType: 'sfx',
            name: `SFX: ${match.category} (${path.basename(match.filename, path.extname(match.filename))})`,
            sourceFilePath: match.filePath,
            timelineStart: start,
            timelineEnd: end,
            duration: match.duration,
            volume: match.defaultVolume,
            fadeInDuration: 0.05,
            fadeOutDuration: 0.15,
          });
          lastSfxEnd = end;
        }
      }
    }

    // 2. Scan dramatic shot transitions (reveal or shock shots)
    for (const shot of shots) {
      if (shot.transition === 'fade_black' || shot.transition === 'fade_white' || shot.isLowConfidence) {
        continue;
      }
      if (shot.whyThisScene?.storyContextReason?.toLowerCase().includes('reveal') || shot.storyEvent?.toLowerCase().includes('climax')) {
        const whoosh = this.sfxLibrary.find((s) => s.id === 'sfx_whoosh_cinematic');
        const start = Number(shot.timelineStart.toFixed(3));
        if (whoosh && start >= lastSfxEnd + minSpacing && start < timelineDuration - 0.5) {
          const end = Number(Math.min(timelineDuration, start + whoosh.duration).toFixed(3));
          generatedSfxLayers.push({
            id: `sfx_${uuid().slice(0, 8)}`,
            trackType: 'sfx',
            name: `SFX: cinematic whoosh`,
            sourceFilePath: whoosh.filePath,
            timelineStart: start,
            timelineEnd: end,
            duration: whoosh.duration,
            volume: whoosh.defaultVolume,
            fadeInDuration: 0.05,
            fadeOutDuration: 0.15,
          });
          lastSfxEnd = end;
        }
      }
    }

    // Combine with preserved layers
    return [...preservedLayers, ...generatedSfxLayers];
  }

  /**
   * Matches text and keywords against SFX triggers
   */
  private findMatchingSfx(text: string, keywords: string[]): SfxAsset | null {
    const combined = `${text} ${keywords.join(' ')}`.toLowerCase();

    for (const sfx of this.sfxLibrary) {
      // Check Bengali triggers
      for (const bTrigger of sfx.bengaliTriggers) {
        if (combined.includes(bTrigger.toLowerCase())) {
          return sfx;
        }
      }
      // Check English triggers
      for (const eTrigger of sfx.englishTriggers) {
        if (combined.includes(eTrigger.toLowerCase())) {
          return sfx;
        }
      }
    }

    return null;
  }
}

export const soundDesignService = new SoundDesignService();
