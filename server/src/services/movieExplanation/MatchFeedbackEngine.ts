// ============================================================
// MatchFeedbackEngine
// Records creator feedback, scene overrides, locks, and manual approvals.
// Preserves creator decisions across AI re-matches and timeline updates.
// ============================================================

import { getDb } from '../database.js';
import type { MovieTimelineShot } from '../../../../shared/types.js';

export interface UserFeedbackRecord {
  id: string;
  projectId: string;
  segmentId: string;
  shotId: string;
  originalSceneId: string;
  selectedSceneId: string;
  actionType: 'replace' | 'lock' | 'unlock' | 'approve' | 'flag_incorrect' | 'alternative_pick';
  userNotes?: string;
  createdAt: string;
}

export class MatchFeedbackEngine {
  private feedbackStore: Map<string, UserFeedbackRecord> = new Map();

  /**
   * Records a user override or decision for a timeline shot
   */
  public recordFeedback(
    projectId: string,
    segmentId: string,
    shot: MovieTimelineShot,
    actionType: UserFeedbackRecord['actionType'],
    userNotes?: string
  ): UserFeedbackRecord {
    const key = `${projectId}_${segmentId}`;
    const record: UserFeedbackRecord = {
      id: `fb_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      projectId,
      segmentId,
      shotId: shot.shotId,
      originalSceneId: shot.sceneId,
      selectedSceneId: shot.sceneId,
      actionType,
      userNotes,
      createdAt: new Date().toISOString(),
    };

    this.feedbackStore.set(key, record);

    // Save to DB
    try {
      const db = getDb();
      db.prepare(`
        INSERT INTO user_match_feedback (id, project_id, segment_id, shot_id, original_scene_id, selected_scene_id, action_type, user_notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        record.id,
        record.projectId,
        record.segmentId,
        record.shotId,
        record.originalSceneId,
        record.selectedSceneId,
        record.actionType,
        record.userNotes || ''
      );
    } catch {
      // Non-blocking fallback
    }

    return record;
  }

  /**
   * Retrieves active user feedback for a segment if present
   */
  public getFeedbackForSegment(projectId: string, segmentId: string): UserFeedbackRecord | undefined {
    const key = `${projectId}_${segmentId}`;
    return this.feedbackStore.get(key);
  }

  /**
   * Applies stored user feedback to protect locked or approved shots during regeneration
   */
  public applyFeedbackToShot(shot: MovieTimelineShot, projectId: string): MovieTimelineShot {
    const feedback = this.getFeedbackForSegment(projectId, shot.segmentId);
    if (!feedback) return shot;

    if (feedback.actionType === 'lock') {
      return {
        ...shot,
        isLocked: true,
        sceneId: feedback.selectedSceneId,
      };
    }

    if (feedback.actionType === 'approve') {
      return {
        ...shot,
        matchStatus: 'manually_approved',
        confidence: 0.95,
      };
    }

    if (feedback.actionType === 'replace') {
      return {
        ...shot,
        sceneId: feedback.selectedSceneId,
        isManualOverride: true,
      };
    }

    return shot;
  }
}

export const matchFeedbackEngine = new MatchFeedbackEngine();

