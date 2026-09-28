// Settings (UI-STANDARD §5): Server, Ausgabe, Presets, plus ein einmaliger Legacy-Cache-
// Aufräumer für Bestandsinstallationen (Spec §4).
//
// Zweigleisig — EINE Wahrheit für beide Renderpfade (REGISTRY „Zweigleisige deklarative
// Settings — eine-Wahrheit-Walker", Muster übernommen aus 3d-codeblocks/src/obsidian/settings.ts
// in der minimalen Form, Hatch-Behandlung aus vault-rag/src/settings.ts):
//
// Ab Obsidian 1.13 fragt der Host `getSettingDefinitions()` ab und ruft `display()` nie —
// nur so erscheinen die Einstellungen in der Settings-SUCHE. Unser `minAppVersion` ist 1.8.7,
// dort gibt es die deklarative API nicht, der Host ruft `display()`. Deshalb ist
// `getSettingDefinitions()` die einzige Definition, und `renderImperative()` zeichnet
// DIESELBE Struktur mit der klassischen `Setting`-API nach. Kein zweiter Definitionsbaum,
// der auseinanderlaufen kann, und der Versions-Floor bleibt, wo er ist (PROF-OBS-06).
//
// Drei Zeilen sind `render`-Hatches (SettingDefinitionRender), weil sie sich nicht als
// einzelnes Control ausdrücken lassen: der Server-Endpunkt (Textfeld UND Test-Knopf in
// derselben Zeile), der Preset-Editor (zeichnet je Preset eine eigene Zeile) und der
// Legacy-Cache-Aufräumer (erscheint erst nach einem asynchronen Check). Alles andere sind
// reine Controls — inklusive der beiden Ordner-Felder, für die 1.13 mit `type: "folder"`
// einen eigenen Suggester mitbringt; darunter setzt der Walker unseren vendorten
// FolderSuggest ein.
import { App, Notice, PluginSettingTab, Setting, type SettingDefinitionItem } from "obsidian";
import { STEPS } from "../core/generation";
import { BUILTIN_MODELS, DEFAULT_ASSET_BASE_URL, filesFor, isBuiltinModelId, modelById, totalBytes, type AssetFile, type BuiltinModelId } from "../core/model-manifest";
import { DEFAULT_SETTINGS, SETTINGS_SCHEMA, type EngineChoice, type LigSettings } from "../core/settings";
import { formatBytes, retryStatus, type EngineState } from "../core/viewmodel";
import { localImageEndpoints, type EndpointRole } from "../core/resolve-endpoint";
import { t } from "../vendor/kit/i18n";
import { validateSettings } from "../vendor/kit/settings_schema";
import { applyDestructive, confirmAction } from "../vendor/kit-obsidian/confirm";
import { renderSettingDefinitions, settingBodyHost, refreshSettingsTab } from "../vendor/kit-obsidian/settings_walker";
import { buildEndpointSourceSection, findEndpointManager, type EndpointSourceSectionStrings } from "../vendor/kit-obsidian/endpoint-source";
import { deleteLegacyCache, hasLegacyCache } from "./legacy-cache";
import { helpDefinition } from "./help-row";
import { renderPresetEditor } from "./preset-editor";
import { WorkflowPickerModal } from "./workflow-picker";
import type LocalImageGeneratorPlugin from "../main";

export class LigSettingTab extends PluginSettingTab {
  /** Ergebnis des asynchronen hasLegacyCache()-Checks: `null` = noch nicht geprüft.
   *  Steuert das `visible`-Prädikat der Aufräum-Zeile in BEIDEN Renderpfaden. */
  private legacyCache: boolean | null = null;
  /** Cleanup-Funktion aus dem letzten renderSettingDefinitions()-Aufruf. */
  private cleanupPrevious: () => void = () => {};
  /** Statuszeile der Modell-Zeile — wird bei Fortschritts-Ticks in place aktualisiert; ein
   *  Wechsel der Zustandsart (downloading → ready) zeichnet den Tab neu (andere Knöpfe). */
  private modelStatusEl: HTMLElement | null = null;
  private renderedEngineKind: EngineState["kind"] | null = null;
  private renderedMode: LigSettings["engine"] | null = null;

