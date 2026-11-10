// Live check of Gnani TTS + STT and Gemini, without WhatsApp. Usage: npx tsx scripts/smoke.ts
import { writeFileSync } from 'node:fs';
import { tts, stt } from '../src/clients/gnani.js';
import { ask } from '../src/clients/gemini.js';
import { wavToOggOpus } from '../src/audio.js';

const q = 'मेरे टमाटर के पत्तों पर भूरे धब्बे हो गए हैं, क्या करूँ?';
const time = async <T>(label: string, fn: () => Promise<T>) => { const s = Date.now(); const r = await fn(); console.log(`${label}: ${Date.now() - s} ms`); return r; };

const wav = await time('Gnani TTS', () => tts(q, 'hi-IN'));
const ogg = await time('ffmpeg encode', () => wavToOggOpus(wav));
writeFileSync('tmp/question.ogg', ogg);
const t = await time('Gnani STT', () => stt(ogg, 'audio/ogg'));
console.log('  transcript:', t.text, '| detected:', t.lang);
const a = await time('Gemini', () => ask({ replyLang: t.lang, crops: [], weather: 'today rain chance 70%', history: [], farmerSaid: t.text, source: 'voice' }));
console.log('  reply_language:', a.reply_language);
console.log('  spoken:', a.spoken_answer);
console.log('  summary:', a.text_summary);
