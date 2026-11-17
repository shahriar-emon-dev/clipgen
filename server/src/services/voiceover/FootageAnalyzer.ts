// ============================================================
// Footage Analyzer — Multi-Level Computer Vision & Indexing
// Analyzes uploaded clips, detects sub-scenes, extracts visual
// tags across 5 levels, and builds the VisualFootageIndex.
// ============================================================

import path from 'path';
import fs from 'fs';
import { spawn } from 'child_process';
import { v4 as uuid } from 'uuid';
import { config } from '../../config/index.js';
import type {
  FootageAsset,
  FootageVisualSegment,
  VisualFootageIndex,
} from '../../../../shared/types.js';
import { extractMetadata, generateThumbnail } from '../ffmpeg.js';
import { detectSceneChanges } from '../sceneDetector.js';
import { getVoiceoverThumbsDir } from '../storage.js';
import { titleBumperDetector } from '../movieExplanation/TitleBumperDetector.js';

export class FootageAnalyzer {
  /**
   * Analyzes an entire collection of uploaded video clips with controlled concurrency.
   * Tolerates single-clip errors without crashing the project.
   */
  public async analyzeClipsCollection(
    projectId: string,
    clipFiles: { clipId: string; filePath: string; originalFilename: string }[],
    existingIndex: FootageAsset[] = [],
    onProgress?: (percent: number, detail: string) => void
  ): Promise<VisualFootageIndex> {
    const existingMap = new Map(existingIndex.map(c => [c.clipId, c]));
    const results: FootageAsset[] = [];
    const totalClips = clipFiles.length;

    // Filter clips that need analysis vs cached
    const pendingClips: typeof clipFiles = [];
    for (const clip of clipFiles) {
      const cached = existingMap.get(clip.clipId);
      if (cached && cached.analysisStatus === 'analyzed' && fs.existsSync(cached.sourceFile)) {
        results.push(cached);
      } else {
        pendingClips.push(clip);
      }
    }

    if (onProgress) {
      onProgress(
        Math.round((results.length / Math.max(1, totalClips)) * 100),
        `Footage library: ${results.length} cached, ${pendingClips.length} to analyze...`
      );
    }

    // Process pending clips in concurrency batches of 3
    const concurrency = 3;
    let completedCount = results.length;

    for (let i = 0; i < pendingClips.length; i += concurrency) {
      const batch = pendingClips.slice(i, i + concurrency);
      const batchPromises = batch.map(async (clipItem) => {
        try {
          const analyzed = await this.analyzeSingleClip(projectId, clipItem);
          results.push(analyzed);
        } catch (err: any) {
          console.warn(`[FootageAnalyzer] Failed to analyze clip ${clipItem.clipId} (${clipItem.originalFilename}):`, err.message);
          results.push({
            clipId: clipItem.clipId,
            projectId,
            originalFilename: clipItem.originalFilename,
            filename: path.basename(clipItem.filePath),
            sourceFile: clipItem.filePath,
            fileSize: fs.existsSync(clipItem.filePath) ? fs.statSync(clipItem.filePath).size : 0,
            duration: 0,
            width: 0,
            height: 0,
            fps: 0,
            codec: 'unknown',
            visualSegments: [],
            visualTags: [],
            qualityScore: 0,
            usageCount: 0,
            matchCount: 0,
            analysisStatus: 'failed',
            error: err.message,
            createdAt: new Date().toISOString(),
          });
        } finally {
          completedCount++;
          const pct = Math.round((completedCount / Math.max(1, totalClips)) * 100);
          onProgress?.(pct, `Analyzed clip ${completedCount}/${totalClips}: "${clipItem.originalFilename}"`);
        }
      });

      await Promise.all(batchPromises);
    }

    // Sort by original clip ID or filename
    results.sort((a, b) => a.originalFilename.localeCompare(b.originalFilename));

    const totalSegments = results.reduce((acc, c) => acc + (c.visualSegments?.length || 0), 0);
    const totalDuration = results.reduce((acc, c) => acc + (c.duration || 0), 0);

    return {
      projectId,
      totalClips: results.length,
      totalDuration: Number(totalDuration.toFixed(2)),
      totalSegments,
      clips: results,
      indexedAt: new Date().toISOString(),
    };
  }

