import { spawn } from 'node:child_process';
import ffmpegPath from 'ffmpeg-static';

/** WAV → OGG/Opus mono, the format WhatsApp renders as a voice note. Pipes only, no temp files. */
export function wavToOggOpus(wav: Buffer): Promise<Buffer> {
  return runFfmpeg(['-hide_banner', '-loglevel', 'error', '-i', 'pipe:0',
    '-ac', '1', '-ar', '48000', '-c:a', 'libopus', '-b:a', '24k', '-application', 'voip', '-f', 'ogg', 'pipe:1'], wav);
}

function runFfmpeg(args: string[], input: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    if (!ffmpegPath) return reject(new Error('ffmpeg-static binary not found'));
    const p = spawn(ffmpegPath as unknown as string, args);
    const out: Buffer[] = [];
    let err = '';
    const timer = setTimeout(() => { p.kill('SIGKILL'); reject(new Error('ffmpeg timeout')); }, 10_000);
    p.stdout.on('data', (c: Buffer) => out.push(c));
    p.stderr.on('data', (c: Buffer) => { err += c.toString(); });
    p.on('error', (e) => { clearTimeout(timer); reject(e); });
    p.on('close', (code) => {
      clearTimeout(timer);
      code === 0 ? resolve(Buffer.concat(out)) : reject(new Error(`ffmpeg exited ${code}: ${err.slice(0, 300)}`));
    });
    p.stdin.on('error', () => { /* reported via close */ });
    p.stdin.end(input);
  });
}
