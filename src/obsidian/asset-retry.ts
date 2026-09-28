import { TransferError } from "./asset-transfer";
import type { CancellableTimer } from "../vendor/kit/cache-download";

export interface RetryProgress { attempt: number; maxAttempts: number; delayMs: number }
export interface RetryOptions {
  signal: AbortSignal;
  timer: CancellableTimer;
  maxAttempts?: number;
  random?: () => number;
  now?: () => number;
  onRetry?: (progress: RetryProgress, error: TransferError) => void;
  onWait?: (progress: RetryProgress) => void;
}

export function isTransient(error: unknown): error is TransferError {
  return error instanceof TransferError && (
    error.kind === "network" || error.kind === "timeout" || error.kind === "incomplete" ||
    (error.kind === "http" && [408, 429, 500, 502, 503, 504].includes(error.status ?? 0))
  );
}

function retryDelay(error: TransferError, attempt: number, o: RetryOptions): number {
  const jitter = 0.5 + (o.random ?? Math.random)() * 0.5;
  const backoff = Math.min(30_000, 1000 * 2 ** (attempt - 1)) * jitter;
  const header = error.retryAfter?.trim();
  if (!header) return backoff;
  const serverDelay = /^\d+$/.test(header) ? Number(header) * 1000 : Date.parse(header) - (o.now ?? Date.now)();
  return Number.isFinite(serverDelay) ? Math.max(backoff, serverDelay) : backoff;
}

async function wait(ms: number, o: RetryOptions): Promise<void> {
  if (o.signal.aborted) throw new DOMException("download aborted", "AbortError");
  let cancelTimer = (): void => {};
  let abort = (): void => {};
  try {
    await new Promise<void>((resolve, reject) => {
      abort = (): void => reject(new DOMException("download aborted", "AbortError"));
      o.signal.addEventListener("abort", abort, { once: true });
      cancelTimer = o.timer(resolve, ms);
    });
  } finally {
    cancelTimer();
    o.signal.removeEventListener("abort", abort);
  }
}

export async function retryTransfer<T>(operation: () => Promise<T>, o: RetryOptions): Promise<T> {
  const maxAttempts = o.maxAttempts ?? 4;
  for (let attempt = 1; ; attempt++) {
    if (o.signal.aborted) throw new DOMException("download aborted", "AbortError");
    try { return await operation(); }
    catch (error) {
      if (o.signal.aborted || attempt >= maxAttempts || !isTransient(error)) throw error;
      const delayMs = retryDelay(error, attempt, o);
      // Bei langem Retry-After weder vorzeitig wiederholen noch den Nutzer unbegrenzt warten lassen.
      if (delayMs > 60_000) throw error;
      const progress = { attempt: attempt + 1, maxAttempts, delayMs };
      o.onRetry?.(progress, error);
      if (!o.onWait) { await wait(delayMs, o); continue; }
      for (let remaining = delayMs; remaining > 0;) {
        o.onWait({ ...progress, delayMs: remaining });
        const step = Math.min(1000, remaining);
        await wait(step, o);
        remaining -= step;
      }
    }
  }
}
