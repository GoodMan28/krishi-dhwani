import 'dotenv/config';

function req(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`Missing required env var ${name} (see .env.example)`);
  return v;
}
const opt = (name: string, def: string) => process.env[name]?.trim() || def;

export const cfg = Object.freeze({
  PORT: Number(opt('PORT', '3000')),
  GRAPH_VERSION: opt('GRAPH_VERSION', 'v23.0'),
  WA_PHONE_NUMBER_ID: req('WA_PHONE_NUMBER_ID'),
  WA_ACCESS_TOKEN: req('WA_ACCESS_TOKEN'),
  WA_APP_SECRET: req('WA_APP_SECRET'),
  WA_VERIFY_TOKEN: req('WA_VERIFY_TOKEN'),
  GNANI_API_KEY: req('GNANI_API_KEY'),
  GNANI_BASE_URL: opt('GNANI_BASE_URL', 'https://api.vachana.ai'),
  GNANI_STT_MODEL: opt('GNANI_STT_MODEL', 'prisma-v3.0'),
  GNANI_TTS_MODEL: opt('GNANI_TTS_MODEL', 'timbre-v2.5'),
  TTS_SAMPLE_RATE: Number(opt('TTS_SAMPLE_RATE', '24000')),
  GEMINI_API_KEY: req('GEMINI_API_KEY'),
  GEMINI_MODEL: opt('GEMINI_MODEL', 'gemini-2.5-flash'),
  DASHBOARD_TOKEN: req('DASHBOARD_TOKEN'),
  DASHBOARD_SHOW_TEXT: opt('DASHBOARD_SHOW_TEXT', '0') === '1',
  MAX_HISTORY_TURNS: Number(opt('MAX_HISTORY_TURNS', '6')),
});
