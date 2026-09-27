import type { CancellableTimer } from "../vendor/kit/cache-download";

export type AssetFetch = (url: string, init: { signal: AbortSignal; headers?: HeadersInit }) => Promise<Response>;
export type TransferFailure = "network" | "timeout" | "incomplete" | "http" | "protocol";

/** Nur Transportfehler kommen fuer Wiederholungen infrage; Cache- und Pruefsummenfehler nicht. */
export class TransferError extends Error {
  constructor(
    public readonly kind: TransferFailure,
    message: string,
    public readonly status?: number,
    public readonly retryAfter?: string | null,
  ) { super(message); this.name = "TransferError"; }
}

export interface TransferOptions {
  fetchFn: AssetFetch;
  timer: CancellableTimer;
  signal: AbortSignal;
  url: string;
  label: string;
  expectedBytes: number;
  stallMs: number;
  connectMs: number;
  /** Byte-Bereich mit inklusiven Grenzen innerhalb von expectedBytes laut Manifest. Bei 200 wird die ganze Datei geladen. */
  range?: { start: number; end: number };
}

function responseBytes(o: TransferOptions, response: Response): number {
  if (response.status === 200) return o.expectedBytes;
  if (response.status !== 206 || !o.range) {
    throw new TransferError("http", `download failed: HTTP ${response.status} for ${o.label}`, response.status, response.headers.get("retry-after"));
  }
  const match = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(response.headers.get("content-range") ?? "");
  const encoding = response.headers.get("content-encoding");
  if (!match || Number(match[1]) !== o.range.start || Number(match[2]) !== o.range.end ||
    Number(match[3]) !== o.expectedBytes || (encoding !== null && encoding !== "identity")) {
    throw new TransferError("protocol", `invalid download byte range for ${o.label}`);
  }
  return o.range.end - o.range.start + 1;
}

/** Die Anfrage bis zum Ende des Einlesens verwalten, einschliesslich Abbruch bei wartenden Lesezugriffen.
 * Das bestehende Kit uebernimmt weiterhin das Streaming in die Cache API und das Rueckgaengigmachen fehlgeschlagener Schreibvorgaenge. */
export async function transferAsset<T>(o: TransferOptions, consume: (response: Response) => Promise<T>): Promise<T> {
  if (o.range && (!Number.isSafeInteger(o.range.start) || !Number.isSafeInteger(o.range.end) ||
    o.range.start < 0 || o.range.end < o.range.start || o.range.end >= o.expectedBytes)) {
    throw new TransferError("protocol", `invalid requested byte range for ${o.label}`);
  }
  const controller = new AbortController();
  const abort = (): void => controller.abort();
  o.signal.addEventListener("abort", abort, { once: true });
  if (o.signal.aborted) controller.abort();

  const network = async <V>(operation: () => Promise<V>, ms: number, phase: string): Promise<V> => {
    if (controller.signal.aborted) throw new DOMException("download aborted", "AbortError");
    let cancelTimer = (): void => {};
    let cancelWait = (): void => {};
    const deadline = new Promise<never>((_resolve, reject) => {
      cancelWait = (): void => reject(new DOMException("download aborted", "AbortError"));
      controller.signal.addEventListener("abort", cancelWait, { once: true });
      cancelTimer = o.timer(() => {
        reject(new TransferError("timeout", `download ${phase} for ${o.label}`));
        controller.abort();
      }, ms);
    });
    try {
      return await Promise.race([operation(), deadline]);
    } catch (error) {
      if (error instanceof TransferError || controller.signal.aborted) throw error;
      throw new TransferError("network", `download connection interrupted for ${o.label}`);
    } finally {
      cancelTimer();
      controller.signal.removeEventListener("abort", cancelWait);
    }
  };

  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    const response = await network(() => o.fetchFn(o.url, {
      signal: controller.signal,
      ...(o.range ? { headers: { Range: `bytes=${o.range.start}-${o.range.end}` } } : {}),
    }), o.connectMs, "connection timed out");
    let expected: number;
    try { expected = responseBytes(o, response); }
    catch (error) { void response.body?.cancel().catch(() => {}); throw error; }
    if (!response.body) {
      throw new TransferError("http", `download failed: HTTP ${response.status} for ${o.label}`, response.status, response.headers.get("retry-after"));
    }
    reader = response.body.getReader();
    const source = reader;
    let received = 0;
    const body = new ReadableStream<Uint8Array>({
      async pull(target) {
        try {
          const next = await network(() => source.read(), o.stallMs, "stalled");
          if (next.done) {
            if (received !== expected) throw new TransferError("incomplete", `download incomplete for ${o.label} (${received}/${expected} bytes)`);
            target.close();
          } else {
            received += next.value.byteLength;
            if (received > expected) throw new TransferError("protocol", `download exceeds expected size for ${o.label}`);
            target.enqueue(next.value);
          }
        } catch (error) { target.error(error); }
      },
      cancel() { controller.abort(); void source.cancel().catch(() => {}); },
    }, { highWaterMark: 0 });
    return await consume(new Response(body, { status: response.status, headers: response.headers }));
  } finally {
    o.signal.removeEventListener("abort", abort);
    controller.abort();
    void reader?.cancel().catch(() => {});
  }
}
