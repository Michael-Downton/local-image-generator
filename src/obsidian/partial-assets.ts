import type { AssetFile } from "../core/model-manifest";
import type { CacheLike } from "../vendor/kit/cache-download";

export const PARTIAL_CACHE_NAME = "local-image-generator-partials-v1";
export interface PartialCache extends CacheLike { keys(): Promise<readonly Request[]> }
export interface AssetChunk { key: string; start: number; end: number }

/** Ein vollstaendig gespeicherter Cache-Eintrag sichert den Fortschritt: Kein separater Index kann den Daten vorauseilen.
 * Teil-Dateien liegen getrennt vom Cache nutzbarer Modelle. Der vollstaendige Manifest-Hash und die Laenge
 * identifizieren sie unabhaengig von ablaufenden CDN-URLs oder dem gewaehlten Spiegelserver. */
export class PartialAssetStore {
  private readonly family: string;
  private readonly prefix: string;
  constructor(private readonly cache: PartialCache, private readonly file: AssetFile) {
    this.family = `https://lig-partial.invalid/${encodeURIComponent(file.key)}/`;
    this.prefix = `${this.family}${file.sha256}/${file.bytes}/`;
  }

  async chunks(): Promise<AssetChunk[]> {
    const candidates: AssetChunk[] = [];
    for (const request of await this.cache.keys()) {
      const key = request.url;
      if (!key.startsWith(this.prefix)) continue;
      const match = /^(\d+)-(\d+)$/.exec(key.slice(this.prefix.length));
      const start = Number(match?.[1]), end = Number(match?.[2]);
      if (!match || !Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || end >= this.file.bytes) {
        await this.cache.delete(key);
      } else candidates.push({ key, start, end });
    }
    candidates.sort((a, b) => a.start - b.start || b.end - a.end);
    const chunks: AssetChunk[] = [];
    let next = 0;
    for (const chunk of candidates) {
      if (chunk.start !== next) { await this.cache.delete(chunk.key); continue; }
      chunks.push(chunk);
      next = chunk.end + 1;
    }
    return chunks;
  }

  async put(start: number, end: number, response: Response): Promise<void> {
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || end >= this.file.bytes) {
      throw new Error("invalid partial asset bounds");
    }
    const key = `${this.prefix}${start}-${end}`;
    // Cache.put lehnt 206-Antworten ab; der gepruefte Bereich steht deshalb im Cache-Schluessel.
    // Der Eintrag wird erst gespeichert, wenn der begrenzte Transport-Stream EOF fehlerfrei erreicht.
    await this.cache.put(key, new Response(response.body, { headers: { "content-type": "application/octet-stream" } }));
  }

  async clear(obsoleteOnly = false): Promise<void> {
    for (const request of await this.cache.keys()) {
      if (request.url.startsWith(this.family) && (!obsoleteOnly || !request.url.startsWith(this.prefix))) {
        await this.cache.delete(request.url);
      }
    }
  }

  /** Mit Rueckstau jeweils einen Teil lesen; weder Zusammenfuehren noch Hashen braucht einen GB-Puffer. */
  stream(chunks: readonly AssetChunk[], signal: AbortSignal): ReadableStream<Uint8Array> {
    const cache = this.cache;
    let index = 0;
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    let received = 0;
    return new ReadableStream<Uint8Array>({
      async pull(target) {
        try {
          if (signal.aborted) throw new DOMException("download aborted", "AbortError");
          for (;;) {
            const chunk = chunks[index];
            if (!chunk) { target.close(); return; }
            if (!reader) {
              const response = await cache.match(chunk.key);
              if (!response?.body) throw new Error("partial asset missing; resume download again");
              reader = response.body.getReader();
              received = 0;
            }
            const next = await reader.read();
            if (signal.aborted) throw new DOMException("download aborted", "AbortError");
            if (next.done) {
              if (received !== chunk.end - chunk.start + 1) throw new Error("partial asset size mismatch; discard download and retry");
              reader.releaseLock(); reader = undefined; index++;
            } else {
              received += next.value.byteLength;
              if (received > chunk.end - chunk.start + 1) throw new Error("partial asset exceeds expected size");
              target.enqueue(next.value); return;
            }
          }
        } catch (error) { void reader?.cancel().catch(() => {}); target.error(error); }
      },
      cancel() { void reader?.cancel().catch(() => {}); },
    }, { highWaterMark: 0 });
  }
}