  constructor(
    app: App,
    private readonly plugin: LocalImageGeneratorPlugin,
  ) {
    super(app, plugin);
    plugin.onEngineStateChanged = () => {
      if (this.renderedMode === null) return; // Tab nicht offen
      const st = plugin.getEngineState();
      const sameShape = st.kind === this.renderedEngineKind && plugin.settings.engine === this.renderedMode;
      if (sameShape && this.modelStatusEl) this.modelStatusEl.setText(engineStatusText(st));
      else this.refreshUi();
    };
  }

  // ── Die eine Wahrheit ────────────────────────────────────────────────────
  // Der Generic-Parameter bindet jeden `key` an ein echtes Settings-Feld: ein Tippfehler
  // bricht den Build, statt zur Laufzeit stumm ins Leere zu greifen (der Host liest den
  // Wert ausschließlich über getControlValue).
  getSettingDefinitions(): SettingDefinitionItem<keyof LigSettings>[] {
    const mode = this.plugin.settings.engine;
    const builtin = mode === "builtin";
    this.renderedMode = mode;
    // Bedingte Zeilen WEGLASSEN statt `visible: false`: Obsidian 1.13 cacht die Definitionen und
    // wertet Prädikate nicht neu aus — nach einem Moduswechsel zeichnet refreshUi() (update())
    // den Tab mit den dann passenden Zeilen neu.
    const activeModel = modelById(this.plugin.settings.builtinModel);
    const modelRow: SettingDefinitionItem<keyof LigSettings> = {
      // Modell-Zeile der eingebauten Engine (Spec 0.6 §6): Status + Herunterladen/Abbrechen/
      // Entfernen je nach Zustand — mehrere Controls, deshalb ein render-Hatch. Bezieht sich
      // immer auf das GEWAEHLTE Modell (settings.builtinModel), nicht auf den Default.
      name: t("settings.model.name", activeModel.label, formatBytes(totalBytes(this.modelFiles(activeModel.id)))),
      desc: t("settings.model.desc", activeModel.attribution, activeModel.license.name),
      render: (setting) => this.renderModel(setting),
    };
    // Modell-Dropdown steht VOR modelRow (Brief Step 3): der Wechsel darunter zeigt sofort
    // die Download-/Loeschen-Zeile des NEU gewaehlten Modells.
    const builtinModelRow: SettingDefinitionItem<keyof LigSettings> = {
      name: t("settings.builtinModel.name"),
      desc: t("settings.builtinModel.desc"),
      control: {
        type: "dropdown",
        key: "builtinModel",
        options: Object.fromEntries(
          (Object.keys(BUILTIN_MODELS) as BuiltinModelId[]).map((id) => [id, BUILTIN_MODELS[id].label]),
        ),
      },
    };
    const showModelPickerRow: SettingDefinitionItem<keyof LigSettings> = {
      name: t("settings.showModelPicker.name"),
      desc: t("settings.showModelPicker.desc"),
      control: { type: "toggle", key: "showModelPicker" },
    };
    // Name und Beschreibung nach Modus: es ist DASSELBE Feld (`settings.endpoint`), aber im
    // comfy-Modus eine andere Software mit einem anderen Standard-Port. Die A1111-Fassung
    // dort stehen zu lassen, schickte den ComfyUI-Nutzer zu Draw Things — und verschwieg,
    // dass ein aus dem Server-Modus uebernommener Endpunkt hier stehenbleibt und antwortet,
    // ohne ComfyUIs API zu bedienen.
    const serverRow: SettingDefinitionItem<keyof LigSettings> = {
      name: mode === "comfy" ? t("settings.comfyServer.name") : t("settings.server.name"),
      desc: mode === "comfy" ? t("settings.comfyServer.desc") : t("settings.server.desc"),
      render: (setting) => this.renderServer(setting),
    };
    // Picker-Knopf + Textfeld teilen sich eine Zeile — als Control nicht abbildbar, deshalb
    // ein render-Hatch wie serverRow.
    const workflowRow: SettingDefinitionItem<keyof LigSettings> = {
      name: t("settings.workflow.name"),
      desc: t("settings.workflow.desc"),
      render: (setting) => this.renderWorkflow(setting),
    };
    // Image Playground (Spec Baustein 5, Welle 13): kein Endpunkt, kein Server — nur ein
    // Kurzbefehl-Name. Die Beschreibung nennt die Ehrlichkeits-Grenzen ausdruecklich
    // (Auftrag C): stilisierte Ausgaben, keine Fotorealistik, keine Negativ-Prompts/Maße,
    // kein img2img — die Settings-Zeile ist der Ort, an dem ein Nutzer das VOR dem ersten
    // Lauf erfaehrt, nicht erst am Fehlschlag.
    const playgroundRow: SettingDefinitionItem<keyof LigSettings> = {
      name: t("settings.playground.name"),
      desc: t("settings.playground.desc"),
      control: { type: "text", key: "playgroundShortcutName", placeholder: DEFAULT_SETTINGS.playgroundShortcutName },
    };
    return [
      helpDefinition(),
      {
        type: "group",
        heading: t("settings.engine.heading"),
        items: [
          {
            name: t("settings.engine.name"),
            // Modellneutral (Task 12 Fixrunde): diese Zeile beschreibt den ENGINE-Modus
            // (eingebaut vs. Server), nicht ein bestimmtes Modell — Groesse/Name des
            // aktiven Modells stehen bereits in modelRow direkt darunter. Vorher hardcodiert
            // auf SD-Turbo/dessen Groesse: mit SDXL-Turbo gewaehlt widersprach diese Zeile
            // der Zeile direkt darunter (Review-Fund Task 12).
            desc: t("settings.engine.desc"),
            control: {
              type: "dropdown",
              key: "engine",
              options: {
                builtin: t("settings.engine.builtin"),
                server: t("settings.engine.server"),
                comfy: t("settings.engine.comfy"),
                playground: t("settings.engine.playground"),
              },
            },
          },
          ...(builtin
            ? [builtinModelRow, showModelPickerRow, modelRow]
            : mode === "comfy"
              ? [serverRow, workflowRow]
              : mode === "playground"
                ? [playgroundRow]
                : [serverRow]),
        ],
      },
      {
        type: "group",
        heading: t("settings.output.heading"),
        items: [
          {
            name: t("settings.output.folder"),
            desc: t("settings.output.folderDesc"),
            control: { type: "folder", key: "outputFolder" },
          },
          {
            name: t("settings.noteFolder"),
            desc: t("settings.noteFolderDesc"),
            control: { type: "folder", key: "noteFolder" },
          },
          {
            name: t("settings.createMode"),
            desc: t("settings.createModeDesc"),
            control: {
              type: "dropdown",
              key: "createMode",
              options: { image: t("settings.createModeImage"), note: t("settings.createModeNote") },
            },
          },
          {
            name: t("settings.defaultSteps"),
            desc: t("settings.defaultStepsDesc"),
            // displayFormat ersetzt das ab 1.13 deprecated setDynamicTooltip(): ab 1.13 zeigt
            // der Host den Wert damit inline, der Fallback-Walker hängt ihn an den Namen.
            control: {
              type: "slider",
              key: "defaultSteps",
              min: STEPS.min,
              max: STEPS.max,
              step: 1,
              displayFormat: (v: number) => String(v),
            },
          },
        ],
      },
      {
        type: "group",
        heading: t("settings.presets.heading"),
        items: [
          {
            name: t("settings.presets.heading"),
            desc: t("settings.presets.desc"),
            render: (setting) => this.renderPresets(setting),
          },
        ],
      },
      {
        type: "group",
        heading: t("settings.advanced.heading"),
        items: [
          {
            name: t("settings.assetBaseUrl.name"),
            desc: t("settings.assetBaseUrl.desc"),
            control: { type: "text", key: "assetBaseUrl", placeholder: DEFAULT_ASSET_BASE_URL },
          },
        ],
      },
      {
        // Legacy-Cache-Hinweis (Spec §4): Bestandsinstallationen können noch ~2,5 GB alte
        // SD-Turbo-Gewichte (0.x, In-Process-Engine) im Cache-API-Speicher haben. Der Check
        // ist asynchron, deshalb entscheidet ein Prädikat über die Sichtbarkeit statt eines
        // nachträglichen Anhängens ans DOM — ausgewertet in beiden Renderpfaden.
        name: t("settings.legacy.delete"),
        visible: () => this.legacyCache === true,
        render: (setting) => this.renderLegacyCache(setting),
      },
    ];
  }

