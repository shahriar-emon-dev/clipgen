// ============================================================
// Upload Middleware — Multer Configuration
// ============================================================

import multer from 'multer';
import path from 'path';
import { config } from '../config/index.js';
import { SUPPORTED_VIDEO_MIMES } from '../../../shared/constants.js';

const storage = multer.memoryStorage();

export const videoUpload = multer({
  storage,
  limits: {
    fileSize: config.maxUploadSize,
  },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const validExts = ['.mp4', '.mov', '.webm', '.mkv', '.avi'];

    if (!validExts.includes(ext) && !SUPPORTED_VIDEO_MIMES.includes(file.mimetype)) {
      cb(new Error(`Unsupported video format: ${ext}. Supported: ${validExts.join(', ')}`));
      return;
    }

    cb(null, true);
  },
});
