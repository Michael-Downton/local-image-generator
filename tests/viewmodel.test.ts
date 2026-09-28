import { beforeEach, describe, expect, it } from "vitest";
import { registerI18n } from "../src/i18n/strings";
import { setLang } from "../src/vendor/kit/i18n";
import { buildViewModel, formatBytes, formatElapsed, partialDownloadLabel, type GenParams, type PanelState } from "../src/core/viewmodel";
import { assetsFor, RUNTIME_WASM, totalBytes } from "../src/core/model-manifest";
import type { WorkflowState } from "../src/core/comfy/state";

beforeEach(() => {
  registerI18n();
  setLang("en");
});

const baseParams: GenParams = {
  initImage: null,
  denoising: null,
  prompt: "a cat",
  negativePrompt: "",
  seed: 1,
  steps: 4,
  cfg: 7,
  model: "sd-turbo",
  width: 512,
  height: 512,
  date: "2026-07-23T10:00:00",
};

const base: PanelState = {
  initImage: null,
  denoising: null,
  missingBytes: null,
  downloadedModels: [],
  builtinModel: "sd-turbo",
  showModelPicker: false,
  mode: "server",
  workflow: { kind: "unconfigured" },
  engine: { kind: "not-downloaded" },
  server: { kind: "ok", modelName: "sd-turbo" },
  playgroundShortcutName: "Generate Image (Obsidian)",
  run: { kind: "idle" },
  image: null,
  editorActive: true,
  prompt: "a cat",
  negativePrompt: "",
  seed: 1,
  steps: 4,
  cfg: 7,
  width: 512,
  height: 512,
};

/** Basis + Overrides — spart das Ausschreiben aller PanelState-Felder in jedem Test. */
const stateOf = (overrides: Partial<PanelState>): PanelState => ({ ...base, ...overrides });

describe("download recovery", () => {
  it("shows resume and discard for retained data, including after a download error", () => {
    for (const engine of [{ kind: "paused", retained: 1024 * 1024 }, { kind: "error", retained: 1024 * 1024, message: "offline" }] as const) {
      const vm = buildViewModel(stateOf({ mode: "builtin", engine }));
      expect(vm.empty?.ctaAction).toBe("download");
      expect(vm.empty?.ctaLabel).toBe("Resume download");
      expect(vm.empty?.discardLabel).toBe("Discard partial download");
      expect(vm.empty?.text).toContain("1 MB");
      expect(vm.generateEnabled).toBe(false);
    }
  });

  it("shows retry timing and retained bytes with cancellation instead of another download", () => {
    const vm = buildViewModel(stateOf({ mode: "builtin", engine: {
      kind: "retrying", file: "unet.onnx", retained: 1024 * 1024, seconds: 3, attempt: 2, maxAttempts: 5,
    } }));
    expect(vm.status.text).toContain("3s");
    expect(vm.status.text).toContain("2/5");
    expect(vm.status.text).toContain("1 MB");
    expect(vm.empty?.ctaAction).toBe("cancel-download");
    expect(vm.empty?.discardLabel).toBeUndefined();
    expect(vm.generateEnabled).toBe(false);
  });

  it("allows cancellation while waiting for another vault's download lock", () => {
    const vm = buildViewModel(stateOf({ mode: "builtin", engine: { kind: "preparing-download" } }));
    expect(vm.status.text).toBe("Preparing download…");
    expect(vm.empty?.ctaAction).toBe("cancel-download");
    expect(vm.generateEnabled).toBe(false);
  });
});

/** Alias fuer die comfy-Tests unten — dieselbe Basis wie `base`, nur unter dem Namen, den
 *  der Task-9-Brief benutzt. */
const PANEL_DEFAULT = base;

/** Ein gueltig eingelesener Workflow (inspectWorkflow-Ausgabe), fuer Tests, die nur
 *  brauchen, dass der Workflow-Zustand "ok" ist — die konkreten Node-IDs sind beliebig. */
const OK_WORKFLOW: WorkflowState = {
  kind: "ok",
  path: "w.json",
  json: "{}",
  slots: {
    sampler: "3",
    positive: "6",
    negative: "7",
    latent: "5",
    seedField: "seed",
    stepsField: "steps",
    workflowSteps: 20,
  },
};

