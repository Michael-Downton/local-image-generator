import { describe, expect, it, vi } from "vitest";
import { ModelStore, IntegrityError, DownloadAborted, type StoreDeps } from "../src/obsidian/model-store";
import { cacheKey, type AssetFile } from "../src/core/model-manifest";
import { sha256Hex } from "../src/vendor/kit/sha256";
import { assetCache } from "./helpers/asset-cache";

const data = new TextEncoder().encode("abcdefghijkl");
const file: AssetFile = { key: "sd-turbo/unet", path: "unet.onnx", bytes: data.length, sha256: sha256Hex(data), kind: "onnx" };
function fixture() {
  const cache = assetCache(), partial = assetCache();
  const ranges: string[] = [];
  const fetchFn: StoreDeps["fetchFn"] = async (_url, init) => {
    const range = new Headers(init.headers).get("range")!;
    ranges.push(range);
    const [start, end] = range.slice(6).split("-").map(Number) as [number, number];
    return new Response(data.slice(start, end + 1), { status: 206, headers: { "Content-Range": `bytes ${start}-${end}/${data.length}` } });
  };
  const deps: StoreDeps = { openCache: async () => cache, openPartialCache: async () => partial, fetchFn,
    chunkBytes: 4, retry: { maxAttempts: 1 },
    timer: (fn, ms) => { const id = setTimeout(fn, ms); return () => clearTimeout(id); },
  };
  const run = (store: ModelStore, signal = new AbortController().signal) => store.download([file], "https://example.com", () => {}, signal);
  return { cache, partial, ranges, deps, run };
}

