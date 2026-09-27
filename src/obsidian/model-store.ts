// Asset-Ablage über die Cache API (Spec 0.6 §4): liegt im Electron-Profil AUSSERHALB des Vaults
// (wird nie gesynct), überlebt Neustarts, grosse Dateien werden in Byte-Bereichen fortgesetzt. Deps injizierbar → in Node
// testbar. Kein obsidian-Import.
//
// Der Streaming-Kern je Datei (tee(): ein Zweig in cache.put, einer für Bytes/Fortschritt/Hash)
// liegt seit Kit 0.27.0 zentral in obsidian-kit als pure/cache-download.ts::streamIntoCache —
// kanonische Quelle war genau dieses downloadOne (@0.4.4). Hier bleibt das Domäneneigene:
// Key-Ableitung, Manifest-Liste, Fortschritts-Hülle und das Hash-Urteil.
//
// Transport ist `activeWindow.fetch` als Member-Access — PROF-OBS-12 erlaubt das genau für den Fall
// „unvermeidbar": speicherkonstantes Streaming einer 1,7-GB-Datei in die Cache API geht nur mit
// einem ReadableStream; XHR hielte die ganze Datei im Puffer. Globales `fetch` ist gebannt
// (no-restricted-globals) und bleibt es. Der Store-Linter (npm run lint) hat 2026-08-19 bestätigt:
// Member-Access ist sauber.
import { assetUrl, cacheKey, legacyCacheKey, type AssetFile, type AssetKey } from "../core/model-manifest";
import { streamIntoCache, type CacheLike } from "../vendor/kit/cache-download";
import { retryTransfer, type RetryOptions } from "./asset-retry";
import { transferAsset, type AssetFetch } from "./asset-transfer";
import { PartialAssetStore, PARTIAL_CACHE_NAME, type PartialCache } from "./partial-assets";
import { Sha256 } from "../vendor/kit/sha256";

export const ASSET_CACHE_NAME = "local-image-generator-assets";

// Der Cache-API-Port kommt aus dem Kit-Modul und wird hier nur weitergereicht — das lokale
// Interface war byte-gleich, und tests/model-store.test.ts importiert den Typ von hier.
export type { CacheLike };

export interface StoreDeps {
  openCache: () => Promise<CacheLike>;
  fetchFn: AssetFetch;
  connectMs?: number;
  retry?: Pick<RetryOptions, "maxAttempts" | "random" | "now" | "onRetry">;
  openPartialCache?: () => Promise<PartialCache>;
  chunkBytes?: number;
  withLock?: <T>(signal: AbortSignal, operation: () => Promise<T>) => Promise<T>;
  /** Frist ohne ein einziges Byte, nach der ein Download als hängend gilt (Default 60 s). Kein
   *  Gesamt-Timeout: 2,6 GB dürfen so lange dauern, wie die Leitung braucht. */
  stallMs?: number;
  /** Timer für die Stall-Frist: stellt `fn` in `ms` ms ein und liefert eine Cancel-Funktion.
   *  Default window.setTimeout/clearTimeout (Store-Regel prefer-window-timers). */
  timer?: (fn: () => void, ms: number) => () => void;
}

export interface DownloadProgress {
  file: AssetFile;
  fileIndex: number;
  fileCount: number;
  received: number;
  total: number;
  phase: "downloading" | "verifying";
}

export class DownloadAborted extends Error {
  constructor() {
    super("download aborted");
    this.name = "DownloadAborted";
  }
}

export class IntegrityError extends Error {
  constructor(
    public readonly file: AssetFile,
    expected: string,
    actual: string,
  ) {
    super(`integrity check failed for ${file.path}: expected ${expected.slice(0, 12)}…, got ${actual.slice(0, 12)}…`);
    this.name = "IntegrityError";
  }
}

const realDeps: StoreDeps = {
  openCache: () => caches.open(ASSET_CACHE_NAME),
  openPartialCache: () => caches.open(PARTIAL_CACHE_NAME),
  withLock: async (signal, operation) => await navigator.locks.request(ASSET_CACHE_NAME, { signal }, operation),
  fetchFn: (url, init) => activeWindow.fetch(url, init),
  timer: (fn, ms) => {
    const id = window.setTimeout(fn, ms);
    return () => window.clearTimeout(id);
  },
};

const DEFAULT_STALL_MS = 60_000;
const DEFAULT_CHUNK_BYTES = 16 * 1024 * 1024;

export class ModelStore {
  constructor(private readonly deps: StoreDeps = realDeps) {}

  async cachedKeys(files: readonly AssetFile[]): Promise<AssetKey[]> {
    const cache = await this.deps.openCache();
    const keys: AssetKey[] = [];
    for (const f of files) if (await cache.match(cacheKey(f))) keys.push(f.key);
    return keys;
  }

  async isComplete(files: readonly AssetFile[]): Promise<boolean> {
    return (await this.cachedKeys(files)).length === files.length;
  }

  private locked<T>(signal: AbortSignal, operation: () => Promise<T>): Promise<T> {
    return this.deps.withLock ? this.deps.withLock(signal, operation) : operation();
  }

