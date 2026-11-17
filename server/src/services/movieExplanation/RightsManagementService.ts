// ============================================================
// Rights Management & Asset Replacement Service
// Manages asset-level rights metadata, pre-export rights audits,
// and alignment-preserving visual replacements.
// ============================================================

import path from 'path';
import fs from 'fs';
import { v4 as uuid } from 'uuid';
import { extractMetadata } from '../ffmpeg.js';
import type {
  AssetRightsMetadata,
  AssetRightsStatus,
  VisualAssetCategory,
  MovieTimelineShot,
  PreExportRightsReview,
  FlaggedTimelineSection,
  ShotReplacementSource,
  ShotAlignmentMode,
  MovieExplanationClipAsset,
  EpisodeScene,
} from '../../../../shared/types.js';

export const RIGHTS_LEGAL_DISCLAIMER =
  'Editorial Rights Audit: This review tracks asset permissions and licenses for your production workflow. ' +
  'It does not constitute legal advice, make a judicial fair use determination, or guarantee Content ID outcomes on third-party platforms.';

export class RightsManagementService {
  /**
   * Generates initial rights metadata for ingested source footage or replacement visuals.
   */
  public createInitialRightsMetadata(
    filename: string,
    category: VisualAssetCategory = 'movie_source',
    overrides?: Partial<AssetRightsMetadata>
  ): AssetRightsMetadata {
    const isCommercialMedia = category === 'movie_source';
    const isStock = category === 'licensed_stock';
    const isGraphic = category === 'original_graphic' || category === 'user_created';
    const isPublicDomain = category === 'public_domain';
    const isCreativeCommons = category === 'creative_commons';

    let defaultStatus: AssetRightsStatus = 'unverified';
    let defaultSourceRef = filename;
    let defaultRestrictions = '';
    let defaultAttribution = '';

    if (isCommercialMedia) {
      // Check for known commercial studio or broadcast patterns
      const fnLower = filename.toLowerCase();
      if (/warner|wbtv|disney|marvel|paramount|universal|sony|netflix|hbo|cbs|nbc|fox/i.test(fnLower)) {
        defaultStatus = 'restricted';
        defaultRestrictions = 'Third-party commercial studio footage. Subject to copyright restrictions.';
      } else {
        defaultStatus = 'unverified';
        defaultRestrictions = 'Commercial broadcast / episode footage. Rights unverified.';
      }
      defaultSourceRef = `Source Media: ${filename}`;
    } else if (isPublicDomain) {
      defaultStatus = 'public_domain';
      defaultSourceRef = `Public Domain / CC0 Media: ${filename}`;
      defaultRestrictions = 'Public domain / CC0 media. Free of copyright restrictions.';
    } else if (isCreativeCommons) {
      defaultStatus = 'licensed';
      defaultSourceRef = `Creative Commons: ${filename}`;
      defaultRestrictions = 'Creative Commons licensed media. Attribution required upon broadcast/publication.';
      defaultAttribution = overrides?.attributionRequirements || `Footage courtesy of ${filename}`;
    } else if (isStock) {
      defaultStatus = 'licensed';
      defaultSourceRef = 'Stock Footage Library';
      defaultRestrictions = 'Standard commercial / editorial stock license';
    } else if (isGraphic) {
      defaultStatus = 'owned';
      defaultSourceRef = 'Original User Creation / Diagram';
      defaultRestrictions = 'Fully owned by creator';
    }

    return {
      rightsStatus: overrides?.rightsStatus || defaultStatus,
      sourceFilename: filename,
      sourceReference: overrides?.sourceReference || defaultSourceRef,
      sourceUrl: overrides?.sourceUrl,
      creatorOrRightsHolder: overrides?.creatorOrRightsHolder,
      licenseDetails: overrides?.licenseDetails,
      evidenceReference: overrides?.evidenceReference,
      evidenceDocumentPath: overrides?.evidenceDocumentPath,
      usageRestrictions: overrides?.usageRestrictions || defaultRestrictions,
      attributionRequirements: overrides?.attributionRequirements || defaultAttribution,
      commercialUsePermitted: overrides?.commercialUsePermitted,
      notes: overrides?.notes,
      verifiedBy: overrides?.verifiedBy,
      lastReviewedAt: overrides?.lastReviewedAt,
      updatedAt: new Date().toISOString(),
    };
  }

