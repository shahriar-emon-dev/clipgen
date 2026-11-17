// ============================================================
// API Client — Typed HTTP API calls
// ============================================================

import type {
  Project,
  Video,
  ProcessingJob,
  Transcript,
  HighlightCandidate,
  Short,
  ApiResponse,
  LoginRequest,
  RegisterRequest,
  AuthResponse,
  GenerateShortRequest,
  UpdateShortRequest,
  AppSettings,
  CopyrightCheck,
  ProcessingLog,
  LongFormCompilation,
  GenerateTimelineRequest,
  UpdateTimelineRequest,
  VoiceoverProjectState,
  VoiceoverTimeline,
  VoiceoverQualityReport,
  VisualMatchCandidate,
  VoiceoverTimelineShot,
  VoiceoverMatchingMode,
  VoiceoverOutputAspectRatio,
  MovieExplanationProjectState,
  MovieExplanationTimeline,
  MovieExplanationQualityReport,
  MovieTimelineShot,
  MovieScreenshotMotionEffect,
  EpisodeIntelligenceIndex,
  ExplanationScript,
  AnalysisJobState,
  MovieExplanationClipAsset,
  ShotAlignmentMode,
  AssetRightsMetadata,
  PreExportRightsReview,
  ScriptReviewReport,
  ExportManifest,
  MovieAnalyzerProject,
  MultilingualExplanationScript,
  MovieAnalyzerLanguage,
  ScriptAccuracyAudit,
  ProjectLibraryOverview,
  ProjectLibraryItem,
  ProjectLibraryAsset,
  ProjectLibraryCategory,
  ProjectLibraryAssetType,
  ProjectLibraryBulkDeleteRequest,
  ProjectLibraryBulkDeleteResult,
  ProjectLibraryDeleteAllRequest,
  ProjectLibraryDeleteAllResult,
} from '@shared/types.js';

class ApiClient {
  private baseUrl = '/api';

  private getAuthHeader(): Record<string, string> {
    const token = localStorage.getItem('clipgen_token');
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const headers: Record<string, string> = {
      ...this.getAuthHeader(),
      ...(options.headers as Record<string, string> || {}),
    };

    if (!(options.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
    }

    let lastError: Error | null = null;
    const maxAttempts = options.method === 'GET' || !options.method ? 3 : 1;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const res = await fetch(url, {
          ...options,
          headers,
        });

        // Parse body as JSON or capture text error
        let data: any;
        const text = await res.text();
        try {
          data = JSON.parse(text);
        } catch {
          data = {
            success: false,
            error: res.status >= 500
              ? 'Server is temporarily unavailable or restarting. Please try again.'
              : `HTTP ${res.status}: ${res.statusText || 'Unexpected response'}`,
          };
        }

        if (res.ok && data.success !== false) {
          return (data.data !== undefined ? data.data : data) as T;
        }

        // If transient 5xx during background reload and attempts remain, retry with brief backoff
        if (res.status >= 500 && attempt < maxAttempts) {
          await new Promise((resolve) => setTimeout(resolve, 250 * attempt));
          continue;
        }

        throw new Error(data.error || `Server error (${res.status})`);
      } catch (err: any) {
        lastError = err;
        if (attempt < maxAttempts && (!options.body || options.method === 'GET')) {
          await new Promise((resolve) => setTimeout(resolve, 250 * attempt));
          continue;
        }
        throw err;
      }
    }

