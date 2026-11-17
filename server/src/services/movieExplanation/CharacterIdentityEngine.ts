// ============================================================
// CharacterIdentityEngine
// Maintains persistent character registry, resolves multilingual
// names/aliases, and links character appearances across movie scenes.
// ============================================================

import type { StoryCharacter, EpisodeScene } from '../../../../shared/types.js';

export interface CharacterEntity {
  id: string;
  primaryName: string;
  aliases: string[];
  bengaliNames: string[];
  role: string;
  visualTraits?: string;
  associatedSceneIds: string[];
  firstAppearanceTimestamp: number;
}

export class CharacterIdentityEngine {
  private characterRegistry: Map<string, CharacterEntity> = new Map();

  // Common movie character multilingual alias map
  private static readonly KNOWN_CHARACTER_ALIASES: Record<string, { english: string[]; bengali: string[]; role: string }> = {
    'patrick_jane': {
      english: ['Patrick Jane', 'Patrick', 'Jane', 'The Consultant'],
      bengali: ['প্যাট্রিক জেন', 'প্যাট্রিক', 'জেন'],
      role: 'CBI Consultant / Mentalist',
    },
    'teresa_lisbon': {
      english: ['Teresa Lisbon', 'Lisbon', 'Senior Agent Lisbon', 'Teresa'],
      bengali: ['টেরিজা লিসবন', 'লিসবন', 'টেরিজা'],
      role: 'CBI Senior Agent / Team Leader',
    },
    'rosemary_tennant': {
      english: ['Rosemary Tennant', 'Rosemary', 'Mrs. Tennant', 'The Widow'],
      bengali: ['রোজমেরি টেন্যান্ট', 'রোজমেরি'],
      role: 'Victim / Wealthy Widow',
    },
    'jeremy_hale': {
      english: ['Jeremy Hale', 'Jeremy', 'The Photographer'],
      bengali: ['জেরেমি হেল', 'জেরেমি'],
      role: 'Photographer / Beneficiary',
    },
    'travis_tennant': {
      english: ['Travis Tennant', 'Travis', 'The Son'],
      bengali: ['ট্রাভিস টেন্যান্ট', 'ট্রাভিস'],
      role: 'Son / Suspect',
    },
    'claire_tennant': {
      english: ['Claire Tennant', 'Claire', 'The Daughter'],
      bengali: ['ক্লেয়ার টেন্যান্ট', 'ক্লেয়ার'],
      role: 'Daughter',
    },
    'kristina_frye': {
      english: ['Kristina Frye', 'Christina Frye', 'Christina', 'Kristina', 'The Psychic'],
      bengali: ['ক্রিস্টিনা ফ্রাই', 'ক্রিস্টিনা'],
      role: 'Spiritual Advisor / Psychic',
    },
    'kimball_cho': {
      english: ['Kimball Cho', 'Cho', 'Agent Cho'],
      bengali: ['কিম্বল চো', 'চো'],
      role: 'CBI Agent',
    },
    'wayne_rigsby': {
      english: ['Wayne Rigsby', 'Rigsby'],
      bengali: ['ওয়েন রিগসবাই', 'রিগসবাই'],
      role: 'CBI Agent',
    },
    'grace_van_pelt': {
      english: ['Grace Van Pelt', 'Van Pelt', 'Grace'],
      bengali: ['গ্রেস ভ্যান পেল্ট', 'ভ্যান পেল্ট', 'গ্রেস'],
      role: 'CBI Agent',
    },
  };

  /**
   * Initializes or refreshes the character registry from movie scenes and story map
   */
  public initializeFromScenes(scenes: EpisodeScene[], storyCharacters: StoryCharacter[] = []): void {
    this.characterRegistry.clear();

    // 1. Seed from known alias knowledge base
    for (const [key, val] of Object.entries(CharacterIdentityEngine.KNOWN_CHARACTER_ALIASES)) {
      this.characterRegistry.set(key, {
        id: key,
        primaryName: val.english[0],
        aliases: val.english,
        bengaliNames: val.bengali,
        role: val.role,
        associatedSceneIds: [],
        firstAppearanceTimestamp: 999999,
      });
    }

    // 2. Link scene appearances
    for (const scene of scenes) {
      if (!scene.characters) continue;
      for (const charName of scene.characters) {
        const entity = this.findMatchingEntity(charName);
        if (entity) {
          if (!entity.associatedSceneIds.includes(scene.sceneId)) {
            entity.associatedSceneIds.push(scene.sceneId);
          }
          entity.firstAppearanceTimestamp = Math.min(entity.firstAppearanceTimestamp, scene.startTime);
        } else {
          // Add dynamically discovered character
          const newId = charName.toLowerCase().replace(/\s+/g, '_');
          if (!this.characterRegistry.has(newId)) {
            this.characterRegistry.set(newId, {
              id: newId,
              primaryName: charName,
              aliases: [charName],
              bengaliNames: [],
              role: 'Discovered Character',
              associatedSceneIds: [scene.sceneId],
              firstAppearanceTimestamp: scene.startTime,
            });
          }
        }
      }
    }
  }

  /**
   * Resolves a character name or reference (Bengali or English) to a canonical entity
   */
  public findMatchingEntity(nameOrReference: string): CharacterEntity | undefined {
    if (!nameOrReference) return undefined;
    const clean = nameOrReference.trim().toLowerCase();

    for (const entity of this.characterRegistry.values()) {
      if (entity.primaryName.toLowerCase() === clean) return entity;
      if (entity.aliases.some((a) => a.toLowerCase() === clean || clean.includes(a.toLowerCase()))) return entity;
      if (entity.bengaliNames.some((b) => b === clean || nameOrReference.includes(b))) return entity;
    }
    return undefined;
  }

  /**
   * Identifies all characters mentioned in a given text snippet (supports Bengali and English)
   */
  public extractReferencedCharacters(text: string): CharacterEntity[] {
    if (!text) return [];
    const matched: CharacterEntity[] = [];

    for (const entity of this.characterRegistry.values()) {
      const enMatch = entity.aliases.some((a) => new RegExp(`\\b${a}\\b`, 'i').test(text));
      const bnMatch = entity.bengaliNames.some((b) => text.includes(b));
      if (enMatch || bnMatch) {
        matched.push(entity);
      }
    }

    return matched;
  }
}

export const characterIdentityEngine = new CharacterIdentityEngine();