describe("buildViewModel — server state", () => {
  it("unconfigured: Fehler-Status, Empty mit Settings-CTA, Generate disabled", () => {
    const vm = buildViewModel({ ...base, server: { kind: "unconfigured" } });
    expect(vm.generateEnabled).toBe(false);
    expect(vm.status.cls).toBe("is-error");
    expect(vm.status.icon).toBe("circle-x");
    expect(vm.empty?.ctaAction).toBe("settings");
    expect(vm.empty?.ctaLabel).toBeDefined();
  });

  it("checking: Loader-Status, Generate disabled", () => {
    const vm = buildViewModel({ ...base, server: { kind: "checking" } });
    expect(vm.status.icon).toBe("loader");
    expect(vm.generateEnabled).toBe(false);
  });

  it("unreachable: Fehler-Status, Empty mit Recheck-CTA, Generate disabled", () => {
    const vm = buildViewModel({ ...base, server: { kind: "unreachable" } });
    expect(vm.status.cls).toBe("is-error");
    expect(vm.empty?.ctaAction).toBe("recheck");
    expect(vm.generateEnabled).toBe(false);
  });

  it("ok + idle + nicht-leerer Prompt: Generate enabled, Status ready", () => {
    const vm = buildViewModel(base);
    expect(vm.generateEnabled).toBe(true);
    expect(vm.status.cls).toBe("is-ok");
    expect(vm.status.text).toBe("Ready");
  });

  it("leerer Prompt: Generate disabled trotz erreichbarem Server", () => {
    expect(buildViewModel({ ...base, prompt: "  " }).generateEnabled).toBe(false);
  });
});

describe("buildViewModel — run state", () => {
  it("contacting: Loader-Status 'Contacting server', Generate disabled", () => {
    const vm = buildViewModel({ ...base, run: { kind: "contacting" } });
    expect(vm.status.icon).toBe("loader");
    expect(vm.status.text).toContain("Contacting server");
    expect(vm.generateEnabled).toBe(false);
  });

  it("generating mit pct: Text enthält Prozent", () => {
    const vm = buildViewModel({ ...base, run: { kind: "generating", pct: 42, elapsedSec: 3 } });
    expect(vm.status.icon).toBe("loader");
    expect(vm.status.text).toContain("42");
    expect(vm.generateEnabled).toBe(false);
  });

  it("generating ohne pct: Text enthält verstrichene Zeit", () => {
    const vm = buildViewModel({ ...base, run: { kind: "generating", pct: null, elapsedSec: 65 } });
    expect(vm.status.text).toContain("1:05");
    expect(vm.generateEnabled).toBe(false);
  });

  it("error: Fehlerstatus mit Message, Generate bei nicht-leerem Prompt wieder enabled (Retry)", () => {
    const vm = buildViewModel({ ...base, run: { kind: "error", message: "boom" } });
    expect(vm.status.cls).toBe("is-error");
    expect(vm.status.text).toContain("boom");
    expect(vm.generateEnabled).toBe(true);
  });

  it("meldet einen Fremdlauf sichtbar und sperrt Generate", () => {
    const vm = buildViewModel({ ...base, run: { kind: "external", pct: 40 } });
    expect(vm.status.text).toContain("40");
    expect(vm.generateEnabled).toBe(false);
  });

  it("Fremdlauf ohne Prozent zeigt den eigenen Text (kein roher Key bei Tippfehler)", () => {
    const vm = buildViewModel({ ...base, run: { kind: "external", pct: null } });
    expect(vm.status.text).toBe("Another plugin is generating an image…");
    expect(vm.generateEnabled).toBe(false);
  });
});

describe("buildViewModel — Bild/Insert", () => {
  it("Bild da: showImage, Insert nur mit aktivem Editor", () => {
    const withImg: PanelState = {
      ...base,
      image: { dataUrl: "data:", params: baseParams },
    };
    expect(buildViewModel(withImg).showImage).toBe(true);
    expect(buildViewModel(withImg).insertEnabled).toBe(true);
    expect(buildViewModel({ ...withImg, editorActive: false }).insertEnabled).toBe(false);
  });

  it("kein Bild, nicht busy: Empty-State 'kein Bild'", () => {
    const vm = buildViewModel(base);
    expect(vm.empty?.text).toBeDefined();
    expect(vm.showImage).toBe(false);
  });

  it("kein Bild, aber generating: kein widersprüchlicher Empty-State", () => {
    const vm = buildViewModel({ ...base, run: { kind: "generating", pct: 10, elapsedSec: 1 } });
    expect(vm.empty).toBeNull();
  });
});