  getControlValue(key: string): unknown {
    return (this.plugin.settings as unknown as Record<string, unknown>)[key];
  }

  async setControlValue(key: string, value: unknown): Promise<void> {
    // Immer durch validateSettings: das ist die einzige Stelle, die Müllwerte abfängt. Der
    // deklarative Host validiert nur den Typ, nicht unsere Grenzen (Steps 1..50, createMode).
    // Der trim() davor war früher pro Feld in den onChange-Handlern verstreut — ohne ihn
    // landet ein versehentliches Leerzeichen im Endpunkt oder im Ordnerpfad.
    const clean = typeof value === "string" ? value.trim() : value;
    if (key === "engine") {
      // Moduswechsel hat Seiteneffekte (GPU-Sessions frei, Server prüfen) — über das Plugin.
      // Während einer Generierung lehnt es ab (Notice); refreshUi stellt den Dropdown zurück.
      // VIER moegliche Werte seit dem Playground-Backend (AGENTS.md § "Der dritte Modus-Wert
      // faellt an rund einem Dutzend Stellen in den else-Zweig" — gilt fuer jeden weiteren
      // Wert genauso): eine Ternaerkette, die einen Wert nicht kennt, schaltet ihn hier
      // still auf "builtin" zurueck — kein Fehler, keine Notice, das Dropdown springt um.
      const next: EngineChoice =
        clean === "server" ? "server" : clean === "comfy" ? "comfy" : clean === "playground" ? "playground" : "builtin";
      await this.plugin.setEngine(next);
      this.refreshUi();
      return;
    }
    if (key === "builtinModel") {
      // Muss ueber onChange laufen (Brief-Warnung): Obsidian 1.13 cacht getSettingDefinitions()
      // und wertet Praedikate nicht neu aus — ohne den Wechsel HIER zu setzen bliebe die
      // Download-/Loeschen-Zeile darunter beim alten Modell stehen.
      // isBuiltinModelId statt `as BuiltinModelId` (Block-5-Fix, Final-Review 2026-08-24): der
      // "engine"-Zweig zwei Zeilen darueber engt echt ein (`=== "server" ? "server" : "builtin"`)
      // — dieser Zweig tat es nicht. Das Dropdown-Options-Objekt lieferte bisher immer einen
      // gueltigen Wert, aber `setControlValue` ist ueber `getControlValue`/den deklarativen Host
      // generisch erreichbar; ein ungeprueftes `as` haette einen Muellwert klaglos in
      // settings.builtinModel und damit in data.json geschrieben — `modelById()` liefert dafuer
      // beim naechsten Laden `undefined` statt eines Modells.
      if (!isBuiltinModelId(clean)) return;
      await this.plugin.setBuiltinModel(clean);
      this.refreshUi(); // Download-/Loeschen-Zeile zeigt jetzt ein anderes Modell
      return;
    }
    this.plugin.settings = validateSettings(DEFAULT_SETTINGS, { ...this.plugin.settings, [key]: clean }, SETTINGS_SCHEMA);
    await this.plugin.saveSettings();
  }