    throw lastError || new Error('An unexpected network error occurred');
  }

  // ── Auth ──

  async register(req: RegisterRequest): Promise<AuthResponse> {
    return this.request<AuthResponse>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(req),
    });
  }

  async login(req: LoginRequest): Promise<AuthResponse> {
    return this.request<AuthResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(req),
    });
  }

  // ── Projects ──

  async getProjects(): Promise<Project[]> {
    return this.request<Project[]>('/projects');
  }

  async getProject(id: string): Promise<Project & { video?: Video; processingJob?: ProcessingJob; highlightCount: number; shortsCount: number }> {
    return this.request<any>(`/projects/${id}`);
  }

  async createProject(name: string): Promise<Project> {
    return this.request<Project>('/projects', {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
  }

  async deleteProject(id: string): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>(`/projects/${id}`, {
      method: 'DELETE',
    });
  }

  // ── Upload ──

  async uploadVideo(
    projectId: string,
    file: File,
    onProgress?: (percent: number) => void
  ): Promise<Video> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${this.baseUrl}/projects/${projectId}/upload`);

      const auth = this.getAuthHeader();
      if (auth.Authorization) {
        xhr.setRequestHeader('Authorization', auth.Authorization);
      }

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable && onProgress) {
          const percent = Math.round((event.loaded / event.total) * 100);
          onProgress(percent);
        }
      };

      xhr.onload = () => {
        try {
          const res = JSON.parse(xhr.responseText);
          if (xhr.status >= 200 && xhr.status < 300 && res.success) {
            resolve(res.data);
          } else {
            reject(new Error(res.error || `Upload failed with status ${xhr.status}`));
          }
        } catch (err: any) {
          reject(new Error('Failed to parse upload response'));
        }
      };

      xhr.onerror = () => reject(new Error('Network error during upload'));

      const formData = new FormData();
      formData.append('video', file);
      xhr.send(formData);
    });
  }

  // ── Processing ──

  async startProcessing(projectId: string, preferredFramingMode: 'blur_fill' | 'action' = 'blur_fill'): Promise<{ jobId: string; status: string }> {
    return this.request<{ jobId: string; status: string }>(`/projects/${projectId}/process`, {
      method: 'POST',
      body: JSON.stringify({ preferredFramingMode }),
    });
  }

  async getProcessingStatus(projectId: string): Promise<ProcessingJob | null> {
    return this.request<ProcessingJob | null>(`/projects/${projectId}/status`);
  }

  async cancelProcessing(projectId: string): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>(`/projects/${projectId}/cancel`, {
      method: 'POST',
    });
  }

  async getTranscript(projectId: string): Promise<Transcript | null> {
    return this.request<Transcript | null>(`/projects/${projectId}/transcript`);
  }

  async getLogs(projectId: string): Promise<ProcessingLog[]> {
    return this.request<ProcessingLog[]>(`/projects/${projectId}/logs`);
  }

  // ── Highlights ──

  async getHighlights(projectId: string, all: boolean = false): Promise<HighlightCandidate[]> {
    return this.request<HighlightCandidate[]>(`/projects/${projectId}/highlights?all=${all}`);
  }

  async updateHighlight(id: string, req: import('@shared/types.js').UpdateHighlightRequest): Promise<HighlightCandidate> {
    return this.request<HighlightCandidate>(`/highlights/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(req),
    });
  }

  async deleteHighlight(id: string): Promise<{ success: boolean; message?: string }> {
    return this.request<{ success: boolean; message?: string }>(`/highlights/${id}`, {
      method: 'DELETE',
    });
  }

  async autoFrameHighlight(id: string): Promise<HighlightCandidate> {
    return this.request<HighlightCandidate>(`/highlights/${id}/auto-frame`, {
      method: 'POST',
    });
  }

  // ── Waveform ──

  async getWaveform(projectId: string): Promise<import('@shared/types.js').AudioWaveformData> {
    return this.request<import('@shared/types.js').AudioWaveformData>(`/projects/${projectId}/waveform`);
  }

  // ── Shorts ──

  async generateShort(highlightId: string, req?: Partial<GenerateShortRequest>): Promise<Short> {
    return this.request<Short>(`/highlights/${highlightId}/generate`, {
      method: 'POST',
      body: JSON.stringify(req || {}),
    });
  }

  async getShorts(projectId: string): Promise<Short[]> {
    return this.request<Short[]>(`/projects/${projectId}/shorts`);
  }

  async getShort(id: string): Promise<Short> {
    return this.request<Short>(`/shorts/${id}`);
  }

  async updateShort(id: string, req: UpdateShortRequest): Promise<Short> {
    return this.request<Short>(`/shorts/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(req),
    });
  }

  async deleteShort(id: string): Promise<{ success: boolean; message?: string }> {
    return this.request<{ success: boolean; message?: string }>(`/shorts/${id}`, {
      method: 'DELETE',
    });
  }

  async exportShort(id: string): Promise<{ status: string }> {
    return this.request<{ status: string }>(`/shorts/${id}/export`, {
      method: 'POST',
    });
  }

  async generateAllShorts(
    projectId: string,
    req?: Partial<GenerateShortRequest>
  ): Promise<{ queued: number; total: number; shorts: Short[] }> {
    return this.request<{ queued: number; total: number; shorts: Short[] }>(
      `/projects/${projectId}/shorts/generate-all`,
      {
        method: 'POST',
        body: JSON.stringify(req || {}),
      }
    );
  }

  getDownloadUrl(shortId: string): string {
    return `${this.baseUrl}/shorts/${shortId}/download`;
  }

  async downloadBlob(url: string, fallbackFilename: string): Promise<void> {
    const res = await fetch(url, {
      headers: this.getAuthHeader(),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({ error: `Server returned HTTP ${res.status}` }));
      throw new Error(errData.error || `Download failed (${res.status})`);
    }

    let filename = fallbackFilename;
    const disposition = res.headers.get('content-disposition');
    if (disposition && disposition.includes('filename=')) {
      const match = disposition.match(/filename=["']?([^"';]+)["']?/);
      if (match && match[1]) filename = match[1].trim();
    }

    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 30000);
  }

  async downloadShort(shortId: string, filename?: string): Promise<void> {
    const url = this.getDownloadUrl(shortId);
    await this.downloadBlob(url, filename || `short_${shortId}.mp4`);
  }

  getDownloadAllShortsUrl(projectId: string, shortIds?: string[]): string {
    let url = `${this.baseUrl}/projects/${projectId}/shorts/download-all`;
    if (shortIds && shortIds.length > 0) {
      url += `?shortIds=${encodeURIComponent(shortIds.join(','))}`;
    }
    return url;
  }

  async downloadAllShorts(projectId: string, shortIds?: string[]): Promise<void> {
    const url = this.getDownloadAllShortsUrl(projectId, shortIds);
    await this.downloadBlob(url, 'shorts.zip');
  }

  // ── As-Is Highlights Export & Download ──

  async exportHighlightAsIs(id: string): Promise<{ highlightId: string; filePath: string; fileSize: number; filename: string; downloadUrl: string }> {
    return this.request<any>(`/highlights/${id}/export-asis`, {
      method: 'POST',
    });
  }

  getDownloadHighlightAsIsUrl(id: string): string {
    return `${this.baseUrl}/highlights/${id}/download-asis`;
  }

  async downloadHighlightAsIs(id: string, filename?: string): Promise<void> {
    const url = this.getDownloadHighlightAsIsUrl(id);
    await this.downloadBlob(url, filename || `moment_${id}_asis.mp4`);
  }

  async exportAllHighlightsAsIs(projectId: string): Promise<{ total: number; exported: number }> {
    return this.request<{ total: number; exported: number }>(`/highlights/projects/${projectId}/export-all-asis`, {
      method: 'POST',
    });
  }

  getDownloadAllHighlightsAsIsUrl(projectId: string, highlightIds?: string[]): string {
    let url = `${this.baseUrl}/highlights/projects/${projectId}/download-all-asis`;
    if (highlightIds && highlightIds.length > 0) {
      url += `?highlightIds=${encodeURIComponent(highlightIds.join(','))}`;
    }
    return url;
  }

  async downloadAllHighlightsAsIs(projectId: string, highlightIds?: string[]): Promise<void> {
    const url = this.getDownloadAllHighlightsAsIsUrl(projectId, highlightIds);
    await this.downloadBlob(url, 'best_moments_asis.zip');
  }

  // ── Settings & Copyright ──

  async getSettings(): Promise<AppSettings> {
    return this.request<AppSettings>('/settings');
  }

  async getCopyrightCheck(projectId: string): Promise<CopyrightCheck> {
    return this.request<CopyrightCheck>(`/projects/${projectId}/copyright`);
  }

  // ── Long-Form Compilation ──

  async getLongFormCompilation(projectId: string): Promise<LongFormCompilation | null> {
    return this.request<LongFormCompilation | null>(`/projects/${projectId}/longform`);
  }

  async generateLongFormTimeline(
    projectId: string,
    req?: GenerateTimelineRequest
  ): Promise<LongFormCompilation> {
    return this.request<LongFormCompilation>(`/projects/${projectId}/longform/generate-timeline`, {
      method: 'POST',
      body: JSON.stringify(req || {}),
    });
  }

  async updateLongFormTimeline(
    compilationId: string,
    req: UpdateTimelineRequest
  ): Promise<LongFormCompilation> {
    return this.request<LongFormCompilation>(`/longform/${compilationId}/timeline`, {
      method: 'PATCH',
      body: JSON.stringify(req),
    });
  }

  async renderLongFormCompilation(
    compilationId: string
  ): Promise<{ compilationId: string; status: string }> {
    return this.request<{ compilationId: string; status: string }>(`/longform/${compilationId}/render`, {
      method: 'POST',
    });
  }

  async getLongFormStatus(compilationId: string): Promise<LongFormCompilation> {
    return this.request<LongFormCompilation>(`/longform/${compilationId}/status`);
  }

  getLongFormDownloadUrl(compilationId: string): string {
    return `${this.baseUrl}/longform/${compilationId}/download`;
  }

  getLongFormStreamUrl(compilationId: string): string {
    return `${this.baseUrl}/longform/${compilationId}/stream`;
  }

  async downloadLongFormCompilation(compilationId: string, filename?: string): Promise<void> {
    const url = this.getLongFormDownloadUrl(compilationId);
    await this.downloadBlob(url, filename || `compilation_${compilationId}.mp4`);
  }

  // ── Voiceover Production Workflow (AI Visual Director) ──

  async createVoiceoverProject(): Promise<VoiceoverProjectState> {
    return this.request<VoiceoverProjectState>('/voiceover/projects', {
      method: 'POST',
    });
  }

  async getVoiceoverProjects(): Promise<VoiceoverProjectState[]> {
    return this.request<VoiceoverProjectState[]>('/voiceover/projects');
  }

  async getVoiceoverState(projectId: string): Promise<VoiceoverProjectState> {
    return this.request<VoiceoverProjectState>(`/voiceover/${projectId}/state`);
  }

  async deleteVoiceoverProject(projectId: string): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>(`/voiceover/${projectId}`, {
      method: 'DELETE',
    });
  }

  async uploadVoiceoverAudio(projectId: string, file: File): Promise<any> {
    const formData = new FormData();
    formData.append('voiceover', file);
    return this.request<any>(`/voiceover/${projectId}/upload-voiceover`, {
      method: 'POST',
      body: formData,
    });
  }

  async uploadVoiceoverFootage(projectId: string, files: File[]): Promise<any> {
    const formData = new FormData();
    for (const f of files) {
      formData.append('footage', f);
    }
    return this.request<any>(`/voiceover/${projectId}/upload-footage`, {
      method: 'POST',
      body: formData,
    });
  }

  async analyzeVoiceover(projectId: string): Promise<{ success: boolean; message: string }> {
    return this.request<{ success: boolean; message: string }>(`/voiceover/${projectId}/analyze-voiceover`, {
      method: 'POST',
    });
  }

  async analyzeFootage(projectId: string): Promise<{ success: boolean; message: string }> {
    return this.request<{ success: boolean; message: string }>(`/voiceover/${projectId}/analyze-footage`, {
      method: 'POST',
    });
  }

  async generateVoiceoverTimeline(
    projectId: string,
    options?: {
      matchingMode?: VoiceoverMatchingMode;
      outputAspectRatio?: VoiceoverOutputAspectRatio;
      captionsEnabled?: boolean;
    }
  ): Promise<{ timeline: VoiceoverTimeline; qualityReport: VoiceoverQualityReport }> {
    return this.request<{ timeline: VoiceoverTimeline; qualityReport: VoiceoverQualityReport }>(
      `/voiceover/${projectId}/generate-timeline`,
      {
        method: 'POST',
        body: JSON.stringify(options || {}),
      }
    );
  }

  async regenerateVoiceoverTimeline(
    projectId: string,
    options?: {
      matchingMode?: VoiceoverMatchingMode;
      outputAspectRatio?: VoiceoverOutputAspectRatio;
    }
  ): Promise<{ timeline: VoiceoverTimeline; qualityReport: VoiceoverQualityReport }> {
    return this.request<{ timeline: VoiceoverTimeline; qualityReport: VoiceoverQualityReport }>(
      `/voiceover/${projectId}/regenerate-timeline`,
      {
        method: 'POST',
        body: JSON.stringify(options || {}),
      }
    );
  }

  async getClipAlternatives(
    projectId: string,
    shotId: string
  ): Promise<{ shotId: string; currentShot: VoiceoverTimelineShot; alternatives: VisualMatchCandidate[] }> {
    return this.request<{ shotId: string; currentShot: VoiceoverTimelineShot; alternatives: VisualMatchCandidate[] }>(
      `/voiceover/${projectId}/alternatives/${shotId}`
    );
  }

  async updateTimelineShot(
    projectId: string,
    shotId: string,
    updates: {
      isLocked?: boolean;
      clipId?: string;
      sourceStart?: number;
      sourceEnd?: number;
      framingMode?: string;
      cropOffsetX?: number;
      scaleFactor?: number;
    }
  ): Promise<{ shot: VoiceoverTimelineShot; qualityReport: VoiceoverQualityReport }> {
    return this.request<{ shot: VoiceoverTimelineShot; qualityReport: VoiceoverQualityReport }>(
      `/voiceover/${projectId}/timeline/shot/${shotId}`,
      {
        method: 'PATCH',
        body: JSON.stringify(updates),
      }
    );
  }

  async renderVoiceoverVideo(projectId: string): Promise<{ success: boolean; message: string }> {
    return this.request<{ success: boolean; message: string }>(`/voiceover/${projectId}/render`, {
      method: 'POST',
    });
  }

  getVoiceoverStreamUrl(projectId: string): string {
    return `${this.baseUrl}/voiceover/${projectId}/stream`;
  }

  getVoiceoverDownloadUrl(projectId: string): string {
    return `${this.baseUrl}/voiceover/${projectId}/download`;
  }

  async getVoiceoverQualityReport(projectId: string): Promise<VoiceoverQualityReport> {
    return this.request<VoiceoverQualityReport>(`/voiceover/${projectId}/quality-report`);
  }

  // ── Movie & Series Explanation Studio ──

  async getMovieExplanationProjects(): Promise<{ projects: MovieExplanationProjectState[] }> {
    return this.request<{ projects: MovieExplanationProjectState[] }>('/movie-explanation/projects');
  }

  async createMovieExplanationProject(projectName?: string): Promise<{ project: MovieExplanationProjectState }> {
    return this.request<{ project: MovieExplanationProjectState }>('/movie-explanation/projects', {
      method: 'POST',
      body: JSON.stringify({ projectName }),
    });
  }

  async getMovieExplanationProject(projectId: string): Promise<{ project: MovieExplanationProjectState }> {
    return this.request<{ project: MovieExplanationProjectState }>(`/movie-explanation/projects/${projectId}`);
  }

  async deleteMovieExplanationProject(projectId: string): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>(`/movie-explanation/projects/${projectId}`, {
      method: 'DELETE',
    });
  }

  async uploadEpisodeVideo(projectId: string, file: File): Promise<{ success: boolean; originalVideo: any; project: MovieExplanationProjectState }> {
    const formData = new FormData();
    formData.append('video', file);
    return this.request<any>(`/movie-explanation/projects/${projectId}/upload-episode`, {
      method: 'POST',
      body: formData,
    });
  }

  async uploadExplanationVoiceover(projectId: string, file: File): Promise<{ success: boolean; voiceoverAudio: any; project: MovieExplanationProjectState }> {
    const formData = new FormData();
    formData.append('audio', file);
    return this.request<any>(`/movie-explanation/projects/${projectId}/upload-voiceover`, {
      method: 'POST',
      body: formData,
    });
  }

  async uploadExplanationScript(projectId: string, fileOrText: File | string): Promise<{ success: boolean; script: ExplanationScript; project: MovieExplanationProjectState }> {
    if (typeof fileOrText === 'string') {
      return this.request<any>(`/movie-explanation/projects/${projectId}/upload-script`, {
        method: 'POST',
        body: JSON.stringify({ scriptText: fileOrText }),
      });
    } else {
      const formData = new FormData();
      formData.append('scriptFile', fileOrText);
      return this.request<any>(`/movie-explanation/projects/${projectId}/upload-script`, {
        method: 'POST',
        body: formData,
      });
    }
  }

  async uploadOriginalTranscript(projectId: string, fileOrText: File | string): Promise<{ success: boolean; originalTranscript: any; project: MovieExplanationProjectState }> {
    if (typeof fileOrText === 'string') {
      return this.request<any>(`/movie-explanation/projects/${projectId}/upload-original-transcript`, {
        method: 'POST',
        body: JSON.stringify({ transcriptText: fileOrText }),
      });
    } else {
      const formData = new FormData();
      formData.append('transcriptFile', fileOrText);
      return this.request<any>(`/movie-explanation/projects/${projectId}/upload-original-transcript`, {
        method: 'POST',
        body: formData,
      });
    }
  }

  async startIndexEpisode(projectId: string): Promise<{ success: boolean; episodeIndex: EpisodeIntelligenceIndex; project: MovieExplanationProjectState }> {
    return this.request<any>(`/movie-explanation/projects/${projectId}/index-episode`, {
      method: 'POST',
    });
  }

  async startAlignScript(projectId: string): Promise<{ success: boolean; script: ExplanationScript; project: MovieExplanationProjectState }> {
    return this.request<any>(`/movie-explanation/projects/${projectId}/align-script`, {
      method: 'POST',
    });
  }

  async generateMovieTimeline(projectId: string, aspectRatio?: VoiceoverOutputAspectRatio): Promise<{ success: boolean; timeline: MovieExplanationTimeline; qualityReport: MovieExplanationQualityReport; project: MovieExplanationProjectState }> {
    return this.request<any>(`/movie-explanation/projects/${projectId}/generate-timeline`, {
      method: 'POST',
      body: JSON.stringify({ aspectRatio }),
    });
  }

  async regenerateMovieTimeline(projectId: string): Promise<{ success: boolean; timeline: MovieExplanationTimeline; qualityReport: MovieExplanationQualityReport; project: MovieExplanationProjectState }> {
    return this.request<any>(`/movie-explanation/projects/${projectId}/regenerate-timeline`, {
      method: 'POST',
    });
  }

  async toggleMovieShotLock(projectId: string, shotId: string): Promise<{ success: boolean; shotId: string; isLocked: boolean }> {
    return this.request<any>(`/movie-explanation/projects/${projectId}/shots/${shotId}/lock`, {
      method: 'POST',
    });
  }

  async getMovieShotAlternatives(projectId: string, shotId: string): Promise<{ shotId: string; currentSceneId: string; candidates: any[] }> {
    return this.request<any>(`/movie-explanation/projects/${projectId}/shots/${shotId}/alternatives`);
  }

  async replaceMovieShot(
    projectId: string,
    shotId: string,
    newSceneId: string
  ): Promise<{ success: boolean; shot: MovieTimelineShot; timelineRevision?: number; exportStatus?: string }> {
    return this.request<any>(`/movie-explanation/projects/${projectId}/shots/${shotId}/replace`, {
      method: 'POST',
      body: JSON.stringify({ newSceneId }),
    });
  }

  async trimMovieShot(
    projectId: string,
    shotId: string,
    sourceStart: number,
    sourceEnd: number
  ): Promise<{ success: boolean; shot: MovieTimelineShot; timelineRevision?: number; exportStatus?: string }> {
    return this.request<any>(`/movie-explanation/projects/${projectId}/shots/${shotId}/trim`, {
      method: 'POST',
      body: JSON.stringify({ sourceStart, sourceEnd }),
    });
  }

  async acceptShotMatch(
    projectId: string,
    shotId: string
  ): Promise<{ success: boolean; shot: MovieTimelineShot; qualityReport: MovieExplanationQualityReport }> {
    return this.request<{ success: boolean; shot: MovieTimelineShot; qualityReport: MovieExplanationQualityReport }>(
      `/movie-explanation/projects/${projectId}/shots/${shotId}/accept-match`,
      { method: 'POST' }
    );
  }

  async convertShotToScreenshot(
    projectId: string,
    shotId: string,
    motionEffect?: MovieScreenshotMotionEffect
  ): Promise<{ success: boolean; shot: MovieTimelineShot; qualityReport: MovieExplanationQualityReport }> {
    return this.request<{ success: boolean; shot: MovieTimelineShot; qualityReport: MovieExplanationQualityReport }>(
      `/movie-explanation/projects/${projectId}/shots/${shotId}/convert-to-screenshot`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ motionEffect }),
      }
    );
  }

  async recheckMovieSegment(
    projectId: string,
    segmentId: string
  ): Promise<{ success: boolean; segment: any; shot: MovieTimelineShot; qualityReport: MovieExplanationQualityReport }> {
    return this.request<{ success: boolean; segment: any; shot: MovieTimelineShot; qualityReport: MovieExplanationQualityReport }>(
      `/movie-explanation/projects/${projectId}/recheck-segment/${segmentId}`,
      { method: 'POST' }
    );
  }

  async revalidateMovieTimeline(
    projectId: string
  ): Promise<{ success: boolean; qualityReport: MovieExplanationQualityReport; validationOutcome?: string }> {
    return this.request<{ success: boolean; qualityReport: MovieExplanationQualityReport; validationOutcome?: string }>(
      `/movie-explanation/projects/${projectId}/revalidate-timeline`,
      { method: 'POST' }
    );
  }

  async acceptAllScreenshots(
    projectId: string
  ): Promise<{ success: boolean; count: number; shots: MovieTimelineShot[]; qualityReport: MovieExplanationQualityReport }> {
    return this.request<{ success: boolean; count: number; shots: MovieTimelineShot[]; qualityReport: MovieExplanationQualityReport }>(
      `/movie-explanation/projects/${projectId}/accept-all-screenshots`,
      { method: 'POST' }
    );
  }

  async acceptAllMatches(
    projectId: string
  ): Promise<{ success: boolean; count: number; shots: MovieTimelineShot[]; qualityReport: MovieExplanationQualityReport }> {
    return this.request<{ success: boolean; count: number; shots: MovieTimelineShot[]; qualityReport: MovieExplanationQualityReport }>(
      `/movie-explanation/projects/${projectId}/accept-all-matches`,
      { method: 'POST' }
    );
  }

  async convertUnmatchedToScreenshots(
    projectId: string
  ): Promise<{ success: boolean; convertedCount: number; shots: MovieTimelineShot[]; qualityReport: MovieExplanationQualityReport }> {
    return this.request<{ success: boolean; convertedCount: number; shots: MovieTimelineShot[]; qualityReport: MovieExplanationQualityReport }>(
      `/movie-explanation/projects/${projectId}/convert-unmatched-to-screenshots`,
      { method: 'POST' }
    );
  }

  async autoReviewAndApprove(
    projectId: string
  ): Promise<{ success: boolean; approvedCount: number; shots: MovieTimelineShot[]; qualityReport: MovieExplanationQualityReport }> {
    return this.request<{ success: boolean; approvedCount: number; shots: MovieTimelineShot[]; qualityReport: MovieExplanationQualityReport }>(
      `/movie-explanation/projects/${projectId}/auto-review-and-approve`,
      { method: 'POST' }
    );
  }

  async renderMovieExplanation(
    projectId: string,
    options?: {
      acknowledgeRightsWarnings?: boolean;
      autoResolveUnmatched?: boolean;
      resolution?: string;
      frameRate?: number;
      qualityPreset?: string;
      burnCaptions?: boolean;
    }
  ): Promise<{ success: boolean; message: string; requiresRightsAcknowledgement?: boolean; rightsReview?: any }> {
    return this.request<{ success: boolean; message: string; requiresRightsAcknowledgement?: boolean; rightsReview?: any }>(
      `/movie-explanation/projects/${projectId}/render`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ autoResolveUnmatched: true, acknowledgeRightsWarnings: true, ...options }),
      }
    );
  }

  async autoResolveUnmatchedShots(
    projectId: string
  ): Promise<{ success: boolean; message: string; resolvedCount: number; qualityReport: any; project: any }> {
    return this.request<{ success: boolean; message: string; resolvedCount: number; qualityReport: any; project: any }>(
      `/movie-explanation/projects/${projectId}/auto-resolve-unmatched`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  async enforceScreenshotCadence(
    projectId: string
  ): Promise<{ success: boolean; convertedCount: number; shots: any[]; qualityReport: any; project: any }> {
    return this.request<{ success: boolean; convertedCount: number; shots: any[]; qualityReport: any; project: any }>(
      `/movie-explanation/projects/${projectId}/enforce-cadence`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  async autoVaryRepeatedScenes(
    projectId: string
  ): Promise<{ success: boolean; replacedCount: number; shots: any[]; qualityReport: any; project: any }> {
    return this.request<{ success: boolean; replacedCount: number; shots: any[]; qualityReport: any; project: any }>(
      `/movie-explanation/projects/${projectId}/auto-vary-repeated-scenes`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  async cancelMovieExplanationRender(
    projectId: string
  ): Promise<{ success: boolean; message: string; hasExistingRender?: boolean; status?: string }> {
    return this.request<{ success: boolean; message: string; hasExistingRender?: boolean; status?: string }>(
      `/movie-explanation/projects/${projectId}/cancel-render`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  getMovieExplanationSRTUrl(projectId: string): string {
    return this.getMovieSrtExportUrl(projectId);
  }

  async getMovieExplanationAnalysisJob(projectId: string): Promise<{ job: AnalysisJobState | null }> {
    return this.request<{ job: AnalysisJobState | null }>(`/movie-explanation/projects/${projectId}/analysis-job`);
  }

  async cancelMovieExplanationAnalysis(projectId: string): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>(`/movie-explanation/projects/${projectId}/cancel-analysis`, {
      method: 'POST',
    });
  }

  getMovieExplanationStreamUrl(projectId: string): string {
    return `${this.baseUrl}/movie-explanation/projects/${projectId}/stream`;
  }

  getMovieExplanationDownloadUrl(projectId: string): string {
    return `${this.baseUrl}/movie-explanation/projects/${projectId}/download`;
  }

  getProvenanceManifestDownloadUrl(projectId: string, format: 'json' | 'csv' = 'json'): string {
    return `${this.baseUrl}/movie-explanation/projects/${projectId}/provenance-manifest?format=${format}&download=true`;
  }

  async getProvenanceManifest(projectId: string): Promise<{ manifest: any }> {
    return this.request<{ manifest: any }>(`/movie-explanation/projects/${projectId}/provenance-manifest`);
  }

  async scanAssetFolder(
    projectId: string,
    params: {
      folderPath: string;
      category?: string;
      licenseDetails?: string;
      attributionRequirements?: string;
    }
  ): Promise<{ success: boolean; count: number; assets: any[]; message: string }> {
    return this.request<{ success: boolean; count: number; assets: any[]; message: string }>(
      `/movie-explanation/projects/${projectId}/assets/scan-folder`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      }
    );
  }

  async runFullProductionPipeline(
    projectId: string,
    options?: {
      autoRender?: boolean;
      aspectRatio?: string;
      qualityPreset?: string;
    }
  ): Promise<{ success: boolean; result: any; project: any }> {
    return this.request<{ success: boolean; result: any; project: any }>(
      `/movie-explanation/projects/${projectId}/run-full-pipeline`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(options || {}),
      }
    );
  }

  async previewOpeningMovieExplanation(
    projectId: string,
    duration: number = 120
  ): Promise<{ success: boolean; previewUrl: string; duration: number; fileSize: number; outputPath?: string }> {
    return this.request<{ success: boolean; previewUrl: string; duration: number; fileSize: number; outputPath?: string }>(
      `/movie-explanation/projects/${projectId}/preview-opening`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ duration }),
      }
    );
  }

  async renderMovieExplanationOpeningPreview(
    projectId: string,
    duration: number = 120
  ): Promise<{ success: boolean; previewUrl: string; duration: number; fileSize: number; outputPath?: string }> {
    return this.previewOpeningMovieExplanation(projectId, duration);
  }

  getMovieExplanationPreviewOpeningUrl(projectId: string): string {
    return `${this.baseUrl}/movie-explanation/projects/${projectId}/preview-opening/stream`;
  }

  async getMovieExplanationOpeningReport(projectId: string): Promise<{ report: any }> {
    return this.request<{ report: any }>(
      `/movie-explanation/projects/${projectId}/opening-report`
    );
  }

  async updateMovieExplanationSettings(
    projectId: string,
    settings: any
  ): Promise<{ success: boolean; settings: any; project: any }> {
    return this.request<{ success: boolean; settings: any; project: any }>(
      `/movie-explanation/projects/${projectId}/settings`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings }),
      }
    );
  }

  async uploadReplacementVisual(
    projectId: string,
    file: File,
    metadata?: {
      label?: string;
      category?: string;
      rightsStatus?: string;
      licenseDetails?: string;
      evidenceReference?: string;
      restrictions?: string;
      attributionRequirements?: string;
    }
  ): Promise<{ success: boolean; asset: MovieExplanationClipAsset }> {
    const formData = new FormData();
    formData.append('file', file);
    if (metadata) {
      if (metadata.label) formData.append('label', metadata.label);
      if (metadata.category) formData.append('category', metadata.category);
      if (metadata.rightsStatus) formData.append('rightsStatus', metadata.rightsStatus);
      if (metadata.licenseDetails) formData.append('licenseDetails', metadata.licenseDetails);
      if (metadata.evidenceReference) formData.append('evidenceReference', metadata.evidenceReference);
      if (metadata.restrictions) formData.append('restrictions', metadata.restrictions);
      if (metadata.attributionRequirements) formData.append('attributionRequirements', metadata.attributionRequirements);
    }
    return this.request<{ success: boolean; asset: MovieExplanationClipAsset }>(
      `/movie-explanation/projects/${projectId}/assets/upload-visual`,
      {
        method: 'POST',
        body: formData,
      }
    );
  }

  async getReplacementAssets(
    projectId: string
  ): Promise<{ success: boolean; assets: MovieExplanationClipAsset[] }> {
    return this.request<{ success: boolean; assets: MovieExplanationClipAsset[] }>(
      `/movie-explanation/projects/${projectId}/replacement-assets`
    );
  }

  async replaceShotWithAsset(
    projectId: string,
    shotId: string,
    payload: {
      assetId: string;
      alignmentMode?: ShotAlignmentMode;
      assetStartOffset?: number;
    }
  ): Promise<{ success: boolean; shot: MovieTimelineShot; project: MovieExplanationProjectState }> {
    return this.request<{ success: boolean; shot: MovieTimelineShot; project: MovieExplanationProjectState }>(
      `/movie-explanation/projects/${projectId}/shots/${shotId}/replace-with-asset`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }
    );
  }

  async updateShotRights(
    projectId: string,
    shotId: string,
    rights: Partial<AssetRightsMetadata>
  ): Promise<{ success: boolean; shot: MovieTimelineShot }> {
    return this.request<{ success: boolean; shot: MovieTimelineShot }>(
      `/movie-explanation/projects/${projectId}/shots/${shotId}/rights`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rights),
      }
    );
  }

  async getRightsReview(
    projectId: string
  ): Promise<{ success: boolean; review: PreExportRightsReview }> {
    return this.request<{ success: boolean; review: PreExportRightsReview }>(
      `/movie-explanation/projects/${projectId}/rights-review`
    );
  }

  async acknowledgeRightsWarnings(
    projectId: string
  ): Promise<{ success: boolean; rightsReview: PreExportRightsReview }> {
    return this.request<{ success: boolean; rightsReview: PreExportRightsReview }>(
      `/movie-explanation/projects/${projectId}/acknowledge-rights`,
      { method: 'POST' }
    );
  }

  async getScriptReview(
    projectId: string
  ): Promise<{ scriptReview: ScriptReviewReport }> {
    return this.request<{ scriptReview: ScriptReviewReport }>(
      `/movie-explanation/projects/${projectId}/script-review`
    );
  }

  async updateScriptSegment(
    projectId: string,
    segmentId: string,
    text: string
  ): Promise<{ success: boolean; segment: any; scriptReview?: ScriptReviewReport }> {
    return this.request<{ success: boolean; segment: any; scriptReview?: ScriptReviewReport }>(
      `/movie-explanation/projects/${projectId}/script-segments/${segmentId}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      }
    );
  }

  async getExportManifest(
    projectId: string
  ): Promise<{ manifest: ExportManifest }> {
    return this.request<{ manifest: ExportManifest }>(
      `/movie-explanation/projects/${projectId}/export-manifest`
    );
  }

  async splitMovieShot(
    projectId: string,
    shotId: string,
    splitTimestamp: number
  ): Promise<{ success: boolean; splitShots: any[]; timeline: any; timelineRevision: number }> {
    return this.request<{ success: boolean; splitShots: any[]; timeline: any; timelineRevision: number }>(
      `/movie-explanation/projects/${projectId}/shots/${shotId}/split`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ splitTimestamp }),
      }
    );
  }

  async reorderMovieShots(
    projectId: string,
    shotIds: string[]
  ): Promise<{ success: boolean; timeline: any; timelineRevision: number }> {
    return this.request<{ success: boolean; timeline: any; timelineRevision: number }>(
      `/movie-explanation/projects/${projectId}/shots/reorder`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shotIds }),
      }
    );
  }

  async updateMovieShotTransform(
    projectId: string,
    shotId: string,
    data: any
  ): Promise<{ success: boolean; shot: any; timelineRevision: number }> {
    return this.request<{ success: boolean; shot: any; timelineRevision: number }>(
      `/movie-explanation/projects/${projectId}/shots/${shotId}/transform`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }
    );
  }

  async batchUpdateMovieShots(
    projectId: string,
    updates: any,
    shotIds?: string[],
    all?: boolean
  ): Promise<{ success: boolean; updatedCount: number; timelineRevision: number }> {
    return this.request<{ success: boolean; updatedCount: number; timelineRevision: number }>(
      `/movie-explanation/projects/${projectId}/shots/batch-update`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates, shotIds, all }),
      }
    );
  }

  async duplicateMovieShot(
    projectId: string,
    shotId: string
  ): Promise<{ success: boolean; duplicatedShot: any; timeline: any; timelineRevision: number }> {
    return this.request<{ success: boolean; duplicatedShot: any; timeline: any; timelineRevision: number }>(
      `/movie-explanation/projects/${projectId}/shots/${shotId}/duplicate`,
      { method: 'POST' }
    );
  }

  async deleteMovieShot(
    projectId: string,
    shotId: string
  ): Promise<{ success: boolean; timeline: any; timelineRevision: number }> {
    return this.request<{ success: boolean; timeline: any; timelineRevision: number }>(
      `/movie-explanation/projects/${projectId}/shots/${shotId}`,
      { method: 'DELETE' }
    );
  }

  async addMovieSceneToTimeline(
    projectId: string,
    sceneId: string,
    insertAfterShotId?: string,
    duration?: number
  ): Promise<{ success: boolean; shot: any; timeline: any; timelineRevision: number }> {
    return this.request<{ success: boolean; shot: any; timeline: any; timelineRevision: number }>(
      `/movie-explanation/projects/${projectId}/shots/add-scene`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sceneId, insertAfterShotId, duration }),
      }
    );
  }

  async updateMovieTimeline(
    projectId: string,
    data: any
  ): Promise<{ success: boolean; timeline: any; timelineRevision: number }> {
    return this.request<{ success: boolean; timeline: any; timelineRevision: number }>(
      `/movie-explanation/projects/${projectId}/timeline/update`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }
    );
  }

  async generateMovieCaptions(
    projectId: string
  ): Promise<{ success: boolean; captions: any[]; count: number }> {
    return this.request<{ success: boolean; captions: any[]; count: number }>(
      `/movie-explanation/projects/${projectId}/captions/generate`,
      { method: 'POST' }
    );
  }

  async updateMovieCaptions(
    projectId: string,
    captions: any[]
  ): Promise<{ success: boolean; captions: any[]; timelineRevision: number }> {
    return this.request<{ success: boolean; captions: any[]; timelineRevision: number }>(
      `/movie-explanation/projects/${projectId}/captions/update`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ captions }),
      }
    );
  }

  getMovieSrtExportUrl(projectId: string): string {
    return `${this.baseUrl}/movie-explanation/projects/${projectId}/export/srt`;
  }

  getMovieSourceVideoStreamUrl(projectId: string): string {
    return `${this.baseUrl}/movie-explanation/projects/${projectId}/media/source-video`;
  }

  getMovieVoiceoverStreamUrl(projectId: string): string {
    return `${this.baseUrl}/movie-explanation/projects/${projectId}/media/voiceover`;
  }

  // ── AI Movie Analyzer & Multilingual Explanation Studio API ──

  async getMovieAnalyzerProjects(): Promise<{ projects: MovieAnalyzerProject[] }> {
    return this.request<{ projects: MovieAnalyzerProject[] }>('/movie-analyzer/projects');
  }

  async createMovieAnalyzerProject(name?: string): Promise<{ project: MovieAnalyzerProject }> {
    return this.request<{ project: MovieAnalyzerProject }>('/movie-analyzer/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
  }

  async getMovieAnalyzerProject(projectId: string): Promise<{ project: MovieAnalyzerProject }> {
    return this.request<{ project: MovieAnalyzerProject }>(`/movie-analyzer/projects/${projectId}`);
  }

  async deleteMovieAnalyzerProject(projectId: string): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>(`/movie-analyzer/projects/${projectId}`, {
      method: 'DELETE',
    });
  }

  async uploadMovieAnalyzerVideo(
    projectId: string,
    file: File
  ): Promise<{ success: boolean; project: MovieAnalyzerProject }> {
    const formData = new FormData();
    formData.append('video', file);
    return this.request<{ success: boolean; project: MovieAnalyzerProject }>(
      `/movie-analyzer/projects/${projectId}/upload-video`,
      {
        method: 'POST',
        body: formData,
      }
    );
  }

  async uploadMovieAnalyzerTranscript(
    projectId: string,
    fileOrText: File | string,
    filename?: string
  ): Promise<{ success: boolean; project: MovieAnalyzerProject }> {
    if (typeof fileOrText === 'string') {
      return this.request<{ success: boolean; project: MovieAnalyzerProject }>(
        `/movie-analyzer/projects/${projectId}/upload-transcript`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: fileOrText, filename }),
        }
      );
    } else {
      const formData = new FormData();
      formData.append('transcript', fileOrText);
      return this.request<{ success: boolean; project: MovieAnalyzerProject }>(
        `/movie-analyzer/projects/${projectId}/upload-transcript`,
        {
          method: 'POST',
          body: formData,
        }
      );
    }
  }

  async startMovieAnalyzerAnalysis(
    projectId: string
  ): Promise<{ success: boolean; scenesCount: number; project: MovieAnalyzerProject }> {
    return this.request<{ success: boolean; scenesCount: number; project: MovieAnalyzerProject }>(
      `/movie-analyzer/projects/${projectId}/analyze`,
      { method: 'POST' }
    );
  }

  async generateMovieAnalyzerScripts(
    projectId: string,
    targetDurationMinutes: number = 9,
    language?: MovieAnalyzerLanguage
  ): Promise<{ success: boolean; scripts: any; project: MovieAnalyzerProject }> {
    return this.request<{ success: boolean; scripts: any; project: MovieAnalyzerProject }>(
      `/movie-analyzer/projects/${projectId}/generate-scripts`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetDurationMinutes, language }),
      }
    );
  }

  async updateMovieAnalyzerScript(
    projectId: string,
    updates: {
      language?: MovieAnalyzerLanguage;
      paragraphId?: string;
      text?: string;
      hookText?: string;
      hookType?: string;
    }
  ): Promise<{ success: boolean; script: MultilingualExplanationScript; project: MovieAnalyzerProject }> {
    return this.request<{ success: boolean; script: MultilingualExplanationScript; project: MovieAnalyzerProject }>(
      `/movie-analyzer/projects/${projectId}/script`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      }
    );
  }

  async selectMovieAnalyzerLanguage(
    projectId: string,
    language: MovieAnalyzerLanguage
  ): Promise<{ success: boolean; selectedLanguage: string; project: MovieAnalyzerProject }> {
    return this.request<{ success: boolean; selectedLanguage: string; project: MovieAnalyzerProject }>(
      `/movie-analyzer/projects/${projectId}/select-language`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ language }),
      }
    );
  }

  async uploadMovieAnalyzerVoiceover(
    projectId: string,
    file?: File
  ): Promise<{ success: boolean; voiceover: any; project: MovieAnalyzerProject }> {
    if (file) {
      const formData = new FormData();
      formData.append('audio', file);
      return this.request<{ success: boolean; voiceover: any; project: MovieAnalyzerProject }>(
        `/movie-analyzer/projects/${projectId}/voiceover`,
        {
          method: 'POST',
          body: formData,
        }
      );
    } else {
      return this.request<{ success: boolean; voiceover: any; project: MovieAnalyzerProject }>(
        `/movie-analyzer/projects/${projectId}/voiceover`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ generate: true }),
        }
      );
    }
  }

  async matchMovieAnalyzerScenes(
    projectId: string,
    options?: { enableMovingScreenshots?: boolean; screenshotInterval?: number }
  ): Promise<{ success: boolean; matchedShotsCount: number; project: MovieAnalyzerProject }> {
    return this.request<{ success: boolean; matchedShotsCount: number; project: MovieAnalyzerProject }>(
      `/movie-analyzer/projects/${projectId}/match-scenes`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(options || {}),
      }
    );
  }

  async handoffMovieAnalyzer(
    projectId: string
  ): Promise<{ success: boolean; movieExplanationProjectId: string; shotsCount: number; project: MovieAnalyzerProject }> {
    return this.request<{ success: boolean; movieExplanationProjectId: string; shotsCount: number; project: MovieAnalyzerProject }>(
      `/movie-analyzer/projects/${projectId}/handoff`,
      { method: 'POST' }
    );
  }

  getMovieAnalyzerExportScriptUrl(projectId: string, lang?: string): string {
    return `${this.baseUrl}/movie-analyzer/projects/${projectId}/export-script${lang ? `?lang=${encodeURIComponent(lang)}` : ''}`;
  }

  getMovieAnalyzerExportSrtUrl(projectId: string, lang?: string): string {
    return `${this.baseUrl}/movie-analyzer/projects/${projectId}/export-srt${lang ? `?lang=${encodeURIComponent(lang)}` : ''}`;
  }

  async downloadMovieAnalyzerScript(projectId: string, lang?: string, filename?: string): Promise<void> {
    const url = this.getMovieAnalyzerExportScriptUrl(projectId, lang);
    await this.downloadBlob(url, filename || `movie_script_${lang || 'full'}.txt`);
  }

  async downloadMovieAnalyzerSrt(projectId: string, lang?: string, filename?: string): Promise<void> {
    const url = this.getMovieAnalyzerExportSrtUrl(projectId, lang);
    await this.downloadBlob(url, filename || `movie_subtitles_${lang || 'full'}.srt`);
  }

  async regenerateMovieAnalyzerHook(
    projectId: string,
    language?: string,
    hookType?: string
  ): Promise<{ success: boolean; hook: any; script: any; project: MovieAnalyzerProject }> {
    return this.request<{ success: boolean; hook: any; script: any; project: MovieAnalyzerProject }>(
      `/movie-analyzer/projects/${projectId}/regenerate-hook`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ language, hookType }),
      }
    );
  }

  async regenerateMovieAnalyzerSection(
    projectId: string,
    language: string,
    paragraphId: string
  ): Promise<{ success: boolean; paragraph: any; project: MovieAnalyzerProject }> {
    return this.request<{ success: boolean; paragraph: any; project: MovieAnalyzerProject }>(
      `/movie-analyzer/projects/${projectId}/regenerate-section`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ language, paragraphId }),
      }
    );
  }

  async approveMovieAnalyzerScript(
    projectId: string,
    language: string
  ): Promise<{ success: boolean; approvedLanguage: string; project: MovieAnalyzerProject }> {
    return this.request<{ success: boolean; approvedLanguage: string; project: MovieAnalyzerProject }>(
      `/movie-analyzer/projects/${projectId}/approve-script`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ language }),
      }
    );
  }

  async cancelMovieAnalyzerOperation(projectId: string): Promise<{ success: boolean; message: string }> {
    return this.request<{ success: boolean; message: string }>(
      `/movie-analyzer/projects/${projectId}/cancel`,
      { method: 'POST' }
    );
  }

  // ── Project Library & Storage Cleanup ──

  async getProjectLibraryOverview(): Promise<ProjectLibraryOverview> {
    return this.request<ProjectLibraryOverview>('/project-library/overview');
  }

  async deleteProjectLibraryProject(
    category: ProjectLibraryCategory,
    projectId: string,
    permanent: boolean = false
  ): Promise<{ success: boolean; freedBytes: number; message: string }> {
    return this.request<{ success: boolean; freedBytes: number; message: string }>(
      `/project-library/projects/${category}/${projectId}?permanent=${permanent}`,
      { method: 'DELETE' }
    );
  }

  async restoreProjectLibraryProject(
    category: ProjectLibraryCategory,
    projectId: string
  ): Promise<{ success: boolean; message: string }> {
    return this.request<{ success: boolean; message: string }>(
      `/project-library/projects/${category}/${projectId}/restore`,
      { method: 'POST' }
    );
  }

  async deleteProjectLibraryAsset(
    category: ProjectLibraryCategory,
    projectId: string,
    assetType: ProjectLibraryAssetType
  ): Promise<{ success: boolean; freedBytes: number; message: string }> {
    return this.request<{ success: boolean; freedBytes: number; message: string }>(
      `/project-library/assets/${category}/${projectId}/${assetType}`,
      { method: 'DELETE' }
    );
  }

  async bulkDeleteProjectLibrary(
    data: ProjectLibraryBulkDeleteRequest
  ): Promise<ProjectLibraryBulkDeleteResult> {
    return this.request<ProjectLibraryBulkDeleteResult>('/project-library/bulk-delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  }

  async deleteAllProjectLibrary(
    data: ProjectLibraryDeleteAllRequest
  ): Promise<ProjectLibraryDeleteAllResult> {
    return this.request<ProjectLibraryDeleteAllResult>('/project-library/delete-all', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  }

  async cleanupProjectLibraryOrphans(): Promise<{ success: boolean; freedBytes: number; formattedFreedBytes: string; message: string }> {
    return this.request<{ success: boolean; freedBytes: number; formattedFreedBytes: string; message: string }>(
      '/project-library/cleanup-orphans',
      { method: 'POST' }
    );
  }
}

export const api = new ApiClient();
