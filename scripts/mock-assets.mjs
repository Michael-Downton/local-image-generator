// Lokaler Asset-Server für den GUI-Smoke der eingebauten Engine (Spec 0.6 §10): serviert
// dist-assets/ (eigene Konversion + ORT-WASM) mit CORS wie huggingface.co, damit der Download-
// Pfad des Plugins ohne Netz und ohne das HF-Repo läuft. Zähler je Datei auf stdout UND in
// `.mock-assets-counts.json` — an ihr misst Smoke-Punkt 23, ob ein abgebrochener
// Bestätigungsdialog wirklich KEIN Byte einer Modelldatei lädt (Spec §4, "ohne Klick fließt
// kein Byte"). Dasselbe Muster wie `.mock-a1111-counts.json` in mock-a1111.mjs.
//
//   node scripts/mock-assets.mjs            # http://127.0.0.1:7862
//   MOCK_ASSETS_PORT=7863 node scripts/mock-assets.mjs
// Danach im Plugin die Download-Quelle auf http://127.0.0.1:7862 stellen (Settings › Erweitert).
import http from "node:http";
import { createReadStream, statSync, writeFileSync } from "node:fs";
import { join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { assetRange, ASSET_CORS } from "./asset-range.mjs";

const ROOT = join(fileURLToPath(new URL("..", import.meta.url)), "dist-assets");
const PORT = Number(process.env.MOCK_ASSETS_PORT ?? 7862);
const COUNTS_FILE = new URL("../.mock-assets-counts.json", import.meta.url);
const counts = new Map();
const persist = () => writeFileSync(COUNTS_FILE, JSON.stringify(Object.fromEntries(counts)));

http.createServer((req, res) => {
  const cors = ASSET_CORS;
  if (req.method === "OPTIONS") { res.writeHead(204, cors); return res.end(); }
  const rel = normalize(decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname)).replace(/^(\.\.[/\\])+/, "");
  const path = join(ROOT, rel);
  if (!path.startsWith(ROOT)) { res.writeHead(403, cors); return res.end(); }
  // Verzeichnisse als 404 abweisen, NICHT ausliefern: createReadStream auf einen Ordner wirft
  // ein unbehandeltes 'error'-Event (EISDIR) und reisst den ganzen Server mit. Gemessen
  // 2026-08-21 an einem simplen `curl http://127.0.0.1:7862/` waehrend eines Smoke-Laufs — der
  // Server war danach weg, und der naechste Download des Pruefling sah eine tote Verbindung.
  let stat;
  try { stat = statSync(path); } catch { res.writeHead(404, cors); return res.end("not found"); }
  if (!stat.isFile()) { res.writeHead(404, cors); return res.end("not a file"); }
  const size = stat.size;
  counts.set(rel, (counts.get(rel) ?? 0) + 1);
  persist();
  console.log(`${req.method} ${rel} (${(size / 1e6).toFixed(1)} MB) #${counts.get(rel)}`);
  const range = assetRange(req.headers.range, size);
  if (!range) { res.writeHead(416, { ...cors, "Content-Range": `bytes */${size}` }); return res.end(); }
  const { start, end, status } = range;
  res.writeHead(status, { ...cors, "Content-Type": "application/octet-stream", "Content-Length": String(end - start + 1),
    "Accept-Ranges": "bytes", ...(status === 206 ? { "Content-Range": `bytes ${start}-${end}/${size}` } : {}) });
  if (req.method === "HEAD") return res.end();
  const stream = createReadStream(path, { start, end });
  stream.on("error", () => res.destroy());
  res.on("close", () => stream.destroy());
  stream.pipe(res);
}).listen(PORT, "127.0.0.1", () => {
  persist(); // frische Zaehlerdatei je Server-Start — sonst liest Punkt 23 den Stand eines frueheren Laufs
  console.log(`mock-assets: ${ROOT} auf http://127.0.0.1:${PORT}`);
});
