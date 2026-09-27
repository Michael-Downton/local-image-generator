import type { PartialCache } from "../../src/obsidian/partial-assets";

/** Bildet das atomare Speichern von Cache.put nach: Ein fehlgeschlagener Stream gibt keinen Eintrag frei. */
export function assetCache(): PartialCache & { entries: Map<string, Uint8Array> } {
  const entries = new Map<string, Uint8Array>();
  return {
    entries,
    async keys() { return [...entries.keys()].map((key) => new Request(key)); },
    async match(key) { const value = entries.get(key); return value ? new Response(value as BodyInit) : undefined; },
    async put(key, response) { entries.set(key, new Uint8Array(await response.arrayBuffer())); },
    async delete(key) { return entries.delete(key); },
  };
}