  /**
   * Analyzes a single video clip: metadata, scene cuts, keyframes, color, motion, tags.
   */
  public async analyzeSingleClip(
    projectId: string,
    clip: { clipId: string; filePath: string; originalFilename: string }
  ): Promise<FootageAsset> {
    const { clipId, filePath, originalFilename } = clip;

    if (!fs.existsSync(filePath)) {
      throw new Error(`Video file missing on disk: ${filePath}`);
    }

    const stat = fs.statSync(filePath);
    // 1. Extract Full Source Metadata (preserving original video parameters)
    const meta = await extractMetadata(filePath);
    if (!meta.duration || meta.duration <= 0) {
      throw new Error('Video duration is zero or file is corrupted');
    }

    // 2. Generate Thumbnail for UI
    const thumbsDir = getVoiceoverThumbsDir(projectId);
    const thumbFilename = `thumb_${clipId}.jpg`;
    const thumbPath = path.join(thumbsDir, thumbFilename);
    let thumbUrl = '';

    try {
      const snapTime = Math.min(2.0, meta.duration / 2);
      await this.extractFrame(filePath, snapTime, thumbPath);
      if (fs.existsSync(thumbPath)) {
        thumbUrl = `/api/files/voiceover/${projectId}/thumbnails/${thumbFilename}`;
      }
    } catch {
      // Fallback: try existing thumbnail generator
      thumbUrl = await generateThumbnail(filePath, projectId, Math.min(1.0, meta.duration / 2));
    }

    // 3. Detect Scene Cuts within the clip (Section 53: Clip Sub-Segment Selection)
    let cutPoints: number[] = [];
    try {
      cutPoints = await detectSceneChanges(filePath, 0.35, meta.duration);
    } catch {
      cutPoints = [];
    }

    // Check for non-narrative opening title cards, definition slates, and bumpers
    let openingSlateEnd = 0;
    try {
      const slate = await titleBumperDetector.detectOpeningTitleSlate(filePath);
      if (slate && slate.hasTitleSlate) {
        openingSlateEnd = slate.openingSlateEnd;
      }
    } catch {}

    // Build sub-segments based on scene boundaries
    const subBoundaries = [0, ...cutPoints.filter(p => p > 0.8 && p < meta.duration - 0.8), meta.duration];
    const visualSegments: FootageVisualSegment[] = [];

    for (let s = 0; s < subBoundaries.length - 1; s++) {
      const start = Number(subBoundaries[s].toFixed(2));
      const end = Number(subBoundaries[s + 1].toFixed(2));
      const duration = Number((end - start).toFixed(2));
      if (duration < 0.4) continue;

      const midTime = Number((start + duration / 2).toFixed(2));
      const subKeyframeName = `sub_${clipId}_${s}.jpg`;
      const subKeyframePath = path.join(thumbsDir, subKeyframeName);

      try {
        await this.extractFrame(filePath, midTime, subKeyframePath);
      } catch {}

      // Analyze visual properties of this sub-segment
      const visionData = await this.sampleSubSegmentVision(filePath, start, end, subKeyframePath, originalFilename);
      const isBumper = (openingSlateEnd > 0 && start < openingSlateEnd - 0.5);

      visualSegments.push({
        subSegmentId: `sub_${clipId}_${String(s + 1).padStart(2, '0')}`,
        clipId,
        start,
        end,
        duration,
        subjects: visionData.subjects,
        actions: visionData.actions,
        environment: visionData.environment,
        shotCharacteristics: visionData.shotCharacteristics,
        semanticConcepts: visionData.semanticConcepts,
        emotion: visionData.emotion,
        timeOfDay: visionData.timeOfDay,
        weather: visionData.weather,
        cameraMovement: visionData.cameraMovement,
        motionIntensity: visionData.motionIntensity,
        keyframeUrl: fs.existsSync(subKeyframePath)
          ? `/api/files/voiceover/${projectId}/thumbnails/${subKeyframeName}`
          : thumbUrl,
        isBumper,
      });
    }

    // If no valid subsegments, fallback to whole clip
    if (visualSegments.length === 0) {
      const wholeVision = await this.sampleSubSegmentVision(filePath, 0, meta.duration, thumbPath, originalFilename);
      visualSegments.push({
        subSegmentId: `sub_${clipId}_01`,
        clipId,
        start: 0,
        end: meta.duration,
        duration: meta.duration,
        subjects: wholeVision.subjects,
        actions: wholeVision.actions,
        environment: wholeVision.environment,
        shotCharacteristics: wholeVision.shotCharacteristics,
        semanticConcepts: wholeVision.semanticConcepts,
        emotion: wholeVision.emotion,
        timeOfDay: wholeVision.timeOfDay,
        weather: wholeVision.weather,
        cameraMovement: wholeVision.cameraMovement,
        motionIntensity: wholeVision.motionIntensity,
        keyframeUrl: thumbUrl,
      });
    }

    // 4. Compute Technical Quality Score (Section 39 & 41)
    const qualityScore = this.calculateTechnicalQualityScore(meta);

    // 5. Aggregate unique visual tags for UI chips
    const allTags = new Set<string>();
    for (const seg of visualSegments) {
      seg.subjects.forEach(t => allTags.add(t));
      seg.actions.forEach(t => allTags.add(t));
      seg.environment.forEach(t => allTags.add(t));
      seg.shotCharacteristics.forEach(t => allTags.add(t));
      seg.semanticConcepts.forEach(t => allTags.add(t));
      if (seg.timeOfDay) allTags.add(seg.timeOfDay);
    }

    return {
      clipId,
      projectId,
      originalFilename,
      filename: path.basename(filePath),
      sourceFile: filePath,
      fileSize: stat.size,
      duration: meta.duration,
      width: meta.width,
      height: meta.height,
      fps: meta.fps,
      codec: meta.codec,
      pixelFormat: meta.pixelFormat,
      audioCodec: meta.audioCodec,
      audioSampleRate: meta.audioSampleRate,
      bitrate: meta.bitrate,
      visualSegments,
      visualTags: Array.from(allTags).slice(0, 15),
      qualityScore,
      usageCount: 0,
      matchCount: 0,
      analysisStatus: 'analyzed',
      thumbnailUrl: thumbUrl,
      isBumper: visualSegments.length > 0 && visualSegments.every(v => v.isBumper),
      createdAt: new Date().toISOString(),
    };
  }

