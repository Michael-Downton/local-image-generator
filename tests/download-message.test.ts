import { beforeEach, describe, expect, it } from "vitest";
import { registerI18n } from "../src/i18n/strings";
import { setLang } from "../src/vendor/kit/i18n";
import { TransferError } from "../src/obsidian/asset-transfer";
import { downloadMessage } from "../src/obsidian/download-message";

beforeEach(() => { registerI18n(); setLang("en"); });
describe("download recovery messages", () => {
  it("explains network, storage, HTTP and protocol recovery separately", () => {
    expect(downloadMessage(new TransferError("timeout", "raw"))).toContain("resume");
    expect(downloadMessage(new DOMException("raw", "QuotaExceededError"))).toContain("disk space");
    expect(downloadMessage(new TransferError("http", "raw", 403))).toContain("HTTP 403");
    expect(downloadMessage(new TransferError("protocol", "raw"))).toContain("byte range");
    expect(downloadMessage(new Error("unexpected failure"))).toBe("unexpected failure");
  });
  it("uses the selected language", () => {
    setLang("de");
    expect(downloadMessage(new TransferError("network", "raw"))).toContain("Verbindung");
  });
});