  // ── render-Hatches ───────────────────────────────────────────────────────

  /** Modell-Zeile: Lizenz-Link in der Beschreibung, Status-Text und Knöpfe je Zustand. */
  private renderModel(setting: Setting): void {
    this.ensureLegacyChecked();
    const st = this.plugin.getEngineState();
    const activeModel = modelById(this.plugin.settings.builtinModel);
    this.renderedEngineKind = st.kind;
    setting.descEl.createEl("br");
    setting.descEl.createEl("a", { text: activeModel.license.name, href: activeModel.license.url });
    this.modelStatusEl = setting.controlEl.createSpan({ text: engineStatusText(st), cls: "lig-model-status" });
    const busy = st.kind === "downloading" || st.kind === "verifying" || st.kind === "retrying" || st.kind === "preparing-download";
    if (busy) {
      setting.addButton((b) => b.setButtonText(t("settings.model.cancel")).onClick(() => this.plugin.cancelDownload()));
      return;
    }
    const retained = st.kind === "paused" || st.kind === "error" ? st.retained ?? 0 : 0;
    if (st.kind === "not-downloaded" || st.kind === "error" || st.kind === "paused") {
      setting.addButton((b) =>
        b.setButtonText(t(retained > 0 ? "settings.model.resume" : "settings.model.download")).setCta().onClick(() => void this.plugin.startDownload()),
      );
    }
    if (retained > 0) {
      setting.addButton((b) => b.setButtonText(t("settings.model.discard")).onClick(() => void this.plugin.discardDownload()));
    }
    if (st.kind === "ready" || st.kind === "error") {
      setting.addButton((b) => {
        b.setButtonText(t("settings.model.remove"));
        applyDestructive(b);
        // Während einer Generierung gesperrt: die GPU-Sessions sind in Gebrauch.
        if (this.plugin.isBusy()) {
          b.setDisabled(true);
          b.setTooltip(t("notice.busy"));
        }
        b.onClick(async () => {
          const ok = await confirmAction(this.app, {
            message: t("settings.model.removeConfirm", formatBytes(totalBytes(this.modelFiles(activeModel.id)))),
            confirmLabel: t("settings.model.remove"),
            cancelLabel: t("modal.cancel"),
          });
          if (!ok) return;
          if (await this.plugin.removeModel(this.plugin.settings.builtinModel)) new Notice(t("settings.model.removed"));
        });
      });
    }
  }