describe("buildViewModel — Generate-Gating (unverändertes Rezept)", () => {
  it("identisches Rezept + modelName stimmt überein → Generate disabled, Reroll unberührt", () => {
    const state: PanelState = {
      ...base,
      image: { dataUrl: "data:", params: baseParams },
    };
    expect(buildViewModel(state).generateEnabled).toBe(false);
  });

  it("identisches Rezept, aber modelName: null (unbeobachtbarer Serverwechsel) → Generate enabled", () => {
    const state: PanelState = {
      ...base,
      server: { kind: "ok", modelName: null },
      image: { dataUrl: "data:", params: baseParams },
    };
    expect(buildViewModel(state).generateEnabled).toBe(true);
  });

  it("ein abweichendes Feld (cfg) → Generate wieder enabled", () => {
    const state: PanelState = {
      ...base,
      cfg: 9,
      image: { dataUrl: "data:", params: baseParams },
    };
    expect(buildViewModel(state).generateEnabled).toBe(true);
  });

  it("abweichender negativePrompt → Generate wieder enabled", () => {
    const state: PanelState = {
      ...base,
      negativePrompt: "blurry",
      image: { dataUrl: "data:", params: baseParams },
    };
    expect(buildViewModel(state).generateEnabled).toBe(true);
  });
});

describe("formatElapsed", () => {
  it("formatiert Sekunden als m:ss", () => {
    expect(formatElapsed(0)).toBe("0:00");
    expect(formatElapsed(5)).toBe("0:05");
    expect(formatElapsed(65)).toBe("1:05");
    expect(formatElapsed(3661)).toBe("61:01");
  });
});

