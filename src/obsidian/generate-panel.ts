// Das Generate-Panel des Hubs (UI-STANDARD §1/§4, Mount-once: Prompt/Preview überleben
// Refreshes). Kennt weder Plugin noch Engine — nur den schmalen ViewHost.
import { setIcon, setTooltip } from "obsidian";
import { presetActive, togglePresetInPrompt } from "../core/presets";
import { t } from "../vendor/kit/i18n";
import { buildViewModel } from "../core/viewmodel";
import { CFG, DENOISING, SIZES, STEPS, type SizeOption } from "../core/generation";
import type { BuiltinModelId } from "../core/model-manifest";
import type { HistoryEntry } from "../core/settings";
import type { HubPanel, TabId } from "./hub";
import type { PanelRecipe, ViewHost } from "./view";

function randomSeed(): number {
  return Math.floor(Math.random() * 2_147_483_647);
}

export class GeneratePanel implements HubPanel<TabId> {
  readonly id: TabId = "generate";
  readonly label = t("view.tabGenerate");
  readonly icon = "image-plus";

  private modelInfoEl!: HTMLElement;
  private sizeRowEl!: HTMLElement; // Container in der controls-Zeile
  private sizeEl: HTMLSelectElement | null = null;
  /** Optionssignatur des zuletzt gezeichneten Groessen-Dropdowns — Rebuild nur bei
   *  tatsaechlicher Aenderung (Modellwechsel builtin↔builtin, Modus-Wechsel). */
  private renderedSizeIds = "";
  private modelPickEl!: HTMLSelectElement;
  private modelPickLabelEl!: HTMLElement;
  /** Optionssignatur des zuletzt gezeichneten Modell-Dropdowns — ein select verliert bei
   *  jedem Neuzeichnen seine Auswahl, deshalb nur bei tatsaechlicher Aenderung neu bauen. */
  private renderedModelIds = "";
  private promptEl!: HTMLTextAreaElement;
  private negativePromptEl!: HTMLTextAreaElement;
  private stepsLabelEl!: HTMLElement;
  private stepsEl!: HTMLInputElement;
  private stepsValueEl!: HTMLElement;
  private cfgEl!: HTMLInputElement;
  private cfgValueEl!: HTMLElement;
  private cfgLabelEl!: HTMLElement;
  private negativePromptRowEl!: HTMLElement;
  private initRowEl!: HTMLElement;
  private initThumbEl!: HTMLImageElement;
  private initPathEl!: HTMLElement;
  private initClearBtn!: HTMLButtonElement;
  private denoiseLabelEl!: HTMLElement;
  private denoiseEl!: HTMLInputElement;
  private denoiseValueEl!: HTMLElement;
  private initFromResultBtn!: HTMLButtonElement;
  /** Zuletzt angewandter Steps-Bereich — Rebuild der Slider-Grenzen nur bei Moduswechsel. */
  private stepsRange: { min: number; max: number } | null = null;
  private seedLabelEl!: HTMLElement;
  private seedEl!: HTMLInputElement;
  private seedDiceEl!: HTMLButtonElement;
  private generateBtn!: HTMLButtonElement;
  private emptyEl!: HTMLElement;
  private emptyTextEl!: HTMLElement;
  private emptyCtaEl!: HTMLButtonElement;
  private discardDownloadEl!: HTMLButtonElement;
  private emptyCtaAction: "settings" | "recheck" | "download" | "cancel-download" | undefined;
  private imageCard!: HTMLElement;
  private imgEl!: HTMLImageElement;
  private regenBtn!: HTMLButtonElement;
  private createBtn!: HTMLButtonElement;
  private insertBtn!: HTMLButtonElement;
  private statusIconEl!: HTMLElement;
  private statusTextEl!: HTMLElement;
  private chipsEl!: HTMLElement;
  private chipEls: { suffix: string; el: HTMLElement }[] = [];
  private presetSig = "";

  constructor(private readonly host: ViewHost) {}

