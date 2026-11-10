// Browser demo channel: same pipeline (Gnani STT → Gemini → Gnani TTS) without WhatsApp delivery.
import express from 'express';
import { spawn } from 'node:child_process';
import ffmpegPath from 'ffmpeg-static';
import { cfg } from './config.js';
import { Trace } from './trace.js';
import * as gnani from './clients/gnani.js';
import { ask, type Turn } from './clients/gemini.js';
import { weatherLine, reverseGeocode } from './clients/weather.js';
import { wavToOggOpus } from './audio.js';
import { detectScript, isLang, type LangCode } from './languages.js';

interface Session { lang: LangCode; history: Turn[]; crops: Set<string>; loc?: { lat: number; lon: number; label?: string } }
const sessions = new Map<string, Session>();

/** Browser recording (webm/opus) → OGG/Opus, a format Gnani Prisma accepts. */
function toOgg(input: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const p = spawn(ffmpegPath as unknown as string, ['-hide_banner', '-loglevel', 'error', '-i', 'pipe:0', '-ac', '1', '-ar', '16000', '-c:a', 'libopus', '-b:a', '32k', '-f', 'ogg', 'pipe:1']);
    const out: Buffer[] = [];
    let err = '';
    p.stdout.on('data', (c: Buffer) => out.push(c));
    p.stderr.on('data', (c: Buffer) => { err += c; });
    p.on('close', (code) => (code === 0 ? resolve(Buffer.concat(out)) : reject(new Error(err.slice(0, 200)))));
    p.stdin.on('error', () => {});
    p.stdin.end(input);
  });
}

export function demoRouter() {
  const r = express.Router();
  r.use((req, res, next) => (req.query.token === cfg.DASHBOARD_TOKEN ? next() : res.status(403).send('Add ?token=<DASHBOARD_TOKEN>')));

  r.post('/location', express.json(), async (req, res) => {
    const s = session(String(req.query.sid));
    const lat = Number(req.body.lat), lon = Number(req.body.lon);
    const [place, weather] = await Promise.all([reverseGeocode(lat, lon), weatherLine(lat, lon)]);
    s.loc = { lat, lon, label: place?.label };
    res.json({ ok: true, place, weather });
  });

  r.post('/ask', express.raw({ type: '*/*', limit: '15mb' }), async (req, res) => {
    const sid = String(req.query.sid ?? 'demo');
    const kind = String(req.query.kind ?? 'audio'); // audio | text | image
    const rid = String(req.query.rid ?? Date.now());
    const s = session(sid);
    const tr = new Trace(`demo-${rid}`, `web-${sid.slice(-4)}`, kind);
    const ms: Record<string, number> = {};
    const timed = async <T>(k: string, fn: () => Promise<T>) => { const t = Date.now(); const v = await fn(); ms[k] = Date.now() - t; return v; };
    try {
      const body = req.body as Buffer;
      const weatherP = s.loc ? tr.stage('weather', () => weatherLine(s.loc!.lat, s.loc!.lon)) : Promise.resolve(null);
      let farmerSaid = '';
      let lang = s.lang;
      let image: { data: Buffer; mime: string } | undefined;
      if (kind === 'audio') {
        const ogg = await tr.stage('download', () => toOgg(body));
        const t = await timed('stt', () => tr.stage('stt', () => gnani.stt(ogg, 'audio/ogg')));
        farmerSaid = t.text;
        lang = t.lang;
      } else if (kind === 'text') {
        farmerSaid = body.toString('utf8');
        lang = detectScript(farmerSaid) ?? s.lang;
      } else {
        image = { data: body, mime: String(req.headers['content-type'] ?? 'image/jpeg').split(';')[0] };
        farmerSaid = String(req.query.caption ?? '');
      }
      const weather = await weatherP;
      const a = await timed('llm', () => tr.stage('llm', () => ask({
        replyLang: lang, weather, farmerSaid, source: kind === 'audio' ? 'voice' : kind === 'text' ? 'text' : 'photo',
        image, crops: [...s.crops], history: s.history.slice(-cfg.MAX_HISTORY_TURNS),
        locationLabel: s.loc ? (s.loc.label ?? `${s.loc.lat.toFixed(2)}, ${s.loc.lon.toFixed(2)}`) : undefined,
      }), { lang }));
      if (isLang(a.reply_language)) s.lang = a.reply_language;
      const wav = await timed('tts', () => tr.stage('tts', () => gnani.tts(a.spoken_answer, a.reply_language), { lang: a.reply_language }));
      const out = await tr.stage('encode', () => wavToOggOpus(wav));
      a.detected_crops.forEach((c) => s.crops.add(c));
      s.history.push({ role: 'farmer', text: farmerSaid || '(photo)' }, { role: 'assistant', text: a.spoken_answer });
      tr.done({ lang: a.reply_language });
      res.json({
        transcript: farmerSaid, lang: a.reply_language, summary: a.text_summary, spoken: a.spoken_answer,
        isPlant: a.is_plant_photo, escalate: a.escalate, weatherUsed: Boolean(weather), place: s.loc?.label ?? null,
        ms, audio: out.toString('base64'),
      });
    } catch (e) {
      tr.emit('error', 'fail', undefined, { error: String((e as Error).message).slice(0, 120) });
      res.status(500).json({ error: (e as Error).message });
    }
  });
  return r;
}

function session(sid: string) {
  let s = sessions.get(sid);
  if (!s) { s = { lang: 'hi-IN', history: [], crops: new Set() }; sessions.set(sid, s); }
  return s;
}