describe("buildViewModel — builtin engine (0.6)", () => {
  const builtin: PanelState = { ...base, mode: "builtin", server: { kind: "unconfigured" }, cfg: 1 };

  it("server-Modus: alle Regler sichtbar, Steps 1–50, kontinuierlich", () => {
    expect(buildViewModel(base).controls).toEqual({
      negative: true, cfg: true, size: true, sizes: null, initImage: true, denoising: false,
      modelPicker: false, stepsMin: 1, stepsMax: 50, steps: true, seed: true,
    });
  });
  it("builtin/not-downloaded: Regler reduziert, CTA download, Generate gesperrt — der Server-Zustand ist egal; img2img seit 0.11 aber verfuegbar", () => {
    const vm = buildViewModel(builtin);
    expect(vm.controls).toEqual({
      negative: false, cfg: false, size: false, sizes: [{ width: 512, height: 512 }], initImage: true,
      denoising: false, modelPicker: false, stepsMin: 1, stepsMax: 8, steps: true, seed: true,
    });
    expect(vm.empty?.ctaAction).toBe("download");
    expect(vm.status.cls).toBe("is-error");
    expect(vm.generateEnabled).toBe(false);
  });
  it("builtin/downloading zeigt Datei und MB in der Statuszeile, CTA cancel-download", () => {
    const vm = buildViewModel({ ...builtin, engine: { kind: "downloading", file: "model.onnx", received: 812e6, total: 1733e6, fileIndex: 2, fileCount: 6 } });
    expect(vm.status.text).toContain("model.onnx");
    expect(vm.status.text).toContain("812 MB");
    expect(vm.status.text).toContain("1.7 GB");
    expect(vm.status.cls).toBe("is-checking");
    expect(vm.empty?.ctaAction).toBe("cancel-download");
    expect(vm.generateEnabled).toBe(false);
  });
  it("builtin/verifying: Prüfstatus, weiter cancel-download", () => {
    const vm = buildViewModel({ ...builtin, engine: { kind: "verifying", file: "model.onnx" } });
    expect(vm.status.text).toContain("model.onnx");
    expect(vm.empty?.ctaAction).toBe("cancel-download");
  });
  it("builtin/gpu-missing: Fehlerstatus mit Grund, CTA settings, Generate gesperrt", () => {
    const vm = buildViewModel({ ...builtin, engine: { kind: "gpu-missing", reason: "no-f16" } });
    expect(vm.status.cls).toBe("is-error");
    expect(vm.status.text).toContain("f16");
    expect(vm.empty?.ctaAction).toBe("settings");
    expect(vm.generateEnabled).toBe(false);
  });
  it("builtin/error: Fehlertext, CTA download (Retry)", () => {
    const vm = buildViewModel({ ...builtin, engine: { kind: "error", message: "checksum" } });
    expect(vm.status.text).toContain("checksum");
    expect(vm.empty?.ctaAction).toBe("download");
  });
  it("builtin/ready: Generate frei, Modell-Label nennt SD-Turbo, Leerzustand wie gewohnt", () => {
    const vm = buildViewModel({ ...builtin, engine: { kind: "ready" } });
    expect(vm.generateEnabled).toBe(true);
    expect(vm.modelLabel).toContain("SD-Turbo");
    expect(vm.status.cls).toBe("is-ok");
    expect(vm.empty?.ctaAction).toBeUndefined();
  });
  it("loading-model zeigt Sekunden und sperrt Generate; generating im builtin-Modus zeigt Prozent", () => {
    const loading = buildViewModel({ ...builtin, engine: { kind: "ready" }, run: { kind: "loading-model", elapsedSec: 42 } });
    expect(loading.status.text).toContain("0:42");
    expect(loading.generateEnabled).toBe(false);
    expect(loading.empty).toBeNull();
    const gen = buildViewModel({ ...builtin, engine: { kind: "ready" }, run: { kind: "generating", pct: 50, elapsedSec: 3 } });
    expect(gen.status.text).toContain("50");
  });
  it("contacting heißt im builtin-Modus nicht „Server", () => {
    const vm = buildViewModel({ ...builtin, engine: { kind: "ready" }, run: { kind: "contacting" } });
    expect(vm.status.text).not.toMatch(/server/i);
    expect(vm.status.cls).toBe("is-checking");
  });
  it("run.error hat im builtin-Modus Vorrang vor dem Engine-Zustand", () => {
    const vm = buildViewModel({ ...builtin, engine: { kind: "ready" }, run: { kind: "error", message: "boom" } });
    expect(vm.status.text).toContain("boom");
  });
  it("recipeUnchanged sperrt im builtin-Modus gegen model 'sd-turbo', unabhängig vom Server-Modellnamen", () => {
    const img = { dataUrl: "d", params: { ...baseParams, cfg: 1, model: "sd-turbo" } };
    expect(buildViewModel({ ...builtin, engine: { kind: "ready" }, image: img }).generateEnabled).toBe(false);
    expect(buildViewModel({ ...builtin, engine: { kind: "ready" }, image: img, seed: 2 }).generateEnabled).toBe(true);
  });
  // Regression: recipeUnchanged verglich frueher IMMER gegen das feste Default-Modell
  // (BUILTIN_MODEL.id === "sd-turbo") statt gegen das GEWAEHLTE (state.builtinModel) — mit
  // sdxl-turbo aktiv waere Generate nach einem unveraenderten Rezept nie gesperrt gewesen.
  it("recipeUnchanged sperrt auch mit sdxl-turbo als gewaehltem Modell, nicht nur mit dem Default", () => {
    const sdxlState = { ...builtin, builtinModel: "sdxl-turbo" as const, engine: { kind: "ready" as const } };
    const matchingImg = { dataUrl: "d", params: { ...baseParams, cfg: 1, model: "sdxl-turbo" } };
    const staleImg = { dataUrl: "d", params: { ...baseParams, cfg: 1, model: "sd-turbo" } };
    expect(buildViewModel({ ...sdxlState, image: matchingImg }).generateEnabled).toBe(false);
    expect(buildViewModel({ ...sdxlState, image: staleImg }).generateEnabled).toBe(true);
  });
  // Review-Befund (14a-Fixrunde): engineEmpty() rechnete die "not-downloaded"-Groesse ueber
  // allAssets() — das ist per Definition IMMER das Default-Modell (sd-turbo). Mit sdxl-turbo
  // gewaehlt und nicht gecacht zeigte Panel und Download-Knopf 2,5 GB und luden tatsaechlich
  // 6,4 GB. Der Name war zusaetzlich als Literal "SD-Turbo" im String hartkodiert.
  it("builtin/not-downloaded nennt Name UND Groesse des GEWAEHLTEN Modells, nicht des Default", () => {
    const sdTurboSize = formatBytes(totalBytes([...assetsFor("sd-turbo"), RUNTIME_WASM]));
    const sdxlTurboSize = formatBytes(totalBytes([...assetsFor("sdxl-turbo"), RUNTIME_WASM]));
    expect(sdxlTurboSize).not.toBe(sdTurboSize); // die Faelle muessen sich ueberhaupt unterscheiden

    const sdVm = buildViewModel({ ...builtin, builtinModel: "sd-turbo" });
    expect(sdVm.empty?.text).toContain("SD-Turbo");
    expect(sdVm.empty?.text).toContain(sdTurboSize);
    expect(sdVm.empty?.ctaLabel).toContain(sdTurboSize);

    const sdxlVm = buildViewModel({ ...builtin, builtinModel: "sdxl-turbo" });
    expect(sdxlVm.empty?.text).toContain("SDXL-Turbo");
    expect(sdxlVm.empty?.text).toContain(sdxlTurboSize);
    expect(sdxlVm.empty?.ctaLabel).toContain(sdxlTurboSize);
    expect(sdxlVm.empty?.text).not.toContain(sdTurboSize);
  });
  // 0.12-Befund aus dem 0.11.0-Final-Review: seit der VAE-Encoder Pflichtteil ist, gilt eine
  // Bestandsinstallation als `not-downloaded`, obwohl ihr nur EINE Datei fehlt. Panel und Knopf
  // nannten trotzdem die Gesamtgroesse — ein SDXL-Nutzer liest "7,1 GB" fuer 137 MB und bricht ab.
  it("builtin/not-downloaded nennt die FEHLENDEN Bytes, wenn nur ein Teil nachzuladen ist", () => {
    const gesamt = formatBytes(totalBytes([...assetsFor("sdxl-turbo"), RUNTIME_WASM]));
    const fehlend = formatBytes(137_000_000);
    expect(fehlend).not.toBe(gesamt);

    const vm = buildViewModel({ ...builtin, builtinModel: "sdxl-turbo", missingBytes: 137_000_000 });
    // Der Knopf verspricht, was der Klick wirklich kostet.
    expect(vm.empty?.ctaLabel).toContain(fehlend);
    expect(vm.empty?.ctaLabel).not.toContain(gesamt);
    // Der Text nennt beides: die kleine Zahl als Kosten, die grosse als das, was danach daliegt.
    expect(vm.empty?.text).toContain(fehlend);
    expect(vm.empty?.text).toContain(gesamt);
  });

  it("faellt auf die Gesamtgroesse zurueck, wenn nichts im Cache liegt oder die Zahl unbekannt ist", () => {
    const gesamt = formatBytes(totalBytes([...assetsFor("sdxl-turbo"), RUNTIME_WASM]));
    const voll = totalBytes([...assetsFor("sdxl-turbo"), RUNTIME_WASM]);

    // (a) unbekannt: der Zustand ist noch nicht gemessen — keine erfundene Teilzahl.
    const unbekannt = buildViewModel({ ...builtin, builtinModel: "sdxl-turbo", missingBytes: null });
    expect(unbekannt.empty?.ctaLabel).toContain(gesamt);

    // (b) es fehlt ohnehin alles: dann waere "7,1 GB von 7,1 GB" nur Rauschen.
    const alles = buildViewModel({ ...builtin, builtinModel: "sdxl-turbo", missingBytes: voll });
    expect(alles.empty?.ctaLabel).toContain(gesamt);
    expect(alles.empty?.text).toBe(unbekannt.empty?.text);

    // (c) LIVE-BEFUND vom 2026-09-02 (GUI-Smoke Punkt 13): "alles" ist nie exakt alles.
    // `removeModel()` entfernt das Modell, NICHT die ORT-WASM — die bleibt im Cache. Damit ist
    // `missingBytes` echt kleiner als die Gesamtgroesse, und das Panel sagte bei leerem
    // Modell-Cache "Fehlende 2.6 GB herunterladen". Wahr, aber irrefuehrend: wer beide Zahlen
    // GLEICH liest, dem sagt die Teil-Formulierung nichts. Entscheidend ist deshalb nicht der
    // Zahlenvergleich, sondern der ANGEZEIGTE Unterschied.
    const fastAlles = buildViewModel({ ...builtin, builtinModel: "sdxl-turbo", missingBytes: voll - 24_254_953 });
    expect(formatBytes(voll - 24_254_953)).toBe(gesamt); // Vorbedingung: formatiert nicht unterscheidbar
    expect(fastAlles.empty?.ctaLabel).toBe(unbekannt.empty?.ctaLabel);
    expect(fastAlles.empty?.text).toBe(unbekannt.empty?.text);
  });

  // EINE Entscheidung fuer Panel UND Bestaetigungsdialog: ein Dialog, der eine andere Zahl
  // nennt als der Knopf, der ihn geoeffnet hat, sieht wie ein Fehler aus. Zwei Kopien derselben
  // Bedingung waeren genau der Weg dorthin (vgl. `hardenParams`).
  describe("partialDownloadLabel", () => {
    it("nennt die fehlenden Bytes nur, wenn sie ANGEZEIGT etwas anderes sagen", () => {
      expect(partialDownloadLabel(137_000_000, 7_100_000_000)).toBe(formatBytes(137_000_000));
      expect(partialDownloadLabel(null, 7_100_000_000)).toBeNull();               // ungemessen
      expect(partialDownloadLabel(7_100_000_000, 7_100_000_000)).toBeNull();      // alles fehlt
      expect(partialDownloadLabel(7_099_000_000, 7_100_000_000)).toBeNull();      // formatiert gleich
    });
  });

  it("formatBytes", () => {
    expect(formatBytes(812e6)).toBe("812 MB");
    expect(formatBytes(1733e6)).toBe("1.7 GB");
    expect(formatBytes(530e3)).toBe("1 MB");
  });
});