  /**
   * Samples visual characteristics of a video sub-range using lightweight OpenCV/Python analysis.
   */
  private async sampleSubSegmentVision(
    videoPath: string,
    start: number,
    end: number,
    keyframePath: string,
    originalFilename: string
  ): Promise<{
    subjects: string[];
    actions: string[];
    environment: string[];
    shotCharacteristics: string[];
    semanticConcepts: string[];
    emotion: string;
    timeOfDay: string;
    weather: string;
    cameraMovement: string;
    motionIntensity: number;
  }> {
    const subjects = new Set<string>();
    const actions = new Set<string>();
    const environment = new Set<string>();
    const shotChars = new Set<string>();
    const concepts = new Set<string>();
    let emotion = 'neutral';
    let timeOfDay = 'daytime';
    let weather = 'clear';
    let cameraMovement = 'static';
    let motionIntensity = 40;

    // 1. Incorporate any semantic hints from original filename without being limited to them
    this.extractTagsFromFilename(originalFilename, subjects, actions, environment, shotChars, concepts);

    // 2. Perform rapid Computer Vision Analysis on sampled keyframe & motion
    try {
      const cvMetrics = await this.runCVProbe(videoPath, start, end, keyframePath);
      motionIntensity = cvMetrics.motionIntensity;
      cameraMovement = cvMetrics.cameraMovement;

      // Color & Lighting analysis
      if (cvMetrics.isSunset) {
        timeOfDay = 'sunset';
        environment.add('sunset');
        shotChars.add('golden hour');
        concepts.add('beauty');
      } else if (cvMetrics.isNight) {
        timeOfDay = 'night';
        environment.add('night');
        shotChars.add('dark');
      } else {
        timeOfDay = 'daytime';
        environment.add('daytime');
      }

      // Nature vs Urban color dominance
      if (cvMetrics.greenDominance > 0.32) {
        environment.add('nature');
        environment.add('greenery');
        subjects.add('plants');
      } else if (cvMetrics.brownDominance > 0.28) {
        environment.add('field');
        environment.add('cracked soil');
        concepts.add('arid');
      } else if (cvMetrics.blueDominance > 0.35) {
        environment.add('sky');
        environment.add('water');
      }

      // Motion & Action
      if (motionIntensity > 65) {
        actions.add('fast movement');
        actions.add('dynamic action');
        shotChars.add('action');
        emotion = 'excitement';
      } else if (motionIntensity < 20) {
        actions.add('static');
        shotChars.add('still');
        emotion = 'calm';
      } else {
        actions.add('walking');
        actions.add('movement');
      }

      // Human presence detection
      if (cvMetrics.hasFaces || cvMetrics.humanPresenceScore > 40) {
        subjects.add('person');
        subjects.add('people');
      }

      // Shot composition (wide vs close-up)
      if (cvMetrics.isWideShot) {
        shotChars.add('wide shot');
        shotChars.add('landscape');
      } else if (cvMetrics.isCloseUp) {
        shotChars.add('close-up');
      }
    } catch (err: any) {
      // Fallback to baseline reasonable tags if CV probe is unavailable
      subjects.add('scene');
      environment.add('environment');
      shotChars.add('standard shot');
    }

    return {
      subjects: Array.from(subjects),
      actions: Array.from(actions),
      environment: Array.from(environment),
      shotCharacteristics: Array.from(shotChars),
      semanticConcepts: Array.from(concepts),
      emotion,
      timeOfDay,
      weather,
      cameraMovement,
      motionIntensity,
    };
  }

