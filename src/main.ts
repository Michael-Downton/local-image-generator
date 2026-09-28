// Wiring (Spec §4): EIN registerView, Command + Ribbon, Host-Implementierung für die
// View. Thin Client — keine In-Process-Engine mehr: generate() spricht über HTTP mit
// einem lokal laufenden A1111-kompatiblen Server (/sdapi/v1/txt2img).
// i18n (docs/superpowers/specs/2026-07-17-i18n-design.md §2): registerI18n() + setLang()
// laufen ZUERST im onload, vor addSettingTab/registerView/addRibbonIcon/addCommand — sonst
// rendern die ersten t()-Aufrufe rohe Keys.
import { arrayBufferToBase64, getLanguage, MarkdownView, normalizePath, Notice, Plugin, TFile, TFolder } from "obsidian";
import { buildImageFilename, buildNoteFilename, dedupeFilename, dirOf } from "./core/filename";
import { deleteEntry, pushHistory } from "./core/history";
import { registerI18n } from "./i18n/strings";
import { buildImageNote } from "./core/note";
import { isOutOfMemoryError } from "./core/engine-errors";
import {
  assetsFor,
  filesFor,
  BUILTIN_MODELS,
  DEFAULT_BUILTIN_MODEL_ID,
  modelById,
  missingBytes,
  totalBytes,
  type AssetFile,
  type BuiltinModel,
  type BuiltinModelId,
} from "./core/model-manifest";
import { DEFAULT_SETTINGS, migrateSettings, SETTINGS_SCHEMA, type EngineChoice, type LigSettings } from "./core/settings";
import { slotsOf, workflowStateFrom, type WorkflowState } from "./core/comfy/state";
import { ComfyClient } from "./core/comfy/client";
import { hardenParams, type HardenContext } from "./core/params";
import {
  createImageGenerationApi,
  type ApiFailure,
  type ApiImage,
  type ApiRequest,
  type ApiSaveResult,
  type ImageGenerationApi,
} from "./core/plugin-api";
import { parseOptionsModel, ProgressPoller, A1111Client, statusUrlFor, type ImageBackend } from "./core/txt2img";
import { resolveImageEndpoint, type EndpointRole } from "./core/resolve-endpoint";
import { findEndpointManager } from "./vendor/kit-obsidian/endpoint-source";
import { formatBytes, partialDownloadLabel, type EngineState, type GenParams, type PanelState, type ServerState } from "./core/viewmodel";
import { confirmAction } from "./vendor/kit-obsidian/confirm";
import { comfyTransport, httpGetJson, httpPostJson } from "./obsidian/http";
import { hasLegacyCache } from "./obsidian/legacy-cache";
import { LocalEngineBackend, SessionBuildTimeout } from "./obsidian/local-engine";
import { PlaygroundBackend } from "./obsidian/playground-backend";
import { createShortcutsBridge, type ShortcutsBridge } from "./vendor/kit-obsidian/shortcuts-bridge";
import { downloadMessage } from "./obsidian/download-message";
import { DownloadAborted, IntegrityError, ModelStore } from "./obsidian/model-store";
import { checkGpu, createOrtSession, initOrt } from "./obsidian/ort-host";
import { base64OfDataUrl, dataUrlToBytes, decodeInitImage, rgbaToDataUrl } from "./obsidian/png";
import { LigSettingTab } from "./obsidian/settings-tab";
import { ImagePickerModal } from "./obsidian/image-picker";
import { GeneratorView, VIEW_TYPE, type PanelRecipe, type ViewHost } from "./obsidian/view";
import { mergeSettings } from "./vendor/kit/settings";
import { validateSettings } from "./vendor/kit/settings_schema";
import { pickLang, setLang, t } from "./vendor/kit/i18n";

export default class LocalImageGeneratorPlugin extends Plugin {
  settings: LigSettings = DEFAULT_SETTINGS;
  private settingTab!: LigSettingTab;
  // Wird in onunload gesetzt. Die runGeneration()-Polling-Callbacks und der Post-await-Block
  // prüfen es, damit ein spät eintreffendes HTTP-Ergebnis nach dem Entladen des Plugins
  // nicht mehr this.state mutiert, refreshViews() ruft oder History schreibt. Der Remote-
  // Call selbst ist nicht abbrechbar (Obsidians requestUrl kennt kein Abort) — wir
  // verhindern nur die späte Nebenwirkung.
  private unloaded = false;
  /** Oeffentlicher Vertrag fuer andere Plugins:
   *  app.plugins.plugins["local-image-generator"].api */
  api!: ImageGenerationApi;
  /** Laeuft gerade ein Lauf ueber die Provider-API? Getrennt von state.run, weil isBusy()
   *  auch dann sperren muss, wenn der Fremdlauf noch in der Anlaufphase steht. */
  private apiRunning = false;
  // Eingebaute Engine (Spec 0.6): Store (Cache API), Backend (lazy, lebt bis dispose), laufender
  // Download. Der Settings-Tab beobachtet den Engine-Zustand über onEngineStateChanged.
  private readonly modelStore = new ModelStore();
  private localEngine: LocalEngineBackend | null = null;
  private shortcutsBridge!: ShortcutsBridge;
  private downloadAbort: AbortController | null = null;
  onEngineStateChanged: (() => void) | null = null;
  // `mode`, `builtinModel`, `showModelPicker` fehlen hier bewusst: sie SIND settings.engine /
  // settings.builtinModel / settings.showModelPicker und werden in getPanelState() abgeleitet
  // (Omit macht ein zweites Spiegeln typseitig unmoeglich). Zwei von Hand synchron gehaltene
  // Wahrheiten hatten schon eine: das ViewModel las state.mode, alles Neuere settings.engine.
  // `workflow` ist seit Task 5 Teil von PanelState (der ganze Zustand, nicht nur die Slots) —
  // die fruehere Intersection ist damit aufgeloest.
  private state: Omit<PanelState, "mode" | "builtinModel" | "showModelPicker" | "playgroundShortcutName"> = {
    initImage: null,
    denoising: null,
    missingBytes: null,
    downloadedModels: [],
    engine: { kind: "not-downloaded" },
    server: { kind: "checking" }, // in onload nach settings-load auf "unconfigured"/"checking" gesetzt
    workflow: { kind: "unconfigured" },
    run: { kind: "idle" },
    image: null,
    editorActive: false,
    prompt: "",
    negativePrompt: "",
    seed: 0,
    steps: 20,
    cfg: 7,
    width: 512,
    height: 512,
  };