  mount(container: HTMLElement): void {
    const root = container.createDiv({ cls: "lig-panel" });

    const modelRow = root.createDiv({ cls: "lig-row lig-model-row" });
    this.modelInfoEl = modelRow.createSpan({ cls: "lig-model-info" });

    const promptRow = root.createDiv({ cls: "lig-prompt-row" });
    this.promptEl = promptRow.createEl("textarea", {
      cls: "lig-prompt",
      attr: { placeholder: t("generate.promptPlaceholder"), rows: "3" },
    });
    this.promptEl.addEventListener("input", () => {
      this.host.setPrompt(this.promptEl.value);
      this.refresh();
    });

    const negativePromptRow = root.createDiv({ cls: "lig-prompt-row lig-negative-row" });
    this.negativePromptRowEl = negativePromptRow;
    negativePromptRow.createSpan({ text: t("generate.negativePrompt"), cls: "lig-label" });
    this.negativePromptEl = negativePromptRow.createEl("textarea", {
      cls: "lig-prompt lig-negative",
      attr: { placeholder: t("generate.negativePromptPlaceholder"), rows: "2" },
    });
    this.negativePromptEl.addEventListener("input", () => {
      this.host.setNegativePrompt(this.negativePromptEl.value);
      this.refresh();
    });

    // Vorlagen-Zeile (img2img). Ganz versteckt, wenn das Backend kein Ausgangsbild kann.
    this.initRowEl = root.createDiv({ cls: "lig-row lig-init-row" });
    this.initRowEl.createSpan({ text: t("generate.initImage"), cls: "lig-label" });
    this.initThumbEl = this.initRowEl.createEl("img", { cls: "lig-init-thumb" });
    this.initPathEl = this.initRowEl.createSpan({ cls: "lig-init-path" });
    const initPickBtn = this.initRowEl.createEl("button", { text: t("generate.initImagePick") });
    initPickBtn.addEventListener("click", () => this.host.pickInitImage());
    // Eigene Klasse wie bei .lig-init-from-result: der GUI-Smoke muss die Vorlage nach einem
    // img2img-Punkt wieder WEGRAEUMEN koennen (state.initImage ueberlebt Moduswechsel per
    // Design), sonst laufen alle spaeteren Panel-Erzeugungen still als img2img weiter.
    this.initClearBtn = this.initRowEl.createEl("button", { text: t("generate.initImageClear"), cls: "lig-init-clear" });
    this.initClearBtn.addEventListener("click", () => this.host.clearInitImage());

    this.chipsEl = root.createDiv({ cls: "lig-row lig-chips" });

    const controls = root.createDiv({ cls: "lig-row" });
    this.sizeRowEl = controls.createSpan({ cls: "lig-size-slot" });
    // Modell-Dropdown (Task 12, Spec 0.9 §6.2): NUR geladene Modelle als Optionen — ein
    // Panel-Klick darf nie einen Download ausloesen (vm.modelOptions filtert das bereits vor).
    // Sichtbare Beschriftung wie beim Groessen-Dropdown daneben (UI-STANDARD: ein
    // Bedienelement ohne zugaengliches Label ist derselbe Fall wie ein Icon-only-Button).
    // Eigene Klasse, weil es MIT dem Dropdown verschwinden muss — ein blosses `.lig-label`
    // waere von den anderen nicht zu unterscheiden, dieselbe Loesung wie bei `.lig-cfg-label`.
    this.modelPickLabelEl = controls.createSpan({ text: t("generate.model"), cls: "lig-label lig-model-pick-label" });
    this.modelPickEl = controls.createEl("select", { cls: "dropdown lig-model-pick" });
    this.modelPickEl.addEventListener("change", () => {
      // KEIN this.refresh() direkt danach (anders als bei den uebrigen Controls hier):
      // host.setBuiltinModel() ist asynchron unter der Haube (main.ts) und ruft selbst
      // refreshViews() nach Abschluss. Ein sofortiges refresh() wuerde die Anzeige VOR dem
      // Abschluss auf state.builtinModel (noch der alte Wert) zuruecksetzen — sichtbares
      // Zurueckspringen bei jedem normalen Wechsel. Einzige Kehrseite: lehnt der Wechsel ab
      // (isBusy(), selten — waehrend eines laufenden Bildes), bleibt die Anzeige bis zum
      // naechsten ANDEREN Refresh optimistisch auf der geklickten Option stehen.
      this.host.setBuiltinModel(this.modelPickEl.value as BuiltinModelId);
    });
    // Eigene Klasse wie bei lig-cfg-label: der GUI-Smoke muss genau dieses Element messen
    // koennen, ein blosses .lig-label ist von den Nachbarn nicht zu unterscheiden.
    this.stepsLabelEl = controls.createSpan({ text: t("generate.steps"), cls: "lig-label lig-steps-label" });
    // Im comfy-Modus hat der Nutzer seinen Workflow schon auf einen Wert gebracht (Spec §3)
    // — der ist der bessere Startwert als der generische Default. Nur beim Mount gelesen
    // (Mount-once, s. Modulkopf): ein spaeterer Workflow-Wechsel wirkt erst beim naechsten
    // Oeffnen des Panels, nicht live auf einen schon gezeichneten Regler.
    const state0 = this.host.getPanelState();
    const workflowSteps = state0.mode === "comfy" && state0.workflow.kind === "ok" ? state0.workflow.slots.workflowSteps : null;
    const startSteps = String(workflowSteps ?? this.host.getSettings().defaultSteps);
    this.stepsEl = controls.createEl("input", {
      cls: "lig-steps",
      attr: {
        type: "range",
        min: String(STEPS.min),
        max: String(STEPS.max),
        step: "1",
        value: startSteps,
      },
    });
    this.stepsValueEl = controls.createSpan({ text: startSteps, cls: "lig-steps-value" });
    this.stepsEl.addEventListener("input", () => {
      this.stepsValueEl.setText(this.stepsEl.value);
      this.refresh();
    });
    // Eigener Klassenname, damit der GUI-Smoke genau dieses Element messen kann: es wird
    // zusammen mit Regler und Zahl versteckt, war aber als blosses `.lig-label` nicht von den
    // Nachbar-Beschriftungen zu unterscheiden — ein Pruefpunkt haette es auslassen muessen.
    this.cfgLabelEl = controls.createSpan({ text: t("generate.cfg"), cls: "lig-label lig-cfg-label" });
    const startCfg = String(CFG.default);
    this.cfgEl = controls.createEl("input", {
      cls: "lig-cfg",
      attr: {
        type: "range",
        min: String(CFG.min),
        max: String(CFG.max),
        step: String(CFG.step),
        value: startCfg,
      },
    });
    this.cfgValueEl = controls.createSpan({ text: startCfg, cls: "lig-cfg-value" });
    this.cfgEl.addEventListener("input", () => {
      this.cfgValueEl.setText(this.cfgEl.value);
      this.refresh();
    });
    // Eigene Klasse wie bei lig-cfg-label: der GUI-Smoke muss genau dieses Element messen
    // koennen, ein blosses .lig-label ist von den Nachbarn nicht zu unterscheiden.
    this.denoiseLabelEl = controls.createSpan({ text: t("generate.denoising"), cls: "lig-label lig-denoise-label" });
    const startDenoise = String(DENOISING.default);
    this.denoiseEl = controls.createEl("input", {
      cls: "lig-denoise",
      attr: {
        type: "range",
        min: String(DENOISING.min),
        max: String(DENOISING.max),
        step: String(DENOISING.step),
        value: startDenoise,
      },
    });
    this.denoiseValueEl = controls.createSpan({ text: startDenoise, cls: "lig-denoise-value" });
    this.denoiseEl.addEventListener("input", () => {
      this.denoiseValueEl.setText(Number(this.denoiseEl.value).toFixed(2));
      this.refresh();
    });
    this.seedLabelEl = controls.createSpan({ text: t("generate.seed"), cls: "lig-label lig-seed-label" });
    this.seedEl = controls.createEl("input", {
      cls: "lig-seed",
      attr: { type: "number", value: String(randomSeed()) },
    });
    this.seedEl.addEventListener("input", () => {
      this.refresh();
    });
    this.seedDiceEl = controls.createEl("button", { cls: "clickable-icon lig-seed-dice" });
    setIcon(this.seedDiceEl, "dices");
    setTooltip(this.seedDiceEl, t("generate.randomSeed"));
    this.seedDiceEl.setAttribute("aria-label", t("generate.randomSeed"));
    this.seedDiceEl.addEventListener("click", () => {
      this.seedEl.value = String(randomSeed());
      this.refresh();
    });

    this.generateBtn = controls.createEl("button", { text: t("generate.button.generate"), cls: "mod-cta lig-generate" });
    this.generateBtn.addEventListener("click", () => {
      this.host.generate(this.currentRecipe());
    });

    this.emptyEl = root.createDiv({ cls: "lig-empty" });
    this.emptyTextEl = this.emptyEl.createDiv();
    this.emptyCtaEl = this.emptyEl.createEl("button", { cls: "mod-cta" });
    this.emptyCtaEl.addEventListener("click", () => {
      if (this.emptyCtaAction === "download") this.host.downloadModel();
      else if (this.emptyCtaAction === "cancel-download") this.host.cancelDownload();
      else if (this.emptyCtaAction === "recheck") this.host.recheckServer();
      else this.host.openSettings();
    });

    this.discardDownloadEl = this.emptyEl.createEl("button", { cls: "lig-discard-download is-hidden" });
    this.discardDownloadEl.addEventListener("click", () => this.host.discardDownload());

    this.imageCard = root.createDiv({ cls: "lig-card" });
    this.imgEl = this.imageCard.createEl("img", { cls: "lig-image" });
    const actions = this.imageCard.createDiv({ cls: "lig-row lig-actions" });
    this.regenBtn = actions.createEl("button", { text: t("generate.button.reroll"), cls: "lig-reroll" });
    this.regenBtn.addEventListener("click", () => {
      // Reroll = neuer Zufalls-Seed + generieren. Der obere "Generate"-Knopf nimmt den
      // Seed aus dem Feld und würfelt nie — so sagt jeder Knopf, was er tut.
      this.seedEl.value = String(randomSeed());
      this.host.generate(this.currentRecipe());
    });
    this.createBtn = actions.createEl("button", { text: t("generate.button.create"), cls: "mod-cta" });
    this.createBtn.addEventListener("click", () => this.host.saveImage("create"));
    this.insertBtn = actions.createEl("button", { text: t("generate.button.insert"), cls: "mod-cta" });
    this.insertBtn.addEventListener("click", () => this.host.saveImage("insert"));
    this.initFromResultBtn = actions.createEl("button", { text: t("generate.initImageFromResult"), cls: "lig-init-from-result" });
    this.initFromResultBtn.addEventListener("click", () => this.host.useResultAsInitImage());

    const status = root.createDiv({ cls: "lig-row lig-status" });
    this.statusIconEl = status.createSpan({ cls: "lig-status-icon" });
    this.statusTextEl = status.createSpan({ cls: "lig-status-text" });

    this.buildSizeDropdown(SIZES);
    this.refresh();
  }

