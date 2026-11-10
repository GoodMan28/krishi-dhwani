import { cfg } from '../config.js';
import { fetchRetry } from './http.js';

const BASE = `https://graph.facebook.com/${cfg.GRAPH_VERSION}`;
const auth = { Authorization: `Bearer ${cfg.WA_ACCESS_TOKEN}` };

async function post(body: Record<string, unknown>) {
  const r = await fetchRetry(`${BASE}/${cfg.WA_PHONE_NUMBER_ID}/messages`, {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', ...body }),
    timeoutMs: 8000,
  }, 'whatsapp');
  return r.json() as Promise<unknown>;
}

export async function downloadMedia(mediaId: string): Promise<{ buf: Buffer; mime: string }> {
  const meta = await (await fetchRetry(`${BASE}/${mediaId}`, { headers: auth, timeoutMs: 6000 }, 'whatsapp_media')).json() as { url: string; mime_type: string };
  const r = await fetchRetry(meta.url, { headers: auth, timeoutMs: 15000 }, 'whatsapp_download');
  return { buf: Buffer.from(await r.arrayBuffer()), mime: meta.mime_type };
}

export async function uploadMedia(buf: Buffer, mime: string, filename: string): Promise<string> {
  const form = new FormData();
  form.append('messaging_product', 'whatsapp');
  form.append('type', mime);
  form.append('file', new Blob([new Uint8Array(buf)], { type: mime }), filename);
  const r = await fetchRetry(`${BASE}/${cfg.WA_PHONE_NUMBER_ID}/media`, { method: 'POST', headers: auth, body: form, timeoutMs: 15000 }, 'whatsapp_upload');
  return ((await r.json()) as { id: string }).id;
}

export const sendText = (to: string, body: string) => post({ to, type: 'text', text: { body: body.slice(0, 4096) } });

export async function sendVoice(to: string, mediaId: string) {
  try {
    return await post({ to, type: 'audio', audio: { id: mediaId, voice: true } });
  } catch (e) {
    // Older API versions reject the `voice` flag; an OGG/Opus file still plays inline without it.
    if (String(e).includes('400')) return post({ to, type: 'audio', audio: { id: mediaId } });
    throw e;
  }
}

export const react = (to: string, messageId: string, emoji: string) =>
  post({ recipient_type: 'individual', to, type: 'reaction', reaction: { message_id: messageId, emoji } });

export async function markReadTyping(messageId: string) {
  try {
    return await post({ status: 'read', message_id: messageId, typing_indicator: { type: 'text' } });
  } catch {
    return post({ status: 'read', message_id: messageId });
  }
}

export const sendLocationRequest = (to: string, text: string) =>
  post({ to, type: 'interactive', interactive: { type: 'location_request_message', body: { text }, action: { name: 'send_location' } } });
