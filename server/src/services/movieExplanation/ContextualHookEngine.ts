// ============================================================
// Contextual Hook Engine — AI-Assisted Narrative On-Screen Hooks
// Generates punchy, context-aware 3-6 word hooks in Bengali and English
// for key narrative beats (suspense, surprise, emotional turning point,
// mystery, action, revelation) placed safely without obscuring faces.
// ============================================================

import { v4 as uuid } from 'uuid';
import type {
  ExplanationScriptSegment,
  MovieTimelineShot,
  TimelineTextOverlay,
} from '../../../../shared/types.js';

export interface HookRecommendation {
  hookText: string;
  category: 'suspense' | 'surprise' | 'emotional' | 'mystery' | 'action' | 'revelation';
  timelineStart: number;
  timelineEnd: number;
  duration: number;
  reason: string;
}

export class ContextualHookEngine {
  /**
   * Generates selective on-screen hooks based on narration beats and scene tone.
   */
  public generateHooks(
    segments: ExplanationScriptSegment[],
    shots: MovieTimelineShot[],
    existingOverlays?: TimelineTextOverlay[],
    options?: {
      maxHooks?: number;
      preferredLanguage?: 'bn' | 'en' | 'auto';
    }
  ): TimelineTextOverlay[] {
    // Preserve existing manually created or locked overlays
    const preservedOverlays = (existingOverlays || []).filter(
      (o) => o.category !== 'callout'
    );

    const maxHooks = options?.maxHooks ?? Math.max(1, Math.min(6, Math.floor(segments.length / 4)));
    const hookRecommendations: HookRecommendation[] = [];

    const minSpacing = 15.0; // Minimum 15s between on-screen hooks to prevent clutter
    let lastHookEnd = -minSpacing;

    for (let i = 0; i < segments.length; i++) {
      if (hookRecommendations.length >= maxHooks) break;

      const seg = segments[i];
      const start = seg.voiceoverStart;
      const end = seg.voiceoverEnd;
      const duration = Number((end - start).toFixed(2));

      if (start < lastHookEnd + minSpacing) continue;

      const text = seg.text || '';
      const isBengali = /[\u0980-\u09FF]/.test(text);
      const purpose = seg.narrativePurpose;
      const action = (seg.storyEventOrAction || '').toLowerCase();

      let hook: { text: string; category: HookRecommendation['category']; reason: string } | null = null;

      // Suspense cues
      if (purpose === 'setup' || /ভয়|আতঙ্ক|বিপদ|অন্ধকার|রহস্যময়|suspense|danger|dark/i.test(text + ' ' + action)) {
        hook = {
          category: 'suspense',
          text: isBengali ? 'কিছু একটা ঠিক নেই...' : "Something isn't right...",
          reason: 'Suspenseful setup beat',
        };
      }
      // Surprise cues
      else if (/চমকে|বিশ্বাস|ভাবেনি|হঠাৎ|unexpected|shock|surprised|suddenly/i.test(text + ' ' + action)) {
        hook = {
          category: 'surprise',
          text: isBengali ? 'এমনটা সে আশা করেনি!' : "He wasn't expecting this...",
          reason: 'Unexpected plot twist or reaction beat',
        };
      }
      // Revelation cues
      else if (purpose === 'reveal' || /সত্য|রহস্য|উন্মোচন|আসল ঘটনা|truth|secret|revealed/i.test(text + ' ' + action)) {
        hook = {
          category: 'revelation',
          text: isBengali ? 'আসল সত্যিটা কী?' : 'The truth finally comes out...',
          reason: 'Crucial revelation moment',
        };
      }
      // Climax / Turning point cues
      else if (purpose === 'climax' || /বদলে গেল|শেষ পরিণতি|মহাসঙ্কট|everything changed|turning point/i.test(text + ' ' + action)) {
        hook = {
          category: 'emotional',
          text: isBengali ? 'সবকিছু বদলে গেল...' : 'This changed everything.',
          reason: 'Emotional turning point',
        };
      }
      // Mystery cues
      else if (/সমস্যা|প্রশ্ন|কিন্তু|কখনো|mystery|problem|curious|why/i.test(text + ' ' + action)) {
        hook = {
          category: 'mystery',
          text: isBengali ? 'কিন্তু একটা বড় সমস্যা আছে...' : "But there's one problem...",
          reason: 'Narrative tension & question hook',
        };
      }

      if (hook) {
        const hookDur = Math.min(3.0, Math.max(1.8, duration * 0.7));
        hookRecommendations.push({
          hookText: hook.text,
          category: hook.category,
          timelineStart: Number(start.toFixed(3)),
          timelineEnd: Number((start + hookDur).toFixed(3)),
          duration: hookDur,
          reason: hook.reason,
        });
        lastHookEnd = start + hookDur;
      }
    }

    // Convert recommendations into TimelineTextOverlay objects
    const newOverlays: TimelineTextOverlay[] = hookRecommendations.map((rec) => {
      const isBn = /[\u0980-\u09FF]/.test(rec.hookText);
      return {
        id: `hook_${uuid().slice(0, 8)}`,
        text: rec.hookText,
        timelineStart: rec.timelineStart,
        timelineEnd: rec.timelineEnd,
        startTime: rec.timelineStart,
        duration: rec.duration,
        trackId: 'track_text',
        positionX: 50, // Centered horizontally
        positionY: 18, // Placed safely in upper third to avoid covering faces or captions
        fontSize: 28,
        fontFamily: isBn ? 'Nirmala UI, Hind Siliguri, Kalpurush, sans-serif' : 'Inter, Montserrat, sans-serif',
        fontWeight: 'bold',
        fontColor: '#FFFFFF',
        backgroundColor: 'rgba(0, 0, 0, 0.65)',
        outlineColor: '#E50914', // Cinematic subtle red accent or high-contrast border
        outlineWidth: 2,
        opacity: 0.95,
        rotation: 0,
        alignment: 'center',
        animation: 'slide_up',
        category: 'callout',
      };
    });

    return [...preservedOverlays, ...newOverlays];
  }
}

export const contextualHookEngine = new ContextualHookEngine();