  /** Nur vom Nutzer gestartete Downloads nutzen diesen Pfad. Die Sperre gilt auch fuer andere Vault-Fenster. */
  async download(
    files: readonly AssetFile[],
    baseUrl: string,
    onProgress: (p: DownloadProgress) => void,
    signal: AbortSignal,
  ): Promise<void> {
    try { await this.locked(signal, () => this.downloadFiles(files, baseUrl, onProgress, signal)); }
    catch (error) { if (signal.aborted) throw new DownloadAborted(); throw error; }
  }

  private async downloadFiles(files: readonly AssetFile[], baseUrl: string, onProgress: (p: DownloadProgress) => void, signal: AbortSignal): Promise<void> {
    const cache = await this.deps.openCache();
    const cached = new Set(await this.cachedKeys(files));
    const todo = files.filter((f) => !cached.has(f.key));
    const fileCount = todo.length;
    let fileIndex = 0;
    for (const file of todo) {
      fileIndex += 1;
      const key = cacheKey(file);
      try {
        const report = (received: number, phase: DownloadProgress["phase"]): void =>
          onProgress({ file, fileIndex, fileCount, received, total: file.bytes, phase });
        if (file.bytes > (this.deps.chunkBytes ?? DEFAULT_CHUNK_BYTES)) {
          await this.downloadResumable(cache, file, assetUrl(baseUrl, file), signal, report);
        } else {
          await retryTransfer(() => this.downloadOne(cache, file, assetUrl(baseUrl, file), key, signal, report),
            { ...this.deps.retry, signal, timer: this.deps.timer ?? realDeps.timer! });
        }
      } catch (e) {
        await cache.delete(key).catch(() => false);
        if (signal.aborted || (e instanceof DOMException && e.name === "AbortError")) throw new DownloadAborted();
        throw e;
      }
    }
  }

  private async partialStore(file: AssetFile): Promise<PartialAssetStore> {
    const cache = await (this.deps.openPartialCache ?? realDeps.openPartialCache!)();
    return new PartialAssetStore(cache, file);
  }

  async retainedBytes(files: readonly AssetFile[]): Promise<number> {
    return this.locked(new AbortController().signal, async () => {
      const cached = new Set(await this.cachedKeys(files));
      let bytes = 0;
      for (const file of files) {
        if (file.bytes <= (this.deps.chunkBytes ?? DEFAULT_CHUNK_BYTES)) continue;
        const store = await this.partialStore(file);
        if (cached.has(file.key)) { await store.clear(); continue; }
        const chunks = await store.chunks();
        bytes += (chunks.at(-1)?.end ?? -1) + 1;
      }
      return bytes;
    });
  }

  async discardPartial(files: readonly AssetFile[]): Promise<void> {
    await this.locked(new AbortController().signal, async () => {
      for (const file of files) await (await this.partialStore(file)).clear();
    });
  }

  private async downloadResumable(cache: CacheLike, file: AssetFile, url: string, signal: AbortSignal,
    report: (received: number, phase: DownloadProgress["phase"]) => void): Promise<void> {
    const partial = await this.partialStore(file);
    await partial.clear(true);
    let chunks = await partial.chunks();
    let offset = (chunks.at(-1)?.end ?? -1) + 1;
    report(offset, "downloading");
    while (offset < file.bytes) {
      const start = offset;
      const end = Math.min(file.bytes - 1, start + (this.deps.chunkBytes ?? DEFAULT_CHUNK_BYTES) - 1);
      await retryTransfer(() => transferAsset({
        fetchFn: this.deps.fetchFn, timer: this.deps.timer ?? realDeps.timer!, signal, url,
        label: file.path, expectedBytes: file.bytes, range: { start, end },
        connectMs: this.deps.connectMs ?? 30_000, stallMs: this.deps.stallMs ?? DEFAULT_STALL_MS,
        onBytes: (received, whole) => report((whole ? 0 : start) + received, "downloading"),
      }, async (response) => {
        const whole = response.status === 200;
        await partial.put(whole ? 0 : start, whole ? file.bytes - 1 : end, response);
        offset = whole ? file.bytes : end + 1;
      }), { ...this.deps.retry, signal, timer: this.deps.timer ?? realDeps.timer! });
    }
    chunks = await partial.chunks();
    report(file.bytes, "verifying");
    const hasher = new Sha256();
    const reader = partial.stream(chunks, signal).getReader();
    try {
      for (;;) {
        const next = await reader.read();
        if (next.done) break;
        hasher.update(next.value);
      }
    } finally { await reader.cancel().catch(() => {}); }
    const actual = hasher.digestHex();
    if (actual !== file.sha256) {
      await partial.clear();
      throw new IntegrityError(file, file.sha256, actual);
    }
    if (signal.aborted) throw new DownloadAborted();
    // VOR dem Anlegen des nutzbaren Cache-Schluessels pruefen. Der zweite Lesedurchlauf braucht weder Netzwerk noch GB-Puffer.
    await cache.put(cacheKey(file), new Response(partial.stream(chunks, signal)));
    await partial.clear();
  }

