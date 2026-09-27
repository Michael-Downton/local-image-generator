import { afterEach, describe, expect, it, vi } from "vitest";
import { retryTransfer, type RetryOptions } from "../src/obsidian/asset-retry";
import { TransferError } from "../src/obsidian/asset-transfer";

const options = (): RetryOptions => ({ signal: new AbortController().signal, random: () => 1,
  timer: (fn, ms) => { const id = setTimeout(fn, ms); return () => clearTimeout(id); },
});
afterEach(() => vi.useRealTimers());

describe("asset retries", () => {
  it("recovers transient failures with exponential backoff", async () => {
    vi.useFakeTimers();
    const operation = vi.fn().mockRejectedValueOnce(new TransferError("network", "interrupted"))
      .mockRejectedValueOnce(new TransferError("incomplete", "EOF")).mockResolvedValue("ready");
    const onRetry = vi.fn();
    const result = retryTransfer(operation, { ...options(), onRetry });
    await vi.advanceTimersByTimeAsync(999);
    expect(operation).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(operation).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(2000);
    expect(await result).toBe("ready");
    expect(onRetry.mock.calls.map(([p]) => p.delayMs)).toEqual([1000, 2000]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("stops at its attempt limit", async () => {
    vi.useFakeTimers();
    const error = new TransferError("http", "unavailable", 503);
    const operation = vi.fn().mockRejectedValue(error);
    const assertion = expect(retryTransfer(operation, options())).rejects.toBe(error);
    await vi.runAllTimersAsync();
    await assertion;
    expect(operation).toHaveBeenCalledTimes(4);
  });

  it("honours Retry-After seconds and dates; leaves very long waits to the user", async () => {
    vi.useFakeTimers();
    for (const header of ["5", "Thu, 01 Jan 1970 00:00:05 GMT"]) {
      const operation = vi.fn().mockRejectedValueOnce(new TransferError("http", "limited", 429, header)).mockResolvedValue(1);
      const result = retryTransfer(operation, { ...options(), now: () => 0 });
      await vi.advanceTimersByTimeAsync(4999);
      expect(operation).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(await result).toBe(1);
    }
    const operation = vi.fn().mockRejectedValue(new TransferError("http", "limited", 429, "3600"));
    await expect(retryTransfer(operation, options())).rejects.toMatchObject({ status: 429 });
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it("never retries permanent HTTP, protocol, integrity, or storage errors", async () => {
    for (const error of [new TransferError("http", "missing", 404), new TransferError("protocol", "bad range"),
      new Error("checksum mismatch"), new DOMException("disk full", "QuotaExceededError")]) {
      const operation = vi.fn().mockRejectedValue(error);
      await expect(retryTransfer(operation, options())).rejects.toBe(error);
      expect(operation).toHaveBeenCalledTimes(1);
    }
  });

  it("cancels a retry wait without another request", async () => {
    vi.useFakeTimers();
    const ac = new AbortController();
    const operation = vi.fn().mockRejectedValue(new TransferError("network", "interrupted"));
    const result = retryTransfer(operation, { ...options(), signal: ac.signal });
    const assertion = expect(result).rejects.toMatchObject({ name: "AbortError" });
    await vi.advanceTimersByTimeAsync(0);
    ac.abort();
    await assertion;
    expect(operation).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});
