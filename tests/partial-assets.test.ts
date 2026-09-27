import { describe, expect, it } from "vitest";
import { PartialAssetStore } from "../src/obsidian/partial-assets";
import type { AssetFile } from "../src/core/model-manifest";
import { assetCache } from "./helpers/asset-cache";

const file: AssetFile = { key: "sd-turbo/unet", path: "unet.onnx", sha256: "a".repeat(64), bytes: 6, kind: "onnx" };
describe("partial assets", () => {
  it("recovers committed chunks after reopening and assembles in byte order", async () => {
    const cache = assetCache();
    const first = new PartialAssetStore(cache, file);
    await first.put(3, 5, new Response("def"));
    await first.put(0, 2, new Response("abc"));
    const reopened = new PartialAssetStore(cache, file);
    const chunks = await reopened.chunks();
    expect(chunks.map((c) => c.start)).toEqual([0, 3]);
    expect(await new Response(reopened.stream(chunks, new AbortController().signal)).text()).toBe("abcdef");
  });

  it("a failed write does not replace a completed checkpoint", async () => {
    const cache = assetCache();
    const store = new PartialAssetStore(cache, file);
    await store.put(0, 2, new Response("abc"));
    await expect(store.put(3, 5, new Response(new ReadableStream({ start(c) { c.error(new Error("connection lost")); } }))))
      .rejects.toThrow("connection lost");
    expect((await store.chunks()).map((c) => c.end)).toEqual([2]);
  });

  it("does not reuse a different manifest; removes obsolete chunks without touching other models", async () => {
    const cache = assetCache();
    await new PartialAssetStore(cache, file).put(0, 2, new Response("abc"));
    const other = new PartialAssetStore(cache, { ...file, key: "sdxl-turbo/unet" });
    await other.put(0, 2, new Response("abc"));
    const changed = new PartialAssetStore(cache, { ...file, sha256: "b".repeat(64) });
    expect(await changed.chunks()).toEqual([]);
    await changed.clear(true);
    expect(cache.entries.size).toBe(1);
    expect(await other.chunks()).toHaveLength(1);
  });

  it("drops chunks beyond a hole and detects corrupt stored sizes", async () => {
    const store = new PartialAssetStore(assetCache(), file);
    await store.put(0, 1, new Response("ab"));
    await store.put(3, 5, new Response("def"));
    expect((await store.chunks()).map((c) => c.end)).toEqual([1]);
    await store.put(2, 5, new Response("c"));
    await expect(new Response(store.stream(await store.chunks(), new AbortController().signal)).text()).rejects.toThrow("size mismatch");
  });

  it("cancels assembly and clears all checkpoints on explicit discard", async () => {
    const cache = assetCache();
    const store = new PartialAssetStore(cache, file);
    await store.put(0, 2, new Response("abc"));
    const ac = new AbortController(); ac.abort();
    await expect(new Response(store.stream(await store.chunks(), ac.signal)).text()).rejects.toMatchObject({ name: "AbortError" });
    await store.clear();
    expect(cache.entries.size).toBe(0);
  });
});