  private renderChips(): void {
    // Ein frisch angelegtes, noch nicht befülltes Preset ({label: "", suffix: ""},
    // preset-editor.ts) bleibt außen vor: ein leeres Label wäre ein unsichtbarer Chip,
    // ein leerer Suffix ein Chip, der togglePresetInPrompt zufolge nichts tut (Finding 5).
    const presets = this.host.getSettings().presets.filter((p) => p.label !== "" && p.suffix !== "");
    // Signatur deckt id, label und suffix ab: der Klick-Handler und die Aktiv-Prüfung
    // schließen jeweils über p.suffix, daher muss jede Änderung an Label ODER Suffix
    // (nicht nur an der Anzahl/Reihenfolge der Presets) einen Rebuild auslösen.
    const sig = presets.map((p) => `${p.id}:${p.label}:${p.suffix}`).join("|");
    if (sig !== this.presetSig) {
      // Nur neu bauen, wenn sich die Liste wirklich geändert hat — refresh() läuft
      // bei jedem Tastendruck, ein Rebuild pro Zeichen wäre unnötiger DOM-Churn.
      this.presetSig = sig;
      this.chipsEl.empty();
      this.chipEls = [];
      if (presets.length > 0) this.chipsEl.createSpan({ text: t("generate.presetsLabel"), cls: "lig-label" });
      for (const p of presets) {
        const el = this.chipsEl.createEl("button", { text: p.label, cls: "lig-chip" });
        el.setAttribute("type", "button");
        el.addEventListener("click", () => {
          const next = togglePresetInPrompt(this.promptEl.value, p.suffix);
          this.promptEl.value = next;
          this.host.setPrompt(next);
          this.refresh();
        });
        this.chipEls.push({ suffix: p.suffix, el });
      }
    }
    // Aktiv-Zustand IMMER aus dem Textfeld ableiten — es ist die einzige Wahrheit.
    for (const chip of this.chipEls) {
      const active = presetActive(this.promptEl.value, chip.suffix);
      chip.el.toggleClass("is-active", active);
      chip.el.setAttribute("aria-pressed", String(active));
    }
  }

