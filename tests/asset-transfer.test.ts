import { describe, expect, it, vi, afterEach } from "vitest";
import { transferAsset, type TransferOptions } from "../src/obsidian/asset-transfer";

const options = (fetchFn: TransferOptions["fetchFn"], signal = new AbortController().signal): TransferOptions => ({
  fetchFn, signal, url: "https://example.com/model", label: "unet/model.onnx", expectedBytes: 3,
  connectMs: 100, stallMs: 100,
  timer: (fn, ms) => { const id = setTimeout(fn, ms); return () => clearTimeout(id); },
});
const read = (response: Response) => response.arrayBuffer();
afterEach(() => vi.useRealTimers());

describe("asset transfer", () => {
  it("bounds a connection that never returns headers and aborts its request", async () => {
    vi.useFakeTimers();
    let requestSignal: AbortSignal | undefined;
    const result = transferAsset(options(async (_url, init) => {
      requestSignal = init.signal;
      return new Promise(() => {});
    }), read);
    const assertion = expect(result).rejects.toMatchObject({ kind: "timeout" });
    await vi.advanceTimersByTimeAsync(100);
    await assertion;
    expect(requestSignal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("cancels immediately while waiting for headers or a stalled body", async () => {
    for (const headers of [false, true]) {
      const ac = new AbortController();
      const result = transferAsset(options(async () => headers
        ? new Response(new ReadableStream()) : new Promise(() => {}), ac.signal), read);
      await Promise.resolve();
      ac.abort();
      await expect(result).rejects.toMatchObject({ name: "AbortError" });
    }
  });

  it("classifies a clean early EOF and a broken connection", async () => {
    await expect(transferAsset(options(async () => new Response("ab")), read)).rejects.toMatchObject({ kind: "incomplete" });
    await expect(transferAsset(options(async () => { throw new TypeError("fetch failed"); }), read)).rejects.toMatchObject({ kind: "network" });
  });

  it("rejects an oversized body and preserves HTTP metadata", async () => {
    await expect(transferAsset(options(async () => new Response("abcd")), read)).rejects.toMatchObject({ kind: "protocol" });
    await expect(transferAsset(options(async () => new Response("", { status: 429, headers: { "Retry-After": "10" } })), read))
      .rejects.toMatchObject({ kind: "http", status: 429, retryAfter: "10" });
  });

  it("does not misclassify storage failures as network failures", async () => {
    const quota = new DOMException("disk full", "QuotaExceededError");
    await expect(transferAsset(options(async () => new Response("abc")), async () => { throw quota; })).rejects.toBe(quota);
  });

  it("preserves transport errors when Chromium's Cache.put translates stream errors", async () => {
    const fetchFn = async () => new Response(new ReadableStream({ start(c) { c.error(new TypeError("reset")); } }));
    await expect(transferAsset(options(fetchFn), async (response) => {
      try { await response.arrayBuffer(); }
      catch { throw new DOMException("Cache.put encountered a network error", "NetworkError"); }
    })).rejects.toMatchObject({ kind: "network" });
  });

  it("requests and validates a byte range without losing its status", async () => {
    const fetchFn = vi.fn(async () => new Response("bc", { status: 206, headers: { "content-range": "bytes 1-2/3" } }));
    const value = await transferAsset({ ...options(fetchFn), range: { start: 1, end: 2 } }, async (r) => {
      expect(r.status).toBe(206);
      return r.text();
    });
    expect(value).toBe("bc");
    expect(fetchFn).toHaveBeenCalledWith("https://example.com/model", expect.objectContaining({ headers: { Range: "bytes=1-2" } }));
  });

  it("a server ignoring Range supplies a whole-file fallback, never an append", async () => {
    const value = await transferAsset({ ...options(async () => new Response("abc")), range: { start: 1, end: 2 } }, async (r) => {
      expect(r.status).toBe(200);
      return r.text();
    });
    expect(value).toBe("abc");
  });

  it.each([null, "bytes 0-1/3", "bytes 1-2/4", "bytes 1-2/*", "bytes 1-1/3"])("rejects an incorrect Content-Range: %s", async (header) => {
    const consume = vi.fn(read);
    const fetchFn = async () => new Response("bc", { status: 206, headers: header ? { "content-range": header } : {} });
    await expect(transferAsset({ ...options(fetchFn), range: { start: 1, end: 2 } }, consume)).rejects.toMatchObject({ kind: "protocol" });
    expect(consume).not.toHaveBeenCalled();
  });

  it("rejects encoded ranges, short ranges and a 416 without accepting any file", async () => {
    for (const [response, kind] of [
      [new Response("bc", { status: 206, headers: { "content-range": "bytes 1-2/3", "content-encoding": "gzip" } }), "protocol"],
      [new Response("b", { status: 206, headers: { "content-range": "bytes 1-2/3" } }), "incomplete"],
      [new Response("", { status: 416 }), "http"],
    ] as const) {
      await expect(transferAsset({ ...options(async () => response), range: { start: 1, end: 2 } }, read)).rejects.toMatchObject({ kind });
    }
  });
});
