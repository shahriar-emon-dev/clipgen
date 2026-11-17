// ============================================================
// Provenance Manifest Service
// Generates verifiable, exportable asset-level provenance manifests
// in JSON and CSV formats for professional editorial and rights compliance.
// ============================================================

import path from 'path';
import type {
  MovieExplanationProject,
  ProvenanceManifest,
  ProvenanceShotRecord,
  VisualAssetCategory,
  AssetRightsStatus,
} from '../../../../shared/types.js';
import { rightsManagementService, RIGHTS_LEGAL_DISCLAIMER } from './RightsManagementService.js';

export function formatSecondsToTimecode(sec: number): string {
  if (isNaN(sec) || sec < 0) sec = 0;
  const hours = Math.floor(sec / 3600);
  const minutes = Math.floor((sec % 3600) / 60);
  const seconds = Math.floor(sec % 60);
  const milliseconds = Math.floor((sec % 1) * 1000);
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(milliseconds).padStart(3, '0')}`;
}

export function escapeCsvCell(value: any): string {
  if (value === null || value === undefined) return '""';
  const str = String(value).replace(/"/g, '""');
  return `"${str}"`;
}

export class ProvenanceManifestService {
  /**
   * Generates a structured provenance manifest object for a project.
   */
  public generateProvenanceManifest(project: MovieExplanationProject): ProvenanceManifest {
    const timeline = project.timeline;
    const shots = timeline?.shots || [];
    const scenes = project.episodeIndex?.scenes || [];
    const segments = project.script?.segments || [];

    // Map segments by segmentId for narration text lookup
    const segmentMap = new Map<string, string>();
    for (const seg of segments) {
      segmentMap.set(seg.segmentId, seg.text || seg.cleanScript || '');
    }

    const attributionsSet = new Set<string>();
    let ownedCount = 0;
    let licensedCount = 0;
    let permissionGrantedCount = 0;
    let publicDomainCount = 0;
    let unverifiedCount = 0;
    let restrictedCount = 0;

    const shotRecords: ProvenanceShotRecord[] = shots.map((shot, idx) => {
      const matchingScene = scenes.find((s) => s.sceneId === shot.sceneId);
      const rights = shot.rightsMetadata || matchingScene?.rightsMetadata;
      const status: AssetRightsStatus = shot.rightsStatus || rights?.rightsStatus || 'unverified';
      const category: VisualAssetCategory = shot.assetCategory || matchingScene?.assetCategory || 'movie_source';
      const sourceFile = path.basename(shot.sourceFile || rights?.sourceFilename || 'unnamed_clip');
      const attribution = rights?.attributionRequirements?.trim() || '';
      const restrictions = rights?.usageRestrictions?.trim() || '';
      const creator = rights?.creatorOrRightsHolder?.trim() || '';
      const license = rights?.licenseDetails?.trim() || '';
      const sourceRef = rights?.sourceReference?.trim() || sourceFile;

      if (attribution) {
        attributionsSet.add(attribution);
      }

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
          break;
        case 'unverified':
        case 'unreviewed':
        case 'uncertain':
        default:
          unverifiedCount++;
          break;
      }

      const narrationSnippet = shot.segmentId ? (segmentMap.get(shot.segmentId) || '') : '';

      return {
        shotIndex: idx + 1,
        shotId: shot.shotId,
        timelineStart: shot.timelineStart,
        timelineEnd: shot.timelineEnd,
        duration: shot.duration,
        timelineStartFormatted: formatSecondsToTimecode(shot.timelineStart),
        timelineEndFormatted: formatSecondsToTimecode(shot.timelineEnd),
        sourceFile,
        sourceStart: shot.sourceStart,
        sourceEnd: shot.sourceEnd,
        sourceStartFormatted: formatSecondsToTimecode(shot.sourceStart),
        sourceEndFormatted: formatSecondsToTimecode(shot.sourceEnd),
        sceneId: shot.sceneId,
        presentationType: shot.presentationType || (shot.isScreenshot ? 'screenshot' : 'video_clip'),
        assetCategory: category,
        rightsStatus: status,
        sourceReference: sourceRef,
        creatorOrRightsHolder: creator,
        licenseDetails: license,
        attribution,
        usageRestrictions: restrictions,
        narrationSnippet,
        isStillScreenshot: Boolean(shot.isScreenshot),
        matchScore: shot.matchScore,
        confidence: shot.confidence,
      };
    });

    const totalDuration = timeline?.totalDuration || (shots.length > 0 ? shots[shots.length - 1].timelineEnd : 0);

    return {
      manifestVersion: '1.0.0',
      generatedAt: new Date().toISOString(),
      projectId: project.projectId,
      projectName: project.projectName || project.name || 'Movie Explanation Project',
      totalShots: shots.length,
      totalDuration,
      totalDurationFormatted: formatSecondsToTimecode(totalDuration),
      rightsSummary: {
        owned: ownedCount,
        licensed: licensedCount,
        permissionGranted: permissionGrantedCount,
        publicDomain: publicDomainCount,
        unverified: unverifiedCount,
        restricted: restrictedCount,
        flagged: unverifiedCount + restrictedCount,
      },
      attributionsList: Array.from(attributionsSet),
      disclaimer: RIGHTS_LEGAL_DISCLAIMER,
      shots: shotRecords,
    };
  }

  /**
   * Serializes the provenance manifest to pretty JSON.
   */
  public exportManifestAsJson(project: MovieExplanationProject): string {
    const manifest = this.generateProvenanceManifest(project);
    return JSON.stringify(manifest, null, 2);
  }

  /**
   * Serializes the provenance manifest to CSV format for spreadsheets and editorial clearance.
   */
  public exportManifestAsCsv(project: MovieExplanationProject): string {
    const manifest = this.generateProvenanceManifest(project);
    const headers = [
      'Shot #',
      'Timeline Start',
      'Timeline End',
      'Duration (s)',
      'Type',
      'Source Asset',
      'Source In',
      'Source Out',
      'Scene ID',
      'Category',
      'Rights Status',
      'Source Reference',
      'Creator / Rights Holder',
      'License Details',
      'Attribution Requirements',
      'Usage Restrictions',
      'Narration Voiceover Beat',
    ];

    const lines: string[] = [headers.map(escapeCsvCell).join(',')];

    for (const s of manifest.shots) {
      const row = [
        s.shotIndex,
        s.timelineStartFormatted,
        s.timelineEndFormatted,
        s.duration.toFixed(3),
        s.presentationType,
        s.sourceFile,
        s.sourceStartFormatted,
        s.sourceEndFormatted,
        s.sceneId,
        s.assetCategory,
        s.rightsStatus,
        s.sourceReference,
        s.creatorOrRightsHolder,
        s.licenseDetails,
        s.attribution,
        s.usageRestrictions,
        s.narrationSnippet,
      ];
      lines.push(row.map(escapeCsvCell).join(','));
    }

    return lines.join('\r\n');
  }
}

export const provenanceManifestService = new ProvenanceManifestService();

