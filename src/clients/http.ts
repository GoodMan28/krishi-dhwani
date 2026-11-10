export class UpstreamError extends Error {
  constructor(readonly service: string, readonly status: number, body: string) {
    super(`${service} HTTP ${status}: ${body.slice(0, 300)}`);
  }
}

/** fetch with a timeout and one retry on network errors, 429 and 5xx. */
export async function fetchRetry(url: string, init: RequestInit & { timeoutMs?: number }, service: string): Promise<Response> {
  const { timeoutMs = 10_000, ...rest } = init;
  for (let attempt = 0; ; attempt++) {
    try {
      const r = await fetch(url, { ...rest, signal: AbortSignal.timeout(timeoutMs) });
      if ((r.status === 429 || r.status >= 500) && attempt === 0) {
        await new Promise((res) => setTimeout(res, r.status === 429 ? 800 : 300));
        continue;
      }
      if (!r.ok) throw new UpstreamError(service, r.status, await r.text());
      return r;
    } catch (e) {
      if (e instanceof UpstreamError || attempt > 0) throw e;
      await new Promise((res) => setTimeout(res, 300));
    }
  }
}
