// Die EINE View des Plugins (UI-STANDARD §1/§4): ein Tab-Hub. Der View selbst ist nur
// die Hülle — Aufbau + Navigation liegen im Kit-Hub (buildHubInto), der Inhalt in den Panels.
// Kennt weder Plugin noch Engine — nur den schmalen ViewHost.
import { ItemView, WorkspaceLeaf, type ViewStateResult } from "obsidian";
import type { HistoryEntry, LigSettings } from "../core/settings";
import { t } from "../vendor/kit/i18n";
import type { BuiltinModelId } from "../core/model-manifest";
import type { PanelState } from "../core/viewmodel";
import { GeneratePanel } from "./generate-panel";
import { HistoryPanel } from "./history-panel";
import { buildHubInto, type HubController, type HubPanel, type TabId } from "./hub";

export const VIEW_TYPE = "local-image-generator";

/** Was das Panel gerade eingestellt hat. Frueher fuenf positionale Zahlen — mit `denoising`
 *  waeren es sechs gleichartige gewesen, und zwei Zahlenlisten nebeneinander sind eine
 *  Verwechslung mit Ansage. `denoising: null` heisst „keine Vorlage im Spiel". */
export interface PanelRecipe {
  steps: number;
  seed: number;
  cfg: number;
  width: number;
  height: number;
  denoising: number | null;
}

export interface ViewHost {
  getPanelState(): PanelState;
  getSettings(): LigSettings;
  setPrompt(p: string): void;
  setNegativePrompt(p: string): void;
  setRecipe(r: PanelRecipe): void;
  generate(r: PanelRecipe): void;
  /** Vorlage aus dem Vault waehlen (oeffnet den Bild-Picker). */
  pickInitImage(): void;
  clearInitImage(): void;
  /** Das gerade erzeugte Bild ablegen und ALS VORLAGE setzen. Speichert bewusst zuerst:
   *  eine Vorlage ohne Vault-Pfad haette in der Ergebnis-Notiz keine benennbare Herkunft
   *  (Spec §4). Legt nur das Bild an, nie eine Notiz. */
  useResultAsInitImage(): void;
  recheckServer(): void;
  /** Eingebaute Engine: Modell-Download aus dem Panel starten/abbrechen (Spec 0.6 §6). */
  downloadModel(): void;
  cancelDownload(): void;
  discardDownload(): void;
  /** Eingebautes Modell wechseln (Panel-Dropdown, Task 12) — nur unter geladenen Modellen
   *  waehlbar (Spec 0.9 §6.2): ein Panel-Klick loest nie einen Download aus. */
  setBuiltinModel(id: BuiltinModelId): void;
  saveImage(mode: "create" | "insert"): void;
  openSettings(): void;
  restoreRecipe(entry: HistoryEntry): void;
  deleteHistoryEntry(entry: HistoryEntry): void;
  clearHistory(): void;
  setHistoryView(v: "recent" | "grouped"): void;
  showTab(id: TabId): void;
}

export class GeneratorView extends ItemView {
  private ctrl: HubController<TabId> | null = null;
  private panels: HubPanel<TabId>[] = [];
  private restoreTab: TabId = "generate";
  private generatePanel: GeneratePanel | null = null;
  private historyPanel: HistoryPanel | null = null;

  constructor(
    leaf: WorkspaceLeaf,
    private readonly host: ViewHost,
  ) {
    super(leaf);
  }

  getViewType(): string {
    return VIEW_TYPE;
  }

  getDisplayText(): string {
    return t("view.title");
  }

  getIcon(): string {
    return "image-plus";
  }

  async onOpen(): Promise<void> {
    const generate = new GeneratePanel(this.host);
    const history = new HistoryPanel(this.host);
    this.generatePanel = generate;
    this.historyPanel = history;
    this.panels = [generate, history];
    this.ctrl = buildHubInto(this.contentEl, this.panels, this.restoreTab);
  }

  refresh(): void {
    this.generatePanel?.refresh();
    // Authoritative Re-Render nach jeder Host-Mutation (Löschen/Reset/Ansicht-Wechsel):
    // das History-Panel MUSS hier mitrendern, damit der Umschlag nicht am Modal vorbeirennt.
    this.historyPanel?.render();
  }

  /** Rezept aus der Historie ins Generate-Panel füllen (kein neuer globaler Zustand). */
  applyRecipe(entry: HistoryEntry): void {
    this.generatePanel?.applyRecipe(entry);
  }

  showTab(id: TabId): void {
    this.ctrl?.setTab(id);
    this.restoreTab = id;
  }

  getState(): Record<string, unknown> {
    return { tab: this.ctrl?.currentTab() ?? this.restoreTab };
  }

  async setState(state: unknown, result: ViewStateResult): Promise<void> {
    const tab = (state as { tab?: TabId } | null)?.tab;
    if (tab) {
      this.restoreTab = tab;
      this.ctrl?.setTab(tab);
    }
    return super.setState(state, result);
  }

  async onClose(): Promise<void> {
    this.ctrl?.destroy();
    this.contentEl.empty();
  }
}
