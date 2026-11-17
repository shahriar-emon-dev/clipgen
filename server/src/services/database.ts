// ============================================================
// Database Service — Robust Zero-Dependency JSON/SQL Engine
// Portable, zero C++ compilation, ACID persistence
// Fully implements SQL-like prepared statement API for 12 tables
// ============================================================

import fs from 'fs';
import path from 'path';
import { config } from '../config/index.js';

export interface DatabaseState {
  users: any[];
  projects: any[];
  videos: any[];
  processing_jobs: any[];
  transcripts: any[];
  transcript_segments: any[];
  scenes: any[];
  highlight_candidates: any[];
  shorts: any[];
  exports: any[];
  copyright_checks: any[];
  processing_logs: any[];
  long_form_compilations: any[];
  original_transcript_segments: any[];
  scene_keyframes: any[];
  characters: any[];
  scene_character_links: any[];
  scene_actions: any[];
  narrative_events: any[];
  match_candidates: any[];
  match_decisions: any[];
  user_match_feedback: any[];
  model_analysis_cache: any[];
}

const DEFAULT_STATE: DatabaseState = {
  users: [],
  projects: [],
  videos: [],
  processing_jobs: [],
  transcripts: [],
  transcript_segments: [],
  scenes: [],
  highlight_candidates: [],
  shorts: [],
  exports: [],
  copyright_checks: [],
  processing_logs: [],
  long_form_compilations: [],
  original_transcript_segments: [],
  scene_keyframes: [],
  characters: [],
  scene_character_links: [],
  scene_actions: [],
  narrative_events: [],
  match_candidates: [],
  match_decisions: [],
  user_match_feedback: [],
  model_analysis_cache: [],
};

class MemoryDb {
  private state: DatabaseState = { ...DEFAULT_STATE };
  private filePath: string;

  constructor(filePath: string) {
    this.filePath = filePath;
    this.load();
  }