describe("resumable model downloads", () => {
  it("keeps completed ranges on failure and a new store fetches only missing bytes", async () => {
    const f = fixture();
    const fetchFn = f.deps.fetchFn;
    const first = new ModelStore({ ...f.deps, fetchFn: async (url, init) => {
      if (new Headers(init.headers).get("range") === "bytes=4-7") throw new TypeError("offline");
      return fetchFn(url, init);
    } });
    await expect(f.run(first)).rejects.toMatchObject({ kind: "network" });
    expect(await first.isComplete([file])).toBe(false);
    expect(await first.retainedBytes([file])).toBe(4);
    const reopened = new ModelStore(f.deps);
    await f.run(reopened);
    expect(f.ranges).toEqual(["bytes=0-3", "bytes=4-7", "bytes=8-11"]);
    expect(new Uint8Array(await reopened.getBuffer(file))).toEqual(data);
    expect(f.partial.entries.size).toBe(0);
  });

  it("retries a failed range without downloading completed ranges again", async () => {
    const f = fixture();
    const fetchFn = f.deps.fetchFn;
    let failed = false;
    const store = new ModelStore({ ...f.deps, retry: { maxAttempts: 2 },
      timer: (fn, ms) => { const id = setTimeout(fn, ms <= 1000 ? 0 : ms); return () => clearTimeout(id); },
      fetchFn: async (url, init) => {
        if (!failed && new Headers(init.headers).get("range") === "bytes=4-7") { failed = true; throw new TypeError("reset"); }
        return fetchFn(url, init);
      },
    });
    await f.run(store);
    expect(failed).toBe(true);
    expect(f.ranges).toEqual(["bytes=0-3", "bytes=4-7", "bytes=8-11"]);
    expect(await store.isComplete([file])).toBe(true);
  });

  it("cancel retains checkpoints, and lookup never starts a download", async () => {
    const f = fixture();
    const ac = new AbortController();
    const first = new ModelStore({ ...f.deps, fetchFn: async (url, init) => {
      if (new Headers(init.headers).get("range") === "bytes=4-7") ac.abort();
      return f.deps.fetchFn(url, init);
    } });
    await expect(f.run(first, ac.signal)).rejects.toBeInstanceOf(DownloadAborted);
    const fetchFn = vi.fn(f.deps.fetchFn);
    const reopened = new ModelStore({ ...f.deps, fetchFn });
    expect(await reopened.retainedBytes([file])).toBe(4);
    await expect(reopened.getBuffer(file)).rejects.toThrow("not downloaded");
    expect(fetchFn).not.toHaveBeenCalled();
    await f.run(reopened);
    expect(await reopened.isComplete([file])).toBe(true);
  });

  it("a 200 fallback after partial progress replaces the file instead of appending", async () => {
    const f = fixture();
    const store = new ModelStore({ ...f.deps, fetchFn: async (url, init) => {
      if (new Headers(init.headers).get("range") === "bytes=0-3") return f.deps.fetchFn(url, init);
      return new Response(data);
    } });
    await f.run(store);
    expect(new Uint8Array(await store.getBuffer(file))).toEqual(data);
    expect(f.partial.entries.size).toBe(0);
  });

  it("never publishes a corrupt assembled file and clears its checkpoints", async () => {
    const f = fixture();
    const store = new ModelStore({ ...f.deps, fetchFn: async (_url, init) => {
      const range = new Headers(init.headers).get("range")!.slice(6);
      return new Response("xxxx", { status: 206, headers: { "Content-Range": `bytes ${range}/12` } });
    } });
    await expect(f.run(store)).rejects.toBeInstanceOf(IntegrityError);
    expect(await store.isComplete([file])).toBe(false);
    expect(f.partial.entries.size).toBe(0);
  });

  it("verification precedes readiness for both small and ranged downloads", async () => {
    for (const chunkBytes of [4, 100]) {
      const f = fixture();
      const store = new ModelStore({ ...f.deps, chunkBytes, fetchFn: chunkBytes === 100 ? async () => new Response(data) : f.deps.fetchFn });
      let verifying = false;
      await store.download([file], "https://example.com", (p) => {
        expect(f.cache.entries.has(cacheKey(file))).toBe(false);
        if (p.phase === "verifying") verifying = true;
      }, new AbortController().signal);
      expect(verifying).toBe(true);
      expect(await store.isComplete([file])).toBe(true);
    }
  });

  it("a failed final cache write retains all chunks and can retry without network", async () => {
    const f = fixture();
    const put = f.cache.put;
    f.cache.put = async () => { throw new DOMException("disk full", "QuotaExceededError"); };
    await expect(f.run(new ModelStore(f.deps))).rejects.toMatchObject({ name: "QuotaExceededError" });
    f.cache.put = put;
    const fetchFn = vi.fn(async () => { throw new Error("must not download again"); });
    const store = new ModelStore({ ...f.deps, fetchFn });
    await f.run(store);
    expect(fetchFn).not.toHaveBeenCalled();
    expect(await store.isComplete([file])).toBe(true);
  });

  it("discard removes partial data without touching verified models", async () => {
    const f = fixture();
    const store = new ModelStore(f.deps);
    await f.run(store);
    await store.discardPartial([file]);
    expect(await store.isComplete([file])).toBe(true);
    await store.deleteAll([file]);
    expect(await store.isComplete([file])).toBe(false);
    expect(f.partial.entries.size).toBe(0);
  });

  it("serializes two stores and removal through the shared lock", async () => {
    const f = fixture();
    let tail = Promise.resolve();
    const withLock: NonNullable<StoreDeps["withLock"]> = async (_signal, operation) => {
      const before = tail;
      let release!: () => void;
      tail = new Promise<void>((resolve) => { release = resolve; });
      await before;
      try { return await operation(); } finally { release(); }
    };
    const first = new ModelStore({ ...f.deps, withLock });
    const second = new ModelStore({ ...f.deps, withLock });
    await Promise.all([f.run(first), f.run(second), second.deleteAll([file])]);
    expect(f.ranges).toEqual(["bytes=0-3", "bytes=4-7", "bytes=8-11"]);
    expect(await first.isComplete([file])).toBe(false);
    expect(f.partial.entries.size).toBe(0);
  });
});
