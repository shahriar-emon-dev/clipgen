// ============================================================
// Persistent Cache Service — Fast Re-runs & Resumable Indexing
// Caches video metadata, scene cuts, analysis frames, Ollama descriptions,
// voiceover transcripts, and candidate match scores.
// Uses file size + mtime content hashing to ensure instant cache hits.
// ============================================================

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { config } from '../../config/index.js';
import { ensureDir } from '../storage.js';

export class PersistentCacheService {
  private cacheDir: string;
  private memoryCache: Map<string, any> = new Map();

  constructor() {
    this.cacheDir = path.join(config.dataDir, 'cache', 'movie_explanation');
    ensureDir(this.cacheDir);
  }

  /**
   * Generates a stable cache key based on file stats (size, mtime) and optional salt.
   */
  public computeFileKey(filePath: string, salt: string = ''): string {
    if (!fs.existsSync(filePath)) {
      return crypto.createHash('md5').update(`${filePath}:${salt}`).digest('hex');
    }
    const stat = fs.statSync(filePath);
    const hash = crypto.createHash('md5')
      .update(`${filePath}:${stat.size}:${stat.mtimeMs}:${salt}`)
      .digest('hex');
    return hash;
  }

  /**
   * Generates a key for raw text or object content.
   */
  public computeContentKey(content: string, salt: string = ''): string {
    return crypto.createHash('md5').update(`${content}:${salt}`).digest('hex');
  }

  /**
   * Retrieves cached data from memory or disk.
   */
  public get<T>(namespace: string, key: string): T | null {
    const memKey = `${namespace}:${key}`;
    if (this.memoryCache.has(memKey)) {
      return this.memoryCache.get(memKey) as T;
    }

    const filePath = path.join(this.cacheDir, namespace, `${key}.json`);
    if (fs.existsSync(filePath)) {
      try {
        const raw = fs.readFileSync(filePath, 'utf8');
        const data = JSON.parse(raw) as T;
        this.memoryCache.set(memKey, data);
        return data;
      } catch {
        return null;
      }
    }
    return null;
  }

  /**
   * Saves data into both memory and persistent disk cache.
   */
  public set<T>(namespace: string, key: string, data: T): void {
    const memKey = `${namespace}:${key}`;
    this.memoryCache.set(memKey, data);

    const nsDir = path.join(this.cacheDir, namespace);
    ensureDir(nsDir);
    const filePath = path.join(nsDir, `${key}.json`);
    const tempPath = `${filePath}.tmp.${Date.now()}`;
    try {
      fs.writeFileSync(tempPath, JSON.stringify(data), 'utf8');
      fs.renameSync(tempPath, filePath);
    } catch (err) {
      console.warn(`[PersistentCacheService] Failed writing cache for ${memKey}:`, err);
      try { if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath); } catch {}
    }
  }

  /**
   * Checks if an item is cached.
   */
  public has(namespace: string, key: string): boolean {
    const memKey = `${namespace}:${key}`;
    if (this.memoryCache.has(memKey)) return true;
    const filePath = path.join(this.cacheDir, namespace, `${key}.json`);
    return fs.existsSync(filePath);
  }

  /**
   * Invalidates a specific namespace or key.
   */
  public invalidate(namespace: string, key?: string): void {
    if (key) {
      this.memoryCache.delete(`${namespace}:${key}`);
      const filePath = path.join(this.cacheDir, namespace, `${key}.json`);
      if (fs.existsSync(filePath)) {
        try { fs.unlinkSync(filePath); } catch {}
      }
    } else {
      // Invalidate whole namespace
      for (const k of this.memoryCache.keys()) {
        if (k.startsWith(`${namespace}:`)) this.memoryCache.delete(k);
      }
      const nsDir = path.join(this.cacheDir, namespace);
      if (fs.existsSync(nsDir)) {
        try { fs.rmSync(nsDir, { recursive: true, force: true }); } catch {}
      }
    }
  }
}

export const persistentCacheService = new PersistentCacheService();