  /**
   * Conducts a pre-export rights audit across all timeline shots.
   * Flags unverified and restricted assets without making false legal claims.
   */
  public auditTimelineRights(
    shots: MovieTimelineShot[],
    scenes?: EpisodeScene[]
  ): PreExportRightsReview {
    let ownedCount = 0;
    let licensedCount = 0;
    let permissionGrantedCount = 0;
    let publicDomainCount = 0;
    let unverifiedCount = 0;
    let restrictedCount = 0;

    const flaggedShotIds: string[] = [];
    const flaggedSections: FlaggedTimelineSection[] = [];
    const attributionsSet = new Set<string>();
    const restrictionsSet = new Set<string>();

    for (const shot of shots) {
      // Look for rights metadata on shot, or fallback to matching scene
      const matchingScene = scenes?.find((s) => s.sceneId === shot.sceneId);
      const rights = shot.rightsMetadata || matchingScene?.rightsMetadata;
      const status: AssetRightsStatus = shot.rightsStatus || rights?.rightsStatus || 'unverified';
      const category: VisualAssetCategory = shot.assetCategory || matchingScene?.assetCategory || 'movie_source';
      const filename = path.basename(shot.sourceFile || rights?.sourceFilename || 'unnamed_clip');

      switch (status) {
        case 'owned':
          ownedCount++;
          break;
        case 'licensed':
          licensedCount++;
          break;
        case 'permission_granted':
          permissionGrantedCount++;
          break;
        case 'public_domain':
        case 'public_domain_verified':
          publicDomainCount++;
          break;
        case 'restricted':
          restrictedCount++;
          flaggedShotIds.push(shot.shotId);
          flaggedSections.push({
            shotId: shot.shotId,
            segmentId: shot.segmentId,
            timelineStart: shot.timelineStart,
            timelineEnd: shot.timelineEnd,
            duration: shot.duration,
            sourceFilename: filename,
            rightsStatus: status,
            category,
            reason: rights?.usageRestrictions || 'Major commercial studio footage subject to strict copyright claims.',
            suggestedAction: 'replace_with_graphic',
          });
          break;
        case 'uncertain':
        case 'unreviewed':
        case 'unverified':
        default:
          unverifiedCount++;
          flaggedShotIds.push(shot.shotId);
          flaggedSections.push({
            shotId: shot.shotId,
            segmentId: shot.segmentId,
            timelineStart: shot.timelineStart,
            timelineEnd: shot.timelineEnd,
            duration: shot.duration,
            sourceFilename: filename,
            rightsStatus: status,
            category,
            reason: rights?.usageRestrictions || 'Asset permissions and rights have not yet been documented or verified.',
            suggestedAction: 'review_rights',
          });
          break;
      }

      if (rights?.attributionRequirements?.trim()) {
        attributionsSet.add(rights.attributionRequirements.trim());
      }
      if (rights?.usageRestrictions?.trim()) {
        restrictionsSet.add(rights.usageRestrictions.trim());
      }
    }

    const flaggedShotsCount = unverifiedCount + restrictedCount;
    const totalShots = shots.length;

    return {
      totalShots,
      ownedShotsCount: ownedCount,
      licensedShotsCount: licensedCount,
      permissionGrantedCount,
      publicDomainCount,
      unverifiedShotsCount: unverifiedCount,
      restrictedShotsCount: restrictedCount,
      flaggedShotsCount,
      attributions: Array.from(attributionsSet),
      usageRestrictions: Array.from(restrictionsSet),
      disclaimer: RIGHTS_LEGAL_DISCLAIMER,
      flaggedShotIds,
      flaggedSections,
    };
  }

