import { cfg } from '../config.js';
import { LANGS, V3_VOICE, normalizeLang, type LangCode } from '../languages.js';
import { fetchRetry, UpstreamError } from './http.js';

export class NoSpeechError extends Error {}

/** Gnani Prisma STT. Sends the WhatsApp OGG as-is (Prisma accepts OGG), so no inbound transcoding. */
export async function stt(audio: Buffer, mime: string, lang: LangCode | 'indic-auto' = 'indic-auto') {
  const form = new FormData();
  form.append('audio_file', new Blob([new Uint8Array(audio)], { type: mime.split(';')[0] }), 'note.ogg');
  form.append('model', cfg.GNANI_STT_MODEL);
  form.append('language_code', lang === 'hi-en' ? 'en-IN' : lang);
  const r = await fetchRetry(`${cfg.GNANI_BASE_URL}/stt/v3`, {
    method: 'POST', headers: { 'X-API-Key-ID': cfg.GNANI_API_KEY }, body: form, timeoutMs: 12000,
  }, 'gnani_stt');
  const j = await r.json() as { transcript?: string; detected_language_code?: string; request_id?: string };
  const text = (j.transcript ?? '').trim();
  if (!text) throw new NoSpeechError('empty transcript');
  return { text, lang: normalizeLang(j.detected_language_code, lang === 'indic-auto' ? 'hi-IN' : lang), requestId: j.request_id };
}

let sampleRate = cfg.TTS_SAMPLE_RATE;

/** Gnani Timbre TTS → WAV bytes. */
export async function tts(text: string, lang: LangCode): Promise<Buffer> {
  const v3 = cfg.GNANI_TTS_MODEL.startsWith('timbre-v3');
  const info = LANGS[lang];
  const call = (rate: number) => fetchRetry(`${cfg.GNANI_BASE_URL}/api/v1/tts/inference`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-Key-ID': cfg.GNANI_API_KEY },
    body: JSON.stringify({
      text,
      voice: v3 ? V3_VOICE : info.voice,
      model: cfg.GNANI_TTS_MODEL,
      language: v3 && lang === 'hi-en' ? 'hi-IN' : info.ttsLang,
      speed: 1.0,
      audio_config: { sample_rate: rate, num_channels: 1, sample_width: 2, encoding: 'linear_pcm', container: 'wav' },
    }),
    timeoutMs: 15000,
  }, 'gnani_tts');
  try {
    return Buffer.from(await (await call(sampleRate)).arrayBuffer());
  } catch (e) {
    // The docs' example uses 48 kHz; if our smaller rate is rejected, switch permanently.
    if (e instanceof UpstreamError && e.status === 400 && sampleRate !== 48000) {
      console.warn(`TTS rejected sample_rate=${sampleRate}, retrying at 48000`);
      sampleRate = 48000;
      return Buffer.from(await (await call(sampleRate)).arrayBuffer());
    }
    throw e;
  }
}
