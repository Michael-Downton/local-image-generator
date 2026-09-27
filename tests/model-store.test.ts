import { describe, expect, it } from "vitest";
import { cacheKey, legacyCacheKey, type AssetFile } from "../src/core/model-manifest";
import { sha256Hex } from "../src/vendor/kit/sha256";
import { DownloadAborted, IntegrityError, ModelStore, type CacheLike, type StoreDeps } from "../src/obsidian/model-store";

function fakeCache(): CacheLike & { map: Map<string, Uint8Array> } {
  const map = new Map<string, Uint8Array>();
  return {
    map,
    async match(key) {
      const v = map.get(key);
      return v ? new Response(v as unknown as BodyInit) : undefined;
    },
    async put(key, res) {
      map.set(key, new Uint8Array(await res.arrayBuffer()));
    },
    async delete(key) {
      return map.delete(key);
    },
  };
}

function bytesOf(n: number, seed = 1): Uint8Array {
  const b = new Uint8Array(n);
  for (let i = 0; i < n; i++) b[i] = (i * seed + 3) & 0xff;
  return b;
}

function fileWith(key: AssetFile["key"], data: Uint8Array, sha = sha256Hex(data)): AssetFile {
  return { key, path: `sd-turbo/${key}/model.onnx`, bytes: data.length, sha256: sha, kind: "onnx" };
}

/** Antwort als Stream in Chunks; `delayMs` simuliert Netzpausen. */
function streamResponse(data: Uint8Array, chunk = 7, status = 200): Response {
  let off = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(ctrl) {
      if (off >= data.length) return ctrl.close();
      ctrl.enqueue(data.slice(off, off + chunk));
      off += chunk;
    },
  });
  return new Response(body, { status, headers: { "content-length": String(data.length) } });
}

const timer: StoreDeps["timer"] = (fn, ms) => {
  const id = setTimeout(fn, ms);
  return () => clearTimeout(id);
};
function deps(cache: CacheLike, fetchFn: StoreDeps["fetchFn"]): StoreDeps {
  return { openCache: async () => cache, fetchFn, timer };
}