describe("Regler fuer img2img — zwei Fragen, nicht eine", () => {
  const vorlage = { path: "Bilder/a.png", dataUrl: "data:image/png;base64,AAAA" };

  it("die Vorlagen-Zeile gehoert seit 0.11 beiden Modi — der VAE-Encoder ist im builtin-Modus Pflicht-Asset", () => {
    expect(buildViewModel({ ...base, mode: "server" }).controls.initImage).toBe(true);
    expect(buildViewModel({ ...base, mode: "builtin" }).controls.initImage).toBe(true);
  });

  // Zweite Stufe: der Regler haengt nicht am Backend, sondern daran, ob es ueberhaupt etwas
  // zu aendern gibt. Ein Denoise-Regler ohne Vorlage ist dieselbe Attrappe wie ein
  // CFG-Regler im builtin-Modus — nur eine Ebene tiefer.
  it("der Denoise-Regler erscheint erst mit einer Vorlage", () => {
    expect(buildViewModel({ ...base, mode: "server", initImage: null }).controls.denoising).toBe(false);
    expect(buildViewModel({ ...base, mode: "server", initImage: vorlage }).controls.denoising).toBe(true);
  });

  // Vor 0.11 verschwand eine aus dem Server-Modus mitgenommene Vorlage im builtin-Modus
  // spurlos (initImage: false streichte die ganze Zeile). Seit dem Capabilities-Flip zeigt
  // der Wechsel denselben Regler wie im Server-Modus.
  it("eine Vorlage aus einem frueheren Server-Lauf zeigt seit 0.11 auch im builtin-Modus den Regler", () => {
    const vm = buildViewModel({ ...base, mode: "builtin", initImage: vorlage });
    expect(vm.controls.initImage).toBe(true);
    expect(vm.controls.denoising).toBe(true);
  });
});