  private async downloadOne(
    cache: CacheLike,
    file: AssetFile,
    url: string,
    key: string,
    signal: AbortSignal,
    report: (received: number, phase: DownloadProgress["phase"]) => void,
  ): Promise<void> {
    const pendingKey = `${key}/pending`;
    try {
      const hasher = new Sha256();
      const { received } = await transferAsset({
        fetchFn: this.deps.fetchFn,
        timer: this.deps.timer ?? realDeps.timer!,
        signal, url, label: file.path, expectedBytes: file.bytes,
        connectMs: this.deps.connectMs ?? 30_000,
        stallMs: this.deps.stallMs ?? DEFAULT_STALL_MS,
      }, (response) => streamIntoCache({
        cache,
        fetchFn: async () => response,
        url,
        key: pendingKey,
        signal,
        // Die Fehlertexte des Kit-Moduls nennen `label`, nicht die URL — die Tests matchen darauf.
        label: file.path,
        // Ein 206 ist hier kein Erfolg, sondern ein halber Bereich; der Kit-Default waere res.ok.
        accept: (r) => r.status === 200,
        abortError: () => new DownloadAborted(),
        onChunk: (c) => hasher.update(c),
        // Das Kit reicht als zweites Argument den content-length mit; die Gesamtanzeige haengt
        // hier am Manifest (file.bytes), nicht am Header.
        onProgress: (r) => report(r, "downloading"),
        expectedBytes: file.bytes,
      }));
      // Nach dem abgeschlossenen `put` (das steckt jetzt im Kit-Modul), nicht davor.
      report(received, "verifying");
      const actual = hasher.digestHex();
      if (actual !== file.sha256) throw new IntegrityError(file, file.sha256, actual);
      if (signal.aborted) throw new DownloadAborted();
      const verified = await cache.match(pendingKey);
      if (!verified) throw new Error(`verified asset missing: ${file.path}`);
      await cache.put(key, verified);
    } finally { await cache.delete(pendingKey); }
  }

  private async matchOrThrow(file: AssetFile): Promise<Response> {
    const cache = await this.deps.openCache();
    const res = await cache.match(cacheKey(file));
    if (!res) throw new Error(`asset not downloaded: ${file.path}`);
    return res;
  }

  async getBuffer(file: AssetFile): Promise<ArrayBuffer> {
    return (await this.matchOrThrow(file)).arrayBuffer();
  }

  async getText(file: AssetFile): Promise<string> {
    return (await this.matchOrThrow(file)).text();
  }

  async deleteAll(files: readonly AssetFile[]): Promise<void> {
    await this.locked(new AbortController().signal, async () => {
      const cache = await this.deps.openCache();
      for (const f of files) {
        await cache.delete(cacheKey(f));
        await (await this.partialStore(f)).clear();
      }
    });
  }

  /** Einmalige Cache-zu-Cache-Migration bestehender SD-Turbo-Downloads auf die
   *  modell-qualifizierten Schluessel (Ruling Task 5 aenderte `cacheKey()` — C2-Fix,
   *  Final-Review 2026-08-24). Ohne sie faende `isComplete()` die ~2,5 GB jeder
   *  Bestandsinstallation nie wieder (`cachedKeys()` prueft nur noch den NEUEN Schluessel),
   *  das Panel boete einen unnoetigen 2,5-GB-Neudownload an, und die alten Bytes blieben fuer
   *  immer verwaist im Cache (`deleteAll()` kennt ebenfalls nur die neuen Schluessel).
   *
   *  Reine Cache-zu-Cache-Operation — `cache.match`/`put`/`delete`, KEIN `fetchFn`-Aufruf, kein
   *  Byte ueber das Netz. Das haelt die strukturelle Zusage ein, dass `ModelStore.download()`
   *  (aufgerufen einzig von `startDownload()`) der einzige Ladepfad bleibt: `getBuffer()`/
   *  `getText()` gehen weiterhin ueber `matchOrThrow()`, das bei einem Fehltreffer wirft statt
   *  zu laden — diese Methode aendert nur, UNTER WELCHEM SCHLUESSEL ein bereits vorhandener
   *  Eintrag zu finden ist.
   *
   *  Idempotent: ein zweiter Aufruf findet unter dem neuen Schluessel bereits einen Treffer
   *  (`if (await cache.match(newKey)) continue`) und tut nichts mehr. Fuer Dateien ohne
   *  Modell-Praefix (aktuell nur `ort_wasm`) ist `legacyCacheKey(f) === cacheKey(f)` — der
   *  erste Guard ueberspringt sie. */
  async migrateLegacyKeys(files: readonly AssetFile[]): Promise<void> {
    const cache = await this.deps.openCache();
    for (const f of files) {
      const newKey = cacheKey(f);
      const oldKey = legacyCacheKey(f);
      if (oldKey === newKey) continue; // kein Modell-Praefix betroffen — nichts zu migrieren
      if (await cache.match(newKey)) continue; // schon migriert oder frisch heruntergeladen
      const res = await cache.match(oldKey);
      if (!res) continue; // nie heruntergeladen — nichts zu migrieren
      await cache.put(newKey, res);
      await cache.delete(oldKey);
    }
  }
}