  /** Endpunkt-Zeile: mit installiertem LLM Endpoint Manager der Kit-Baustein
   *  (buildEndpointSourceSection, Capability "image", eigene ROLLE je Modus — Entscheidung
   *  Johannes 2026-09-17: zwei Rollen am selben Manager statt zwei Settings-Felder); ohne
   *  Manager exakt das bisherige Textfeld + Test-Knopf (renderServerFallback), das dann auch
   *  der `renderLocalList`-Callback des Bausteins bleibt — der Baustein ruft ihn nur, wenn ER
   *  selbst keinen Manager findet, also identisches Verhalten wie vor diesem Umbau. */
  private renderServer(setting: Setting): void {
    const manager = findEndpointManager(this.app);
    if (!manager) {
      this.renderServerFallback(setting);
      return;
    }
    const role: EndpointRole = this.plugin.settings.engine === "comfy" ? "comfy" : "server";
    const strings: EndpointSourceSectionStrings = {
      managed: t("settings.endpointSource.managed"),
      managedDesc: role === "comfy" ? t("settings.endpointSource.managedDescComfy") : t("settings.endpointSource.managedDescServer"),
      openManager: t("settings.endpointSource.openManager"),
      pickEndpoint: t("settings.endpointSource.pickEndpoint"),
      automatic: t("settings.endpointSource.automatic"),
      model: t("settings.endpointSource.model"),
      importLocal: t("settings.endpointSource.importLocal"),
      imported: (r) => t("settings.endpointSource.imported", r.added.length, r.merged.length),
      importFailed: t("settings.endpointSource.importFailed"),
      modelHint: (key) => t(`settings.endpointSource.modelHint.${key}`),
      savedSuffix: t("settings.endpointSource.savedSuffix"),
      refreshModels: t("settings.endpointSource.refreshModels"),
      saveFailed: t("settings.endpointSource.saveFailed"),
    };
    // settingBodyHost, NICHT setting.settingEl: die Kit-Sektion haengt mehrere eigene
    // `.setting-item`-Zeilen ein — in setting.settingEl (selbst ein `.setting-item`, per
    // CSS ein Flex-Container fuer Name/Control) liefen sie nebeneinander statt
    // untereinander (Regel 12: am Screenshot gefunden, nicht am DOM-Smoke).
    const host = settingBodyHost(setting);
    buildEndpointSourceSection({
      app: this.app,
      containerEl: host,
      capability: "image",
      caller: `local-image-generator/${role}`,
      choice: () => (role === "comfy" ? this.plugin.settings.comfyEndpointChoice : this.plugin.settings.serverEndpointChoice),
      setChoice: async (c) => {
        if (role === "comfy") this.plugin.settings.comfyEndpointChoice = c;
        else this.plugin.settings.serverEndpointChoice = c;
        await this.plugin.saveSettings();
        void this.plugin.checkServer();
      },
      local: () => localImageEndpoints(this.plugin.settings.endpoint),
      strings,
      renderLocalList: () => this.renderServerFallback(setting),
      rerender: () => this.refreshUi(),
    });
    // Keine Modell-Zeile: "Der Server bestimmt das Modell ... es waehlt nie ein Modell aus"
    // (AGENTS.md, Keine-Attrappen-Linie) — resolveEndpointFor() in main.ts verwirft
    // EndpointSourceResult.model vollstaendig, eine gewaehlte Zeile haette also KEINE
    // Wirkung. Der Kit-Baustein hat keine Option, die Modell-Zeile wegzulassen (er zeichnet
    // sie unbedingt, sobald ein Endpunkt existiert); ausgeblendet statt eine wirkungslose
    // Auswahl zu zeigen. Fund aus dem Master-Review der ersten Fassung (Screenshot).
    for (const nameEl of Array.from(host.querySelectorAll<HTMLElement>(".setting-item-name"))) {
      if (nameEl.textContent === t("settings.endpointSource.model")) nameEl.closest(".setting-item")?.remove();
    }
  }