describe("generateEnabled kennt img2img", () => {
  const vorlage = { path: "Bilder/a.png", dataUrl: "data:image/png;base64,AAAA" };
  // Ein Ergebnis, dessen Rezept exakt dem aktuellen Panel-Zustand entspricht: Generate ist
  // ausgegraut, weil ein erneuter Lauf dasselbe Bild braechte.
  const fertig: PanelState = {
    ...base,
    prompt: baseParams.prompt,
    negativePrompt: baseParams.negativePrompt,
    seed: baseParams.seed,
    steps: baseParams.steps,
    // `PanelState.cfg` ist der REGLERWERT (immer eine Zahl), `GenParams.cfg` das Ergebnis
    // der Haertung (seit 0.13 auch `null` = vom Backend bestimmt) — der Fallback haelt die
    // beiden Typen auseinander, ohne die Gleichheit dieses Falls (7) anzutasten.
    cfg: baseParams.cfg ?? base.cfg,
    width: baseParams.width,
    height: baseParams.height,
    image: { dataUrl: "data:,", params: baseParams },
  };

  it("das unveraenderte Rezept sperrt Generate weiterhin", () => {
    expect(buildViewModel(fertig).generateEnabled).toBe(false);
  });

  // Derselbe Seed mit Vorlage ergibt ein VOELLIG anderes Bild — der Lauf ginge an einen
  // anderen Endpunkt. Ohne diesen Vergleich bleibt der Knopf gesperrt und das Feature ist
  // aus dem Panel heraus unbenutzbar, sobald einmal ein Bild dasteht.
  it("eine neu gesetzte Vorlage macht das Rezept wieder erzeugbar", () => {
    const mit = buildViewModel({ ...fertig, initImage: vorlage, denoising: 0.4 });
    expect(mit.generateEnabled).toBe(true);
  });

  it("eine geaenderte Aenderungsstaerke zaehlt als neues Rezept", () => {
    const gerechnet = { ...baseParams, initImage: "Bilder/a.png", denoising: 0.4 };
    const stand: PanelState = { ...fertig, image: { dataUrl: "data:,", params: gerechnet },
                                initImage: vorlage, denoising: 0.4 };
    expect(buildViewModel(stand).generateEnabled).toBe(false);
    expect(buildViewModel({ ...stand, denoising: 0.8 }).generateEnabled).toBe(true);
  });

  it("das Entfernen der Vorlage zaehlt ebenfalls als neues Rezept", () => {
    const gerechnet = { ...baseParams, initImage: "Bilder/a.png", denoising: 0.4 };
    const stand: PanelState = { ...fertig, image: { dataUrl: "data:,", params: gerechnet },
                                initImage: null, denoising: null };
    expect(buildViewModel(stand).generateEnabled).toBe(true);
  });
});

