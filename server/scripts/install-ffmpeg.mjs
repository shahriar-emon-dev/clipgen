import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const binDir = path.resolve(__dirname, '../bin');
if (!fs.existsSync(binDir)) {
  fs.mkdirSync(binDir, { recursive: true });
}

async function downloadFile(url, dest) {
  console.log(`Downloading ${url}...`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download ${url}: ${res.statusText}`);
  const fileStream = fs.createWriteStream(dest);
  await pipeline(Readable.fromWeb(res.body), fileStream);
  console.log(`Saved to ${dest}`);
}

async function main() {
  const tmpDir = path.resolve(__dirname, '../.tmp_bin');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

  const ffmpegTgz = path.join(tmpDir, 'ffmpeg.tgz');
  const ffprobeTgz = path.join(tmpDir, 'ffprobe.tgz');

  // 1. Download FFmpeg
  await downloadFile(
    'https://registry.npmjs.org/@ffmpeg-installer/win32-x64/-/win32-x64-4.1.0.tgz',
    ffmpegTgz
  );

  console.log('Extracting ffmpeg.exe...');
  execSync(`tar -xzf "${ffmpegTgz}" -C "${binDir}" --strip-components=1 package/ffmpeg.exe`, { stdio: 'inherit' });

  // 2. Download FFprobe
  await downloadFile(
    'https://registry.npmjs.org/@ffprobe-installer/win32-x64/-/win32-x64-5.1.0.tgz',
    ffprobeTgz
  );

  console.log('Extracting ffprobe.exe...');
  execSync(`tar -xzf "${ffprobeTgz}" -C "${binDir}" --strip-components=1 package/ffprobe.exe`, { stdio: 'inherit' });

  // Clean up
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {}

  console.log('\nVerifying installed binaries:');
  const ffmpegExe = path.join(binDir, 'ffmpeg.exe');
  const ffprobeExe = path.join(binDir, 'ffprobe.exe');

  if (fs.existsSync(ffmpegExe) && fs.existsSync(ffprobeExe)) {
    const ffmpegVer = execSync(`"${ffmpegExe}" -version`).toString().split('\n')[0];
    const ffprobeVer = execSync(`"${ffprobeExe}" -version`).toString().split('\n')[0];
    console.log(`✓ FFmpeg: ${ffmpegVer}`);
    console.log(`✓ FFprobe: ${ffprobeVer}`);
    console.log('SUCCESS: Static binaries ready in ' + binDir);
  } else {
    throw new Error('Verification failed: ffmpeg.exe or ffprobe.exe missing');
  }
}

main().catch(err => {
  console.error('Installation failed:', err);
  process.exit(1);
});
