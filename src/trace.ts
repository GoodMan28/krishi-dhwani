import { EventEmitter } from 'node:events';
import { performance } from 'node:perf_hooks';

export type Stage =
  | 'received' | 'profile' | 'download' | 'stt' | 'weather' | 'llm'
  | 'send_text' | 'tts' | 'encode' | 'upload' | 'send_voice' | 'done' | 'error';

export interface TraceEvent {
  traceId: string;
  user: string;
  kind: string;
  stage: Stage;
  status: 'start' | 'ok' | 'fail' | 'skip';
  t: number;        // ms since the trace started
  ms?: number;      // stage duration
  meta?: Record<string, string | number | boolean>;
}

export const bus = new EventEmitter();
bus.setMaxListeners(100);

/** Last 200 traces, newest last, for dashboard snapshots and stats. */
const ring: { id: string; events: TraceEvent[] }[] = [];
export function recentTraces(n = 50) { return ring.slice(-n); }

export function maskPhone(p: string): string {
  return p.length <= 5 ? '•••' : `${p.slice(0, 2)}${'•'.repeat(Math.max(3, p.length - 5))}${p.slice(-3)}`;
}

export class Trace {
  private t0 = performance.now();
  private rec: { id: string; events: TraceEvent[] };
  readonly user: string;

  constructor(readonly id: string, from: string, readonly kind: string) {
    this.user = maskPhone(from);
    this.rec = { id, events: [] };
    ring.push(this.rec);
    if (ring.length > 200) ring.shift();
    this.emit('received', 'ok');
  }

  private now() { return Math.round(performance.now() - this.t0); }

  emit(stage: Stage, status: TraceEvent['status'], ms?: number, meta?: TraceEvent['meta']) {
    const ev: TraceEvent = { traceId: this.id, user: this.user, kind: this.kind, stage, status, t: this.now(), ms, meta };
    this.rec.events.push(ev);
    bus.emit('trace', ev);
  }

  async stage<T>(stage: Stage, fn: () => Promise<T>, meta?: TraceEvent['meta']): Promise<T> {
    const s = performance.now();
    this.emit(stage, 'start', undefined, meta);
    try {
      const r = await fn();
      this.emit(stage, 'ok', Math.round(performance.now() - s), meta);
      return r;
    } catch (e) {
      this.emit(stage, 'fail', Math.round(performance.now() - s), { error: String((e as Error).message).slice(0, 120) });
      throw e;
    }
  }

  skip(stage: Stage, meta?: TraceEvent['meta']) { this.emit(stage, 'skip', 0, meta); }
  done(meta?: TraceEvent['meta']) { this.emit('done', 'ok', this.now(), meta); }
}

/** p50/p95 per stage over recent traces. */
export function stats() {
  const per: Record<string, number[]> = {};
  const langs: Record<string, number> = {};
  let errors = 0;
  for (const tr of ring) {
    for (const e of tr.events) {
      if (e.status === 'ok' && e.ms !== undefined) (per[e.stage] ??= []).push(e.ms);
      if (e.stage === 'error') errors++;
      if (e.stage === 'done' && typeof e.meta?.lang === 'string') langs[e.meta.lang] = (langs[e.meta.lang] ?? 0) + 1;
    }
  }
  const pct = (a: number[], p: number) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))] ?? 0; };
  const stages = Object.fromEntries(Object.entries(per).map(([k, v]) => [k, { p50: pct(v, 0.5), p95: pct(v, 0.95), n: v.length }]));
  return { requests: ring.length, errors, langs, stages };
}
