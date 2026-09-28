// Eigenstaendiger Browser-Smoke: npm run smoke:downloads (CHROMIUM_BIN kann auf eine vorhandene Programmdatei zeigen).
import http from "node:http";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { build } from "esbuild";
import { assetRange, ASSET_CORS } from "./asset-range.mjs";

const data = Buffer.from(Uint8Array.from({ length: 1024 * 1024 }, (_, i) => (i * 17 + 7) & 255));
let mode = "ok", dropped = false, requests = [];
const assets = http.createServer((req, res) => {
  const url = new URL(req.url, "http://fixture");
  for (const [key, value] of Object.entries(ASSET_CORS)) res.setHeader(key, value);
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }
  if (url.pathname === "/mode") {
    mode = url.searchParams.get("name"); dropped = false; requests = [];
    return res.end("ok");
  }
  if (url.pathname === "/requests") return res.end(JSON.stringify(requests));
  if (url.pathname !== "/model") { res.writeHead(404); return res.end(); }
  requests.push(req.headers.range ?? "full");
  const range = assetRange(mode === "ignore" ? undefined : req.headers.range, data.length);
  if (!range) { res.writeHead(416); return res.end(); }
  const { start, end, status } = range;
  const body = mode === "corrupt" ? Buffer.alloc(end - start + 1) : data.subarray(start, end + 1);
  res.setHeader("Content-Length", body.length);
  if (status === 206) res.setHeader("Content-Range", `bytes ${mode === "bad-range" ? start + 1 : start}-${end}/${data.length}`);
  res.writeHead(status);
  if (start >= 256 * 1024 && (mode === "drop" || (mode === "drop-once" && !dropped))) {
    dropped = true;
    res.write(body.subarray(0, 1024));
    setTimeout(() => res.destroy(), 20);
  } else res.end(body);
});
const listen = (server) => new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(`http://127.0.0.1:${server.address().port}`)));
const assetOrigin = await listen(assets);
const bundle = await build({ entryPoints: ["scripts/download-smoke.ts"], bundle: true, write: false, format: "iife", platform: "browser" });
let finish;
const completed = new Promise((resolve) => { finish = resolve; });
const app = http.createServer(async (req, res) => {
  if (req.url === "/smoke.js") { res.setHeader("Content-Type", "text/javascript"); return res.end(bundle.outputFiles[0].contents); }
  if (req.url === "/result" && req.method === "POST") {
    let body = "";
    for await (const chunk of req) body += chunk;
    finish(JSON.parse(body)); return res.end("ok");
  }
  res.setHeader("Content-Type", "text/html");
  res.end(`<title>Download smoke</title><p>Testing model download recovery…</p><script>window.assetOrigin=${JSON.stringify(assetOrigin)}</script><script src="/smoke.js"></script>`);
});
const url = await listen(app);
const profile = await mkdtemp(join(tmpdir(), "lig-download-smoke-"));
let browser, timeout;
const grouped = process.platform !== "win32";
let interrupt;
try {
  browser = spawn(process.env.CHROMIUM_BIN ?? "chromium", ["--headless", "--disable-gpu", "--no-first-run", "--disable-background-networking", `--user-data-dir=${profile}`, url], { detached: grouped, stdio: ["ignore", "ignore", "pipe"] });
  let stderr = "";
  browser.stderr.on("data", (chunk) => { stderr = (stderr + chunk).slice(-4000); });
  const failed = new Promise((_, reject) => {
    interrupt = () => reject(new Error("Download smoke interrupted"));
    process.once("SIGINT", interrupt);
    process.once("SIGTERM", interrupt);
    browser.once("error", reject);
    browser.once("exit", (code) => reject(new Error(`Chromium exited (${code}): ${stderr}`)));
    timeout = setTimeout(() => reject(new Error(`Download smoke timed out: ${stderr}`)), 60_000);
  });
  const result = await Promise.race([completed, failed]);
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
} finally {
  clearTimeout(timeout);
  if (interrupt) { process.removeListener("SIGINT", interrupt); process.removeListener("SIGTERM", interrupt); }
  if (browser?.pid && browser.exitCode === null && browser.signalCode === null) {
    const exited = new Promise((resolve) => browser.once("exit", resolve));
    browser.kill();
    const force = setTimeout(() => browser.kill("SIGKILL"), 2000);
    await exited; clearTimeout(force);
  }
  // Verbleibende Renderer- und Hilfsprozesse beenden, bevor sie das Profil beim Aufraeumen neu anlegen koennen.
  if (grouped && browser?.pid) {
    try { process.kill(-browser.pid, "SIGKILL"); } catch (error) { if (error.code !== "ESRCH") throw error; }
  }
  app.closeAllConnections(); assets.closeAllConnections();
  await Promise.all([new Promise((resolve) => app.close(resolve)), new Promise((resolve) => assets.close(resolve))]);
  await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