describe("Modell-Picker im Panel (Spec 0.9 §6.2)", () => {
  const basis = { ...stateOf({ mode: "builtin" }), builtinModel: "sdxl-turbo" as const };

  it("unsichtbar, wenn der Toggle aus ist — auch bei zwei geladenen Modellen", () => {
    const vm = buildViewModel({ ...basis, showModelPicker: false, downloadedModels: ["sd-turbo", "sdxl-turbo"] });
    expect(vm.controls.modelPicker).toBe(false);
  });

  it("unsichtbar, wenn nur ein Modell geladen ist — auch mit Toggle an", () => {
    const vm = buildViewModel({ ...basis, showModelPicker: true, downloadedModels: ["sdxl-turbo"] });
    expect(vm.controls.modelPicker).toBe(false);
  });

  it("sichtbar erst, wenn beide Bedingungen erfuellt sind", () => {
    const vm = buildViewModel({ ...basis, showModelPicker: true, downloadedModels: ["sd-turbo", "sdxl-turbo"] });
    expect(vm.controls.modelPicker).toBe(true);
    expect(vm.modelOptions.map((o) => o.id)).toEqual(["sd-turbo", "sdxl-turbo"]);
  });

  it("listet NUR geladene Modelle — ein Panel-Klick darf nie einen Download ausloesen", () => {
    const vm = buildViewModel({ ...basis, showModelPicker: true, downloadedModels: ["sdxl-turbo"] });
    expect(vm.modelOptions.every((o) => o.id === "sdxl-turbo")).toBe(true);
  });

  it("im Server-Modus gibt es keinen Picker", () => {
    const vm = buildViewModel({ ...stateOf({ mode: "server" }), showModelPicker: true, downloadedModels: ["sd-turbo", "sdxl-turbo"] });
    expect(vm.controls.modelPicker).toBe(false);
  });
});

describe("Groessen-Zeile (Spec 0.9 §6.3)", () => {
  it("bei sd-turbo weg, bei sdxl-turbo da", () => {
    expect(buildViewModel({ ...stateOf({ mode: "builtin" }), builtinModel: "sd-turbo" }).controls.size).toBe(false);
    expect(buildViewModel({ ...stateOf({ mode: "builtin" }), builtinModel: "sdxl-turbo" }).controls.size).toBe(true);
  });

  it("die Sichtbarkeit haengt an sizes.length, nicht am Modellnamen", () => {
    const vm = buildViewModel({ ...stateOf({ mode: "builtin" }), builtinModel: "sdxl-turbo" });
    expect(vm.controls.sizes).toHaveLength(2);
  });
});

