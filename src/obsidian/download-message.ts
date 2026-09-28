import { t } from "../vendor/kit/i18n";
import { TransferError } from "./asset-transfer";

export function downloadMessage(error: unknown): string {
  if (error instanceof DOMException && error.name === "QuotaExceededError") return t("engine.downloadStorage");
  if (error instanceof TransferError) {
    if (error.kind === "http") return t("engine.downloadHttp", error.status ?? "?");
    if (error.kind === "protocol") return t("engine.downloadProtocol");
    return t("engine.downloadNetwork");
  }
  return error instanceof Error ? error.message : String(error);
}
