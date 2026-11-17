// ============================================================
// Upload Routes — Video Upload with Validation
// ============================================================

import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import path from 'path';
import { getDb } from '../services/database.js';
import { saveUploadedFile } from '../services/storage.js';
import { extractMetadata, validateVideo } from '../services/ffmpeg.js';
import { videoUpload } from '../middleware/upload.js';
import { authMiddleware, type AuthRequest } from '../middleware/auth.js';

const router = Router();

router.use(authMiddleware);

// POST /api/projects/:id/upload — Upload video
router.post('/:id/upload', videoUpload.single('video'), async (req: AuthRequest, res) => {
  try {
    const db = getDb();
    const project = db.prepare('SELECT id FROM projects WHERE id = ?')
      .get(req.params.id) as any;

    if (!project) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }

    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No video file provided' });
    }

    // Check if project already has a video
    const existingVideo = db.prepare('SELECT id FROM videos WHERE project_id = ?').get(project.id);
    if (existingVideo) {
      return res.status(409).json({ success: false, error: 'Project already has a video. Delete the project and create a new one.' });
    }

    // Save file
    const saved = saveUploadedFile(req.file.buffer, project.id, req.file.originalname);

    // Validate video
    const validation = await validateVideo(saved.filepath);
    if (!validation.valid) {
      // Delete invalid file
      const fs = await import('fs');
      try { fs.unlinkSync(saved.filepath); } catch {}
      return res.status(422).json({ success: false, error: validation.error });
    }

    // Extract metadata
    const metadata = await extractMetadata(saved.filepath);

    // Store video record
    const videoId = uuid();
    db.prepare(`
      INSERT INTO videos (
        id, project_id, filename, original_filename, file_path,
        file_size, duration, width, height, fps, codec,
        audio_codec, audio_tracks, bitrate, mime_type
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      videoId, project.id, saved.filename, req.file.originalname, saved.filepath,
      req.file.size, metadata.duration, metadata.width, metadata.height,
      metadata.fps, metadata.codec, metadata.audioCodec, metadata.audioTracks,
      metadata.bitrate, req.file.mimetype
    );

    // Update project status
    db.prepare("UPDATE projects SET status = 'uploaded', updated_at = datetime('now') WHERE id = ?")
      .run(project.id);

    res.status(201).json({
      success: true,
      data: {
        id: videoId,
        projectId: project.id,
        filename: saved.filename,
        originalFilename: req.file.originalname,
        fileSize: req.file.size,
        duration: metadata.duration,
        width: metadata.width,
        height: metadata.height,
        fps: metadata.fps,
        codec: metadata.codec,
        audioCodec: metadata.audioCodec,
        audioTracks: metadata.audioTracks,
        bitrate: metadata.bitrate,
        url: saved.url,
      },
    });
  } catch (err: any) {
    console.error('Upload error:', err);
    res.status(500).json({ success: false, error: 'Upload failed: ' + err.message });
  }
});

export default router;