describe("ModelStore", () => {
  it("lädt fehlende Dateien, meldet Fortschritt je Chunk und legt sie unter dem cacheKey ab", async () => {
    const a = bytesOf(20), b = bytesOf(33, 5);
    const files = [fileWith("text_encoder", a), fileWith("unet", b)];
    const cache = fakeCache();
    const urls: string[] = [];
    const store = new ModelStore(deps(cache, async (url) => { urls.push(url); return streamResponse(url.includes("unet") ? b : a); }));
    const progress: string[] = [];
    await store.download(files, "http://127.0.0.1:7862/", (p) => progress.push(`${p.file.key}:${p.phase}:${p.received}/${p.total}:${p.fileIndex}/${p.fileCount}`), new AbortController().signal);
    expect(urls).toEqual(["http://127.0.0.1:7862/sd-turbo/text_encoder/model.onnx", "http://127.0.0.1:7862/sd-turbo/unet/model.onnx"]);
    expect(cache.map.get(cacheKey(files[0]!))).toEqual(a);
    expect(cache.map.get(cacheKey(files[1]!))).toEqual(b);
    expect(progress.filter((p) => p.startsWith("text_encoder:downloading")).length).toBeGreaterThanOrEqual(2);
    expect(progress).toContain("text_encoder:downloading:20/20:1/2");
    expect(progress).toContain("text_encoder:verifying:20/20:1/2");
    expect(progress[progress.length - 1]).toBe("unet:verifying:33/33:2/2");
    expect(await store.isComplete(files)).toBe(true);
    expect(new Uint8Array(await store.getBuffer(files[1]!))).toEqual(b);
  });

  it("überspringt bereits gecachte Dateien (kein fetch) und meldet cachedKeys", async () => {
    const a = bytesOf(10);
    const f = fileWith("vocab", a);
    const cache = fakeCache();
    cache.map.set(cacheKey(f), a);
    let calls = 0;
    const store = new ModelStore(deps(cache, async () => { calls++; return streamResponse(a); }));
    expect(await store.cachedKeys([f])).toEqual(["vocab"]);
    await store.download([f], "http://x", () => {}, new AbortController().signal);
    expect(calls).toBe(0);
  });

  it("Hash-Mismatch: IntegrityError mit Datei, Cache-Eintrag wieder gelöscht", async () => {
    const a = bytesOf(50);
    const f = fileWith("unet", a, "0".repeat(64));
    const cache = fakeCache();
    const store = new ModelStore(deps(cache, async () => streamResponse(a)));
    await expect(store.download([f], "http://x", () => {}, new AbortController().signal)).rejects.toBeInstanceOf(IntegrityError);
    expect(cache.map.has(cacheKey(f))).toBe(false);
    expect(await store.isComplete([f])).toBe(false);
  });

  it("Abbruch per AbortSignal: DownloadAborted, angefangene Datei nicht im Cache, fertige bleibt", async () => {
    const a = bytesOf(10), b = bytesOf(1000, 3);
    const files = [fileWith("text_encoder", a), fileWith("unet", b)];
    const cache = fakeCache();
    const ac = new AbortController();
    const store = new ModelStore(deps(cache, async (url, init) => {
      if (!url.includes("unet")) return streamResponse(a);
      let off = 0;
      const body = new ReadableStream<Uint8Array>({
        pull(ctrl) {
          if (init.signal.aborted) return ctrl.error(new DOMException("aborted", "AbortError"));
          if (off >= b.length) return ctrl.close();
          ctrl.enqueue(b.slice(off, off + 100)); off += 100;
        },
      });
      return new Response(body, { status: 200 });
    }));
    const p = store.download(files, "http://x", (pr) => { if (pr.file.key === "unet" && pr.received >= 200) ac.abort(); }, ac.signal);
    await expect(p).rejects.toBeInstanceOf(DownloadAborted);
    expect(cache.map.has(cacheKey(files[0]!))).toBe(true);
    expect(cache.map.has(cacheKey(files[1]!))).toBe(false);
  });

  it("HTTP ≠ 200: Error mit Status und Pfad", async () => {
    const f = fileWith("merges", bytesOf(5));
    const store = new ModelStore(deps(fakeCache(), async () => streamResponse(new Uint8Array(0), 7, 404)));
    await expect(store.download([f], "http://x", () => {}, new AbortController().signal)).rejects.toThrow(/404.*sd-turbo\/merges/);
  });

  it("Inaktivität über die Frist ohne Byte → Error 'stalled', Teil-Download nicht im Cache", async () => {
    const f = fileWith("merges", bytesOf(50));
    const cache = fakeCache();
    const store = new ModelStore({
      openCache: async () => cache,
      fetchFn: async () => {
        // Ein Chunk, dann Stille: der Stream schließt nie — die Stall-Frist muss greifen.
        const body = new ReadableStream<Uint8Array>({ start(ctrl) { ctrl.enqueue(bytesOf(10)); } });
        return new Response(body, { status: 200 });
      },
      stallMs: 30,
      retry: { maxAttempts: 1 },
      timer,
    });
    await expect(store.download([f], "http://x", () => {}, new AbortController().signal)).rejects.toThrow(/stalled/);
    expect(cache.map.has(cacheKey(f))).toBe(false);
  });

  it("Stall-Timer: je Datei genau ein aktiver Timer, der nach jedem Chunk neu gestellt und am Ende abgeräumt wird (kein Leak)", async () => {
    const a = bytesOf(700); // 100 Chunks à 7 Byte
    const f = fileWith("unet", a);
    let armed = 0, cancelled = 0, live = 0, maxLive = 0;
    const countingTimer: StoreDeps["timer"] = (fn, ms) => {
      armed++; live++; maxLive = Math.max(maxLive, live);
      const id = setTimeout(fn, ms);
      return () => { clearTimeout(id); live--; cancelled++; };
    };
    const store = new ModelStore({ openCache: async () => fakeCache(), fetchFn: async () => streamResponse(a), timer: countingTimer });
    await store.download([f], "http://x", () => {}, new AbortController().signal);
    expect(armed).toBeGreaterThan(50);
    expect(maxLive).toBe(1);
    expect(live).toBe(0);
    expect(cancelled).toBe(armed);
  });

  // C2 (Final-Review, 2026-08-24): Ruling Task 5 qualifizierte cacheKey() modell-spezifisch
  // (`${modelId}/${key}`). SD-Turbos fuenf Eintraege liegen bei einer Bestandsinstallation
  // aber noch unter dem ALTEN, flachen Schluessel (`legacyCacheKey`) — ohne Migration faende
  // isComplete() sie nie wieder, und das Panel boete einen unnoetigen 2,5-GB-Neudownload an.
  // Dieser Test legt Bytes NUR unter dem legacy-Schluessel ab (kein cache.put unter dem neuen
  // Schluessel — genau der Bestandszustand) und beweist zwei Dinge:
  //   1. NACH migrateLegacyKeys() findet isComplete() die Datei — vorher (ungetestet hier, aber
  //      strukturell zwingend: cachedKeys() prueft ausschliesslich cacheKey()) waere das false.
  //   2. Kein einziger fetch-Aufruf: fetchFn wirft sofort, wenn es je aufgerufen wuerde — die
  //      Migration ist reines cache.match/put/delete, kein zweiter Ladepfad neben download().
  it("migrateLegacyKeys findet einen legacy-keyed Eintrag wieder — ohne jeden fetch", async () => {
    const data = bytesOf(40);
    const f: AssetFile = { key: "sd-turbo/unet", path: "sd-turbo/unet/model.onnx", bytes: data.length, sha256: sha256Hex(data), kind: "onnx" };
    const cache = fakeCache();
    cache.map.set(legacyCacheKey(f), data); // Bestandszustand VOR Ruling Task 5
    let fetchCalls = 0;
    const store = new ModelStore(deps(cache, async () => { fetchCalls++; throw new Error("darf nie gerufen werden — Migration ist cache-only"); }));

    // Vor der Migration: unter dem NEUEN Schluessel ist nichts zu finden — das ist der Defekt,
    // den C2 beschreibt (isComplete() misst dort und boete einen Neudownload an).
    expect(await store.isComplete([f])).toBe(false);

    await store.migrateLegacyKeys([f]);

    expect(await store.isComplete([f])).toBe(true);
    expect(new Uint8Array(await store.getBuffer(f))).toEqual(data);
    expect(cache.map.has(cacheKey(f))).toBe(true);
    expect(cache.map.has(legacyCacheKey(f))).toBe(false); // alter Eintrag weggeraeumt, kein Leak
    expect(fetchCalls).toBe(0);
  });

  it("migrateLegacyKeys ist idempotent und ruehrt Dateien ohne Modell-Praefix nicht an", async () => {
    const data = bytesOf(12);
    // ort_wasm hat keinen "${modelId}/"-Praefix — legacyCacheKey === cacheKey, nichts zu tun.
    const wasm: AssetFile = { key: "ort_wasm", path: "runtime/ort-wasm.wasm", bytes: data.length, sha256: sha256Hex(data), kind: "wasm" };
    const unet: AssetFile = { key: "sd-turbo/unet", path: "sd-turbo/unet/model.onnx", bytes: data.length, sha256: sha256Hex(data), kind: "onnx" };
    const cache = fakeCache();
    cache.map.set(cacheKey(wasm), data); // bereits am NEUEN (= einzigen) Schluessel
    cache.map.set(cacheKey(unet), data); // schon migriert (z. B. Neuinstallation)
    let fetchCalls = 0;
    const store = new ModelStore(deps(cache, async () => { fetchCalls++; throw new Error("darf nie gerufen werden"); }));

    await store.migrateLegacyKeys([wasm, unet]);
    await store.migrateLegacyKeys([wasm, unet]); // zweiter Aufruf: nichts mehr zu tun

    expect(cache.map.size).toBe(2);
    expect(cache.map.has(cacheKey(wasm))).toBe(true);
    expect(cache.map.has(cacheKey(unet))).toBe(true);
    expect(fetchCalls).toBe(0);
  });

  it("deleteAll entfernt alle Keys der Liste", async () => {
    const a = bytesOf(3), b = bytesOf(4);
    const files = [fileWith("vocab", a), fileWith("merges", b)];
    const cache = fakeCache();
    for (const [f, d] of [[files[0]!, a], [files[1]!, b]] as const) cache.map.set(cacheKey(f), d);
    const store = new ModelStore(deps(cache, async () => streamResponse(a)));
    await store.deleteAll(files);
    expect(cache.map.size).toBe(0);
    expect(await store.cachedKeys(files)).toEqual([]);
  });
});