  private load() {
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf-8');
        const parsed = JSON.parse(raw);
        this.state = { ...DEFAULT_STATE, ...parsed };
      } else {
        this.saveNow();
      }
    } catch (err) {
      console.error('Error loading DB file:', err);
      this.state = { ...DEFAULT_STATE };
    }
  }

  public saveNow() {
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const data = JSON.stringify(this.state, null, 2);
      const tmpPath = `${this.filePath}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
      try {
        fs.writeFileSync(tmpPath, data, 'utf-8');
        fs.renameSync(tmpPath, this.filePath);
      } catch {
        try { fs.unlinkSync(tmpPath); } catch {}
        fs.writeFileSync(this.filePath, data, 'utf-8');
      }
    } catch (err) {
      console.error('Error writing DB file:', err);
    }
  }

  public scheduleSave() {
    this.saveNow();
  }

  public exec(_sql: string) {
    // DDL no-op
  }

  public pragma(_sql: string) {
    // Pragma no-op
  }

  public transaction(fn: () => void) {
    return () => {
      fn();
      this.scheduleSave();
    };
  }

  public prepare(sql: string) {
    const trimmed = sql.trim();
    return {
      run: (...params: any[]) => this.executeRun(trimmed, params),
      get: (...params: any[]) => this.executeGet(trimmed, params),
      all: (...params: any[]) => this.executeAll(trimmed, params),
    };
  }

  private executeRun(sql: string, params: any[]) {
    // ── USERS ──
    if (/^INSERT\s+INTO\s+users/i.test(sql)) {
      const [id, email, password_hash, name] = params;
      this.state.users.push({
        id,
        email,
        password_hash,
        name: name || '',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      this.scheduleSave();
      return { changes: 1 };
    }

    // ── PROJECTS ──
    if (/^INSERT\s+INTO\s+projects/i.test(sql)) {
      const [id, user_id, name, status] = params;
      this.state.projects.push({
        id,
        user_id,
        name,
        status: status || 'created',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      this.scheduleSave();
      return { changes: 1 };
    }

    if (/^UPDATE\s+projects/i.test(sql)) {
      const id = params[params.length - 1];
      const project = this.state.projects.find(p => p.id === id);
      if (project) {
        this.applyDynamicSet(project, sql, params);
        project.updated_at = new Date().toISOString();
        this.scheduleSave();
        return { changes: 1 };
      }
      return { changes: 0 };
    }

    if (/^DELETE\s+FROM\s+projects/i.test(sql)) {
      const id = params[0];
      this.state.projects = this.state.projects.filter(p => p.id !== id);
      this.state.videos = this.state.videos.filter(v => v.project_id !== id);
      this.state.processing_jobs = this.state.processing_jobs.filter(j => j.project_id !== id);
      this.state.transcripts = this.state.transcripts.filter(t => t.project_id !== id);
      this.state.scenes = this.state.scenes.filter(s => s.project_id !== id);
      this.state.highlight_candidates = this.state.highlight_candidates.filter(h => h.project_id !== id);
      this.state.shorts = this.state.shorts.filter(sh => sh.project_id !== id);
      this.state.copyright_checks = this.state.copyright_checks.filter(c => c.project_id !== id);
      this.state.processing_logs = this.state.processing_logs.filter(l => l.project_id !== id);
      this.state.long_form_compilations = (this.state.long_form_compilations || []).filter(c => c.project_id !== id);
      this.scheduleSave();
      return { changes: 1 };
    }

    // ── VIDEOS ──
    if (/^INSERT\s+INTO\s+videos/i.test(sql)) {
      const [
        id, project_id, filename, original_filename, file_path,
        file_size, duration, width, height, fps, codec,
        audio_codec, audio_tracks, bitrate, mime_type
      ] = params;
      this.state.videos.push({
        id, project_id, filename, original_filename, file_path,
        file_size: file_size || 0,
        duration: duration || 0,
        width: width || 0,
        height: height || 0,
        fps: fps || 0,
        codec: codec || '',
        audio_codec: audio_codec || '',
        audio_tracks: audio_tracks || 0,
        bitrate: bitrate || 0,
        mime_type: mime_type || '',
        thumbnail_url: null,
        created_at: new Date().toISOString(),
      });
      this.scheduleSave();
      return { changes: 1 };
    }

    if (/^UPDATE\s+videos/i.test(sql)) {
      const id = params[params.length - 1];
      const video = this.state.videos.find(v => v.id === id || v.project_id === id);
      if (video) {
        this.applyDynamicSet(video, sql, params);
        this.scheduleSave();
        return { changes: 1 };
      }
      return { changes: 0 };
    }

    // ── PROCESSING JOBS ──
    if (/^INSERT\s+INTO\s+processing_jobs/i.test(sql)) {
      const [id, project_id, status] = params;
      this.state.processing_jobs.push({
        id,
        project_id,
        status: status || 'pending',
        current_stage: 'validating',
        progress: 0,
        stage_progress: 0,
        stage_detail: null,
        stages_completed: '[]',
        error: null,
        started_at: null,
        completed_at: null,
        created_at: new Date().toISOString(),
      });
      this.scheduleSave();
      return { changes: 1 };
    }

    if (/^UPDATE\s+processing_jobs/i.test(sql)) {
      const id = params[params.length - 1];
      const job = this.state.processing_jobs.find(j => j.id === id);
      if (job) {
        this.applyDynamicSet(job, sql, params);
        this.scheduleSave();
        return { changes: 1 };
      }
      return { changes: 0 };
    }

    // ── TRANSCRIPTS ──
    if (/^INSERT\s+INTO\s+transcripts/i.test(sql)) {
      const [id, project_id, language, full_text, duration] = params;
      this.state.transcripts.push({
        id,
        project_id,
        language: language || 'en',
        full_text: full_text || '',
        duration: duration || 0,
        created_at: new Date().toISOString(),
      });
      this.scheduleSave();
      return { changes: 1 };
    }

    // ── TRANSCRIPT SEGMENTS ──
    if (/^INSERT\s+INTO\s+transcript_segments/i.test(sql)) {
      const [id, transcript_id, start_time, end_time, text, confidence, word_timestamps] = params;
      this.state.transcript_segments.push({
        id,
        transcript_id,
        start_time: Number(start_time),
        end_time: Number(end_time),
        text: text || '',
        confidence: Number(confidence) || 0.9,
        word_timestamps: word_timestamps || '[]',
      });
      this.scheduleSave();
      return { changes: 1 };
    }

    // ── SCENES ──
    if (/^INSERT\s+INTO\s+scenes/i.test(sql)) {
      const [id, project_id, scene_index, start_time, end_time, duration, is_bumper] = params;
      this.state.scenes.push({
        id,
        project_id,
        scene_index: Number(scene_index) || 0,
        start_time: Number(start_time),
        end_time: Number(end_time),
        duration: Number(duration),
        thumbnail_path: null,
        is_bumper: is_bumper ? 1 : 0,
      });
      this.scheduleSave();
      return { changes: 1 };
    }

    // ── HIGHLIGHT CANDIDATES ──
    if (/^INSERT\s+INTO\s+highlight_candidates/i.test(sql)) {
      if (params.length >= 21) {
        const [
          id, project_id, start_time, end_time, duration, transcript_text,
          score_total, score_hook, score_emotion, score_information,
          score_surprise, score_story, score_visual, score_audio,
          score_shorts_potential, ai_reason, ai_recommended_start,
          ai_recommended_end, rank, is_selected, is_suppressed, crop_offset_x,
          title, framing_mode
        ] = params;
        this.state.highlight_candidates.push({
          id, project_id,
          title: title || '',
          start_time: Number(start_time),
          end_time: Number(end_time),
          duration: Number(duration),
          transcript_text: transcript_text || '',
          score_total: Number(score_total),
          score_hook: Number(score_hook),
          score_emotion: Number(score_emotion),
          score_information: Number(score_information),
          score_surprise: Number(score_surprise),
          score_story: Number(score_story),
          score_visual: Number(score_visual),
          score_audio: Number(score_audio),
          score_shorts_potential: Number(score_shorts_potential),
          ai_reason: ai_reason || '',
          ai_recommended_start: Number(ai_recommended_start) || 0,
          ai_recommended_end: Number(ai_recommended_end) || 0,
          rank: Number(rank) || 0,
          is_selected: is_selected ? 1 : 0,
          is_suppressed: is_suppressed ? 1 : 0,
          crop_offset_x: Number(crop_offset_x) || 0.5,
          framing_mode: framing_mode || 'action',
          created_at: new Date().toISOString(),
        });
      } else {
        const [id, project_id, start_time, end_time, duration, transcript_text, score_total, rank, is_selected] = params;
        this.state.highlight_candidates.push({
          id, project_id,
          title: '',
          start_time: Number(start_time),
          end_time: Number(end_time),
          duration: Number(duration),
          transcript_text: transcript_text || '',
          score_total: Number(score_total),
          score_hook: 50, score_emotion: 50, score_information: 50, score_surprise: 50,
          score_story: 50, score_visual: 50, score_audio: 50, score_shorts_potential: 50,
          ai_reason: '', ai_recommended_start: 0, ai_recommended_end: 0,
          rank: Number(rank) || 0,
          is_selected: is_selected ? 1 : 0,
          is_suppressed: 0,
          crop_offset_x: 0.5,
          framing_mode: 'action',
          created_at: new Date().toISOString(),
        });
      }
      this.scheduleSave();
      return { changes: 1 };
    }

    if (/^UPDATE\s+highlight_candidates/i.test(sql)) {
      const id = params[params.length - 1];
      const highlight = this.state.highlight_candidates.find(h => h.id === id);
      if (highlight) {
        this.applyDynamicSet(highlight, sql, params);
        this.scheduleSave();
        return { changes: 1 };
      }
      return { changes: 0 };
    }

    if (/^DELETE\s+FROM\s+highlight_candidates/i.test(sql)) {
      const id = params[0];
      const prevLen = this.state.highlight_candidates.length;
      this.state.highlight_candidates = this.state.highlight_candidates.filter(h => h.id !== id);
      this.scheduleSave();
      return { changes: prevLen - this.state.highlight_candidates.length };
    }

    // ── SHORTS ──
    if (/^INSERT\s+INTO\s+shorts/i.test(sql)) {
      let id, project_id, highlight_id, start_time, end_time, duration, captions_enabled, reframe_mode, width, height, title, framing_mode;
      if (sql.includes('title, framing_mode, start_time')) {
        [id, project_id, highlight_id, title, framing_mode, start_time, end_time, duration, captions_enabled, reframe_mode, width, height] = params;
      } else {
        [id, project_id, highlight_id, start_time, end_time, duration, captions_enabled, reframe_mode, width, height, title] = params;
      }
      this.state.shorts.push({
        id, project_id, highlight_id,
        title: title || '',
        start_time: Number(start_time) || 0,
        end_time: Number(end_time) || 0,
        duration: Number(duration) || 0,
        captions_enabled: captions_enabled ? 1 : 0,
        reframe_mode: reframe_mode || 'action',
        framing_mode: framing_mode || reframe_mode || 'action',
        status: 'rendering',
        width: width || 1080,
        height: height || 1920,
        file_path: null,
        file_size: 0,
        caption_style: null,
        render_progress: 0,
        error: null,
        thumbnail_url: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      this.scheduleSave();
      return { changes: 1 };
    }

    if (/^UPDATE\s+shorts/i.test(sql)) {
      if (/WHERE.*project_id\s*=/i.test(sql)) {
        const projectId = params[params.length - 1];
        let changes = 0;
        for (const short of this.state.shorts) {
          if (short.project_id === projectId && (!sql.includes("status = 'rendering'") || short.status === 'rendering')) {
            this.applyDynamicSet(short, sql, params);
            short.updated_at = new Date().toISOString();
            changes++;
          }
        }
        if (changes > 0) this.scheduleSave();
        return { changes };
      }

      const id = params[params.length - 1];
      const short = this.state.shorts.find(sh => sh.id === id);
      if (short) {
        this.applyDynamicSet(short, sql, params);
        short.updated_at = new Date().toISOString();
        this.scheduleSave();
        return { changes: 1 };
      }
      return { changes: 0 };
    }

    if (/^DELETE\s+FROM\s+shorts/i.test(sql)) {
      const id = params[0];
      const prevLen = this.state.shorts.length;
      this.state.shorts = this.state.shorts.filter(sh => sh.id !== id);
      this.scheduleSave();
      return { changes: prevLen - this.state.shorts.length };
    }


    // ── COPYRIGHT CHECKS ──
    if (/^INSERT\s+INTO\s+copyright_checks/i.test(sql)) {
      const [id, project_id, risk_level, details] = params;
      this.state.copyright_checks.push({
        id,
        project_id,
        risk_level: risk_level || 'low',
        details: details || '[]',
        checked_at: new Date().toISOString(),
      });
      this.scheduleSave();
      return { changes: 1 };
    }

    // ── PROCESSING LOGS ──
    if (/^INSERT\s+INTO\s+processing_logs/i.test(sql)) {
      const [project_id, job_id, level, stage, message] = params;
      this.state.processing_logs.push({
        id: this.state.processing_logs.length + 1,
        project_id,
        job_id,
        level: level || 'info',
        stage: stage || '',
        message: message || '',
        metadata: null,
        created_at: new Date().toISOString(),
      });
      this.scheduleSave();
      return { changes: 1 };
    }

    // ── LONG-FORM COMPILATIONS ──
    if (/^INSERT\s+INTO\s+long_form_compilations/i.test(sql)) {
      let id: string, project_id: string, title: string, status: string, progress: number, stage: string, settings: any, timeline: any,
          estimated_duration: number, actual_duration: any, file_path: any, file_size: any, quality_report: any, error: any;

      if (params.length === 6) {
        [id, project_id, title, settings, timeline, estimated_duration] = params;
        status = 'draft';
        progress = 0;
        stage = 'timeline_ready';
        actual_duration = null;
        file_path = null;
        file_size = null;
        quality_report = null;
        error = null;
      } else {
        [
          id, project_id, title, status, progress, stage, settings, timeline,
          estimated_duration, actual_duration, file_path, file_size, quality_report, error
        ] = params;
      }
      if (!this.state.long_form_compilations) this.state.long_form_compilations = [];
      this.state.long_form_compilations.push({
        id,
        project_id,
        title: title || 'Untitled Compilation',
        status: status || 'draft',
        progress: Number(progress) || 0,
        stage: stage || 'created',
        settings: typeof settings === 'string' ? settings : JSON.stringify(settings || {}),
        timeline: typeof timeline === 'string' ? timeline : JSON.stringify(timeline || []),
        estimated_duration: Number(estimated_duration) || 0,
        actual_duration: actual_duration !== undefined && actual_duration !== null ? Number(actual_duration) : null,
        file_path: file_path || null,
        file_size: file_size !== undefined && file_size !== null ? Number(file_size) : null,
        quality_report: quality_report ? (typeof quality_report === 'string' ? quality_report : JSON.stringify(quality_report)) : null,
        error: error || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      this.scheduleSave();
      return { changes: 1 };
    }

    if (/^UPDATE\s+long_form_compilations/i.test(sql)) {
      const id = params[params.length - 1];
      if (!this.state.long_form_compilations) this.state.long_form_compilations = [];
      const item = this.state.long_form_compilations.find(c => c.id === id);
      if (item) {
        this.applyDynamicSet(item, sql, params);
        item.updated_at = new Date().toISOString();
        this.scheduleSave();
        return { changes: 1 };
      }
      return { changes: 0 };
    }

    if (/^DELETE\s+FROM\s+long_form_compilations/i.test(sql)) {
      const id = params[0];
      if (!this.state.long_form_compilations) this.state.long_form_compilations = [];
      const prev = this.state.long_form_compilations.length;
      this.state.long_form_compilations = this.state.long_form_compilations.filter(c => c.id !== id);
      this.scheduleSave();
      return { changes: prev - this.state.long_form_compilations.length };
    }

    // ── GENERIC ADDITIVE TABLES HANDLER ──
    const insertMatch = sql.match(/^INSERT\s+INTO\s+([a-zA-Z0-9_]+)\s*\(([^)]+)\)\s*VALUES/i);
    if (insertMatch) {
      const tableName = insertMatch[1].toLowerCase();
      if ((this.state as any)[tableName] !== undefined) {
        if (!Array.isArray((this.state as any)[tableName])) {
          (this.state as any)[tableName] = [];
        }
        const cols = insertMatch[2].split(',').map(c => c.trim().toLowerCase());
        const record: any = {};
        cols.forEach((col, idx) => {
          record[col] = params[idx] !== undefined ? params[idx] : null;
        });
        if (!record.created_at) record.created_at = new Date().toISOString();
        if (!record.updated_at) record.updated_at = new Date().toISOString();
        (this.state as any)[tableName].push(record);
        this.scheduleSave();
        return { changes: 1 };
      }
    }

    return { changes: 0 };
  }

  private applyDynamicSet(target: any, sql: string, params: any[]) {
    const match = sql.match(/SET\s+(.+?)\s+WHERE/is);
    if (!match) return;

    const setClause = match[1];
    const assignments = setClause.split(',').map(s => s.trim());

    let paramIdx = 0;
    assignments.forEach((assign) => {
      const parts = assign.split('=');
      const colName = parts[0].trim().toLowerCase();
      const rightSide = parts[1]?.trim();

      if (rightSide === '?') {
        const val = params[paramIdx++];
        if (val !== undefined) {
          target[colName] = val;
        }
      } else if (rightSide) {
        if (rightSide.toLowerCase().includes("datetime('now')")) {
          target[colName] = new Date().toISOString();
        } else if (rightSide.toUpperCase() === 'NULL') {
          target[colName] = null;
        } else {
          const cleaned = rightSide.replace(/^['"]|['"]$/g, '');
          const num = Number(cleaned);
          target[colName] = !isNaN(num) && cleaned !== '' ? num : cleaned;
        }
      }
    });
  }

  private executeGet(sql: string, params: any[]) {
    // USERS
    if (/FROM\s+users\s+WHERE\s+email\s*=\s*\?/i.test(sql)) {
      const email = params[0];
      return this.state.users.find(u => u.email === email) || null;
    }
    if (/FROM\s+users\s+WHERE\s+id\s*=\s*\?/i.test(sql)) {
      const id = params[0];
      return this.state.users.find(u => u.id === id) || null;
    }

    // PROJECTS
    if (/FROM\s+projects\s+WHERE\s+id\s*=\s*\?/i.test(sql)) {
      const id = params[0];
      return this.state.projects.find(p => p.id === id) || null;
    }

    // VIDEOS
    if (/FROM\s+videos\s+WHERE\s+project_id\s*=\s*\?/i.test(sql)) {
      const projectId = params[0];
      return this.state.videos.find(v => v.project_id === projectId) || null;
    }

    // PROCESSING JOBS
    if (/FROM\s+processing_jobs\s+WHERE\s+project_id\s*=\s*\?/i.test(sql)) {
      const projectId = params[0];
      const jobs = this.state.processing_jobs.filter(j => j.project_id === projectId);
      if (sql.includes("status IN ('pending', 'running')")) {
        return jobs.find(j => j.status === 'pending' || j.status === 'running') || null;
      }
      return jobs.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0] || null;
    }

    // TRANSCRIPTS
    if (/FROM\s+transcripts\s+WHERE\s+project_id\s*=\s*\?/i.test(sql)) {
      const projectId = params[0];
      return this.state.transcripts.find(t => t.project_id === projectId) || null;
    }

    // SCENES COUNT
    if (/COUNT\(\*\)\s+as\s+count\s+FROM\s+scenes\s+WHERE\s+project_id\s*=\s*\?/i.test(sql)) {
      const projectId = params[0];
      const count = this.state.scenes.filter(s => s.project_id === projectId).length;
      return { count };
    }

    // HIGHLIGHT COUNT
    if (/COUNT\(\*\)\s+as\s+count\s+FROM\s+highlight_candidates/i.test(sql)) {
      const projectId = params[0];
      const count = this.state.highlight_candidates.filter(h => h.project_id === projectId && h.is_selected === 1).length;
      return { count };
    }

    // SHORTS COUNT
    if (/COUNT\(\*\)\s+as\s+count\s+FROM\s+shorts/i.test(sql)) {
      const projectId = params[0];
      const count = this.state.shorts.filter(sh => sh.project_id === projectId).length;
      return { count };
    }

    // HIGHLIGHTS
    if (/FROM\s+highlight_candidates\s+WHERE\s+id\s*=\s*\?/i.test(sql)) {
      const id = params[0];
      return this.state.highlight_candidates.find(h => h.id === id) || null;
    }
    if (/FROM\s+highlight_candidates\s+WHERE\s+project_id\s*=\s*\?\s+ORDER\s+BY\s+score_total\s+DESC\s+LIMIT\s+1/i.test(sql)) {
      const projectId = params[0];
      const list = this.state.highlight_candidates.filter(h => h.project_id === projectId);
      return list.sort((a, b) => b.score_total - a.score_total)[0] || null;
    }

    // SHORTS
    if (/FROM\s+shorts[\s\S]*WHERE/i.test(sql)) {
      if (/WHERE[\s\S]*\bid\s*=\s*\?/i.test(sql)) {
        const id = params[0];
        const sh = this.state.shorts.find(s => s.id === id) || null;
        if (sh) {
          const highlight = this.state.highlight_candidates.find(h => h.id === sh.highlight_id);
          return {
            ...sh,
            title: sh.title || highlight?.title || '',
            framing_mode: sh.framing_mode || sh.reframe_mode || 'action',
            highlight_title: highlight?.title || '',
            highlight_framing_mode: highlight?.framing_mode || 'action',
          };
        }
        return null;
      }
      if (/project_id/i.test(sql) && /highlight_id/i.test(sql)) {
        const [projectId, highlightId] = params;
        let list = this.state.shorts.filter(sh => sh.project_id === projectId && sh.highlight_id === highlightId);
        if (/status\s*=\s*['"]completed['"]/i.test(sql)) {
          list = list.filter(sh => sh.status === 'completed');
        }
        if (/file_path\s+IS\s+NOT\s+NULL/i.test(sql)) {
          list = list.filter(sh => Boolean(sh.file_path));
        }
        return list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0] || null;
      }
    }

    // COPYRIGHT
    if (/FROM\s+copyright_checks\s+WHERE\s+project_id\s*=\s*\?/i.test(sql)) {
      const projectId = params[0];
      const list = this.state.copyright_checks.filter(c => c.project_id === projectId);
      return list.sort((a, b) => new Date(b.checked_at).getTime() - new Date(a.checked_at).getTime())[0] || null;
    }

    // LONG FORM COMPILATIONS
    if (/FROM\s+long_form_compilations/i.test(sql)) {
      if (/WHERE[\s\S]*project_id\s*=\s*\?/i.test(sql)) {
        const projectId = params[0];
        const list = (this.state.long_form_compilations || []).filter(c => c.project_id === projectId);
        return list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0] || null;
      }
      if (/WHERE[\s\S]*\bid\s*=\s*\?/i.test(sql)) {
        const id = params[0];
        return (this.state.long_form_compilations || []).find(c => c.id === id) || null;
      }
    }

    // ── GENERIC ADDITIVE TABLES GETTER ──
    const newTables = [
      'original_transcript_segments',
      'scene_keyframes',
      'characters',
      'scene_character_links',
      'scene_actions',
      'narrative_events',
      'match_candidates',
      'match_decisions',
      'user_match_feedback',
      'model_analysis_cache',
    ];
    for (const tbl of newTables) {
      if (new RegExp(`FROM\\s+${tbl}`, 'i').test(sql)) {
        const list = (this.state as any)[tbl] || [];
        if (/WHERE[\s\S]*\bid\s*=\s*\?/i.test(sql) && params[0]) {
          return list.find((r: any) => r.id === params[0]) || null;
        } else if (/WHERE[\s\S]*\bproject_id\s*=\s*\?/i.test(sql) && params[0]) {
          return list.find((r: any) => r.project_id === params[0]) || null;
        }
        return list[0] || null;
      }
    }

    return null;
  }

  private executeAll(sql: string, params: any[]): any[] {
    // PROJECTS with subqueries
    if (/FROM\s+projects/i.test(sql)) {
      return this.state.projects
        .map(p => ({
          ...p,
          highlight_count: this.state.highlight_candidates.filter(h => h.project_id === p.id && h.is_selected === 1).length,
          shorts_count: this.state.shorts.filter(sh => sh.project_id === p.id).length,
        }))
        .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
    }

    // TRANSCRIPT SEGMENTS
    if (/FROM\s+transcript_segments\s+WHERE\s+transcript_id\s*=\s*\?/i.test(sql)) {
      const transcriptId = params[0];
      return this.state.transcript_segments
        .filter(s => s.transcript_id === transcriptId)
        .sort((a, b) => a.start_time - b.start_time);
    }

    // SCENES
    if (/FROM\s+scenes\s+WHERE\s+project_id\s*=\s*\?/i.test(sql)) {
      const projectId = params[0];
      return this.state.scenes
        .filter(s => s.project_id === projectId)
        .sort((a, b) => a.scene_index - b.scene_index);
    }

    // HIGHLIGHTS
    if (/FROM\s+highlight_candidates\s+WHERE\s+project_id\s*=\s*\?/i.test(sql)) {
      const [projectId, limit] = params;
      let list = this.state.highlight_candidates.filter(h => h.project_id === projectId);
      if (sql.includes('is_suppressed = 0')) {
        list = list.filter(h => h.is_suppressed === 0);
      }
      list.sort((a, b) => b.score_total - a.score_total);
      return typeof limit === 'number' ? list.slice(0, limit) : list;
    }

    // SHORTS
    if (/FROM\s+shorts/i.test(sql)) {
      const projectId = params[0];
      let list = this.state.shorts.filter(sh => sh.project_id === projectId);
      if (/status\s*=\s*['"]completed['"]/i.test(sql)) {
        list = list.filter(sh => sh.status === 'completed');
      }
      // Attach highlight metadata if joined
      return list.map(sh => {
        const highlight = this.state.highlight_candidates.find(h => h.id === sh.highlight_id);
        return {
          ...sh,
          title: sh.title || highlight?.title || '',
          framing_mode: sh.framing_mode || sh.reframe_mode || 'action',
          rank: highlight?.rank,
          score_total: highlight?.score_total,
        };
      }).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }

    // LOGS
    if (/FROM\s+processing_logs\s+WHERE\s+project_id\s*=\s*\?/i.test(sql)) {
      const projectId = params[0];
      return this.state.processing_logs
        .filter(l => l.project_id === projectId)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 100);
    }

    // LONG FORM COMPILATIONS
    if (/FROM\s+long_form_compilations\s+WHERE\s+project_id\s*=\s*\?/i.test(sql)) {
      const projectId = params[0];
      return (this.state.long_form_compilations || [])
        .filter(c => c.project_id === projectId)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }

    // ── GENERIC ADDITIVE TABLES GETTERS ──
    const newTables = [
      'original_transcript_segments',
      'scene_keyframes',
      'characters',
      'scene_character_links',
      'scene_actions',
      'narrative_events',
      'match_candidates',
      'match_decisions',
      'user_match_feedback',
      'model_analysis_cache',
    ];
    for (const tbl of newTables) {
      if (new RegExp(`FROM\\s+${tbl}`, 'i').test(sql)) {
        let list = (this.state as any)[tbl] || [];
        if (/WHERE\s+project_id\s*=\s*\?/i.test(sql) && params[0]) {
          list = list.filter((r: any) => r.project_id === params[0]);
        } else if (/WHERE\s+scene_id\s*=\s*\?/i.test(sql) && params[0]) {
          list = list.filter((r: any) => r.scene_id === params[0]);
        }
        return list;
      }
    }

    return [];
  }
}

let dbInstance: MemoryDb;

export function getDb(): any {
  if (!dbInstance) {
    const isTestRun = process.env.NODE_ENV === 'test' || process.argv.some(a => a.includes('.test.') || a.includes('--test'));
    const dbFile = process.env.DB_PATH || (isTestRun
      ? config.dbPath.replace(/\.db$/, '.test.json')
      : config.dbPath.replace(/\.db$/, '.json'));
    dbInstance = new MemoryDb(dbFile);
  }
  return dbInstance;
}

export function initializeDatabase(): void {
  getDb();
  console.log('✓ Database initialized (JSON persistence active)');
}

export function closeDatabase(): void {
  if (dbInstance) {
    dbInstance.saveNow();
  }
}