  /** Bestandsverhalten ohne Manager: Endpunkt-Textfeld und Test-Knopf teilen sich eine Zeile
   *  — als Control nicht abbildbar. */
  private renderServerFallback(setting: Setting): void {
    // Echtes Render-Signal: den Legacy-Check hier anstoßen und nicht in
    // getSettingDefinitions(), das ab 1.13 auch für den bloßen Suchindex aufgerufen wird.
    this.ensureLegacyChecked();

    setting
      .addText((tf) => {
        // Der Platzhalter nennt den Port des GEWAEHLTEN Modus — ComfyUI hoert standardmaessig
        // auf 8188 (die Desktop-App auf 8000), A1111/Draw Things auf 7860. Dasselbe Feld, zwei Erwartungen: ein
        // 7860-Platzhalter im comfy-Modus ist die erste falsche Fährte.
        tf.setPlaceholder(this.plugin.settings.engine === "comfy" ? "http://127.0.0.1:8188" : "http://127.0.0.1:7860");
        tf.setValue(this.plugin.settings.endpoint).onChange(async (v) => {
          await this.setControlValue("endpoint", v);
          void this.plugin.checkServer();
        });
      })
      .addButton((b) =>
        b.setButtonText(t("settings.server.test")).onClick(async () => {
          const result = await this.plugin.checkServer();
          if (result.kind === "ok") new Notice(t("notice.serverOk", result.modelName ?? "–"));
          else new Notice(t("notice.serverFail"));
        }),
      );
  }

  /** Workflow-Pfad-Textfeld und Auswahl-Knopf teilen sich eine Zeile — wie renderServer.
   *  Nach dem Speichern liest `loadWorkflow()` die Datei neu und beurteilt sie; der Tab
   *  wird danach neu gezeichnet, damit das Textfeld den (evtl. per Picker gesetzten) Pfad
   *  zeigt und eine bedingte Nachbarzeile den frischen Zustand sieht. */
  private renderWorkflow(setting: Setting): void {
    setting
      .addText((tf) => {
        tf.setPlaceholder(t("settings.workflow.pick"));
        tf.setValue(this.plugin.settings.comfyWorkflowPath).onChange(async (v) => {
          await this.setControlValue("comfyWorkflowPath", v);
          void this.plugin.loadWorkflow();
        });
      })
      .addButton((b) =>
        b.setButtonText(t("settings.workflow.pick")).onClick(() => {
          new WorkflowPickerModal(this.app, (file) => {
            void (async () => {
              await this.setControlValue("comfyWorkflowPath", file.path);
              void this.plugin.loadWorkflow();
              this.refreshUi();
            })();
          }).open();
        }),
      );
  }

  /** Der Preset-Editor zeichnet je Preset eine eigene Zeile plus einen Hinzufügen-Knopf —
   *  er braucht deshalb einen Block-Container statt der Zwei-Spalten-Zeile. */
  private renderPresets(setting: Setting): void {
    const host = settingBodyHost(setting);
    host.createEl("p", { text: t("settings.presets.desc"), cls: "setting-item-description" });
    renderPresetEditor(host, {
      getPresets: () => this.plugin.settings.presets,
      setPresets: async (next) => {
        this.plugin.settings.presets = next;
        await this.plugin.saveSettings();
        this.plugin.refreshViews();
      },
      rerender: () => this.refreshUi(),
    });
  }

