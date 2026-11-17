// ============================================================
// Zip Service — Archive Creation & Strict Verification Engine
// Zero-dependency binary zip central-directory inspection
// ============================================================

import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';

/**
 * Pure Node.js binary ZIP central-directory reader.
 * Inspects End of Central Directory (EOCD) and Central Directory Records
 * to return all entry filenames stored in the ZIP archive without external dependencies.
 */
export function listZipEntries(zipBufferOrPath: Buffer | string): string[] {
  const buffer = typeof zipBufferOrPath === 'string'
    ? fs.readFileSync(zipBufferOrPath)
    : zipBufferOrPath;

  const eocdSignature = 0x06054b50; // 'PK\x05\x06'
  let eocdOffset = -1;

  // Search backward from the end for the EOCD record (min size 22 bytes, max comment 65535 bytes)
  const searchLimit = Math.max(0, buffer.length - 65557);
  for (let i = buffer.length - 22; i >= searchLimit; i--) {
    if (buffer.readUInt32LE(i) === eocdSignature) {
      eocdOffset = i;
      break;
    }
  }

  if (eocdOffset === -1) {
    throw new Error('Invalid ZIP file: End of Central Directory record not found');
  }

  const entryCount = buffer.readUInt16LE(eocdOffset + 10);
  const cdOffset = buffer.readUInt32LE(eocdOffset + 16);
  const entries: string[] = [];

  let offset = cdOffset;
  for (let i = 0; i < entryCount; i++) {
    if (offset + 46 > buffer.length) break;
    const headerSig = buffer.readUInt32LE(offset);
    if (headerSig !== 0x02014b50) { // 'PK\x01\x02'
      break;
    }

    const nameLen = buffer.readUInt16LE(offset + 28);
    const extraLen = buffer.readUInt16LE(offset + 30);
    const commentLen = buffer.readUInt16LE(offset + 32);

    if (offset + 46 + nameLen <= buffer.length) {
      const filename = buffer.toString('utf8', offset + 46, offset + 46 + nameLen);
      entries.push(filename);
    }

    offset += 46 + nameLen + extraLen + commentLen;
  }

  return entries;
}

/**
 * Creates a ZIP archive from sourceDir and strictly verifies that:
 * 1. Staging directory has exactly expectedCount files.
 * 2. ZIP file is created with size > 0.
 * 3. The ZIP archive central directory contains exactly expectedCount unique entries.
 *
 * If ANY verification fails, the generated ZIP is deleted and an error is thrown.
 */
export async function createAndVerifyZipArchive(
  sourceDir: string,
  zipPath: string,
  expectedCount: number
): Promise<{ entryCount: number; entries: string[] }> {
  if (!fs.existsSync(sourceDir)) {
    throw new Error(`Staging directory does not exist: ${sourceDir}`);
  }

  const stagedFiles = fs
    .readdirSync(sourceDir)
    .filter((f) => !f.startsWith('.') && fs.statSync(path.join(sourceDir, f)).isFile());

  if (stagedFiles.length === 0) {
    throw new Error('Staging directory is empty. No files to package into ZIP.');
  }

  if (stagedFiles.length !== expectedCount) {
    throw new Error(
      `Staging verification failed: expected ${expectedCount} unique clips, but found ${stagedFiles.length} in staging directory.`
    );
  }

  // Ensure target zip does not already exist
  if (fs.existsSync(zipPath)) {
    try {
      fs.unlinkSync(zipPath);
    } catch {}
  }

  // Create ZIP archive
  await executeZipArchive(sourceDir, zipPath, stagedFiles);

  // Verification 1: ZIP exists and is non-empty
  if (!fs.existsSync(zipPath)) {
    throw new Error(`ZIP archive was not created at ${zipPath}`);
  }

  const stat = fs.statSync(zipPath);
  if (stat.size === 0) {
    try { fs.unlinkSync(zipPath); } catch {}
    throw new Error(`ZIP archive created at ${zipPath} is empty (0 bytes)`);
  }

  // Verification 2: Read archive central directory and verify entry count and uniqueness
  let zipEntries: string[];
  try {
    zipEntries = listZipEntries(zipPath);
  } catch (err: any) {
    try { fs.unlinkSync(zipPath); } catch {}
    throw new Error(`Failed to verify ZIP archive contents: ${err.message}`);
  }

  if (zipEntries.length !== expectedCount) {
    try { fs.unlinkSync(zipPath); } catch {}
    throw new Error(
      `ZIP verification failed: expected ${expectedCount} clips in archive, but archive contains ${zipEntries.length} entries.`
    );
  }

  const uniqueZipEntries = new Set(zipEntries);
  if (uniqueZipEntries.size !== expectedCount) {
    try { fs.unlinkSync(zipPath); } catch {}
    throw new Error(
      `ZIP verification failed: archive contains duplicate file entries (${expectedCount - uniqueZipEntries.size} duplicates detected).`
    );
  }

  return { entryCount: zipEntries.length, entries: zipEntries };
}

/**
 * Underlying archive creation via native bsdtar (with fallback to PowerShell Compress-Archive).
 */
function executeZipArchive(sourceDir: string, zipPath: string, files: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      // 1. Fast store compression with bsdtar (near-instant for MP4s, avoids re-compressing H.264)
      const proc = spawn('tar.exe', ['-a', '-c', '--options', 'zip:compression=store', '-f', zipPath, ...files], {
        cwd: sourceDir,
        windowsHide: true,
      });

      proc.on('close', (code) => {
        if (code === 0 && fs.existsSync(zipPath) && fs.statSync(zipPath).size > 0) {
          return resolve();
        }

        // 2. Fallback: standard tar without store option
        const procFallback = spawn('tar.exe', ['-a', '-c', '-f', zipPath, ...files], {
          cwd: sourceDir,
          windowsHide: true,
        });

        procFallback.on('close', (code2) => {
          if (code2 === 0 && fs.existsSync(zipPath) && fs.statSync(zipPath).size > 0) {
            return resolve();
          }

          // 3. Final fallback: PowerShell Compress-Archive
          const ps = spawn('powershell.exe', [
            '-NoProfile',
            '-Command',
            `Get-ChildItem -Path "${sourceDir}" | Compress-Archive -DestinationPath "${zipPath}" -Force`,
          ], { windowsHide: true });

          ps.on('close', (psCode) => {
            if (psCode === 0 && fs.existsSync(zipPath) && fs.statSync(zipPath).size > 0) {
              resolve();
            } else {
              reject(new Error(`Zip creation failed (tar: ${code}/${code2}, ps: ${psCode})`));
            }
          });

          ps.on('error', reject);
        });

        procFallback.on('error', (err2) => reject(err2));
      });

      proc.on('error', () => {
        const ps = spawn('powershell.exe', [
          '-NoProfile',
          '-Command',
          `Get-ChildItem -Path "${sourceDir}" | Compress-Archive -DestinationPath "${zipPath}" -Force`,
        ], { windowsHide: true });

        ps.on('close', (psCode) => {
          if (psCode === 0 && fs.existsSync(zipPath) && fs.statSync(zipPath).size > 0) {
            resolve();
          } else {
            reject(new Error(`PowerShell Compress-Archive failed with code ${psCode}`));
          }
        });

        ps.on('error', reject);
      });
    } catch (err) {
      reject(err);
    }
  });
}
