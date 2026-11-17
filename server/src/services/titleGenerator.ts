// ============================================================
// Title Generator — Unique Human-Readable Title Engine
// Generates accurate, engaging, and unique titles for Shorts
// ============================================================

import { config } from '../config/index.js';

interface TitleContext {
  transcriptText: string;
  projectTitle?: string;
  scores?: {
    hook?: number;
    emotion?: number;
    curiosity?: number;
    story?: number;
    contentValue?: number;
    audio?: number;
  };
  duration?: number;
  startTime?: number;
  index: number;
}

const SPORTS_ENTITIES = [
  'Ronaldo', 'Cristiano', 'Messi', 'Neymar', 'Mbappe', 'Haaland', 'Vinicius',
  'Bellingham', 'Modric', 'Benzema', 'Zidane', 'Ronaldinho', 'Pele', 'Maradona',
  'Manchester United', 'Real Madrid', 'Barcelona', 'PSG', 'Juventus', 'Arsenal',
  'Liverpool', 'Chelsea', 'Man City', 'Bayern', 'Portugal', 'Argentina', 'Brazil'
];

const ACTION_KEYWORDS: Record<string, string> = {
  'goal': 'Goal',
  'score': 'Finish',
  'kick': 'Strike',
  'free kick': 'Free Kick',
  'penalty': 'Penalty',
  'header': 'Header',
  'bicycle': 'Bicycle Kick',
  'save': 'Incredible Save',
  'dribble': 'Solo Dribble',
  'comeback': 'Epic Comeback',
  'clutch': 'Clutch Moment',
  'run': 'Sprint',
  'celebrat': 'Celebration',
  'assist': 'Brilliant Assist',
  'skill': 'Skill Display',
  'reaction': 'Unreal Reaction',
  'tackle': 'Crunching Tackle',
  'red card': 'Shocking Red Card',
  'mistake': 'Costly Mistake',
  'shock': 'Shocking Turnaround',
  'insane': 'Insane Moment',
  'impossible': 'Impossible Feat',
};

/**
 * Generate a unique, human-readable title for a Short candidate.
 */