  /** Größen-Dropdown aus den gegebenen Optionen aufbauen — builtin: `vm.controls.sizes`
   *  (Modellkatalog, z. B. nur 512² bei SD-Turbo, 512²/1024² bei SDXL-Turbo); server: die
   *  generische SIZES-Konstante (der Server-App-seitige Modellwechsel kennt keine
   *  Katalog-Größen). Erhaelt die bisherige Auswahl, wenn sie in den neuen Optionen noch
   *  vorkommt — sonst faellt sie auf die erste Option zurueck (wie applyRecipe()). */
  private buildSizeDropdown(sizes: readonly SizeOption[]): void {
    const vorher = this.sizeEl?.value ?? null;
    this.sizeRowEl.empty();
    this.sizeRowEl.createSpan({ text: t("generate.size"), cls: "lig-label" });
    this.sizeEl = this.sizeRowEl.createEl("select", { cls: "dropdown lig-size" });
    for (const s of sizes)
      this.sizeEl.createEl("option", { text: `${s.width} × ${s.height}`, attr: { value: `${s.width}x${s.height}` } });
    this.sizeEl.addEventListener("change", () => this.refresh());
    const first = sizes[0]!;
    const stillValid = vorher !== null && sizes.some((s) => `${s.width}x${s.height}` === vorher);
    this.sizeEl.value = stillValid && vorher !== null ? vorher : `${first.width}x${first.height}`;
  }

