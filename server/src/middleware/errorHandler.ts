// ============================================================
// Global Error Handler
// ============================================================

import { Request, Response, NextFunction } from 'express';

export function errorHandler(
  err: any,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  console.error('Server error:', err.message || err);

  // Multer errors
  if (err.code === 'LIMIT_FILE_SIZE') {
    res.status(413).json({
      success: false,
      error: 'File too large. Maximum upload size exceeded.',
    });
    return;
  }

  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    res.status(400).json({
      success: false,
      error: 'Unexpected file field.',
    });
    return;
  }

  const status = err.status || err.statusCode || 500;
  const message = err.message || (typeof err === 'string' ? err : 'Internal server error');

  res.setHeader('Content-Type', 'application/json');
  res.status(status).json({
    success: false,
    error: message,
    code: err.code || (status === 500 ? 'INTERNAL_SERVER_ERROR' : undefined),
  });
}
