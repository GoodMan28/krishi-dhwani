import crypto from 'node:crypto';
import { LRUCache } from 'lru-cache';
import { cfg } from './config.js';
import { MSG, detectScript, type LangCode } from './languages.js';
import { Trace, maskPhone } from './trace.js';
import type { InboundMessage } from './webhook.js';
import * as wa from './clients/whatsapp.js';
import * as gnani from './clients/gnani.js';
import { ask, type BrainAnswer, type BrainContext, type Turn } from './clients/gemini.js';
import { weatherLine, geocode } from './clients/weather.js';
import { wavToOggOpus } from './audio.js';

// ---- In-memory farmer profiles (crunch mode; MongoDB is the next step in the plan) ----
interface User {
  lang: LangCode;
  pendingLang?: LangCode;       // language change needs two consecutive detections
  location?: { lat: number; lon: number; label?: string };
  crops: Set<string>;
  history: Turn[];
  welcomed: boolean;
}
const users = new Map<string, User>();
function getUser(id: string, lang: LangCode = 'hi-IN'): User {
  let u = users.get(id);
  if (!u) { u = { lang, crops: new Set(), history: [], welcomed: false }; users.set(id, u); }
  return u;
}

// ---- Dedupe (Meta retries webhooks) and per-farmer ordering ----
const seen = new LRUCache<string, true>({ max: 20000, ttl: 3600_000 });
const chains = new Map<string, Promise<void>>();
const ttsCache = new LRUCache<string, string>({ max: 2000, ttl: 25 * 24 * 3600_000 }); // hash → WhatsApp media ID

export function enqueue(m: InboundMessage) {
  if (seen.has(m.id)) return;
  seen.set(m.id, true);
  const prev = chains.get(m.from) ?? Promise.resolve();
  const next = prev.then(() => handle(m)).catch((e) => console.error('handler crashed', e));
  chains.set(m.from, next);
  void next.finally(() => { if (chains.get(m.from) === next) chains.delete(m.from); });
}

async function handle(m: InboundMessage) {
  const tr = new Trace(m.id, m.from, m.kind);
  const user = getUser(m.from);
  if (m.kind !== 'location' && m.kind !== 'unsupported') {
    void wa.react(m.from, m.id, '🎧').catch(() => {});
    void wa.markReadTyping(m.id).catch(() => {});
  }
  try {
    switch (m.kind) {
      case 'audio': return await handleAudio(tr, m, user);
      case 'text': return await handleText(tr, m, user);
      case 'image': return await handleImage(tr, m, user);
      case 'location': {
        user.location = { lat: m.lat, lon: m.lon, label: m.label };
        const w = await tr.stage('weather', () => weatherLine(m.lat, m.lon));
        await wa.sendText(m.from, MSG.locationSaved[user.lang] + (w ? `\n🌦️ ${w}` : ''));
        return tr.done({ lang: user.lang });
      }
      default:
        await wa.sendText(m.from, MSG.unsupported[user.lang]);
        return tr.done({ lang: user.lang });
    }
  } catch (e) {
    console.error(`[${maskPhone(m.from)}] ${m.kind} failed:`, (e as Error).message);
    tr.emit('error', 'fail', undefined, { error: String((e as Error).message).slice(0, 120) });
    const msg = e instanceof gnani.NoSpeechError ? MSG.couldNotHear : MSG.error;
    await wa.sendText(m.from, msg[user.lang]).catch(() => {});
  }
}

async function weatherFor(tr: Trace, user: User) {
  if (!user.location) { tr.skip('weather', { reason: 'no location' }); return null; }
  return tr.stage('weather', () => weatherLine(user.location!.lat, user.location!.lon));
}

async function handleAudio(tr: Trace, m: Extract<InboundMessage, { kind: 'audio' }>, user: User) {
  const [audio, weather] = await Promise.all([
    tr.stage('download', () => wa.downloadMedia(m.mediaId)),
    weatherFor(tr, user),
  ]);
  const stt = await tr.stage('stt', () => gnani.stt(audio.buf, audio.mime), { kb: Math.round(audio.buf.length / 1024) });
  const lang = updateLanguage(user, stt.lang);
  console.log(`[${maskPhone(m.from)}] STT ${stt.lang}: ${cfg.DASHBOARD_SHOW_TEXT ? stt.text : `${stt.text.length} chars`}`);
  await answer(tr, m.from, user, { replyLang: lang, weather, farmerSaid: stt.text, source: 'voice' });
}