  /**
   * Fast Python/OpenCV probe measuring color histograms, motion magnitude, and face presence.
   */
  private async runCVProbe(
    videoPath: string,
    start: number,
    end: number,
    keyframePath: string
  ): Promise<{
    motionIntensity: number;
    cameraMovement: string;
    isSunset: boolean;
    isNight: boolean;
    greenDominance: number;
    brownDominance: number;
    blueDominance: number;
    hasFaces: boolean;
    humanPresenceScore: number;
    isWideShot: boolean;
    isCloseUp: boolean;
  }> {
    return new Promise((resolve) => {
      const pyScript = `
import cv2, json, sys, os
import numpy as np

vpath = sys.argv[1]
kpath = sys.argv[2]
start_t = float(sys.argv[3])
end_t = float(sys.argv[4])

res = {
    "motionIntensity": 45,
    "cameraMovement": "static",
    "isSunset": False,
    "isNight": False,
    "greenDominance": 0.1,
    "brownDominance": 0.1,
    "blueDominance": 0.1,
    "hasFaces": False,
    "humanPresenceScore": 20,
    "isWideShot": True,
    "isCloseUp": False
}

try:
    # 1. Analyze keyframe image if present
    img = None
    if os.path.exists(kpath):
        img = cv2.imread(kpath)
    
    if img is not None:
        h, w = img.shape[:2]
        hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
        h_channel = hsv[:, :, 0]
        s_channel = hsv[:, :, 1]
        v_channel = hsv[:, :, 2]
        
        mean_v = float(np.mean(v_channel))
        mean_s = float(np.mean(s_channel))
        
        # Night vs Day vs Sunset
        if mean_v < 50:
            res["isNight"] = True
        elif (np.sum((h_channel >= 5) & (h_channel <= 25) & (s_channel > 80)) / (h * w)) > 0.22:
            res["isSunset"] = True
            
        # Color Dominance
        res["greenDominance"] = float(np.sum((h_channel >= 35) & (h_channel <= 85) & (s_channel > 50)) / (h * w))
        res["brownDominance"] = float(np.sum((h_channel >= 10) & (h_channel <= 25) & (s_channel < 120) & (v_channel < 160)) / (h * w))
        res["blueDominance"] = float(np.sum((h_channel >= 90) & (h_channel <= 130) & (s_channel > 60)) / (h * w))
        
        # Face / Human detection (fast Haar)
        try:
            face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')
            gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
            faces = face_cascade.detectMultiScale(gray, 1.25, 4, minSize=(30, 30))
            if len(faces) > 0:
                res["hasFaces"] = True
                res["humanPresenceScore"] = 85
                max_face_area = max([fw * fh for (fx, fy, fw, fh) in faces])
                if max_face_area > (w * h * 0.12):
                    res["isCloseUp"] = True
                    res["isWideShot"] = False
        except:
            pass

    # 2. Motion sampling
    cap = cv2.VideoCapture(vpath)
    cap.set(cv2.CAP_PROP_POS_MSEC, start_t * 1000.0)
    ret1, f1 = cap.read()
    cap.set(cv2.CAP_PROP_POS_MSEC, min(end_t, start_t + 1.2) * 1000.0)
    ret2, f2 = cap.read()
    cap.release()
    
    if ret1 and ret2:
        g1 = cv2.resize(cv2.cvtColor(f1, cv2.COLOR_BGR2GRAY), (320, 180))
        g2 = cv2.resize(cv2.cvtColor(f2, cv2.COLOR_BGR2GRAY), (320, 180))
        diff = cv2.absdiff(g1, g2)
        m_energy = float(np.mean(diff))
        res["motionIntensity"] = int(min(100, max(5, m_energy * 5.0)))
        if res["motionIntensity"] > 45:
            res["cameraMovement"] = "tracking"
        elif res["motionIntensity"] > 20:
            res["cameraMovement"] = "pan"
        else:
            res["cameraMovement"] = "static"

    print(json.dumps(res))
except Exception as e:
    print(json.dumps(res))
`;

      const pythonBin = process.env.PYTHON_PATH ||
        (fs.existsSync('C:\\Users\\ASUS\\AppData\\Local\\Python\\pythoncore-3.14-64\\python.exe')
          ? 'C:\\Users\\ASUS\\AppData\\Local\\Python\\pythoncore-3.14-64\\python.exe'
          : 'python');

      const proc = spawn(pythonBin, [
        '-c', pyScript,
        videoPath,
        keyframePath,
        String(start),
        String(end),
      ], { stdio: ['pipe', 'pipe', 'pipe'] });

      let stdout = '';
      proc.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });

      proc.on('close', (code) => {
        if (code === 0 && stdout.trim()) {
          try {
            const data = JSON.parse(stdout.trim());
            return resolve(data);
          } catch {}
        }
        resolve({
          motionIntensity: 45,
          cameraMovement: 'static',
          isSunset: false,
          isNight: false,
          greenDominance: 0.1,
          brownDominance: 0.1,
          blueDominance: 0.1,
          hasFaces: false,
          humanPresenceScore: 20,
          isWideShot: true,
          isCloseUp: false,
        });
      });

      proc.on('error', () => {
        resolve({
          motionIntensity: 45,
          cameraMovement: 'static',
          isSunset: false,
          isNight: false,
          greenDominance: 0.1,
          brownDominance: 0.1,
          blueDominance: 0.1,
          hasFaces: false,
          humanPresenceScore: 20,
          isWideShot: true,
          isCloseUp: false,
        });
      });
    });
  }

  /**
   * Computes objective technical quality score (0-100) based on resolution, fps, and bitrate.
   */
  private calculateTechnicalQualityScore(meta: { width: number; height: number; fps: number; bitrate: number }): number {
    let score = 70;

    // Resolution contribution (up to +20)
    const pixels = meta.width * meta.height;
    if (pixels >= 3840 * 2160) score += 20;      // 4K
    else if (pixels >= 2560 * 1440) score += 18; // 1440p
    else if (pixels >= 1920 * 1080) score += 15; // 1080p
    else if (pixels >= 1280 * 720) score += 5;   // 720p
    else score -= 15;                            // <720p

    // Framerate contribution
    if (meta.fps >= 59) score += 5;              // 60fps smooth
    else if (meta.fps >= 23.9) score += 3;

    // Bitrate contribution
    if (meta.bitrate >= 15000000) score += 5;    // >15 Mbps
    else if (meta.bitrate < 2000000 && meta.bitrate > 0) score -= 10; // low bitrate compression

    return Math.max(10, Math.min(100, Math.round(score)));
  }

  /**
   * Extracts tags from filename tokens (e.g. `tokyo_sunset_drone_01.mp4`).
   */
  private extractTagsFromFilename(
    filename: string,
    subjects: Set<string>,
    actions: Set<string>,
    environment: Set<string>,
    shotChars: Set<string>,
    concepts: Set<string>
  ): void {
    const clean = filename.toLowerCase().replace(/[-_.]+/g, ' ');
    const tokens = clean.split(/\s+/);

    const envMap: Record<string, string> = {
      airport: 'airport', terminal: 'airport', plane: 'airplane', tokyo: 'tokyo', city: 'city',
      hotel: 'hotel', coast: 'coast', beach: 'beach', mountain: 'mountain', valley: 'valley',
      forest: 'forest', stadium: 'stadium', pitch: 'football field', field: 'field', office: 'office',
      garage: 'garage', factory: 'factory', temple: 'temple', skyline: 'skyline', street: 'street',
      farm: 'farm', drought: 'drought', crops: 'crops', soil: 'soil',
    };

    const actionMap: Record<string, string> = {
      walk: 'walking', walking: 'walking', run: 'running', running: 'running', drive: 'driving',
      fly: 'flying', climb: 'climbing', celebrate: 'celebrating', celebration: 'celebrating',
      cut: 'cutting inside', goal: 'goal', defense: 'defending', work: 'working',
    };

    const shotMap: Record<string, string> = {
      drone: 'drone', aerial: 'aerial', pov: 'POV', wide: 'wide shot', closeup: 'close-up',
      sunset: 'sunset', sunrise: 'sunrise', night: 'night',
    };

    const conceptMap: Record<string, string> = {
      startup: 'startup', tech: 'technology', technology: 'technology', historic: 'historical',
      history: 'history', struggle: 'struggle', growth: 'growth', travel: 'travel',
    };

    for (const tok of tokens) {
      if (envMap[tok]) environment.add(envMap[tok]);
      if (actionMap[tok]) actions.add(actionMap[tok]);
      if (shotMap[tok]) shotChars.add(shotMap[tok]);
      if (conceptMap[tok]) concepts.add(conceptMap[tok]);
    }
  }

  /**
   * Fast single-frame extraction helper.
   */
  private async extractFrame(videoPath: string, timestamp: number, outputPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const args = [
        '-y',
        '-ss', String(timestamp),
        '-i', videoPath,
        '-vframes', '1',
        '-vf', 'scale=640:-1:flags=bicubic',
        '-q:v', '3',
        outputPath,
      ];
      const proc = spawn(config.ffmpegPath, args, { stdio: ['pipe', 'pipe', 'pipe'] });
      proc.on('close', (code) => code === 0 ? resolve() : reject(new Error('Frame extraction failed')));
      proc.on('error', reject);
    });
  }
}

export const footageAnalyzer = new FootageAnalyzer();