describe("Status im comfy-Modus", () => {
  const basis = { ...PANEL_DEFAULT, mode: "comfy" as const, server: { kind: "ok", modelName: null } as const };

  it("meldet den Workflow-Fehler, nicht den Server", () => {
    const vm = buildViewModel({ ...basis, workflow: { kind: "invalid", path: "w.json", reason: { kind: "no-sampler" } } });
    expect(vm.status.cls).toBe("is-error");
    // Brief-Text ist "No sampler found..." (kleines s) — die grossgeschriebene Fassung im
    // Brief-Test war ein Tippfehler, der Text selbst ist woertlich aus Step 6 uebernommen.
    expect(vm.status.text).toContain("sampler");
  });

  it("meldet einen unerreichbaren Server auch bei gutem Workflow", () => {
    const vm = buildViewModel({ ...basis, server: { kind: "unreachable" }, workflow: OK_WORKFLOW });
    expect(vm.status.cls).toBe("is-error");
  });

  it("ist erst bereit, wenn Server UND Workflow stimmen", () => {
    const vm = buildViewModel({ ...basis, workflow: OK_WORKFLOW, prompt: "x" });
    expect(vm.generateEnabled).toBe(true);
    // I4 (Final-Review 2026-09-06): der Name behauptet eine Konjunktion, der Rumpf prueft
    // ohne diese Zeile nur den EINEN Punkt, an dem beide Konjunkte wahr sind. Streicht
    // jemand die Workflow-Bedingung aus `buildViewModel`, bliebe die Suite gruen — und der
    // Generate-Knopf waere im comfy-Modus ohne brauchbaren Workflow klickbar, ohne dass
    // etwas passiert. Der Server ist hier unveraendert `ok`; nur der Workflow fehlt.
    const ohneWorkflow = buildViewModel({ ...basis, workflow: { kind: "missing", path: "w.json" }, prompt: "x" });
    expect(ohneWorkflow.generateEnabled).toBe(false);
  });

  // I3 (Final-Review 2026-09-06): im comfy-Modus fiel der Leerzustand auf den Server-Text
  // zurueck und schickte den Nutzer zu Draw Things — an genau der Stelle, an der er Hilfe
  // braucht. Beide Zeilen gehoeren zusammen: der Port belegt den comfy-Text, die
  // Draw-Things-Zeile belegt, dass es nicht mehr der Server-Text ist (nur zusammen sind sie
  // von einem beliebig geaenderten Server-Text unterscheidbar).
  it("nennt bei fehlendem Endpunkt ComfyUIs Port statt Draw Things", () => {
    const vm = buildViewModel({ ...basis, workflow: OK_WORKFLOW, server: { kind: "unconfigured" } });
    expect(vm.empty?.text).toContain("8188");
    expect(vm.empty?.text).not.toContain("Draw Things");
    expect(vm.status.text).toContain("ComfyUI");
  });

  it("erklaert bei unerreichbarem Endpunkt den uebernommenen A1111-Endpunkt", () => {
    const vm = buildViewModel({ ...basis, workflow: OK_WORKFLOW, server: { kind: "unreachable" } });
    expect(vm.empty?.ctaAction).toBe("recheck");
    expect(vm.empty?.text).toContain("8188");
    expect(vm.status.text).toContain("8188");
  });

  it("zeigt Negativ-Prompt, aber keinen CFG-Regler", () => {
    const vm = buildViewModel({ ...basis, workflow: OK_WORKFLOW });
    expect(vm.controls.negative).toBe(true);
    expect(vm.controls.cfg).toBe(false);
    expect(vm.controls.initImage).toBe(false);
  });
});

// Abnahme-Befund Welle 13: Steps/Seed (+ Reroll haengt am Seed) waren die einzigen Regler
// ohne eigenes Sichtbarkeits-Signal — der Kurzbefehl ignoriert beide, das Panel zeigte sie
// trotzdem bedienbar. Alle drei anderen Modi bleiben unveraendert true.
describe("controls.steps/seed (Keine-Attrappen-Linie, Image Playground)", () => {
  it("playground blendet Steps UND Seed aus — der Kurzbefehl nimmt keinen von beiden entgegen", () => {
    const vm = buildViewModel(stateOf({ mode: "playground" }));
    expect(vm.controls.steps).toBe(false);
    expect(vm.controls.seed).toBe(false);
  });

  it("builtin/server/comfy zeigen beide weiterhin", () => {
    for (const mode of ["builtin", "server", "comfy"] as const) {
      const vm = buildViewModel(stateOf({ mode }));
      expect(vm.controls.steps).toBe(true);
      expect(vm.controls.seed).toBe(true);
    }
  });
});