async function handleText(tr: Trace, m: Extract<InboundMessage, { kind: 'text' }>, user: User) {
  if (/^\s*delete my data\s*$/i.test(m.body)) {
    users.delete(m.from);
    await wa.sendText(m.from, 'Your data has been deleted. ✅');
    return tr.done({ lang: user.lang });
  }
  const detected = detectScript(m.body);
  const lang = detected ? updateLanguage(user, detected) : user.lang;
  const weather = await weatherFor(tr, user);
  await answer(tr, m.from, user, { replyLang: lang, weather, farmerSaid: m.body, source: 'text' });
}

async function handleImage(tr: Trace, m: Extract<InboundMessage, { kind: 'image' }>, user: User) {
  const [img, weather] = await Promise.all([tr.stage('download', () => wa.downloadMedia(m.mediaId)), weatherFor(tr, user)]);
  const lang = m.caption && detectScript(m.caption) ? updateLanguage(user, detectScript(m.caption)!) : user.lang;
  await answer(tr, m.from, user, { replyLang: lang, weather, farmerSaid: m.caption ?? '', source: 'photo', image: { data: img.buf, mime: img.mime.split(';')[0] } });
}

/** Accept a new language only after two consecutive detections, so one short misheard note doesn't flip it. */
function updateLanguage(user: User, detected: LangCode): LangCode {
  if (user.history.length === 0) { user.lang = detected; return detected; }
  if (detected === user.lang) { user.pendingLang = undefined; return detected; }
  if (user.pendingLang === detected) { user.lang = detected; user.pendingLang = undefined; return detected; }
  user.pendingLang = detected;
  return detected; // reply in what they just spoke, but keep the stored preference for now
}

async function answer(tr: Trace, to: string, user: User, partial: Pick<BrainContext, 'replyLang' | 'weather' | 'farmerSaid' | 'source' | 'image'>) {
  // If the farmer named a place and we have no location, geocode it for weather (short budget).
  const ctx: BrainContext = {
    ...partial,
    crops: [...user.crops],
    locationLabel: user.location?.label ?? (user.location ? 'shared pin' : undefined),
    history: user.history.slice(-cfg.MAX_HISTORY_TURNS),
  };
  let a = await tr.stage('llm', () => ask(ctx), { lang: ctx.replyLang });

  if (!user.location && a.spoken_place && a.needs_location) {
    const g = await geocode(a.spoken_place);
    if (g) {
      user.location = g;
      const w = await tr.stage('weather', () => weatherLine(g.lat, g.lon));
      if (w) a = await tr.stage('llm', () => ask({ ...ctx, weather: w, locationLabel: g.label }), { lang: ctx.replyLang, retryWithWeather: true });
    }
  }

  if (partial.source === 'photo' && !a.is_plant_photo) {
    await wa.sendText(to, MSG.notAPlant[a.reply_language]);
    return tr.done({ lang: a.reply_language });
  }

  await sendReply(tr, to, a);

  // Update memory after replying (never on the hot path).
  a.detected_crops.forEach((c) => user.crops.add(c.toLowerCase()));
  user.history.push({ role: 'farmer', text: partial.farmerSaid || '(photo)' }, { role: 'assistant', text: a.spoken_answer });
  if (user.history.length > 20) user.history.splice(0, user.history.length - 20);

  if (!user.welcomed) {
    user.welcomed = true;
    await wa.sendLocationRequest(to, MSG.welcome[a.reply_language]).catch(() => wa.sendText(to, MSG.welcome[a.reply_language]));
  } else if (a.needs_location && !user.location) {
    await wa.sendLocationRequest(to, MSG.welcome[a.reply_language]).catch(() => {});
  }
  tr.done({ lang: a.reply_language, confidence: a.confidence, escalate: a.escalate });
}

/** Text summary first (fast), voice note second. Sent sequentially so WhatsApp keeps the order. */
async function sendReply(tr: Trace, to: string, a: BrainAnswer) {
  const voiceP = (async () => {
    const key = crypto.createHash('sha256').update(`${cfg.GNANI_TTS_MODEL}|${a.reply_language}|${a.spoken_answer}`).digest('hex');
    const cached = ttsCache.get(key);
    if (cached) { tr.skip('tts', { cacheHit: true }); return cached; }
    const wav = await tr.stage('tts', () => gnani.tts(a.spoken_answer, a.reply_language), { lang: a.reply_language });
    const ogg = await tr.stage('encode', () => wavToOggOpus(wav));
    const id = await tr.stage('upload', () => wa.uploadMedia(ogg, 'audio/ogg', 'reply.ogg'), { kb: Math.round(ogg.length / 1024) });
    ttsCache.set(key, id);
    return id;
  })();
  voiceP.catch(() => {}); // handled below

  await tr.stage('send_text', () => wa.sendText(to, a.text_summary));
  try {
    const mediaId = await voiceP;
    await tr.stage('send_voice', () => wa.sendVoice(to, mediaId));
  } catch (e) {
    console.error('voice reply failed (text already sent):', (e as Error).message);
  }
}