  private renderLegacyCache(setting: Setting): void {
    setting.addButton((b) => {
      b.setButtonText(t("settings.legacy.delete"));
      // Nicht setWarning(): ab Obsidian 1.13 deprecated und im Store-Review angemahnt.
      // setDestructive() gibt es erst ab 1.13 — applyDestructive prüft zur Laufzeit und
      // fällt darunter auf die native mod-warning-Klasse zurück.
      applyDestructive(b);
      b.onClick(async () => {
        b.setDisabled(true);
        await deleteLegacyCache();
        new Notice(t("settings.legacy.done"));
        // Nicht settingEl.remove(): der Zustand gehört ins Prädikat, sonst kommt die Zeile
        // beim nächsten Rebuild (Preset-Add, Settings-Suche) wieder.
        this.legacyCache = false;
        this.refreshUi();
      });
    });
  }

  /** Alle Dateien EINES Modells inkl. Runtime-WASM — dieselbe Zusammensetzung wie main.ts'
   *  private activeFiles(), hier fuer ein beliebiges (nicht nur das aktive) Modell, weil der
   *  Settings-Tab die Groesse in Name/Beschreibung UND im Loesch-Bestaetigungstext braucht. */
  private modelFiles(id: BuiltinModelId): AssetFile[] {
    return filesFor(id);
  }

  /** Einmal pro Tab-Öffnen prüfen, ob alte Gewichte im Cache-API-Speicher liegen. hide()
   *  setzt das Ergebnis zurück, damit ein späteres Öffnen erneut misst. */
  private ensureLegacyChecked(): void {
    if (this.legacyCache !== null) return;
    this.legacyCache = false;
    void hasLegacyCache().then((found) => {
      if (!found) return;
      this.legacyCache = true;
      this.refreshUi();
    });
  }

  hide(): void {
    this.legacyCache = null;
    this.modelStatusEl = null;
    this.renderedEngineKind = null;
    this.renderedMode = null;
    super.hide();
  }

  // ── Imperativer Fallback (Obsidian < 1.13) ───────────────────────────────
  // Ab 1.13 ruft der Host getSettingDefinitions() selbst auf und display() wird nie
  // aufgerufen; auf ≤1.12 fehlt der deklarative Renderpfad, dort ruft der Host display().
  display(): void {
    this.renderImperative();
  }

  private renderImperative(): void {
    this.cleanupPrevious();
    this.containerEl.empty();
    this.cleanupPrevious = renderSettingDefinitions(
      this.containerEl,
      this.getSettingDefinitions(),
      this,
      this.app,
    );
  }

  /** Re-Render des Tabs. Ab 1.13 exponiert das deklarative Framework update(); auf dem
   *  <1.13-Fallback existiert die Methode nicht → renderImperative() erneut laufen. Der Cast
   *  auf einen anonymen Typ nimmt `obsidianmd/no-unsupported-api` die Sicht auf
   *  SettingTab.update (1.13-only). */
  private refreshUi(): void {
    refreshSettingsTab(this, () => this.renderImperative());
  }

}

/** Kurzer Zustandstext für die Modell-Zeile (dieselben Keys wie die Panel-Statuszeile). */
function engineStatusText(st: EngineState): string {
  switch (st.kind) {
    case "gpu-checking": return t("status.gpuChecking");
    case "gpu-missing": return st.reason === "no-webgpu" ? t("status.gpuMissing.noWebgpu") : t("status.gpuMissing.noF16");
    case "preparing-download": return t("status.preparingDownload");
    case "paused": return t("status.downloadPaused", formatBytes(st.retained));
    case "retrying": return retryStatus(st);
    case "not-downloaded": return t("status.notDownloaded");
    case "downloading": return t("status.downloading", st.file, formatBytes(st.received), formatBytes(st.total), String(st.fileIndex), String(st.fileCount));
    case "verifying": return t("status.verifying", st.file);
    case "ready": return t("settings.model.ready");
    case "error": return t("status.error", st.message);
  }
}