  /** Aktive Größe: Dropdown-Wert (der Dropdown existiert nach mount() immer). */
  private currentSize(): SizeOption {
    const [w, h] = this.sizeEl!.value.split("x").map(Number);
    return { width: w!, height: h! };
  }

  /** Die EINE Lesestelle der DOM-Felder. `denoising` gilt genau dann, wenn der Regler auch
   *  SICHTBAR ist — dieselbe Ableitung, nicht eine zweite: `controls.denoising` faellt das
   *  Urteil (Backend kann es UND eine Vorlage ist gesetzt). Ein eigener Check hier waere im
   *  builtin-Modus mit haengengebliebener Vorlage bereits auseinandergelaufen. */
  private currentRecipe(): PanelRecipe {
    const { width, height } = this.currentSize();
    const sichtbar = buildViewModel(this.host.getPanelState()).controls.denoising;
    return {
      steps: Number(this.stepsEl.value),
      seed: Number(this.seedEl.value),
      cfg: Number(this.cfgEl.value),
      width,
      height,
      denoising: sichtbar ? Number(this.denoiseEl.value) : null,
    };
  }

  /** Ein Rezept aus der Historie in die DOM-Felder schreiben. Der Host wechselt danach
   *  auf den Generate-Tab; refresh() zieht Chips/Aktiv-Zustand nach. */
  applyRecipe(entry: HistoryEntry): void {
    this.promptEl.value = entry.prompt;
    this.host.setPrompt(entry.prompt);
    this.negativePromptEl.value = entry.negativePrompt;
    this.host.setNegativePrompt(entry.negativePrompt);
    this.seedEl.value = String(entry.seed);
    const range = this.stepsRange ?? { min: STEPS.min, max: STEPS.max };
    const steps = Math.min(range.max, Math.max(range.min, entry.steps));
    this.stepsEl.value = String(steps);
    this.stepsValueEl.setText(String(steps));
    // `cfg: null` heisst „der Eintrag sagt nichts ueber CFG" (comfy-Lauf) — dann bleibt der
    // Regler stehen, wo er steht. Ihn zu setzen ginge nur mit einer erfundenen Zahl, und ohne
    // diesen Zweig faellt `null` durch die Klemme auf CFG.min (Math.max(1, null) === 1) und
    // riesse den Regler bei jedem zurueckgeladenen comfy-Rezept auf 1.
    if (entry.cfg !== null) {
      const cfg = Math.min(CFG.max, Math.max(CFG.min, entry.cfg));
      this.cfgEl.value = String(cfg);
      this.cfgValueEl.setText(String(cfg));
    }
    // Die Vorlage selbst setzt der HOST (nur er kann den Vault lesen) — hier nur der Regler.
    const denoise = entry.denoising ?? DENOISING.default;
    this.denoiseEl.value = String(denoise);
    this.denoiseValueEl.setText(Number(this.denoiseEl.value).toFixed(2));
    const inCatalog = SIZES.some((s) => s.width === entry.width && s.height === entry.height);
    const size = inCatalog ? { width: entry.width, height: entry.height } : SIZES[0]!;
    this.sizeEl!.value = `${size.width}x${size.height}`;
    this.refresh();
  }

