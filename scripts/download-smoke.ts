// Laeuft mit synthetischen Dateien in einem isolierten Chromium-Profil und greift nie auf echte Modell-Caches zu.
import { ModelStore, type StoreDeps } from "../src/obsidian/model-store";
import { sha256Hex } from "../src/vendor/kit/sha256";
import type { AssetFile } from "../src/core/model-manifest";

declare global { interface Window { assetOrigin: string } }
const origin = window.assetOrigin;
const chunkBytes = 256 * 1024;
const data = Uint8Array.from({ length: 1024 * 1024 }, (_, i) => (i * 17 + 7) & 255);
const file: AssetFile = { key: "smoke/unet", path: "model", bytes: data.length, sha256: sha256Hex(data), kind: "onnx" };
const deps: StoreDeps = {
  openCache: () => caches.open("lig-smoke-complete"),
  openPartialCache: () => caches.open("lig-smoke-partial"),
  withLock: async (signal, operation) => await navigator.locks.request("lig-smoke", { signal }, operation),
  fetchFn: (url, init) => window.fetch(url, init),
  timer: (fn, ms) => { const id = window.setTimeout(fn, ms); return () => window.clearTimeout(id); },
  chunkBytes, minChunkBytes: 64 * 1024, retry: { maxAttempts: 1 }, connectMs: 2000, stallMs: 2000,
};
const store = new ModelStore(deps);
const signal = () => new AbortController().signal;
const run = (modelStore = store) => modelStore.download([file], origin, () => {}, signal());
const check = (ok: boolean, label: string): void => { if (!ok) throw new Error(label); };
const mode = async (name: string): Promise<void> => { await fetch(`${origin}/mode?name=${name}`, { method: "POST" }); };
const requests = async (): Promise<string[]> => (await fetch(`${origin}/requests`)).json();
const results: string[] = JSON.parse(sessionStorage.getItem("results") ?? "[]") as string[];

async function expectFailure(operation: () => Promise<unknown>): Promise<void> {
  let failed = false;
  try { await operation(); } catch { failed = true; }
  check(failed, "expected failure");
  check(!await store.isComplete([file]), "failed download became usable");
}

async function smoke(): Promise<void> {
  if (!sessionStorage.getItem("reload")) {
    await mode("drop");
    await expectFailure(() => run());
    check(await store.retainedBytes([file]) === chunkBytes, "checkpoint not retained");
    const before = (await requests()).length;
    await expectFailure(() => store.getBuffer(file));
    check((await requests()).length === before, "lookup performed network access");
    results.push("dropped HTTP stream retains a completed range; lookup remains offline");
    sessionStorage.setItem("results", JSON.stringify(results));
    sessionStorage.setItem("reload", "1");
    window.location.reload();
    return;
  }
  check(await store.retainedBytes([file]) === chunkBytes, "reload lost persistent checkpoint");
  await mode("ok");
  await run();
  check((await requests())[0] === `bytes=${chunkBytes}-${2 * chunkBytes - 1}`, "resume redownloaded saved bytes");
  check(sha256Hex(new Uint8Array(await store.getBuffer(file))) === file.sha256, "resumed bytes differ");
  check((await (await deps.openPartialCache!()).keys()).length === 0, "successful download left chunks behind");
  results.push("page reload resumes only missing ranges; browser Cache API contains the verified file");

  await store.deleteAll([file]);
  await mode("ignore");
  await run();
  check((await requests()).length === 1, "ignored Range caused extra downloads");
  check(sha256Hex(new Uint8Array(await store.getBuffer(file))) === file.sha256, "200 fallback corrupted bytes");
  results.push("server ignoring Range falls back to one verified full response");

  for (const name of ["bad-range", "corrupt"]) {
    await store.deleteAll([file]);
    await mode(name);
    await expectFailure(() => run());
    results.push(`${name} never becomes a usable model`);
  }

  await store.deleteAll([file]);
  await mode("drop-once");
  const retryEvents: number[] = [];
  const adaptive = new ModelStore({ ...deps, retry: { maxAttempts: 3 } });
  await adaptive.download([file], origin, (p) => { if (p.retry) retryEvents.push(p.received); }, signal());
  const ranges = await requests();
  check(ranges.includes(`bytes=${chunkBytes}-${chunkBytes + chunkBytes / 2 - 1}`), "failed range did not shrink");
  check(retryEvents.includes(chunkBytes), "retry UI lost retained progress");
  results.push("real connection reset retries a smaller range and reports retained progress");

  await store.deleteAll([file]);
  await mode("ok");
  await Promise.all([run(), run(new ModelStore(deps))]);
  check((await requests()).length === 4, "concurrent stores duplicated requests");
  results.push("browser Web Locks serialize two stores without duplicate downloads");

  await store.deleteAll([file]);
  await mode("drop");
  await expectFailure(() => run());
  await store.discardPartial([file]);
  check(await store.retainedBytes([file]) === 0, "discard left partial data");
  results.push("explicit discard removes persistent partial data");
  await fetch("/result", { method: "POST", body: JSON.stringify({ ok: true, results }) });
}

void smoke().catch(async (error: unknown) => {
  await fetch("/result", { method: "POST", body: JSON.stringify({ ok: false, results, error: error instanceof Error ? error.stack : String(error) }) });
});
