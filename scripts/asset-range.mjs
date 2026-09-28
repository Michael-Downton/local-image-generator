/** Der Downloader nutzt genau einen begrenzten Bereich. Ungueltige oder nicht unterstuetzte Bereiche erhalten 416. */
export function assetRange(header, size) {
  if (header === undefined) return { start: 0, end: size - 1, status: 200 };
  const match = /^bytes=(\d+)-(\d*)$/.exec(header);
  if (!match) return null;
  const start = Number(match[1]);
  const end = match[2] === "" ? size - 1 : Math.min(Number(match[2]), size - 1);
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= size || end < start) return null;
  return { start, end, status: 206 };
}

export const ASSET_CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Range, Content-Type",
  "Access-Control-Expose-Headers": "Content-Length, Content-Range, Retry-After",
};