  refresh(): void {
    // setRecipe ZUERST, dann lesen: das ViewModel vergleicht das Ergebnis-Rezept gegen den
    // Panel-Zustand (recipeUnchanged → generateEnabled). Andersherum misst es den vorigen
    // Reglerstand, und der Generate-Knopf haengt eine Aenderung hinterher.
    this.host.setRecipe(this.currentRecipe());
    const state = this.host.getPanelState();
    this.renderChips();
    const vm = buildViewModel(state);

    this.modelInfoEl.setText(vm.modelLabel);
    // Regler pro Modus (Keine-Attrappen-Linie): die eingebaute Engine kennt weder Negativ-Prompt
    // noch CFG noch andere Größen; der Steps-Slider bekommt den Bereich des Modells. Grenzen nur
    // beim Wechsel setzen — der Wert wird dabei in den neuen Bereich geklemmt.
    this.negativePromptRowEl.toggleClass("is-hidden", !vm.controls.negative);
    this.cfgLabelEl.toggleClass("is-hidden", !vm.controls.cfg);
    this.cfgEl.toggleClass("is-hidden", !vm.controls.cfg);
    this.cfgValueEl.toggleClass("is-hidden", !vm.controls.cfg);
    // Abnahme-Befund Welle 13: Steps/Seed waren die einzigen Regler ohne eigenes
    // Sichtbarkeits-Signal — ein Kurzbefehl-Backend, das beide ignoriert, zeigte sie trotzdem
    // bedienbar an (Keine-Attrappen-Linie). "Reroll" haengt am Seed: ohne Seed-Wirkung ist ein
    // Knopf, der einen neuen Seed wuerfelt und generiert, dieselbe Attrappe.
    this.stepsLabelEl.toggleClass("is-hidden", !vm.controls.steps);
    this.stepsEl.toggleClass("is-hidden", !vm.controls.steps);
    this.stepsValueEl.toggleClass("is-hidden", !vm.controls.steps);
    this.seedLabelEl.toggleClass("is-hidden", !vm.controls.seed);
    this.seedEl.toggleClass("is-hidden", !vm.controls.seed);
    this.seedDiceEl.toggleClass("is-hidden", !vm.controls.seed);
    this.regenBtn.toggleClass("is-hidden", !vm.controls.seed);
    this.sizeRowEl.toggleClass("is-hidden", !vm.controls.size);
    // Optionen NUR aus dem Modellkatalog (builtin) oder der generischen Konstante (server) —
    // nicht aus dem Modellnamen ableiten (Kommentar an buildSizeDropdown()).
    const sizeOptions = vm.controls.sizes ?? SIZES;
    const sizeIds = sizeOptions.map((s) => `${s.width}x${s.height}`).join(",");
    if (sizeIds !== this.renderedSizeIds) {
      this.renderedSizeIds = sizeIds;
      const vorherSize = this.sizeEl?.value ?? null;
      this.buildSizeDropdown(sizeOptions);
      if (this.sizeEl!.value !== vorherSize) this.host.setRecipe(this.currentRecipe());
    }
    // Modell-Dropdown (Task 12): NUR bei sichtbarem Picker sind die Optionen ueberhaupt
    // relevant, aber toggleClass laeuft immer — dieselbe Regel wie bei den anderen Zeilen.
    this.modelPickEl.toggleClass("is-hidden", !vm.controls.modelPicker);
    this.modelPickLabelEl.toggleClass("is-hidden", !vm.controls.modelPicker);
    const modelIds = vm.modelOptions.map((o) => o.id).join(",");
    if (modelIds !== this.renderedModelIds) {
      this.renderedModelIds = modelIds;
      this.modelPickEl.empty();
      for (const o of vm.modelOptions) this.modelPickEl.createEl("option", { text: o.label, attr: { value: o.id } });
    }
    // vm hat kein eigenes builtinModel-Feld (nur modelLabel/modelOptions) — die Auswahl kommt
    // aus dem State, nicht dem ViewModel (Divergenz vom Brief-Snippet, siehe Taskbericht).
    // NUR setzen, wenn es die Option gibt: ein `select.value` ohne passende `<option>` setzt
    // die Auswahl auf LEER, und das Feld zeigte dann nichts an, statt beim bisherigen Wert zu
    // bleiben. Heute unsichtbar (in genau dem Fall ist der Picker verborgen) — aber die
    // Bedingung dafuer ist `downloadedModels`, nicht dieser Code hier, und die kann sich
    // aendern (Nachlese 0.9.0).
    if (vm.modelOptions.some((o) => o.id === state.builtinModel)) this.modelPickEl.value = state.builtinModel;
    // Zwei getrennte Fragen (Spec §3): kann das BACKEND ein Ausgangsbild (ganze Zeile), und
    // gibt es ueberhaupt eine Vorlage zu aendern (nur der Regler)?
    this.initRowEl.toggleClass("is-hidden", !vm.controls.initImage);
    this.denoiseLabelEl.toggleClass("is-hidden", !vm.controls.denoising);
    this.denoiseEl.toggleClass("is-hidden", !vm.controls.denoising);
    this.denoiseValueEl.toggleClass("is-hidden", !vm.controls.denoising);
    this.initFromResultBtn.toggleClass("is-hidden", !vm.controls.initImage);
    const init = state.initImage;
    this.initThumbEl.toggleClass("is-hidden", init === null);
    this.initClearBtn.toggleClass("is-hidden", init === null);
    if (init !== null) this.initThumbEl.src = init.dataUrl;
    this.initPathEl.setText(init?.path ?? t("generate.initImageNone"));
    if (this.stepsRange?.min !== vm.controls.stepsMin || this.stepsRange.max !== vm.controls.stepsMax) {
      this.stepsRange = { min: vm.controls.stepsMin, max: vm.controls.stepsMax };
      // Vor dem Setzen der Grenzen lesen — danach hat der Browser bereits geklemmt.
      const vorher = Number(this.stepsEl.value);
      this.stepsEl.min = String(vm.controls.stepsMin);
      this.stepsEl.max = String(vm.controls.stepsMax);
      // NICHT gegen `stepsEl.value` vergleichen, um das Nachziehen zu sparen: der Browser
      // klemmt den Wert eines range-Inputs SELBST, sobald `max` kleiner wird. `value` steht
      // danach also schon auf 4, `clamped` ist gleich — und die Zahl daneben (ein eigenes
      // Span) bliebe fuer immer auf ihrem Startwert stehen. Gemessen 2026-08-21 an einem
      // README-Screenshot: Regler am rechten Anschlag, Beschriftung „20", gerechnet wurde
      // mit 4. Der Zustand war korrekt, nur die Anzeige log.
      const clamped = Math.min(vm.controls.stepsMax, Math.max(vm.controls.stepsMin, vorher));
      this.stepsEl.value = String(clamped);
      this.stepsValueEl.setText(String(clamped));
      if (clamped !== vorher) {
        // Rezept im Host nachziehen, sonst rechnet generate() mit dem alten Wert.
        this.host.setRecipe(this.currentRecipe());
      }
    }

    // Hier stand bis zum Final-Review ein Denoise-Gegenstueck zum Steps-Block oben. Seit 0.12
    // setzt niemand mehr `min`/`step` des Denoise-Reglers nach — sie kommen bei der Erzeugung
    // aus denselben Konstanten, gegen die der Block verglich, die Bedingung konnte also nicht
    // mehr wahr werden. Ein Kommentar, der eine Absicherung BEHAUPTET, die es nicht gibt, ist
    // teurer als gar keine: er laedt dazu ein, sich auf einen nie ausgefuehrten Pfad zu
    // verlassen. Die Klemm-Falle vom 2026-08-21 bewacht weiterhin der Steps-Block oben — dort
    // ist sie echt (`stepsMin`/`stepsMax` haengen am Backend). Wer den Denoise-Regler wieder
    // dynamisch bemasst, holt sich das Muster von dort zurueck, samt Test.

    this.generateBtn.disabled = !vm.generateEnabled;
    this.emptyEl.toggleClass("is-hidden", vm.empty === null);
    if (vm.empty) {
      this.emptyTextEl.setText(vm.empty.text);
      this.emptyCtaEl.toggleClass("is-hidden", vm.empty.ctaLabel === undefined);
      if (vm.empty.ctaLabel) this.emptyCtaEl.setText(vm.empty.ctaLabel);
      this.emptyCtaAction = vm.empty.ctaAction;
      this.discardDownloadEl.toggleClass("is-hidden", vm.empty.discardLabel === undefined);
      if (vm.empty.discardLabel) this.discardDownloadEl.setText(vm.empty.discardLabel);
    }
    this.imageCard.toggleClass("is-hidden", !vm.showImage);
    if (state.image) this.imgEl.src = state.image.dataUrl;
    this.insertBtn.disabled = !vm.insertEnabled;
    setTooltip(this.insertBtn, vm.insertEnabled ? "" : t("generate.insertNeedsEditor"));

    this.statusIconEl.className = `lig-status-icon ${vm.status.cls}`;
    setIcon(this.statusIconEl, vm.status.icon);
    this.statusIconEl.setAttribute("aria-label", vm.status.text);
    this.statusTextEl.setText(vm.status.text);
  }

  destroy(): void {}
}