  /**
   * Computes an alignment-preserving replacement for a timeline shot.
   * Guarantees that timelineStart, timelineEnd, and narration sync are NEVER disturbed.
   */
  public prepareShotReplacement(
    targetShot: MovieTimelineShot,
    replacementAsset: {
      assetId: string;
      filePath: string;
      filename: string;
      duration: number;
      width: number;
      height: number;
      rightsMetadata?: AssetRightsMetadata;
      assetCategory?: VisualAssetCategory;
    },
    requestedAlignmentMode: ShotAlignmentMode = 'fit_narration',
    startOffset: number = 0
  ): {
    updatedShot: MovieTimelineShot;
    alignmentNotice: string;
  } {
    const narrationDuration = targetShot.duration;
    const actualDuration = replacementAsset.duration || narrationDuration;
    const isImage = /\.(jpg|jpeg|png|webp|svg)$/i.test(replacementAsset.filePath);

    let effectiveAlignmentMode: ShotAlignmentMode = requestedAlignmentMode;
    let alignmentNotice = '';
    let sourceStart = Math.max(0, startOffset);
    let sourceEnd = sourceStart + narrationDuration;

    if (isImage) {
      effectiveAlignmentMode = 'hold';
      sourceStart = 0;
      sourceEnd = narrationDuration;
      alignmentNotice = `Still graphic / diagram held for narration duration (${narrationDuration.toFixed(2)}s). Master narration timing preserved.`;
    } else if (actualDuration >= narrationDuration) {
      effectiveAlignmentMode = 'fit_narration';
      if (sourceStart + narrationDuration > actualDuration) {
        sourceStart = Math.max(0, actualDuration - narrationDuration);
      }
      sourceEnd = Number((sourceStart + narrationDuration).toFixed(3));
      alignmentNotice = `Visual fitted to narration segment (${narrationDuration.toFixed(2)}s from ${sourceStart.toFixed(1)}s to ${sourceEnd.toFixed(1)}s of source). Neighboring entries undisturbed.`;
    } else {
      // Replacement footage is shorter than narration
      if (requestedAlignmentMode === 'loop') {
        effectiveAlignmentMode = 'loop';
        sourceStart = 0;
        sourceEnd = narrationDuration;
        alignmentNotice = `Replacement footage (${actualDuration.toFixed(1)}s) looped to cover narration (${narrationDuration.toFixed(2)}s).`;
      } else {
        effectiveAlignmentMode = 'hold';
        sourceStart = 0;
        sourceEnd = actualDuration;
        alignmentNotice = `Replacement footage is ${actualDuration.toFixed(1)}s. Final frame held to sustain narration (${narrationDuration.toFixed(2)}s).`;
      }
    }

    const replacementSource: ShotReplacementSource = {
      isReplacement: true,
      originalSceneId: targetShot.sceneId,
      replacementAssetId: replacementAsset.assetId,
      sourceFilePath: replacementAsset.filePath,
      alignmentMode: effectiveAlignmentMode,
      originalNarrationDuration: narrationDuration,
      actualFootageDuration: actualDuration,
      startOffset: sourceStart,
      mediaType: isImage ? 'image' : 'video',
    };

    const rightsMetadata: AssetRightsMetadata = replacementAsset.rightsMetadata || {
      rightsStatus: replacementAsset.assetCategory === 'original_graphic' ? 'owned' : 'licensed',
      sourceFilename: replacementAsset.filename,
      sourceReference: `Replacement Asset: ${replacementAsset.filename}`,
      updatedAt: new Date().toISOString(),
    };

    const updatedShot: MovieTimelineShot = {
      ...targetShot,
      // Maintain exact timeline start and end
      timelineStart: targetShot.timelineStart,
      timelineEnd: targetShot.timelineEnd,
      duration: targetShot.duration,
      // Update source pointers to replacement
      sourceFile: replacementAsset.filePath,
      sourceStart: Number(sourceStart.toFixed(3)),
      sourceEnd: Number(sourceEnd.toFixed(3)),
      sceneId: `repl_${replacementAsset.assetId.slice(0, 8)}`,
      sceneDescription: `Replacement visual: ${replacementAsset.filename} (${rightsMetadata.rightsStatus.toUpperCase()})`,
      rightsStatus: rightsMetadata.rightsStatus,
      rightsMetadata,
      assetCategory: replacementAsset.assetCategory || 'custom_visual',
      replacementSource,
      isManualOverride: true,
      isLocked: true,
      isStillHold: isImage,
      stillHoldDuration: isImage ? narrationDuration : undefined,
      matchScore: 95,
      confidence: 0.95,
      isLowConfidence: false,
      whyThisScene: {
        characterMatch: `Rights-cleared replacement: ${rightsMetadata.rightsStatus}`,
        actionMatch: `Replaced unlicensed scene with ${replacementAsset.filename}`,
        storyContextReason: alignmentNotice,
        chronologyCheck: 'Narration synchronization preserved',
        emotionalFit: 'Rights-aware production asset',
        fullSummary: `Replaced with ${replacementAsset.filename} [Rights: ${rightsMetadata.rightsStatus}]. ${alignmentNotice}`,
      },
    };

    return { updatedShot, alignmentNotice };
  }

  /**
   * Scans a local filesystem folder (e.g. public_domain, creative_commons, stock)
   * and registers all discovered media assets with rights metadata.
   */
  public async scanAndIngestAssetFolder(
    dirPath: string,
    category: VisualAssetCategory = 'public_domain',
    overrides?: Partial<AssetRightsMetadata>
  ): Promise<MovieExplanationClipAsset[]> {
    if (!fs.existsSync(dirPath)) {
      throw new Error(`Asset directory does not exist: ${dirPath}`);
    }
    const dirents = await fs.promises.readdir(dirPath, { withFileTypes: true });
    const assets: MovieExplanationClipAsset[] = [];
    const MEDIA_EXTS = /\.(mp4|mov|mkv|webm|avi|jpg|jpeg|png|webp)$/i;

    for (const ent of dirents) {
      if (!ent.isFile()) continue;
      if (!MEDIA_EXTS.test(ent.name)) continue;

      const filePath = path.join(dirPath, ent.name);
      const isImage = /\.(jpg|jpeg|png|webp)$/i.test(ent.name);
      let duration = 0;
      let width = 1920;
      let height = 1080;
      let fps = 30;

      if (!isImage) {
        try {
          const meta = await extractMetadata(filePath);
          duration = meta.duration;
          width = meta.width;
          height = meta.height;
          fps = meta.fps;
        } catch {
          // Defaults if probe fails
        }
      }

      const stat = await fs.promises.stat(filePath);
      const rightsMetadata = this.createInitialRightsMetadata(ent.name, category, overrides);

      assets.push({
        clipId: `asset_${uuid().slice(0, 8)}`,
        filename: ent.name,
        originalFilename: ent.name,
        filePath,
        duration,
        width,
        height,
        fps,
        fileSize: stat.size,
        isAnalyzed: true,
        rightsMetadata,
        assetCategory: category,
      });
    }

    return assets;
  }
}

export const rightsManagementService = new RightsManagementService();