  async onload(): Promise<void> {
    registerI18n();
    setLang(pickLang(getLanguage()));

    // Obsidian traegt diese Instanz schon in app.plugins.plugins ein, bevor onload() zu Ende
    // ist — ein parallel ladendes Fremdplugin kann `.api` also in genau diesem Fenster lesen.
    // Deshalb VOR dem await auf loadData() konstruiert: jede Abhaengigkeit unten ist eine
    // Closure ueber `this`, keine braucht die geladenen Settings zum Bauzeitpunkt.
    this.api = createImageGenerationApi({
      getMode: () => this.settings.engine,
      builtinModel: () => this.settings.builtinModel,
      workflowSlots: () => slotsOf(this.state.workflow),
      readiness: () => this.apiReadiness(),
      // Der EINE Netzaufruf hinter `api.recheck()`. `checkServer()` schreibt `state.server`
      // und wirft nicht — ein unerreichbarer Server ist dort ein Ergebnis; die Fassade liest
      // den neuen Stand danach ueber `readiness()`, nicht aus dem Rueckgabewert.
      recheckServer: async () => {
        await this.checkServer();
      },
      isBusy: () => this.isBusy(),
      harden: (input) => hardenParams(input, this.hardenContext()),
      run: async (params, onProgress, initImageData, signal) => {
        // Ein Konsument haelt seine api-Referenz ueber unser Entladen hinaus. Ohne diesen
        // Guard baut ensureLocalEngine() eine neue GPU-Session fuer eine Plugin-Instanz,
        // die es nicht mehr gibt — und niemand disposed sie je.
        if (this.unloaded) return { ok: false, message: "plugin unloaded" };
        this.apiRunning = true;
        try {
          return await this.runGeneration(params, initImageData ?? null, onProgress, { external: true, signal });
        } finally {
          this.apiRunning = false;
        }
      },
      save: (image, createNote) => this.saveApiImage(image, createNote),
      defaultCreateNote: () => this.settings.createMode === "note",
      saveToFolder: (folder, params, base64) => this.saveToFolder(folder, params, base64),
    });

    // migrateSettings VOR mergeSettings: das neue Feld `engine` entscheidet sich am alten
    // Endpunkt (0.5-Nutzer bleiben im Server-Modus), nicht am Default.
    this.settings = validateSettings(
      DEFAULT_SETTINGS,
      mergeSettings(DEFAULT_SETTINGS, migrateSettings(await this.loadData())),
      SETTINGS_SCHEMA,
    );
    this.state.server = { kind: this.settings.endpoint.trim() === "" ? "unconfigured" : "checking" };
    this.state.engine = { kind: this.settings.engine === "builtin" ? "gpu-checking" : "not-downloaded" };
    // Einmal je Sitzung, unabhaengig vom aktuellen Modus (Kit-Vertrag: EIN Besitzer verbaut
    // die Bruecke einmal, nie je Aufruf) — registerObsidianProtocolHandler() ist ein
    // no-op-artiges Setup, solange niemand `run()` aufruft.
    this.shortcutsBridge = createShortcutsBridge(this, { protocolAction: "local-image-generator-shortcut" });

    this.settingTab = new LigSettingTab(this.app, this);
    this.addSettingTab(this.settingTab);

    const host: ViewHost = {
      getPanelState: () => {
        this.state.editorActive = this.app.workspace.getActiveViewOfType(MarkdownView)?.editor !== undefined;
        // Die einzige Stelle, an der `mode`/`builtinModel`/`showModelPicker` entstehen —
        // abgeleitet, nicht gespiegelt.
        return {
          ...this.state,
          mode: this.settings.engine,
          builtinModel: this.settings.builtinModel,
          showModelPicker: this.settings.showModelPicker,
          playgroundShortcutName: this.settings.playgroundShortcutName,
        };
      },
      getSettings: () => this.settings,
      setPrompt: (p) => {
        this.state.prompt = p;
      },
      setNegativePrompt: (p) => {
        this.state.negativePrompt = p;
      },
      setRecipe: (r) => {
        this.state.steps = r.steps;
        this.state.seed = r.seed;
        this.state.cfg = r.cfg;
        this.state.width = r.width;
        this.state.height = r.height;
        this.state.denoising = r.denoising;
      },
      generate: (r) => void this.generate(r),
      pickInitImage: () => {
        new ImagePickerModal(this.app, (f) => void this.setInitImage(f)).open();
      },
      clearInitImage: () => {
        this.state.initImage = null;
        this.refreshViews();
      },
      useResultAsInitImage: () => void this.useResultAsInitImage(),
      recheckServer: () => void this.checkServer(),
      downloadModel: () => void this.startDownload(),
      cancelDownload: () => this.cancelDownload(),
      discardDownload: () => void this.discardDownload(),
      setBuiltinModel: (id) => void this.setBuiltinModel(id),
      saveImage: (mode) => void this.saveImage(mode),
      openSettings: () => {
        const setting = (this.app as unknown as { setting: { open(): void; openTabById(id: string): void } }).setting;
        setting.open();
        setting.openTabById("local-image-generator");
      },
      restoreRecipe: (entry) => {
        // Die Vorlage gehoert zum Rezept — aber nur, wenn die Datei noch da ist. Ein
        // stillschweigend als txt2img wieder aufgelegter img2img-Eintrag waere genau die
        // Sorte Luege, die die Keine-Attrappen-Linie verbietet (Spec §7): der Nutzer sieht
        // die leere Vorlagen-Zeile und weiss, dass er sie neu waehlen muss.
        const quelle = entry.initImage !== null ? this.app.vault.getAbstractFileByPath(entry.initImage) : null;
        if (quelle instanceof TFile) void this.setInitImage(quelle);
        else this.state.initImage = null;
        // Rezept direkt in die DOM-Felder des Generate-Panels füllen und dorthin wechseln —
        // ohne neuen globalen Zustand (die Panels halten ihre eigenen Felder).
        for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE)) {
          const view = leaf.view;
          if (view instanceof GeneratorView) {
            view.applyRecipe(entry);
            view.showTab("generate");
          }
        }
      },
      deleteHistoryEntry: (entry) => {
        this.settings.history = deleteEntry(this.settings.history, entry);
        void this.saveSettings();
        this.refreshViews();
      },
      clearHistory: () => {
        void confirmAction(this.app, {
          message: t("history.clearConfirm"),
          confirmLabel: t("history.clear"),
          cancelLabel: t("modal.cancel"),
        }).then((ok) => {
          if (!ok) return;
          this.settings.history = [];
          void this.saveSettings();
          this.refreshViews();
        });
      },
      setHistoryView: (v) => {
        this.settings.historyView = v;
        void this.saveSettings();
        this.refreshViews();
      },
      showTab: (id) => {
        for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE)) {
          const view = leaf.view;
          if (view instanceof GeneratorView) view.showTab(id);
        }
      },
    };

    this.registerView(VIEW_TYPE, (leaf) => new GeneratorView(leaf, host));
    this.addRibbonIcon("image-plus", t("view.title"), () => void this.activateView());
    this.addCommand({ id: "open", name: t("cmd.open"), callback: () => void this.activateView() });

    // Cache-Migration (C2-Fix, Final-Review 2026-08-24) VOR dem ersten isComplete()-Blick:
    // Ruling Task 5 qualifizierte die Cache-Schluessel modell-spezifisch — eine Bestands-
    // installation traegt ihre ~2,5 GB SD-Turbo noch unter dem alten, flachen Schluessel.
    // Awaited, damit refreshEngineState() gleich danach den migrierten Stand sieht statt eine
    // Race gegen die eigene Migration zu laufen und einen 2,5-GB-Neudownload anzubieten.
    await this.modelStore.migrateLegacyKeys(assetsFor("sd-turbo"));
    if (this.settings.engine === "builtin") void this.refreshEngineState();
    // playground hat keinen Server-Begriff — nichts zu pruefen, der Kurzbefehl-Name allein
    // entscheidet ueber die Bereitschaft (apiReadiness()/getPanelState() lesen ihn direkt).
    else if (this.settings.engine !== "playground") void this.checkServer();
    if (this.settings.engine === "comfy") void this.loadWorkflow();
    // Einmalig pro Session (onload läuft genau einmal pro Plugin-Ladevorgang, nicht pro
    // Settings-Tab-Öffnung): Bestandsinstallationen können noch ~2,5 GB alte SD-Turbo-
    // Gewichte im Cache-API-Speicher haben (0.x, In-Process-Engine). Hinweis statt
    // automatischem Löschen — der Aufräumer selbst sitzt in den Settings (Task 7).
    void hasLegacyCache().then((found) => {
      if (found) new Notice(t("notice.legacyHint"));
    });
  }

  onunload(): void {
    // Eine laufende runGeneration() pollt per setInterval und wartet auf einen nicht abbrechbaren
    // HTTP-Call. Das Flag sorgt dafür, dass deren Callbacks nach dem Entladen zu No-ops werden
    // (kein State-Mutieren, kein refreshViews, kein History-Schreiben). Die eingebaute Engine
    // hält GPU-Sessions und evtl. einen Download — beides abräumen (0.1-Leak-Befund).
    this.unloaded = true;
    this.downloadAbort?.abort();
    void this.localEngine?.dispose();
    this.localEngine = null;
  }

  // ── Eingebaute Engine (Spec 0.6 §2/§4/§5) ─────────────────────────────────

  getEngineState(): EngineState {
    return this.state.engine;
  }

  /** Läuft gerade eine Generierung (oder das Laden davor)? Modus-Wechsel und Entfernen warten
   *  darauf — die GPU-Sessions dürfen nicht unter einem aktiven UNet-Schritt weggezogen werden
   *  (Review 2026-08-19). `apiRunning` deckt die Anlaufphase eines Fremdlaufs ab, bevor
   *  runGeneration() state.run überhaupt auf "external" gesetzt hat. */
  isBusy(): boolean {
    const k = this.state.run.kind;
    return this.apiRunning || k === "contacting" || k === "loading-model"
      || k === "generating" || k === "external";
  }

  /** Netzfreie Bereitschaft fuer status(). Spiegelt den zuletzt ermittelten Zustand —
   *  ein Netzaufruf gehoert hier nicht hin (der Vertrag sagt das zu). */
  private apiReadiness(): { ready: true } | { ready: false; reason: ApiFailure } {
    if (this.settings.engine === "builtin") {
      const e = this.state.engine;
      if (e.kind === "ready") return { ready: true };
      if (e.kind === "gpu-missing") return { ready: false, reason: "no-gpu" };
      return { ready: false, reason: "model-not-downloaded" };
    }
    if (this.settings.engine === "comfy") {
      const w = this.state.workflow;
      if (w.kind !== "ok") return { ready: false, reason: "not-configured" };
      // Danach gilt dieselbe Server-Bedingung wie fuer A1111 — Fall-through nach unten.
    }
    if (this.settings.engine === "playground") {
      // Kein Server-Begriff — der Kurzbefehl-Name ist die ganze Konfiguration.
      return this.settings.playgroundShortcutName.trim() === ""
        ? { ready: false, reason: "not-configured" }
        : { ready: true };
    }
    const s = this.state.server;
    if (s.kind === "ok") return { ready: true };
    if (s.kind === "unconfigured") return { ready: false, reason: "not-configured" };
    return { ready: false, reason: "unreachable" };
  }

  private currentModelName(): string {
    if (this.settings.engine === "builtin") return this.settings.builtinModel;
    // Stabile Kennung wie ein builtin-Modell-Id (kein UI-Label) — "Image Playground" traegt
    // hier keine Uebersetzung, aus demselben Grund wie "sd-turbo": das Feld landet in
    // GenParams.model/der Ergebnis-Notiz, nicht in einem sichtbaren Widget.
    if (this.settings.engine === "playground") return "image-playground";
    return (this.state.server.kind === "ok" ? this.state.server.modelName : null) ?? "unknown";
  }

  /** Das gewaehlte eingebaute Modell (settings.builtinModel) — abgeleitet, keine zweite
   *  Kopie. Oeffentlich: der Settings-Tab (Task 11) zeigt Name/Groesse/Lizenz darueber an. */
  activeModel(): BuiltinModel {
    return modelById(this.settings.builtinModel);
  }

  /** Alle Dateien des gewaehlten Modells inkl. Runtime-WASM — der Cache-/Download-Umfang fuer
   *  refreshEngineState()/startDownload(). removeModel() nutzt bewusst NUR assetsFor(id): die
   *  Runtime gehoert keinem Modell allein und darf beim Loeschen eines Modells nicht mit weg. */
  private activeFiles(): AssetFile[] {
    return filesFor(this.settings.builtinModel);
  }

  /** Welche eingebauten Modelle vollstaendig im Cache liegen — fuer den Settings-Tab (Task 11),
   *  der pro Modell Download/Loeschen anbietet. */
  get downloadedModels(): BuiltinModelId[] {
    return this.state.downloadedModels;
  }

  /** Der EINE Kontext, unter dem gehaertet wird — Panel wie Provider-API. Zwei Kontexte
   *  waeren zwei Wahrheiten: die API meldete dann andere Parameter, als das Panel in seine
   *  Notiz schreibt. Genau dafuer liegt die Haertung in core/params.ts an einer Stelle. */
  private hardenContext(): HardenContext {
    return {
      mode: this.settings.engine,
      defaultSteps: this.settings.defaultSteps,
      model: this.currentModelName(),
      builtinModel: this.settings.builtinModel,
      workflowSlots: slotsOf(this.state.workflow),
      now: new Date(),
      randomSeed: () => Math.floor(Math.random() * 2 ** 31),
    };
  }

  /** Der einzige Vault-Write der Provider-API. Nutzt dieselbe Ablage wie der Create-Knopf
   *  (Ausgabeziel, Dedup, optional Ergebnis-Notiz) — ein Fremdplugin soll nicht an der
   *  Einstellung des Nutzers vorbei schreiben. */
  /** Vault-Datei → Vorlage. Die Bytes werden EINMAL gelesen und als dataUrl gehalten: das
   *  Vorschaubild braucht sie, und der naechste Lauf schickt genau diese Bytes. Ein zweites
   *  Lesen zum Generier-Zeitpunkt koennte eine inzwischen geaenderte Datei erwischen — die
   *  Notiz naennte dann einen Pfad, dessen Inhalt nie ins Bild eingegangen ist. */
  private async setInitImage(file: TFile): Promise<void> {
    try {
      const bytes = await this.app.vault.readBinary(file);
      const ext = file.extension.toLowerCase();
      const mime = ext === "jpg" ? "image/jpeg" : `image/${ext}`;
      this.state.initImage = { path: file.path, dataUrl: `data:${mime};base64,${arrayBufferToBase64(bytes)}` };
      this.refreshViews();
    } catch (e) {
      new Notice(t("notice.saveFailed", e instanceof Error ? e.message : String(e)));
    }
  }

  /** „Speichern & als Vorlage": legt das gerade erzeugte Bild im Vault ab und macht es zur
   *  Vorlage. Speichert BEWUSST zuerst — eine Vorlage ohne Vault-Pfad haette in der
   *  Ergebnis-Notiz keine benennbare Herkunft (Spec §4). Nur das Bild, nie eine Notiz:
   *  `createMode` gilt fuer Ergebnisse, nicht fuer Zwischenschritte. */
  private async useResultAsInitImage(): Promise<void> {
    const img = this.state.image;
    if (!img) return;
    let file: TFile;
    try {
      const path = await this.resolveImagePath(buildImageFilename(new Date(img.params.date), img.params.seed));
      file = await this.app.vault.createBinary(path, dataUrlToBytes(img.dataUrl));
    } catch (e) {
      new Notice(t("notice.saveFailed", e instanceof Error ? e.message : String(e)));
      return;
    }
    new Notice(t("notice.saved", file.path));
    await this.setInitImage(file);
  }

  private async saveApiImage(image: ApiImage, createNote: boolean): Promise<ApiSaveResult> {
    // Derselbe Grund wie beim `run`-Guard oben: ein Konsument haelt seine api-Referenz ueber
    // unser Entladen hinaus. Der Vertrag ist generate() → Mensch schaut sich das Bild an →
    // save() — genau in dieser Pause kann der Nutzer das Plugin deaktivieren. this.app bleibt
    // nach onunload gueltig, also wuerde createBinary anstandslos in den Vault schreiben; ein
    // entladenes Plugin darf den Vault aber nicht mehr anfassen.
    if (this.unloaded) return { ok: false, reason: "write-failed", message: "plugin unloaded" };
    const { created, ...rest } = image.params;
    // `initImage` (der Vault-Pfad) bleibt null: ein API-Konsument schickt Bytes, keine
    // Vault-Datei. `denoising` kommt aus dem Vertrag — die Notiz nennt die Staerke.
    const params: GenParams = { ...rest, date: created, initImage: null };
    let file: TFile;
    try {
      const path = await this.resolveImagePath(buildImageFilename(new Date(params.date), params.seed));
      file = await this.app.vault.createBinary(path, dataUrlToBytes(`data:image/png;base64,${image.base64}`));
    } catch (e) {
      return { ok: false, reason: "write-failed", message: e instanceof Error ? e.message : String(e) };
    }
    if (!createNote) return { ok: true, imagePath: file.path, notePath: null };
    // Ab hier ist das Bild bereits geschrieben. Ein Fehler in der Notiz darf es NICHT
    // entwerten (dieselbe Lehre wie saveImage() unten) — deshalb eigener try, und der
    // Rueckgabewert bleibt ok mit notePath: null statt eines write-failed, das den Aufrufer
    // die bereits gespeicherte Datei nicht mehr finden liesse.
    try {
      const note = await this.createNote(params, file.path);
      return { ok: true, imagePath: file.path, notePath: note.path };
    } catch {
      return { ok: true, imagePath: file.path, notePath: null };
    }
  }

  /** Kit-Vertrag `image-gen-provider::generateImage` (Auftrag E, Welle 13): schreibt in
   *  einen vom AUFRUFER benannten Ordner — anders als `resolveImagePath()`, das immer
   *  `settings.outputFolder` verwendet. Ein Fremdplugin (Koda, yijing, epub-exporter, …)
   *  bekommt so seinen eigenen Zielordner, statt in den lig-eigenen Ordner DIESES Nutzers zu
   *  schreiben. Legt den Ordner an, dedupt Kollisionen — dieselbe Logik wie der
   *  outputFolder-Zweig in `resolveImagePath()`, nur mit einem uebergebenen statt einem
   *  konfigurierten Ordner (leer = Vault-Wurzel, kein Attachment-Sonderfall: der ist eine
   *  Zusage an DIESEN Nutzer, kein genereller Vertrag). */
  private async saveToFolder(
    folder: string,
    params: GenParams,
    base64: string,
  ): Promise<string | { ok: false; message: string }> {
    if (this.unloaded) return { ok: false, message: "plugin unloaded" };
    try {
      const clean = normalizePath(folder.trim());
      if (clean !== "" && !(this.app.vault.getAbstractFileByPath(clean) instanceof TFolder)) {
        await this.app.vault.createFolder(clean).catch(() => undefined);
      }
      const filename = buildImageFilename(new Date(params.date), params.seed);
      const path = dedupeFilename(
        normalizePath(clean === "" ? filename : `${clean}/${filename}`),
        (p) => this.app.vault.getAbstractFileByPath(p) !== null,
      );
      const file = await this.app.vault.createBinary(path, dataUrlToBytes(`data:image/png;base64,${base64}`));
      return file.path;
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : String(e) };
    }
  }

  private setEngineState(e: EngineState): void {
    this.state.engine = e;
    this.refreshViews();
    this.onEngineStateChanged?.();
  }

  /** Modus wechseln (Settings): das andere Backend wird verlassen — GPU-Sessions frei, Server
   *  neu geprüft bzw. Engine-Zustand neu ermittelt. */
  async setEngine(mode: EngineChoice): Promise<boolean> {
    if (mode === this.settings.engine) return true;
    if (this.isBusy()) {
      new Notice(t("notice.busy"));
      return false;
    }
    this.settings.engine = mode;
    await this.saveSettings();
    if (mode !== "builtin") {
      // Ein laufender Download gehört zum verlassenen Modus — abbrechen, nicht im Verborgenen
      // weiterlaufen lassen (fertige Dateien bleiben im Cache). Gilt fuer JEDEN Zielmodus
      // ausserhalb von builtin, nicht nur "server" — sonst laedt ein Wechsel builtin->comfy
      // mehrere GB fuer einen verlassenen Modus weiter, und die GPU-Sessions bleiben belegt.
      this.cancelDownload();
      const e = this.localEngine;
      this.localEngine = null;
      // AWAIT, nicht `void`: die GPU-Sessions sind erst danach wirklich frei. Das
      // strukturgleiche `setBuiltinModel()`/`removeModel()` wartet schon immer — die zwei
      // liefen auseinander (Nachlese 0.9.0), und die wartende Fassung ist die richtige:
      // wer direkt danach in den builtin-Modus zurueckwechselt, baut sonst eine zweite
      // Session neben einer noch nicht freigegebenen auf.
      await e?.dispose();
      // playground hat keinen Server zu pruefen — derselbe Ausschluss wie beim Start
      // (onload) und beim GUI-Guard (generate()).
      if (mode !== "playground") await this.checkServer();
      if (mode === "comfy") await this.loadWorkflow();
    } else {
      await this.refreshEngineState();
    }
    this.refreshViews();
    this.onEngineStateChanged?.();
    return true;
  }

  /** GPU prüfen, dann nachsehen, ob alle Assets im Cache liegen. Läuft beim Aktivieren des
   *  builtin-Modus und nach jedem Download/Entfernen. Ein laufender Download bleibt unberührt. */
  async refreshEngineState(): Promise<void> {
    if (this.downloadAbort) return;
    this.setEngineState({ kind: "gpu-checking" });
    const gpu = await checkGpu();
    if (this.unloaded) return;
    if (gpu !== "ok") {
      this.setEngineState({ kind: "gpu-missing", reason: gpu });
      return;
    }
    // EINE Cache-Abfrage fuer beide Aussagen: ob alles da ist UND was fehlt. `cachedKeys` ist
    // das, worauf `isComplete` ohnehin aufbaut — zwei Abfragen waeren zwei Messungen, die
    // auseinanderlaufen koennen. `null` heisst „nicht gemessen" und fuehrt in der Anzeige zur
    // Gesamtgroesse, nicht zu einer geratenen Teilzahl.
    const files = this.activeFiles();
    const cached = await this.modelStore.cachedKeys(files).catch(() => null);
    if (this.unloaded) return;
    const complete = cached !== null && cached.length === files.length;
    const retained = await this.modelStore.retainedBytes(files).catch(() => 0);
    this.state.missingBytes = cached === null ? null : Math.max(0, missingBytes(files, cached) - retained);
    // Welche Modelle ueberhaupt im Cache liegen — unabhaengig vom aktiven, fuer den
    // Settings-Tab (Task 11). Ohne RUNTIME_WASM: die zaehlt nicht als Teil eines Modells.
    const geladen: BuiltinModelId[] = [];
    for (const id of Object.keys(BUILTIN_MODELS) as BuiltinModelId[]) {
      if (await this.modelStore.isComplete(assetsFor(id)).catch(() => false)) geladen.push(id);
    }
    if (this.unloaded) return;
    this.state.downloadedModels = geladen;
    this.setEngineState(complete ? { kind: "ready" } : retained > 0 ? { kind: "paused", retained } : { kind: "not-downloaded" });
  }

  /** Opt-in-Download aller fehlenden Assets des GEWAEHLTEN Modells (Spec 0.6 §4: ohne Klick
   *  fließt kein Byte). Vor dem grossen SDXL-Turbo-Download fragt zusaetzlich ein
   *  Bestaetigungsdialog (Task 12) — SD-Turbo (Default) bleibt ohne Rueckfrage, wie bisher.
   *  Abbrechen (Knopf, Escape, Klick daneben) laedt kein Byte: confirmAction() loest bei
   *  jedem dieser drei Wege mit `false` auf. */
  async startDownload(): Promise<void> {
    if (this.downloadAbort) return;
    const m = this.activeModel();
    if (m.id !== DEFAULT_BUILTIN_MODEL_ID) {
      const gesamt = totalBytes(this.activeFiles());
      // Zahl UND Entscheidung kommen von dort, wo der Knopf sie herhat: aus dem State und aus
      // `partialDownloadLabel()`. Ein Dialog, der eine andere Zahl nennt als der Knopf, der ihn
      // geoeffnet hat, sieht wie ein Fehler aus — und eine zweite Kopie der Bedingung waere
      // genau der Weg dorthin.
      const fehlend = partialDownloadLabel(this.state.missingBytes, gesamt);
      const ok = await confirmAction(this.app, {
        title: t("confirm.bigModel.title", m.label),
        // Die Warnung vor dem doppelten Speicher bleibt in BEIDEN Faellen richtig: geladen wird
        // beim ersten Bild das ganze Modell, auch wenn der Download nur eine Datei nachholt.
        message:
          fehlend !== null
            ? t("confirm.bigModel.bodyPartial", fehlend, formatBytes(gesamt))
            : t("confirm.bigModel.body", formatBytes(gesamt)),
        confirmLabel: t("confirm.bigModel.cta"),
        cancelLabel: t("modal.cancel"),
        warning: false,
      });
      if (!ok) return; // kein Byte
    }
    if (this.unloaded || this.downloadAbort || this.settings.engine !== "builtin" || m.id !== this.settings.builtinModel) return;
    const ac = new AbortController();
    this.downloadAbort = ac;
    const files = this.activeFiles();
    let failure: unknown;
    this.setEngineState({ kind: "preparing-download" });
    try {
      await this.modelStore.download(
        files,
        this.settings.assetBaseUrl,
        (p) => {
          if (this.unloaded || ac.signal.aborted || m.id !== this.settings.builtinModel || this.settings.engine !== "builtin") return;
          const file = p.file.path.split("/").pop() ?? p.file.path;
          this.setEngineState(
            p.retry
              ? { kind: "retrying", file, retained: p.received, seconds: Math.ceil(p.retry.delayMs / 1000), attempt: p.retry.attempt, maxAttempts: p.retry.maxAttempts }
              : p.phase === "verifying"
              ? { kind: "verifying", file }
              : { kind: "downloading", file, received: p.received, total: p.total, fileIndex: p.fileIndex, fileCount: p.fileCount },
          );
        },
        ac.signal,
      );
      if (this.unloaded) return;
      new Notice(t("notice.modelReady"));
    } catch (e) {
      failure = e;
    } finally {
      if (this.downloadAbort === ac) this.downloadAbort = null;
    }
    if (this.unloaded) return;
    await this.refreshEngineState();
    if (failure && !(failure instanceof DownloadAborted) && m.id === this.settings.builtinModel && this.settings.engine === "builtin") {
      const retained = this.state.engine.kind === "paused" ? this.state.engine.retained : 0;
      this.setEngineState({ kind: "error", retained,
        message: failure instanceof IntegrityError ? t("engine.integrityError", failure.file.path) : downloadMessage(failure) });
    }
  }

  async discardDownload(): Promise<void> {
    if (this.downloadAbort) return;
    try {
      await this.modelStore.discardPartial(this.activeFiles());
      await this.refreshEngineState();
    } catch (error) {
      this.setEngineState({ kind: "error", message: downloadMessage(error) });
    }
  }

  cancelDownload(): void {
    this.downloadAbort?.abort();
  }

  /** Assets EINES Modells aus dem Cache entfernen (Settings, nach Bestätigung); GPU-Sessions
   *  dazu frei. Default = das gewaehlte Modell (Ruf ohne Argument, wie der bestehende
   *  Settings-Knopf ihn nutzt). Loescht bewusst OHNE RUNTIME_WASM — die gehoert keinem Modell
   *  allein und darf dem jeweils anderen Modell nicht unter den Fuessen weggezogen werden. */
  async removeModel(id: BuiltinModelId = this.settings.builtinModel): Promise<boolean> {
    if (this.isBusy()) {
      new Notice(t("notice.busy"));
      return false;
    }
    this.cancelDownload();
    const e = this.localEngine;
    this.localEngine = null;
    await e?.dispose();
    await this.modelStore.deleteAll(assetsFor(id));
    await this.refreshEngineState();
    return true;
  }

  private ensureLocalEngine(): LocalEngineBackend {
    if (this.localEngine) return this.localEngine;
    const be = new LocalEngineBackend(
      {
        store: this.modelStore,
        createSession: createOrtSession,
        initRuntime: initOrt,
        checkGpu,
        encodePng: rgbaToDataUrl,
        decodeImage: decodeInitImage,
      },
      this.activeModel(),
    );
    this.localEngine = be;
    return be;
  }

  /** Ein Client pro Lauf, wie beim A1111Client. Der Workflow-Zustand ist zu diesem
   *  Zeitpunkt `ok` — das Gate darueber hat es geprueft; der Nicht-ok-Fall wirft hier
   *  bewusst, statt still einen leeren Graphen zu schicken.
   *
   *  `timeoutMs` ausdruecklich gesetzt: der Client-Default sind 10 min, waehrend der
   *  A1111-Weg ueber `httpPostJson` effektiv 30 min haelt (I1 des Branch-Abschlussreviews
   *  2026-09-06). Ein ComfyUI-Lauf mit Upscaler-Kette ueberschreitet 10 min mit Ansage, und
   *  der Nutzer haette die Grenze nirgends anheben koennen — sie steht in keinem Setting.
   *  Dieselbe Groessenordnung fuer beide Server-Wege, damit ein langer Lauf nicht davon
   *  abhaengt, welches Backend ihn faehrt.
   *
   *  `url` kommt vom Aufrufer (resolveEndpointFor("comfy")) statt hier erneut aufgeloest
   *  zu werden — ein Lauf braucht GENAU EINE Aufloesung, nicht eine je Backend-Baustein. */
  private makeComfyClient(url: string): ImageBackend {
    const w = this.state.workflow;
    if (w.kind !== "ok") throw new Error("kein brauchbarer Workflow");
    return new ComfyClient(url, w.json, comfyTransport(), { timeoutMs: 1_800_000 });
  }

  /** Ein Backend pro Lauf, wie bei den anderen drei. Timeout **120 s**: der Spike maß
   *  18,5 s fuer einen echten Image-Playground-Lauf (Spec-Messgrundlage) — grosszuegig
   *  darueber, dieselbe Haltung wie `SESSION_BUILD_TIMEOUT_MS` ("generous beats clever"),
   *  weil ein Timeout hier die EINZIGE Verteidigung ist (Kit-Kommentar shortcuts-bridge.ts:
   *  Kurzbefehle kennen kein Try/Catch, ein gelöschter Kurzbefehl antwortet nie). Zielordner
   *  ist `settings.outputFolder` — dieselbe Ablage wie der Rest des Plugins, kein eigenes
   *  Zielordner-Setting (Auftrag Welle 13). */
  private makePlaygroundBackend(): ImageBackend {
    return new PlaygroundBackend(
      this.settings.playgroundShortcutName,
      this.settings.outputFolder.trim() || "/",
      120_000,
      {
        bridge: this.shortcutsBridge,
        readBinary: (p) => this.app.vault.adapter.readBinary(p),
        deleteFile: async (p) => {
          const f = this.app.vault.getAbstractFileByPath(p);
          if (f !== null) await this.app.fileManager.trashFile(f);
        },
        arrayBufferToBase64,
      },
    );
  }

  /** Aktuelle Rolle beim Endpoint Manager — Server- und Comfy-Modus fragen UNABHAENGIG
   *  voneinander (Entscheidung Johannes 2026-09-17: zwei Rollen statt zwei Settings-Felder).
   *  Nur fuer Nicht-builtin-Modi sinnvoll; der Aufrufer prueft das selbst. */
  private endpointRole(): EndpointRole {
    return this.settings.engine === "comfy" ? "comfy" : "server";
  }

  /** Endpunkt fuer die aktuelle Rolle aufloesen. OHNE Manager exakt das Bestandsverhalten:
   *  `settings.endpoint`, ungeprueft — ein Ping hier wuerde eine Generierung verhindern,
   *  die heute (ohne "Verbindung testen" geklickt) trotzdem funktioniert. MIT Manager
   *  entscheidet der Kit-Vertrag `resolveEndpointSource` allein, OHNE stillen Ruckfall auf
   *  das geteilte lokale Feld — dieselbe Regel wie bei yijing-oracle/lingotuner: eine
   *  Fehlermeldung soll auf die Manager-Einstellungen zeigen, nicht auf die dann
   *  irrelevante lokale Liste. */
  private async resolveEndpointFor(role: EndpointRole): Promise<{ url: string | null }> {
    const manager = findEndpointManager(this.app);
    if (!manager) return { url: this.settings.endpoint.trim() || null };
    const choice = role === "comfy" ? this.settings.comfyEndpointChoice : this.settings.serverEndpointChoice;
    const ping = async (cfg: { url: string }): Promise<boolean> => {
      try {
        const r = await httpGetJson(statusUrlFor(this.settings.engine, cfg.url));
        return r.status === 200;
      } catch {
        return false;
      }
    };
    const r = await resolveImageEndpoint(role, choice, this.settings.endpoint, manager, ping);
    return { url: r.config?.url ?? null };
  }

  /** Modell wechseln (Settings, Task 10): dieselbe Sperre wie setEngine() — ein Wechsel darf
   *  die GPU-Sessions nicht unter einem laufenden Panel- ODER API-Lauf wegziehen (isBusy()
   *  deckt beide). Schaltet NICHT automatisch zurueck, wenn das neue Modell fehlt: das
   *  Panel zeigt dann seinen Download-Aufruf (Spec §4, „ohne Klick fließt kein Byte" gilt
   *  auch hier — dieser Wechsel selbst laedt nichts). */
  async setBuiltinModel(id: BuiltinModelId): Promise<void> {
    if (this.isBusy()) {
      new Notice(t("notice.busy"));
      return;
    }
    if (id === this.settings.builtinModel) return;
    this.cancelDownload();
    const e = this.localEngine;
    this.localEngine = null;
    await e?.dispose();
    this.settings.builtinModel = id;
    await this.saveSettings();
    await this.refreshEngineState();
    this.refreshViews();
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  /** Erreichbarkeit + aktives Modell in den State spiegeln (Spec §3: GET /sdapi/v1/options,
   *  200 ohne Modellfeld gilt als OK — Draw Things liefert die Options-Form nur teilweise).
   *  Gibt den resultierenden ServerState zurück, damit der Settings-Tab-Test-Button (Task 7)
   *  das Ergebnis direkt für seine Notice auswerten kann, ohne einen eigenen Zugriff auf
   *  den (privaten) Plugin-State zu brauchen. */
  async checkServer(): Promise<ServerState> {
    const ep = (await this.resolveEndpointFor(this.endpointRole())).url;
    if (ep === null) {
      this.state.server = { kind: "unconfigured" };
      this.refreshViews();
      return this.state.server;
    }
    this.state.server = { kind: "checking" };
    this.refreshViews();
    try {
      const r = await httpGetJson(statusUrlFor(this.settings.engine, ep));
      if (this.unloaded) return this.state.server; // Plugin entladen → keine späten State-Mutationen mehr
      // ComfyUI liefert in /system_stats keinen Modellnamen — das Modell steht im
      // Workflow. `modelName: null` ist die richtige Aussage; die UI zeigt dann
      // "(im Server gewählt)", was hier woertlich stimmt.
      this.state.server = r.status === 200
        ? { kind: "ok", modelName: this.settings.engine === "comfy" ? null : parseOptionsModel(r.json) }
        : { kind: "unreachable" };
    } catch {
      if (this.unloaded) return this.state.server;
      this.state.server = { kind: "unreachable" };
    }
    this.refreshViews();
    return this.state.server;
  }

  /** Workflow-Datei lesen und beurteilen. Laeuft beim Start (nur im comfy-Modus), nach dem
   *  Setzen des Pfades und beim Moduswechsel — nicht vor jedem Lauf: ein Workflow aendert
   *  sich nicht zwischen zwei Klicks, und ein Vault-Read pro Klick waere Rauschen. */
  async loadWorkflow(): Promise<WorkflowState> {
    const path = this.settings.comfyWorkflowPath.trim();
    let raw: string | null = null;
    if (path !== "") {
      // Form wie ueberall sonst in main.ts: getAbstractFileByPath + instanceof TFile.
      // Ein Ordner unter dem Pfad ist hier dasselbe wie "nicht da".
      const file = this.app.vault.getAbstractFileByPath(path);
      if (file instanceof TFile) {
        try {
          raw = await this.app.vault.cachedRead(file);
        } catch {
          raw = null;
        }
      }
    }
    if (this.unloaded) return this.state.workflow; // keine spaeten State-Mutationen
    this.state.workflow = workflowStateFrom(path, raw);
    this.refreshViews();
    return this.state.workflow;
  }

  refreshViews(): void {
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE)) {
      const view = leaf.view;
      if (view instanceof GeneratorView) view.refresh();
    }
  }

  private async activateView(): Promise<void> {
    const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE)[0];
    if (existing) {
      await this.app.workspace.revealLeaf(existing);
      return;
    }
    const leaf = this.app.workspace.getRightLeaf(false);
    if (leaf) {
      await leaf.setViewState({ type: VIEW_TYPE, active: true });
      await this.app.workspace.revealLeaf(leaf);
    }
  }

  /** Rechnet ein Bild — bereits gehärtete Parameter, Backend-Wahl, Sekundentakt und
   *  ProgressPoller. Fasst NICHT an: state.image, settings.history, state.prompt — das ist
   *  Sache des Aufrufers (Panel: generate() unten; Provider-API: plugin.api.generate() ->
   *  ApiDeps.run() oben). Setzt aber state.run und ruft refreshViews(), weil die
   *  Fortschrittsanzeige zum Lauf gehört, nicht zum Aufrufer. Hat KEINE eigene Busy-Sperre —
   *  die sitzt beim jeweiligen Aufrufer (Panel: generate() unten; API: plugin-api.ts +
   *  apiRunning), der garantiert, dass hier nie zwei Läufe gleichzeitig starten.
   *  `opts.external`: der Lauf kommt über die Provider-API, nicht vom eigenen Klick — die
   *  Statuszeile zeigt dafür durchgehend "external" (mit dem zuletzt bekannten Prozentsatz)
   *  statt der Phasen-Zustände contacting/loading-model/generating. */
  private async runGeneration(
    params: GenParams,
    /** Die BYTES der Vorlage (Base64 ohne data:-Praefix) oder null. Bewusst ein eigener
     *  Parameter statt eines Feldes in `params`: das Rezept traegt nur die Herkunft, nie
     *  das Bild — sonst laege ein Megabyte pro Eintrag in data.json (Spec §1). */
    initImageData: string | null,
    onProgress?: ApiRequest["onProgress"],
    opts?: { external?: boolean; signal?: AbortSignal },
  ): Promise<{ ok: true; base64: string } | { ok: false; message: string }> {
    const builtin = this.settings.engine === "builtin";
    const playground = this.settings.engine === "playground";
    // GENAU EINE Aufloesung fuer den ganzen Lauf — Backend-Bau UND Fortschritts-Poller
    // (weiter unten) teilen sich diese eine URL, statt je einen eigenen Manager-Zugriff
    // zu machen. Ohne Manager ist das exakt `settings.endpoint`, wie vor der Aenderung.
    // playground hat KEINEN Endpunkt — `resolveEndpointFor` wuerde hier ins Leere fragen
    // (kein `EndpointRole` fuer die Bruecke), deshalb derselbe Ausschluss wie bei builtin.
    const endpointUrl = builtin || playground ? null : (await this.resolveEndpointFor(this.endpointRole())).url;
    if (!builtin && !playground && endpointUrl === null) {
      return { ok: false, message: t("notice.serverFail") };
    }
    // Non-null bewiesen durch die Rueckkehr oben: `!builtin && !playground && endpointUrl
    // === null` ist ausgeschlossen, TypeScript kann diese Korrelation zwischen zwei
    // Variablen aber nicht verfolgen (kein direkter Typ-Guard auf `endpointUrl` allein).
    const backend: ImageBackend = builtin
      ? this.ensureLocalEngine()
      : playground
        ? this.makePlaygroundBackend()
        : this.settings.engine === "comfy"
          ? this.makeComfyClient(endpointUrl!)
          : new A1111Client(endpointUrl!, httpPostJson);
    const external = opts?.external === true;
    // `phase` ist die WAHRE Phase und steuert den Kontrollfluss unten (Poller/Timer); im
    // Fremdlauf faellt state.run (die ANGEZEIGTE Phase) fuer die gesamte Laufzeit auf
    // "external" — ohne die Trennung wuerden die r.kind-Checks unten staendig an "external"
    // vorbeilaufen, weil sie dort contacting/loading-model/generating erwarten. "done" markiert
    // den Abschluss (Erfolg oder Fehler), damit ein spät eintreffender Poll keinen bereits
    // beendeten Lauf mehr ueberschreibt.
    let phase: "contacting" | "loading-model" | "generating" | "done" = "contacting";
    let genPct: number | null = null;
    const setRun = (
      r: { kind: "contacting" } | { kind: "loading-model"; elapsedSec: number } | { kind: "generating"; pct: number | null; elapsedSec: number },
    ): void => {
      phase = r.kind;
      if (r.kind === "generating") genPct = r.pct;
      this.state.run = external ? { kind: "external", pct: r.kind === "generating" ? r.pct : null } : r;
    };
    setRun({ kind: "contacting" });
    this.refreshViews();
    // Fortschritt. Server: 1-s-Polling auf /sdapi/v1/progress; liefert der Server keins (404,
    // Timeout, fremde Form), bleibt pct null und die Statuszeile zählt Sekunden. Nach dem ersten
    // 404 fragt der Poller nicht mehr (Draw Things) — der Zähler läuft trotzdem.
    // Eingebaut: die Engine meldet Phasen selbst (loading-model einmal je Sitzung, dann Schritte);
    // der Timer trägt nur den Sekundenzähler der Ladephase.
    let elapsed = 0;
    // Kein Poller im comfy-Modus: ComfyUIs Fortschritt laeuft ueber den WebSocket, und der
    // wird bewusst nicht uebernommen (Spec §0 — ComfyUI 0.30.0 weist Verbindungen aus dem
    // Renderer mit 403 ab, weil Origin app://obsidian.md nicht zum Host passt). Die
    // Statuszeile zaehlt Sekunden, derselbe Pfad wie bei Draw Things.
    const poller = this.settings.engine === "server"
      ? new ProgressPoller(endpointUrl!, (u) => httpGetJson(u, 1000))
      : null;
    if (builtin) {
      this.ensureLocalEngine().onPhase = (ph, step, total) => {
        if (this.unloaded) return;
        if (ph === "loading-model") {
          setRun({ kind: "loading-model", elapsedSec: elapsed });
          onProgress?.(null, "loading-model");
        } else if (step !== undefined && total !== undefined && total > 0) {
          const pct = Math.round((step / total) * 100);
          setRun({ kind: "generating", pct, elapsedSec: elapsed });
          onProgress?.(pct, "generating");
        }
        this.refreshViews();
      };
    }
    const tick = window.setInterval(() => {
      if (this.unloaded) return; // Plugin entladen → keine späten State-Mutationen mehr
      elapsed += 1;
      if (phase === "loading-model") {
        setRun({ kind: "loading-model", elapsedSec: elapsed });
        onProgress?.(null, "loading-model");
        this.refreshViews();
        return;
      }
      if (phase !== "generating" && phase !== "contacting") return;
      if (!poller) {
        if (phase === "generating") {
          setRun({ kind: "generating", pct: genPct, elapsedSec: elapsed });
          onProgress?.(genPct, "generating");
          this.refreshViews();
        }
        return;
      }
      void poller.poll().then((pct) => {
        if (this.unloaded) return;
        if (phase === "generating" || phase === "contacting") {
          setRun({ kind: "generating", pct, elapsedSec: elapsed });
          onProgress?.(pct, "generating");
        }
        this.refreshViews();
      });
    }, 1000);
    try {
      const png = await backend.generate({ ...params, initImageData, signal: opts?.signal });
      phase = "done";
      // Ergebnis kann nach onunload eintreffen (Remote-Call ist nicht abbrechbar). Dann
      // keine State-Mutation, kein refreshViews — nur das finally räumt den Timer ab.
      if (this.unloaded) return { ok: true, base64: png };
      this.state.run = { kind: "idle" };
      return { ok: true, base64: png };
    } catch (e) {
      phase = "done";
      const msg = e instanceof Error ? e.message : String(e);
      if (this.unloaded) return { ok: false, message: msg };
      // Ein Fremdlauf hinterlaesst im Panel KEINE Spur — weder bei Erfolg (idle, oben) noch
      // bei Fehler. Ohne diese Unterscheidung zeigte die Statuszeile die rohe Backend-Meldung
      // eines fremden Laufs, als waere der EIGENE gescheitert. Der Aufrufer bekommt den
      // Fehler ohnehin als Rueckgabewert und meldet ihn seinem Nutzer selbst; unsere
      // Statuszeile gehoert dem eigenen Klick. (Ruling 2026-08-23, Task „Folgearbeit aus dem
      // Provider-API-Abschlussreview" — Alternative war ein dritter i18n-Key.)
      // Spec §8 Punkt 1: ein Session-Aufbau, der an knappem Speicher scheitert, bekommt einen
      // lesbaren Satz statt der rohen ORT-Fehlermeldung — nur im eingebauten Modus, nur bei
      // erkanntem Signal (`isOutOfMemoryError`, src/core/engine-errors.ts). Erkennt sie nichts,
      // bleibt die rohe Meldung stehen — lesbar, nur nicht freundlich; nie ein Ewig-Spinner,
      // weil dieser catch-Zweig ohnehin greift, sobald `createOrtSession` wirft/verwirft.
      // Spec §8 Punkt 2: haengt `createSession` laenger als `SESSION_BUILD_TIMEOUT_MS`, wirft
      // `local-engine.ts`s Wachhund `SessionBuildTimeout` — eigener Satz statt „nicht genug
      // Speicher", weil ein Timeout ein anderer Befund ist (koennte auch ein haengender
      // Treiber sein, nicht nur GPU-Speicher).
      const displayMsg =
        builtin && e instanceof SessionBuildTimeout ? t("status.sessionTimeout")
        : builtin && isOutOfMemoryError(e) ? t("status.outOfMemory")
        : msg;
      this.state.run = external ? { kind: "idle" } : { kind: "error", message: displayMsg };
      // Fehlschlag kann Erreichbarkeits-Ursache haben → Serverstatus neu prüfen (fire-and-forget).
      if (!builtin) void this.checkServer();
      return { ok: false, message: msg };
    } finally {
      // Timer immer abräumen (auch wenn onunload zwischen zwei Polls fiel) — verhindert
      // weiteres Feuern; refreshViews aber nur, solange das Plugin noch aktiv ist.
      window.clearInterval(tick);
      // `onPhase` wird nur fuer diesen einen Lauf gesetzt (Zeile oben), aber nie zurueckgesetzt —
      // ohne das haelt this.localEngine nach dem Aufloesen des Laufs weiter eine Closure ueber
      // ein fremdes onProgress fest (bei einem API-Lauf), die niemand mehr braucht. Der naechste
      // Lauf ueberschreibt onPhase ohnehin selbst; das hier schliesst nur die Luecke dazwischen.
      if (builtin && this.localEngine) this.localEngine.onPhase = undefined;
      if (!this.unloaded) this.refreshViews();
    }
  }

  private async generate(r: PanelRecipe): Promise<void> {
    // ViewModel deaktiviert den Generate-Knopf schon bei jedem busy-Zustand (inkl. "external") —
    // dieser Check ist die Defensive dahinter und muss deshalb dieselbe Menge sperren wie
    // isBusy(), sonst koennte ein Klick waehrend eines Fremdlaufs zwei runGeneration()-Aufrufe
    // gleichzeitig lostreten.
    if (this.isBusy()) return;
    const builtin = this.settings.engine === "builtin";
    // ViewModel gated das bereits — Defensive: server ok bzw. Engine bereit. Im comfy-Modus
    // reicht ein erreichbarer Server nicht: ohne brauchbaren Workflow gibt es nichts zu senden.
    // playground braucht weder Server noch Engine — nur einen gesetzten Kurzbefehl-Namen.
    const bereit = builtin
      ? this.state.engine.kind === "ready"
      : this.settings.engine === "playground"
        ? this.settings.playgroundShortcutName.trim() !== ""
        : this.state.server.kind === "ok" && (this.settings.engine !== "comfy" || this.state.workflow.kind === "ok");
    if (!bereit) return;
    // Rezept-Ehrlichkeit (Spec 0.6 §7): die eingebaute Engine kennt weder Negativ-Prompt noch CFG
    // noch andere Größen — die Notiz trägt genau das, was gerechnet wurde. hardenParams
    // neutralisiert das still statt es abzulehnen (Keine-Attrappen-Linie).
    const init = this.state.initImage;
    const params = hardenParams(
      {
        prompt: this.state.prompt,
        negativePrompt: this.state.negativePrompt,
        width: r.width,
        height: r.height,
        steps: r.steps,
        seed: r.seed,
        cfg: r.cfg,
        // REZEPT: nur die Herkunft. Die Anwesenheit des Objekts ist das img2img-Signal.
        initImage: init !== null ? { ref: init.path } : undefined,
        denoising: r.denoising ?? undefined,
      },
      this.hardenContext(),
    );
    // AUFTRAG: die Bytes, getrennt vom Rezept (Spec §1). Die Bedingung haengt an
    // `denoising`, NICHT an `params.initImage`: Letzteres ist der Pfad und darf null sein,
    // waehrend sehr wohl ein Bild mitlaeuft (API-Fall). `denoising !== null` ist per
    // Haertung genau dann wahr, wenn es ein Ausgangsbild gibt.
    const initData = params.denoising !== null && init !== null ? base64OfDataUrl(init.dataUrl) : null;
    const result = await this.runGeneration(params, initData);
    // Ergebnis kann nach onunload eintreffen — runGeneration hat dann selbst schon keine
    // späte State-Mutation vorgenommen; hier zusätzlich kein Bild, keine Historie schreiben.
    if (this.unloaded) return;
    if (result.ok) {
      this.state.image = { dataUrl: `data:image/png;base64,${result.base64}`, params };
      this.settings.history = pushHistory(this.settings.history, {
        prompt: params.prompt, negativePrompt: params.negativePrompt, seed: params.seed, steps: params.steps,
        cfg: params.cfg, model: params.model, width: params.width, height: params.height, created: params.date,
        denoising: params.denoising, initImage: params.initImage,
      });
      this.refreshViews();
      void this.saveSettings();
    }
  }

  private async resolveImagePath(filename: string): Promise<string> {
    if (this.settings.outputFolder === "") {
      const fm = this.app.fileManager as unknown as {
        getAvailablePathForAttachment(name: string): Promise<string>;
      };
      return fm.getAvailablePathForAttachment(filename);
    }
    const folder = normalizePath(this.settings.outputFolder);
    if (!(this.app.vault.getAbstractFileByPath(folder) instanceof TFolder)) {
      await this.app.vault.createFolder(folder).catch(() => undefined);
    }
    // Kollisions-Dedup: getAvailablePathForAttachment übernimmt das im leeren-Ordner-
    // Fall; für einen expliziten outputFolder müssen wir selbst -2, -3, … anhängen.
    return dedupeFilename(
      normalizePath(`${folder}/${filename}`),
      (p) => this.app.vault.getAbstractFileByPath(p) !== null,
    );
  }

  // Ergebnis-Notiz neben/statt dem Bild anlegen. Spiegelt resolveImagePath: fehlender
  // Zielordner wird angelegt, Kollisionen bekommen -2, -3, … angehängt.
  private async createNote(params: GenParams, imagePath: string): Promise<TFile> {
    const configured = this.settings.noteFolder.trim();
    const folder = configured === "" ? dirOf(imagePath) : normalizePath(configured);
    if (folder !== "" && !(this.app.vault.getAbstractFileByPath(folder) instanceof TFolder)) {
      await this.app.vault.createFolder(folder).catch(() => undefined);
    }
    const name = buildNoteFilename(params.prompt, params.seed);
    const path = dedupeFilename(
      folder === "" ? name : normalizePath(`${folder}/${name}`),
      (p) => this.app.vault.getAbstractFileByPath(p) !== null,
    );
    return this.app.vault.create(path, buildImageNote(params, imagePath));
  }

  // Das Öffnen ist Komfort, kein Ergebnis: schlägt es fehl, liegt die Datei trotzdem im
  // Vault. Der Fehler wird deshalb geschluckt — die "Saved: <Pfad>"-Meldung des Aufrufers
  // sagt, wo sie ist. Ein Öffnen-Fehler darf weder das Ergebnis entwerten (Nur-Bild-Pfad:
  // gar keine Meldung) noch es falsch benennen (Notiz-Pfad: "note failed", obwohl die
  // Notiz existiert).
  private async revealFile(file: TFile): Promise<void> {
    await this.app.workspace.getLeaf(true).openFile(file).catch(() => undefined);
  }

  private async saveImage(mode: "create" | "insert"): Promise<void> {
    const img = this.state.image;
    if (!img) return;
    let file: TFile;
    try {
      // Aus dem beim Generieren eingefrorenen Zeitstempel ableiten, nicht aus "jetzt":
      // sonst laufen Dateiname und Notiz-`created` (params.date) auseinander, wenn
      // zwischen Generieren und Create Zeit vergeht (Spec §7.4, Finding 4). isoStamp
      // liefert lokale Zeit ohne Offset — new Date() parst das als lokale Zeit zurück,
      // der Round-Trip ist verlustfrei.
      const path = await this.resolveImagePath(buildImageFilename(new Date(img.params.date), img.params.seed));
      file = await this.app.vault.createBinary(path, dataUrlToBytes(img.dataUrl));
    } catch (e) {
      new Notice(t("notice.saveFailed", e instanceof Error ? e.message : String(e)));
      return;
    }

    if (mode === "insert") {
      const editor = this.app.workspace.getActiveViewOfType(MarkdownView)?.editor;
      if (editor) editor.replaceSelection(`![[${file.path}]]`);
      else new Notice(t("generate.insertNeedsEditor"));
      new Notice(t("notice.saved", file.path));
      return;
    }

    if (this.settings.createMode !== "note") {
      await this.revealFile(file);
      new Notice(t("notice.saved", file.path));
      return;
    }

    // Ab hier ist das Bild bereits geschrieben. Ein Fehler in der Notiz darf es NICHT
    // entwerten — deshalb eigener try und eine Meldung, die beides benennt.
    let note: TFile;
    try {
      note = await this.createNote(img.params, file.path);
    } catch (e) {
      new Notice(t("notice.noteFailed", file.path, e instanceof Error ? e.message : String(e)));
      return;
    }
    // Öffnen erst NACH dem try: scheitert nur das Öffnen, ist die Notiz trotzdem da —
    // sie hier mit "note failed" zu melden wäre schlicht gelogen.
    await this.revealFile(note);
    new Notice(t("notice.saved", note.path));
  }
}
