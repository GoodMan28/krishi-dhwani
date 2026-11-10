import crypto from 'node:crypto';

export type InboundMessage =
  | { kind: 'audio'; id: string; from: string; mediaId: string; mime: string }
  | { kind: 'image'; id: string; from: string; mediaId: string; mime: string; caption?: string }
  | { kind: 'text'; id: string; from: string; body: string }
  | { kind: 'location'; id: string; from: string; lat: number; lon: number; label?: string }
  | { kind: 'unsupported'; id: string; from: string; type: string };

export function verifySignature(rawBody: Buffer, header: string | undefined, appSecret: string): boolean {
  if (!header) return false;
  const expected = 'sha256=' + crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex');
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

interface RawMsg {
  id: string; from: string; type: string;
  audio?: { id: string; mime_type: string };
  voice?: { id: string; mime_type: string };
  image?: { id: string; mime_type: string; caption?: string };
  text?: { body: string };
  location?: { latitude: number; longitude: number; name?: string; address?: string };
}

/** Extract messages from a WhatsApp Cloud API webhook body. Status receipts are ignored. */
export function parseWebhook(body: unknown): InboundMessage[] {
  const out: InboundMessage[] = [];
  const entries = (body as { entry?: { changes?: { value?: { messages?: RawMsg[] } }[] }[] })?.entry ?? [];
  for (const e of entries) for (const c of e.changes ?? []) for (const m of c.value?.messages ?? []) {
    const base = { id: m.id, from: m.from };
    const audio = m.audio ?? m.voice;
    if ((m.type === 'audio' || m.type === 'voice') && audio) out.push({ ...base, kind: 'audio', mediaId: audio.id, mime: audio.mime_type });
    else if (m.type === 'image' && m.image) out.push({ ...base, kind: 'image', mediaId: m.image.id, mime: m.image.mime_type, caption: m.image.caption });
    else if (m.type === 'text' && m.text) out.push({ ...base, kind: 'text', body: m.text.body });
    else if (m.type === 'location' && m.location) out.push({ ...base, kind: 'location', lat: m.location.latitude, lon: m.location.longitude, label: m.location.name ?? m.location.address });
    else out.push({ ...base, kind: 'unsupported', type: m.type });
  }
  return out;
}