export function generateShortTitle(
  ctx: TitleContext,
  existingTitles: Set<string> = new Set()
): string {
  const text = (ctx.transcriptText || '').trim();
  const proj = (ctx.projectTitle || '').replace(/\.[^/.]+$/, '').trim();

  // 1. Detect main subject / entity from project name or transcript
  let mainEntity = '';
  for (const entity of SPORTS_ENTITIES) {
    const re = new RegExp(`\\b${entity}\\b`, 'i');
    if (re.test(proj) || re.test(text)) {
      mainEntity = entity;
      break;
    }
  }

  // Fallback entity from clean project name
  if (!mainEntity && proj && !/^video|test|project|sample$/i.test(proj)) {
    const words = proj.split(/[\s_\-]+/).filter(w => w.length > 2);
    if (words.length > 0) {
      mainEntity = words.slice(0, 2).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
    }
  }

  // 2. Detect key action / theme
  let mainAction = '';
  const lowerText = (proj + ' ' + text).toLowerCase();
  for (const [key, label] of Object.entries(ACTION_KEYWORDS)) {
    if (lowerText.includes(key)) {
      mainAction = label;
      break;
    }
  }

  // 3. Detect questions or punchy phrases in transcript
  let punchyPhrase = '';
  const sentences = text.split(/[.!?]+/).map(s => s.trim()).filter(s => s.length > 10 && s.length < 50);
  const question = sentences.find(s => s.endsWith('?') || /^(why|how|what|who|when)\b/i.test(s));
  if (question) {
    punchyPhrase = cleanTitlePhrase(question);
  }

  // 4. Candidate Title Templates based on signals
  const templates: string[] = [];
  const hookScore = ctx.scores?.hook ?? 70;
  const emotionScore = ctx.scores?.emotion ?? 70;
  const storyScore = ctx.scores?.story ?? 70;

  if (mainEntity && mainAction) {
    templates.push(`${mainEntity}'s ${mainAction} That Shocked Everyone`);
    templates.push(`${mainEntity}'s Impossible ${mainAction}`);
    templates.push(`The ${mainAction} That Changed Everything for ${mainEntity}`);
    templates.push(`Nobody Saw This ${mainAction} Coming From ${mainEntity}`);
    templates.push(`${mainEntity} Did the Unthinkable Here`);
    templates.push(`When ${mainEntity} Turned the Whole Game Around`);
  } else if (mainEntity) {
    templates.push(`${mainEntity}'s Insane Last-Minute Moment`);
    templates.push(`Nobody Expected ${mainEntity} To Do This`);
    templates.push(`The Moment ${mainEntity} Proved Everyone Wrong`);
    templates.push(`${mainEntity}'s Pure Magic on Full Display`);
    templates.push(`How ${mainEntity} Stunned the Entire Stadium`);
    templates.push(`${mainEntity}'s Most Clutch Play Ever`);
  } else if (mainAction) {
    templates.push(`The Insane ${mainAction} That Broke the Internet`);
    templates.push(`Nobody Expected This ${mainAction}`);
    templates.push(`The Most Impossible ${mainAction} Ever Seen`);
    templates.push(`This ${mainAction} Completely Changed the Match`);
    templates.push(`One of the Wildest ${mainAction}s in History`);
  } else if (punchyPhrase) {
    templates.push(punchyPhrase);
    templates.push(`The Moment: "${punchyPhrase}"`);
  }

  // General high-retention fallback templates
  if (hookScore >= 75) {
    templates.push(`The 20 Seconds That Left Everyone Speechless`);
    templates.push(`Nobody Saw What Was Coming Next`);
    templates.push(`This Was the Turning Point of the Entire Game`);
  }
  if (emotionScore >= 75) {
    templates.push(`The Wildest Emotional Climax You Will See Today`);
    templates.push(`Pure Chaos: The Play Nobody Could Believe`);
  }
  if (storyScore >= 75) {
    templates.push(`The Incredible Story Behind This Moment`);
    templates.push(`How Everything Completely Flipped in Seconds`);
  }

  templates.push(`Unstoppable Play at ${Math.round(ctx.startTime || 0)}s`);
  templates.push(`The Masterclass That Left Everyone in Awe`);
  templates.push(`A Once-in-a-Lifetime Highlight Moment`);

  // 5. Select first unique title from candidate templates
  let chosenTitle = '';
  for (const t of templates) {
    const formatted = formatTitleCase(t);
    if (!existingTitles.has(formatted.toLowerCase())) {
      chosenTitle = formatted;
      break;
    }
  }

  // If all generated were taken, append a distinctive qualifier
  if (!chosenTitle) {
    const base = formatTitleCase(templates[0] || `${mainEntity || 'Epic'} Highlight Moment`);
    const modifiers = ['(Unreal)', '(Clutch)', '(Historic)', '(Part 2)', '(Peak Moment)', '(Must Watch)'];
    for (const m of modifiers) {
      const candidate = `${base} ${m}`;
      if (!existingTitles.has(candidate.toLowerCase())) {
        chosenTitle = candidate;
        break;
      }
    }
    if (!chosenTitle) {
      chosenTitle = `${base} #${ctx.index + 1}`;
    }
  }

  existingTitles.add(chosenTitle.toLowerCase());
  return chosenTitle;
}

/**
 * Format a string into clean Title Case.
 */
export function formatTitleCase(str: string): string {
  const minorWords = new Set(['a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'in', 'nor', 'of', 'on', 'or', 'the', 'to', 'up', 'with']);
  return str
    .split(/\s+/)
    .map((word, i) => {
      const lower = word.toLowerCase();
      if (i > 0 && minorWords.has(lower)) {
        return lower;
      }
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ')
    .replace(/["']/g, '');
}

/**
 * Clean up a transcript fragment into a punchy title line.
 */
function cleanTitlePhrase(phrase: string): string {
  let cleaned = phrase
    .replace(/^(and|so|then|well|you know|i mean|basically|like)\s+/i, '')
    .replace(/[.?!,;:]+$/, '')
    .trim();
  if (cleaned.length > 55) {
    cleaned = cleaned.substring(0, 52).trim() + '...';
  }
  return formatTitleCase(cleaned);
}

/**
 * Generate a safe, unique filename combining the human title and short ID.
 * Example: "Ronaldo's Insane Comeback", "a8f7c92e" -> "ronaldos-insane-comeback-a8f7c92e.mp4"
 */
export function generateSafeFilename(title: string, shortId: string, ext: string = 'mp4'): string {
  const cleanTitle = (title || 'short')
    .toLowerCase()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 36);

  const cleanId = (shortId || 'short').slice(0, 8);
  return `${cleanTitle}-${cleanId}.${ext}`;
}
