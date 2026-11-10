import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cfg } from './config.js';
import { verifySignature, parseWebhook } from './webhook.js';
import { enqueue } from './pipeline.js';
import { bus, recentTraces, stats, type TraceEvent } from './trace.js';

const app = express();
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

app.get('/healthz', (_req, res) => { res.json({ ok: true }); });

// Meta webhook verification handshake
app.get('/webhook', (req, res) => {
  if (req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === cfg.WA_VERIFY_TOKEN) {
    console.log('Webhook verified by Meta');
    res.status(200).type('text/plain').send(String(req.query['hub.challenge'] ?? ''));
  } else {
    console.warn('Webhook verification failed: verify token mismatch');
    res.sendStatus(403);
  }
});

// Incoming WhatsApp events: verify signature, ACK immediately, process in the background.
app.post('/webhook', express.raw({ type: '*/*', limit: '2mb' }), (req, res) => {
  const raw = req.body as Buffer;
  if (!verifySignature(raw, req.get('x-hub-signature-256'), cfg.WA_APP_SECRET)) {
    console.warn('Rejected webhook: bad signature (check WA_APP_SECRET)');
    res.sendStatus(401);
    return;
  }
  res.sendStatus(200);
  try {
    for (const m of parseWebhook(JSON.parse(raw.toString('utf8')))) enqueue(m);
  } catch (e) {
    console.error('Bad webhook payload', e);
  }
});

// ---- Live dashboard ----
const authed = (req: express.Request) => req.query.token === cfg.DASHBOARD_TOKEN;

app.get('/dashboard', (req, res) => {
  if (!authed(req)) { res.status(403).send('Add ?token=<DASHBOARD_TOKEN> to the URL'); return; }
  res.sendFile(path.join(root, 'public', 'dashboard.html'));
});

app.get('/api/stats', (req, res) => {
  if (!authed(req)) { res.sendStatus(403); return; }
  res.json(stats());
});

app.get('/events', (req, res) => {
  if (!authed(req)) { res.sendStatus(403); return; }
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.write(`event: snapshot\ndata: ${JSON.stringify(recentTraces(30))}\n\n`);
  const onTrace = (ev: TraceEvent) => res.write(`event: trace\ndata: ${JSON.stringify(ev)}\n\n`);
  bus.on('trace', onTrace);
  const hb = setInterval(() => res.write(': ping\n\n'), 15000);
  req.on('close', () => { bus.off('trace', onTrace); clearInterval(hb); });
});

app.listen(cfg.PORT, () => {
  console.log(`Krishi Dhwani listening on http://localhost:${cfg.PORT}`);
  console.log(`Dashboard: http://localhost:${cfg.PORT}/dashboard?token=<DASHBOARD_TOKEN>`);
  // Warm TLS connections to the services on the hot path.
  for (const u of ['https://graph.facebook.com', cfg.GNANI_BASE_URL, 'https://generativelanguage.googleapis.com']) {
    fetch(u, { method: 'HEAD', signal: AbortSignal.timeout(3000) }).catch(() => {});
  }
});
