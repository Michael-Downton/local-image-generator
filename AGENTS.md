# AGENTS.md

Conventions for AI assistants working in this repo.

> **Workspace-Standards (maintainer-lokal):** Die verbindliche Leitkonvention steht in `_docs/CONVENTIONS.md`
> im Multi-Projekt-Workspace des Maintainers, ../../_docs relativ zu diesem Repo — nicht Teil dieses Repos,
> ignorieren falls im Klon nicht vorhanden. Modell comply-or-explain.

## What this is

Obsidian community plugin: eine **Oberflaeche** fuer Bilderzeugung (Prompt, Stil-Chips,
Verlauf, Ablage im Vault) vor **drei austauschbaren Backends** (Eingebaut/Server seit 0.6,
Spec im Cockpit `_SDD/2026-08-19-eingebaute-engine-zwei-backends-design.md`; ComfyUI seit
0.13, Spec `2026-09-06-comfyui-backend-design.md`):

- **Eingebaut (Default):** SD-Turbo im Renderer ueber `onnxruntime-web/webgpu`. Modell
  (eigene fp16-ONNX-Konversion, ~2,6 GB) + ORT-WASM werden **nur nach Klick** aus dem
  eigenen HF-Repo in die Cache API gestreamt, SHA-256 gegen das generierte Manifest
  geprueft. 512 px, Steps 1–8, kein Negativ/CFG (Keine-Attrappen-Linie).
- **Server:** Draw Things, AUTOMATIC1111, Forge oder SD.Next ueber deren gemeinsame
  A1111-kompatible HTTP-API — dem Server gehoeren Modell und Hardware, volle Regler.
  Seit 0.8 zusaetzlich **img2img**: von einer Vault-Vorlage aus weiterrechnen — seit 0.11 in
  BEIDEN Backends: der Server kontinuierlich (denoising 0–1 in 0,05er-Schritten), die
  eingebaute Engine ueber ihren eigenen VAE-Encoder ebenso kontinuierlich (0–1 in 0,05er-
  Schritten; der Einstiegspunkt im Zeitplan wird interpoliert statt gerastert, s. Gotchas).
- **ComfyUI (seit 0.13):** ein vom Nutzer bereitgestellter API-Workflow (Vault-Datei, JSON im
  ComfyUI-API-Format) wird vor jedem Lauf **gepatcht**, nicht neu gebaut — Prompt, Negativ,
  Seed, Steps und Groesse wandern in die vom Workflow selbst benannten Nodes, alles andere
  (Sampler, Scheduler, CFG, LoRAs, Upscaler) bleibt in der Hand des Nutzers. Ein Workflow ohne
  setzbare Steps oder Bildmasse wird abgewiesen, nicht stillschweigend mit Luecken uebernommen
  (Begruendung unter Gotchas). Kein img2img, kein Fortschrittsbalken, kein CFG-Regler — Details
  im CHANGELOG-Eintrag 0.13.0. Herkunft: Client und Workflow-Inspektion sind aus `yijing-oracle`
  uebernommen (Vendoring-Header in `src/core/comfy/client.ts`/`workflow.ts`), nicht neu gebaut.

Desktop-only, ein Sidebar-Hub mit zwei Reitern (Generate/History). Alle drei Backends
implementieren `ImageBackend` (`src/core/txt2img.ts`); `main.ts` routet nach
`settings.engine`. **Bis 0.4 lief eine aeltere Fassung der Engine im Prozess (plus mflux als
Kindprozess), 0.5 war reiner Thin-Client** — Details unter *Historie* unten; die Reste
(`legacy-cache.ts` fuer die 0.4-Gewichte, totes Settings-Feld `mfluxPath`) bleiben erklaert.

## Workflow conventions

- **Gate:** `npm run gate` (typecheck + check:manifest + vitest + lint + check:pure + build +
  check:clean) — vor jedem Commit grün.
- **Assets (eingebaute Engine):** `tools/convert-model.sh <sd-turbo|sdxl-turbo>`
  (`npm run assets:convert -- <sd-turbo|sdxl-turbo>`; uv-Venv, optimum + ORT-fp16-Konverter,
  seit der zweiten Modellstufe modellparametrisiert in `tools/convert/convert_model.py`)
  erzeugt `dist-assets/` (gitignored), `npm run assets` hasht sie und schreibt
  `src/core/engine-manifest.generated.ts` (**nie von Hand**), `npm run assets:verify` prueft
  I/O-Namen/Dtypes/Shapes mit onnxruntime-node, `npm run assets:upload` laedt ins HF-Repo
  (`johannes-kaindl/local-image-generator-models`, per `HF_MODELS_REPO` ueberschreibbar).
  **Der Namespace ist eine Vertrauenszusage, kein Detail:** die URL steht als Platzhalter der
  Settings-Zeile „Download source" im Bild, und wer 2,6 GB laedt, gleicht den Namen mit dem
  Plugin-Autor ab — er wurde deshalb am 2026-08-21 auf `johannes-kaindl` gezogen, damals
  identisch mit dem GitHub-Profil.
  ⚠️ **Diese Kopplung ist seit 2026-09-03 gebrochen, und das ist in Ordnung:** `authorUrl` zeigt
  seit 2026-09-04 auf `https://jkaindl.de`, weil das GitHub-Konto geflaggt und anonym 404 ist
  (Zwischenstand 2026-09-03 war `git.jkaindl.de/jkaindl` — die Domain gewinnt, weil sie nicht an
  einem Git-Host-Pfad haengt; gemessen 2026-09-04: 200).
  **HuggingFace ist davon NICHT betroffen** — eigener Dienst, eigenes Konto; das Modell-Repo
  antwortet unveraendert (gemessen 2026-09-03: 200 auf das Repo, 307 aufs CDN). Der HF-Namespace
  bleibt deshalb, wie er ist: ein Umzug wuerde jede Bestandsinstallation ins Leere laden
  (`assetBaseUrl` ist ein gespeichertes Setting, s. u.) und loeste ein Problem, das es nicht
  gibt. Das alte `v6t2b9/…` bleibt online: `assetBaseUrl` ist ein GESPEICHERTES
  Setting, eine 0.6.0-Installation traegt die alte URL in ihrer `data.json` und wuerde nach
  einem Repo-Umzug ins Leere laden.
  Nach jedem `onnxruntime-web`-Upgrade: `npm run assets` + Manifest mitcommitten, WASM neu
  hochladen — `check:manifest` bricht sonst das Gate.
- **Pure-Core-Schnitt:** `src/core/` und `src/vendor/kit/` importieren NIE `obsidian`
  (Gate: `scripts/check-pure.mjs`, `ROOTS`). `src/obsidian/legacy-cache.ts` ist browser-API-only
  (Cache API), ebenfalls obsidian-frei — nicht vom Gate erfasst, manuell halten.
- **Vendoring (nie von Hand):** `sh tools/sync-kit.sh` ist seit Welle 12 (2026-09-27) nur noch
  ein Wrapper und delegiert an das zentrale `../tools/kit-sync/kit-sync.mjs`; Pins und
  Modul-/Zielordner-Zuordnung stehen in `tools/kit-sync.json`, nicht mehr in Env-Variablen
  (`KIT_REF`/`KIT_HELP_REF` sind Geschichte). Ein Kit-Upgrade ist weiter eine bewusste Handlung —
  jetzt per Editieren der `ref`-Werte in `tools/kit-sync.json`, kein Nebeneffekt davon, dass
  jemand nebenan im Nachbar-Checkout einen Branch auscheckt (Inhalt kommt per `git show <ref>:…`,
  CORE-META-22). Vor 2026-09-27 lief das ueber ein repo-eigenes Skript mit `KIT_REF`/`KIT_HELP_REF`;
  die dort gemessenen Lehren gelten fuer das zentrale Werkzeug sinngemaess (Fix bereits dort
  gebaut): Inhalt kommt aus einer FESTEN REF, nie aus dem Arbeitsstand des Nachbar-Repos: bis
  2026-09-02 war das hier umgekehrt und seit Kit 0.28.0 ein DEFEKT (pure-Module nach `code-kit`
  abgewandert, ein Lauf gegen den Arbeitsstand waere abgebrochen, ohne dass der alte
  Ordner-Existenz-Guard es gesehen haette). Ebenso: Schreiben ueber `.tmp` + `mv`, nie eine
  Umleitung direkt aufs Ziel (sonst bleibt bei fehlgeschlagenem `git show` ein Torso mit
  gueltig aussehender Stempelzeile stehen) — `kit-sync.mjs` macht das. **Zielordner ist Vertrag,
  nicht Geschmack:** `obsidian-kit/src/pure/*` → `src/vendor/kit/`,
  `obsidian-kit/src/obsidian/*` → `src/vendor/kit-obsidian/` — ein obsidian-importierendes Modul
  unter `src/vendor/kit/` bricht `npm run check:pure` und damit das Gate. Ein neues Modul kommt
  in die `modules`-Liste von `tools/kit-sync.json`, nicht per `cp` in den Baum; danach muss
  `node ../tools/kit-sync/kit-sync.mjs --check` Exit 0 liefern (Reproduzierbarkeit).
  ⚠️ `HUB_CSS` aus `src/vendor/kit-obsidian/hub.ts` ist zusaetzlich in `styles.css` uebernommen —
  das Kit injiziert kein CSS. Wer das Modul neu vendoriert, gleicht den Block mit ab.
- **Hilfe-Zeile:** `src/vendor/kit-obsidian/help-setting.ts` hat seit Welle 12 einen Einzelpin
  `{ "name": "help-setting", "ref": "0.43.0" }` in `tools/kit-sync.json` (vorher `KIT_HELP_REF`
  in `tools/sync-kit.sh`); die uebrigen Module bleiben auf der Quell-Ref `0.27.0`. Die Zeile ist
  das erste Element von `getSettingDefinitions()` (`src/obsidian/help-row.ts`), Test
  `tests/help-row.test.ts`, Smoke-Punkt 41.
- **Commit style:** Conventional Commits (deutsch), AI-Commits mit Co-Authored-By-Trailer.
- **Deploy (lokal):** `OBSIDIAN_PLUGIN_DIR=<vault>/.obsidian/plugins/local-image-generator npm run deploy`
- **Dach-Regeln gelten:** Kit-first (`../AGENTS.md`, `../REGISTRY.md`), UI-STANDARD (`../UI-STANDARD.md`).

## UI-Abweichungen

Deklaration nach `UI-STANDARD.md` §1a — von einem verbindlichen §8-Baustein abzuweichen ist
erlaubt, stillschweigend abzuweichen nicht.

- **endpoint-list** — Grund: Dieses Plugin hat gar keine Endpunkt-LISTE, sondern EIN
  Textfeld (`settings.endpoint`, geteilt zwischen Server- und Comfy-Modus) — schlanker als
  selbst yijing-oracles/lingotuners eigener `string[]`-Editor, der bereits als
  `endpoint-list`-Abweichung geführt wird. Seit der Endpunkt-Manager-Anbindung (Welle 7,
  2026-09-17, `203a074`) zeigt `tools/ui_adoption_check.py` das Repo trotzdem als
  `[rueckstand]` — gemessen: der Treffer kommt über die UND-Indikatoren
  (`endpoint_config` aus dem neu vendorten `../vendor/kit/endpoint_config`-Importpfad in
  `src/core/resolve-endpoint.ts` **plus** zufällig `trash-2` aus dem Löschen-Icon der
  History-Zeile in `src/obsidian/history-panel.ts`, unabhängig vom Endpunkt-Feld) — keine
  echte Adoption-Lücke. Bei installiertem LLM Endpoint Manager zeigt die Endpunkt-Zeile
  dessen Kit-Baustein `buildEndpointSourceSection` (`src/obsidian/settings-tab.ts::renderServer`)
  statt `endpoint-list.ts`; ohne Manager bleibt das einzelne Textfeld
  (`renderServerFallback`) der Fallback. Eine Migration auf eine echte Liste (mehrere
  Server-Presets) ist kein offener Bruch, sondern schlicht nie Teil der Spec gewesen.
  — gilt-solange: `src/obsidian/settings-tab.ts` enthaelt-nicht `EndpointConfig[]`

## Memory + logs

- **Cockpit (SSOT):** `$VAULT/25_Coding/local-image-generator/` (Hub, _Tasks, _Log, Handover; maintainer-lokal).
- **Memory:** `~/.claude/projects/-Users-Shared-code-obsidian-plugins/memory/` (Zeiger-Schicht).
- Spec/Plan (neu): im Coding-Cockpit des Maintainers (siehe §Memory) — nicht mehr im Repo.

## Memory

- **SDD-Artefakte (seit 2026-07-16): Cockpit, nicht Repo** — Specs/Plans/Task-Reports leben im
  Coding-Cockpit des Maintainers (`$VAULT/25_Coding/local-image-generator/_SDD/`, CORE-META-14, maintainer-lokal).
  Sie tragen Arbeitskontext (Vault-Pfade, Schwester-Repo-Interna), der in einem public Repo niemandem nützt.
  Das Repo behält die Design-Essenz in dieser Datei + `CHANGELOG.md`.
- **Alt-Bestand:** `docs/superpowers/{specs,plans}/` ist eingefroren — nichts Neues dort ablegen.
- **Nie im Repo:** absolute Pfade außerhalb des Repos (`/Users/…`, Vault-Pfade) — Platzhalter nutzen
  (`$VAULT/…`, `~/…`, repo-relativ). Herkunftsnachweise als Repo-Name + `Datei:Zeile` sind dagegen erwünscht.
  Gate: `scripts/check-no-abs-paths.mjs` (Teil von `npm test`).

## Architecture notes / Gotchas

- **WASM-Paarung (wieder aktiv seit 0.6):** das ORT-WASM-Binary MUSS zum Glue des importierten
  Bundles passen — `onnxruntime-web/webgpu` referenziert `ort-wasm-simd-threaded.asyncify.wasm`,
  nicht jsep. Falsche Paarung = stiller Ewig-Haenger. `scripts/build-assets.mjs` liest den
  Namen aus dem Bundle und hasht genau diese Datei; `check:manifest` bewacht es.
- **Stueckeln heisst NICHT „alles auslagern": kleine Tensoren muessen inline bleiben.** Der
  Bucket-Splitter (`tools/convert/split_external_data.py`) fuehrt deshalb `size_threshold=1024`
  (der ONNX-Default). Ohne die Schwelle entsteht ein Modell, das strukturell einwandfrei aussieht
  — richtige `location`-Strings, ausgerichtete Offsets, ladbare Buckets — und das ORT trotzdem
  abweist: `[ShapeInferenceError] Cannot parse data from external tensors ... onnx::Unsqueeze_1780`.
  Grund: Achsen fuer `Unsqueeze`, Formen fuer `Reshape` und Aehnliches braucht die Shape-Inferenz
  schon beim LADEN, bevor irgendwer External Data aufloest. Gemessen 2026-08-24 am echten
  SDXL-Turbo-UNet; fuenf gruene Splitter-Tests gegen synthetische Modelle hatten es nicht gesehen.
- **Ein fp16-Modell ueber 2 GiB laesst sich nicht ohne External Data ZWISCHENSPEICHERN.**
  `save_model_to_file(..., use_external_data_format=False)` stirbt bei 4,78 GiB mit
  `google.protobuf.message.EncodeError: Failed to serialize proto` — protobuf serialisiert keine
  Nachricht ueber 2 GiB. Der split-Zweig speichert deshalb MIT External Data (eine grosse
  temporaere `model.onnx.data`), stueckelt daraus und loescht die Zwischendatei. Sie darf nicht
  liegen bleiben: `build-assets.mjs` naehme sie ins Manifest, `assets:upload` lued sie mit hoch.
- **SDXLs Text-Encoder liefern die Hidden States als INDIZIERTE EINZELAUSGAENGE**, nicht als
  einen Ausgang `hidden_states`: `hidden_states.0` … `.12` beim ersten (CLIP-L, 13 Stueck) und
  `.0` … `.32` beim zweiten (bigG, 33 Stueck). SDXL braucht den VORLETZTEN — also `.11` bzw.
  `.31`. Wer auf den Namen `hidden_states` prueft, findet nie etwas; wer `last_hidden_state`
  nimmt, bekommt kein Fehlerbild, sondern ein stillschweigend schlechteres Bild.
  Ebenso: beim zweiten Encoder steht `text_embeds` (pooled) an Position 0, nicht
  `last_hidden_state` — die Reihenfolge der Ausgaenge ist keine Zusage des Exports.
- **Das Pad-Token ist pro Tokenizer verschieden — und die Abweichung sitzt beim ERSTEN.**
  Gemessen 2026-08-23 an den HF-Configs: sd-turbo `!` = 0 · sdxl-turbo `tokenizer` (CLIP-L)
  `<|endoftext|>` = **49407** · sdxl-turbo `tokenizer_2` (bigG) `!` = 0. Der bestehende
  `tokenize()`-Default 0 ist fuer SD-Turbo und den ZWEITEN SDXL-Encoder richtig und fuer den
  ERSTEN falsch. Auch das kostet nur Qualitaet, nie einen Fehler.
- **Ein Modell ueber 2 GiB geht nur mit GESTUECKELTER External Data — und nur unter WebGPU.**
  Gemessen 2026-08-23 im Renderer (Obsidian 1.13.7 / Electron 39 / Chromium 142, M5 Pro):
  ein plain `ArrayBuffer` endet bei ~2,0 GiB, `WebAssembly.Memory` bei exakt 4 GiB (wasm32,
  65536 Seiten). Eine monolithische `.onnx_data` von 4,78 GiB (SDXL-Turbos UNet) ist damit
  gar nicht uebergebbar — der Export muss die Tensoren auf mehrere Dateien verteilen
  (`convert_model_to_external_data(all_tensors_to_one_file=False)`). ORTs `externalData`
  nimmt `Blob | Uint8Array | ArrayBuffer`, also unseren Cache-API-Pfad; die URL-Variante
  wuerde ORT selbst fetchen lassen und ist deshalb ausgeschlossen.
  **Die 4-GiB-Grenze des WASM-Heaps bindet dabei NICHT**, weil der WebGPU-EP die Gewichte
  direkt von JS in GPU-Puffer laedt (Glue-Callback: `case 0` schreibt in `HEAPU8`, `case 1`
  laedt zur GPU hoch). Gegenprobe am identischen 4,75-GiB-Modell, einzige Variable der EP:
  `wasm` stirbt mit `std::bad_alloc`, `webgpu` baut die Session in 1,1 s.
  ⚠️ **Spitzenspeicher ist rund das Doppelte der Modellgroesse** — ORT gibt die JS-Puffer
  erst nach `createSession` frei (`unmountExternalData` im `finally`), bis dahin liegen
  Gewichte in JS UND auf der GPU; auf Apple Silicon ist das derselbe Speicherpool.
  **Gebautes Gegenstueck (Stand 2026-08-24):** die reale SDXL-Turbo-Konversion stueckelt
  ihr UNet (≈ 5,1 GiB) in **13 External-Data-Buckets** (`sdxl-turbo/unet/unet_000.onnx_data`
  … `_012`, keiner ueber 420 MB) plus die 4,4-MB-Modell-Shell — genau die Form, die dieser
  Punkt vorschreibt; `src/core/engine-manifest.generated.ts` listet alle 13 mit eigenem
  Hash, `src/obsidian/local-engine.ts::loadPart()` laedt sie als Array (Reihenfolge = die
  des Manifests) und reicht sie als `externalData` an `createOrtSession`.
- **`location`-Strings in External Data sind reine Dateinamen, nie Cache-Schluessel oder
  HF-Pfade.** `split_external_data.py` schreibt in jeden Bucket-Verweis nur den Basisnamen
  (`unet_003.onnx_data`), und `loadPart()` muss ORT exakt diesen String zurueckgeben —
  `d.path.split("/").pop()`, NICHT `d.key` (der Cache-API-Schluessel, hash-gebunden seit
  0.6) und NICHT der HF-Pfad (`sdxl-turbo/unet/unet_003.onnx_data`, mit Ordner). Reicht man
  Cache-Schluessel oder HF-Pfad durch, findet ORT die Bucket-Daten nicht — der Session-Aufbau
  scheitert, aber mit einer Meldung, die nach einem Datenfehler aussieht, nicht nach einem
  Pfadfehler.
- **`pickHidden()` (`src/core/engine-sdxl.ts`) nimmt den VORLETZTEN indizierten
  `hidden_states.N`-Ausgang und faellt NICHT auf `last_hidden_state` zurueck — bewusst.**
  Fehlt der erwartete Index (weniger als zwei indizierte Ausgaenge gefunden), wirft die
  Funktion, statt still ein schlechteres Ergebnis zu liefern (Spec §9-Risiko 1: genau der
  leise Qualitaetsverlust, den ein Fallback waere). Ein Fehlerbild ist hier das gewollte
  Verhalten, kein fehlender Edge-Case.
- **ORT bietet KEIN Abort fuer `InferenceSession.create` — deshalb sitzt der Wachhund am
  Rand, nicht im Kern.** `SESSION_BUILD_TIMEOUT_MS` (`src/obsidian/local-engine.ts`, 5 min)
  umschliesst den Aufruf mit `withTimeout`, aber ein Ablauf BRICHT den Aufruf nicht ab — er
  meldet nur der UI, dass er als haengend gilt, und laesst die echte Promise im Hintergrund
  verwaisen; loest sie doch noch spaeter auf, bleibt diese Session unreleased (kein
  `.dispose()`, GPU-Speicher bleibt belegt). Der Guard sitzt bewusst an der INJIZIERTEN
  Grenze `LocalEngineDeps.createSession`, nicht in `ort-host.ts`: nur dort ist er mit einem
  Fake in Node testbar, `ort-host.ts` ruft echtes ORT. **Dieser Wachhund existierte schon
  einmal** (Entwurf 2026-07-18) und ging ueber zwei Engine-Umbauten (0.5-Entfernung,
  0.6-Rueckholung) verloren, weil er nur in einer Spec-Datei stand, nicht im Code — genau der
  Fehlermodus, den dieser Absatz jetzt verhindern soll: was hier nicht steht, kann beim
  naechsten Umbau wieder verschwinden.
- **Die WebGPU-Limits im Obsidian-Renderer sind weit ueber den Spec-Defaults** (gemessen
  2026-08-23, M5 Pro): `maxBufferSize` und `maxStorageBufferBindingSize` je 4 GiB statt
  256/128 MiB, `shader-f16` vorhanden, 16 GiB GPU-Belegung ohne device-lost. Puffergrenzen
  sind hier also kein Engpass — die JS-Seite ist es.
- **SDXLs VAE-Decoder ueberschreitet in fp16 unter dem WebGPU-EP den Wertebereich — und das
  Ergebnis ist ein reines schwarzes Bild, OHNE jeden Fehler.** Gemessen 2026-08-24: SDXL-Turbo
  lieferte live gueltige PNGs in der richtigen Groesse, Status „Bereit", Inhalt zu 100 % Schwarz.
  Drei Runden Instrumentierung haben es eingekreist — Node/CPU-EP mit denselben Gewichten und
  demselben Code ist durchgaengig saubere Zahlen bis zum Ende der Pipeline; im Renderer/WebGPU
  sind beide Text-Encoder und beide UNet-Schritte ebenso saubere und mit der CPU-Referenz
  deckungsgleiche Zahlen, aber der VAE-Decoder-INPUT ist gesund und der VAE-Decoder-OUTPUT ist zu
  786.432/786.432 (100 %) NaN. Ursache: SDXLs Aktivierungen an dieser Stelle ueberschreiten
  fp16s Bereich (Maximum 65504) → Inf → NaN; ORTs CPU-Kernel rechnen die identische Graph-Struktur
  offenbar hoeher praezise und zeigen den Defekt NICHT — **ein Node-seitiger Test kann diesen
  Fehler grundsaetzlich nicht finden**, nur ein Live-Lauf im Renderer. Eine fp32-Gegenprobe am
  selben Graph, denselben Gewichten, demselben Code (nur die eine Session getauscht) war NaN-frei
  und deckungsgleich mit der CPU-Referenz (Min/Max/Mean je auf ~1 % Abweichung) und produzierte
  ein kohärentes, korrektes Bild. Deshalb bleibt GENAU dieser eine Teil fp32, waehrend alles
  andere im Modell fp16 bleibt (`tools/convert/convert_model.py`, `MODELS["sdxl-turbo"]["fp32"]`,
  Funktion `copy_fp32()`) — SD-Turbo ist von diesem Defekt nicht betroffen und bleibt
  unveraendert vollstaendig fp16. Kosten: **+99 MB** (198.078.154 vs. 99.126.105 Byte, der
  VAE-Decoder allein) und **+~650 ms** pro `generate()`-Aufruf (2317 ms vs. 1671 ms, n=1, sonst
  identische warme Sessions). Kein Zufall, dass es dafuer ein bekanntes Community-Fixmodell
  (`sdxl-vae-fp16-fix`) gibt — das ist eine bekannte Eigenschaft von SDXLs Architektur, kein
  Defekt in diesem Code. GUI-Smoke-Punkt 25 (`scripts/gui-smoke.ts`) generiert seitdem ein
  echtes SDXL-Turbo-Bild und misst dessen Pixel-Inhalt (Luma-Standardabweichung + Zahl
  distinkter Farben) statt nur seine Form — verifiziert per Live-Session-Swap gegen genau
  diesen fp16-Zustand rot, gegen den fp32-Fix gruen (`docs/SMOKE.md` § 2026-08-24 Phase 4).
  **Seit 0.11 gilt dieselbe Ausnahme fuer SDXLs VAE-ENCODER** (img2img, Posten 4a): der
  Spike vom 2026-08-30 mass per torch-Hooks max-|Aktivierung| von **300k–500k auf jedem von
  7 diversen Inputs** — Faktor 7 ueber fp16s 65504, schlimmer als der Decoder-Fall. Er wird
  deshalb fp32 ausgeliefert (137 MB statt ~68 MB; `MODELS["sdxl-turbo"]["fp32"]` fuehrt
  beide). SD-Turbos Encoder bleibt fp16 (Peak 1 248, 50x Luft). Live-Beweis unter WebGPU ist
  GUI-Smoke-Punkt 27 (`docs/SMOKE.md` § 2026-08-31).
  **Bei jedem weiteren fp16-Konversionsschritt an SDXL: diesen Teil NICHT „der Einheitlichkeit
  wegen" zurueckstellen** — er sieht wie eine vergessene Aufraeumarbeit aus und ist keine.
- **Feeds an die Session anpassen, nie hardcoden:** `Session.inputTypes` (Dtype) UND
  `Session.inputShapes` (Rang). Die eigene Konversion deklariert `timestep` als 0-d-Skalar
  (`shape []`) — `dims [1]` bricht das UNet mit „Gemm: must be 2 dimensional" (gemessen
  2026-08-19, erster Live-Lauf). `scripts/verify-model.mjs` zeigt Dtypes + Shapes.
- **Download per `activeWindow.fetch` + `tee()`, nicht XHR** (`src/obsidian/model-store.ts`):
  speicherkonstantes Streaming einer 1,7-GB-Datei in die Cache API geht nur mit
  ReadableStream; XHR hielte alles im Puffer. PROF-OBS-12-Fall „unvermeidbar", Store-Linter
  bestaetigt (globales `fetch` bleibt gebannt). SHA-256 laeuft chunkweise im Stream
  (`src/vendor/kit/sha256.ts`, ~200 MB/s — seit Kit 0.27.0 vendoriert; die kanonische Quelle
  des Kit-Moduls WAR die frueher hier liegende `src/core/sha256.ts`). Der Streaming-Kern je
  Datei liegt seit 0.27.0 ebenfalls im Kit (`src/vendor/kit/cache-download.ts`,
  `streamIntoCache`); lokal bleiben Key-Ableitung, Manifest-Liste, Fortschritts-Huelle und
  das Hash-Urteil.
- **Download-Recovery:** `asset-transfer.ts` begrenzt Header-/Read-Wartezeiten an der injizierten
  Fetch-Grenze; `asset-retry.ts` wiederholt nur klassifizierte Transportfehler. Kit-Kopien bleiben
  unveraendert. Grosse Dateien laufen durch `PartialAssetStore` (eigener Cache mit vollem
  Manifest-Hash und Byte-Grenzen); `ModelStore` prueft vor dem nutzbaren Cache-Key und kopiert
  danach gestreamt. Web Locks serialisieren Download/Verwerfen/Entfernen ueber Vault-Fenster.
  Keine Fortsetzung ohne Nutzer-Klick nach Neustart. Tests gehoeren zum jeweiligen Verhalten;
  `npm run smoke:downloads` deckt reale Browser-Streams und Cache API ohne Modellgewichte ab.
- **Cache-Namen nicht verwechseln:** 0.6-Assets liegen in `local-image-generator-assets` mit
  hash-gebundenen, URL-unabhaengigen Schluesseln; `legacy-cache.ts` loescht weiterhin nur
  `local-image-generator-models` (0.4). Die zwei kollidieren nicht.
- **Die Download-Zusage der Provider-API ist strukturell, nicht bloss gegated.** `generate()`
  im builtin-Modus laedt ohne Klick des Nutzers keine Bytes — das gilt nicht nur, weil das
  Bereitschafts-Gate es abweist, sondern weil es keinen zweiten Ladepfad gibt: `ModelStore.getBuffer`/
  `getText` gehen ueber `matchOrThrow` (`src/obsidian/model-store.ts`), das bei einem
  Cache-Fehltreffer **wirft** und nie laedt. Der einzige Ladepfad ist `ModelStore.download`,
  aufgerufen ausschliesslich von `startDownload()`, das an genau zwei vom Nutzer geklickte
  Bedienelemente haengt und in `ApiDeps` (`src/main.ts`) nicht vorkommt. Selbst ohne das
  Bereitschafts-Gate endet ein builtin-`generate()` ohne Assets als
  `{ ok: false, reason: "failed" }`.
  **Seit 2026-08-30 ist die Zusage zusaetzlich GEMESSEN, nicht nur begruendet** — GUI-Smoke-Punkt
  18d, platziert zwischen den Punkten 13 und 14, wo der Zustand `not-downloaded` geprueft statt
  angenommen ist. ⚠️ Er prueft DREI Dinge (Rueckgabewert, Cache-Umfang, Engine-Zustand), und das
  ist kein Guertel-mit-Hosentraeger: in der Gegenprobe wurde er **allein ueber den Engine-Zustand**
  rot, waehrend die Cache-Zaehlung nach drei Sekunden noch unveraendert dastand — der Download
  lief bereits, hatte aber noch keine Datei fertig geschrieben. Wer die Zustandspruefung fuer
  redundant haelt und streicht, macht den Punkt blind fuer genau den Defekt, gegen den er steht
  (`docs/SMOKE.md` § 2026-08-30).
- **`new Function(` im Bundle ist die ORT-Glue (Emscripten-embind)** — BEHAVIOR-Disclosure
  einer gebuendelten Dependency, notenneutral (publishing.md); `check-clean` laesst es
  begruendet zu, `eval(` bleibt verboten. Bundle ~184 KB (`check:clean`, gemessen 2026-08-20 nach
  dem Kit-0.27.0-Vendoring; Grenze `MAX_BYTES` = 2 MB).
- **ORT nimmt den eingebetteten Glue-Pfad nur mit gesetztem `env.wasm.wasmBinary` und
  `numThreads = 1`** — sonst versucht es `import()` einer URL (Code-Nachladen). `initOrt()`
  muss vor der ersten Session laufen (`ort-host.ts` wirft sonst).
- **Kit-Hub: `setTab(aktueller Tab)` ist ein No-op — kein `onShow()`, kein Re-Render.** Der
  Guard (`if (id === navState) return`) kam mit dem Vendoring von `buildHubInto` (Kit 0.27.0) und
  ist richtig; er heisst aber, dass ein Klick auf den bereits aktiven Reiter das Panel NICHT
  auffrischt. Wer ein sichtbares Panel neu zeichnen will, nimmt `refreshActive()` (oder den
  Host-Pfad `view.refresh()`), nicht einen zweiten Klick. Der aktive Reiter ueberlebt im
  Workspace-State — was im GUI-Smoke am 2026-08-21 einen flaky Pruefpunkt erzeugte (Punkt 10 mass
  die Historie VOR dem Lauf, weil sein Tab-Klick ins Leere lief; `docs/SMOKE.md` § 2026-08-21).
- **`npm run deploy` ist kein Reload.** Obsidian laedt die kopierte `main.js` erst beim
  Aktivieren des Plugins; ein laufendes Fenster misst sonst den Stand von seinem letzten Start,
  und die Manifest-Version verraet den Unterschied nicht. `scripts/gui-smoke.ts` laedt das Plugin
  deshalb selbst neu, bevor es misst. Wer von Hand prueft: Plugin aus- und einschalten.
- **Settings-Tab: bedingte Zeilen weglassen, nicht `visible:false`** — Obsidian 1.13 cacht
  `getSettingDefinitions()` und wertet Praedikate nicht neu aus; nach Modus-/Zustandswechsel
  `refreshUi()` (gemessen 2026-08-19: Server-Zeile blieb im builtin-Modus stehen).
  **Von aussen (Treiber, Test) heisst das: den Modus ueber das DROPDOWN wechseln, nicht ueber
  die Einstellung.** Nur dessen `onChange` ruft `refreshUi()`. Wer den Wert vorher setzt,
  nimmt dem Wechsel sogar seinen Anlass — das Dropdown steht dann schon richtig, das Ereignis
  bleibt aus, und darunter steht die Zeile des alten Modus (gemessen 2026-08-21 an
  `settings-server.png`, zweimal hintereinander).
- **`.is-hidden` steht am ENDE von `styles.css` — und muss dort bleiben.** Es ist die
  Aus-Schaltung fuer jede Zeile, die ein Backend nicht kann (Negativ-Prompt, CFG, Groesse:
  die Keine-Attrappen-Linie). Die Regel traegt nur eine Klasse und verliert deshalb gegen
  jede spaetere Ein-Klassen-Regel, die `display` setzt. Genau so blieb die Negativ-Zeile im
  builtin-Modus sichtbar, obwohl das Panel sie korrekt markiert hatte (`.lig-prompt-row`
  stand weiter unten). Wer etwas anhaengt, haengt es DARUEBER an.
- **Ein range-Input klemmt seinen `value` selbst, sobald `max` sinkt.** Deshalb darf das
  Nachziehen der Anzeige nicht davon abhaengen, ob `clamped !== stepsEl.value` — diese
  Bedingung ist nach dem Setzen von `max` nie erfuellt, und die Zahl neben dem Regler bleibt
  auf ihrem Startwert stehen (gemessen 2026-08-21: Regler auf 4, Beschriftung „20").
  Verallgemeinert: **beide Anzeigefehler waren nur ueber die GERENDERTE Darstellung
  sichtbar** (`getComputedStyle`, DOM-Text), nie ueber den Zustand — Unit-Tests koennen sie
  nicht finden, ein Screenshot findet sie sofort. **Seit 2026-08-22 bewacht sie Smoke-Punkt 17**
  (`runControlVisibilityCheck`): er misst beide Richtungen ueber `getComputedStyle`, laeuft in
  jedem Lauf (auch `--quick`, er braucht weder Server noch Assets) und schiebt den Steps-Regler
  vorher selbst ueber das builtin-Maximum — ohne dieses Klemmen kann die Beschriftung gar nicht
  danebenliegen, und der Punkt blieb in der Gegenprobe gruen, obwohl der Defekt drin war.
- **Vier Endpunkte, mehr nicht (Server-Modus):** `POST /sdapi/v1/txt2img` erzeugt,
  `POST /sdapi/v1/img2img` rechnet von einer Vorlage aus weiter (seit 0.8; derselbe Body plus
  `init_images` und `denoising_strength`),
  `GET /sdapi/v1/progress` liefert den Fortschritt (1-s-Polling), `GET /sdapi/v1/options`
  nennt das aktive Modell und dient als Verbindungstest. Alles Weitere gehoert dem
  Server, nicht uns.
- **`requestUrl` kennt weder Abort noch Timeout** (`src/obsidian/http.ts`). Ohne das
  selbst gesetzte kurze Zeitlimit haengt das Panel an einem toten Server ewig, statt ihn
  als unerreichbar zu melden. Diese Zeile nicht "vereinfachen".
- **Ein Server ohne `/progress` ist kein Fehlerfall:** liefert er 404 oder eine fremde
  Form, faellt die Anzeige auf unbestimmt zurueck — der Lauf selbst bleibt gueltig.
  Seit `598f050` fragt der `ProgressPoller` (`src/core/txt2img.ts`, eine Instanz pro Lauf)
  nach dem **ersten 404 nicht mehr** — Draw Things kennt den Endpunkt nicht, und ~240
  vergebliche Anfragen pro Bild sind Last auf einem rechnenden Server. Nur 404 schaltet ab;
  Timeout und 5xx sind voruebergehend und pollen weiter. Nicht "vereinheitlichen".
- **GUI-Smoke ohne echten Bild-Server:** `node scripts/mock-a1111.mjs` stellt die drei
  Endpunkte auf Port 7861 (`/progress` → 404, zaehlt Anfragen in `.mock-a1111-counts.json`);
  Plugin-Endpunkt darauf stellen, `npm run smoke:gui` fahren. Draw Things' API-Server ist ein
  Schalter in der App-Oberflaeche — `open -a "Draw Things"` allein oeffnet Port 7860 nicht.
- ⚠️ **`scripts/mock-a1111.mjs` hat seit 2026-09-02 einen FREMDEN Konsumenten.** Der Naht-Lauf
  von `epub-exporter` (`npm run smoke:e2e` dort) startet den Mock selbst und faehrt die
  Provider-API v1 ueber die Plugin-Grenze — er belegt damit, was beide Halbe-Seite-Smokes
  ueberspringen (REGISTRY, Zeile „Eine Faehigkeit fuer andere Obsidian-Plugins bereitstellen").
  Praktische Folge fuer dieses Repo: **wer die Endpunkte, den Fehlerschalter `/mock/fail?on=`
  oder die Antwortform des Mocks aendert, bricht einen Treiber im Nachbar-Repo** — und zwar
  still, weil er hier nicht mitlaeuft. Dasselbe gilt fuer die Vertragszusagen, die der Lauf
  misst: `apiVersion` am Plugin-Objekt, `recheck()` heilt `unreachable`, `capabilities.sizes`
  meldet im builtin-Modus GENAU eine Groesse, ein Backend-Fehlschlag kommt als Wert.
- **`scripts/mock-comfy.mjs` ist deshalb eine EIGENE Datei, kein drittes `if` in
  `mock-a1111.mjs`.** ComfyUIs API-Form (Queue-POST auf `/prompt`, Polling auf
  `/history/<id>`, Bildabruf auf `/view`) hat nichts mit A1111s drei Endpunkten gemein, und
  `mock-a1111.mjs` traegt bereits einen fremden Konsumenten (s. o.) — eine Aenderung dort fuer
  ComfyUI haette dessen Vertrag mitverschoben, ohne dass der Naht-Lauf in `epub-exporter` das
  hier sehen wuerde. Zwei getrennte Mocks halten die beiden Vertraege getrennt aenderbar.
- **Der Server bestimmt das Modell.** Das Plugin schickt generische Parameter und zeigt
  den gemeldeten Modellnamen als Statushinweis; es waehlt nie ein Modell aus.
- **Engine-Interface** (`ImageBackend`-kompatibel zu yijing-oracle) nicht brechen — die
  Provider-API 0.2 rastet darauf ein.
- **`recheck()` ist im builtin-Modus ein NO-OP — und das ist die Zusage, nicht die Luecke.**
  `status()` ist per Vertrag netzfrei und synchron und kann deshalb einen veralteten
  `unreachable`-Zustand nicht heilen; `recheck()` (0.10.0, additiv, `apiVersion` bleibt 1) macht
  GENAU EINEN Netzaufruf und liefert den frischen Stand. Im builtin-Modus unterbleibt der Aufruf,
  weil es dort keinen entfernten Zustand gibt, der sich hinter unserem Ruecken aendern koennte —
  ein „Neupruefen", das nichts prueft, waere dieselbe Attrappe wie ein CFG-Regler ohne Wirkung.
  Die Modus-Entscheidung sitzt in der FASSADE (`src/core/plugin-api.ts`), nicht im Dep: nur dort
  ist sie ohne Obsidian testbar (`tests/plugin-api.test.ts` zaehlt die Netzaufrufe am Fake, was
  am Wirt gar nicht ginge). Der Server-Zweig wird am Wirt von GUI-Smoke-Punkt 18e gemessen.
  ⚠️ `status()` wird dadurch NICHT asynchron — wer die Bequemlichkeit sucht und `recheck()` in
  `status()` zieht, bricht die Zusage „synchron und netzfrei", auf die jeder Konsument baut.
- **Die Provider-API laedt NIE nach.** `generate()` gibt bei fehlenden Assets
  `model-not-downloaded` zurueck. „Ohne Klick fliesst kein Byte" ist eine Zusage an den
  Nutzer — ein Fremdplugin darf sie nicht umgehen.
- **`isBusy()` deckt beide Wege.** Panel-Laeufe UND API-Laeufe; sonst zieht ein
  Moduswechsel die GPU-Sessions unter einem Fremdlauf weg.
- **Das Ausgangsbild (img2img) ist KEIN Rezept-Parameter.** `GenParams.initImage` ist ein
  VAULT-PFAD, `ImageRequest.initImageData` sind die BASE64-Bytes — bewusst verschiedene
  Namen. Grund fuer die Trennung: `GenParams` wandert in `settings.history`, also in
  `data.json`, das bei jedem `saveSettings()` komplett geschrieben wird; ein eingebettetes
  PNG waere dort ein Megabyte pro Eintrag. Grund fuer die verschiedenen NAMEN: `runGeneration`
  baut den Auftrag als `{ ...params, initImageData }`, und bei gleichem Namen haette ein
  vergessener Override still einen Pfad als Bilddaten an den Server geschickt. Als
  Pflichtfeld mit eigenem Namen faengt das der Typecheck.
- **Ob img2img gerechnet wurde, sagt `denoising` — nicht `initImage`.** Der Pfad darf null
  sein, waehrend sehr wohl ein Bild mitlaeuft: ein Fremdplugin schickt ueber die API Bytes
  ohne Vault-Datei. Deshalb ist auch `HardenInput.initImage` ein `{ ref: string | null }`:
  die ANWESENHEIT des Objekts ist das Signal, `ref` nur die Herkunft. Haengte das Signal am
  Pfad, verlore jeder API-Lauf sein `denoising` und die Notiz meldete einen img2img-Lauf als
  txt2img. Aus demselben Grund darf `ApiRequest` NIE ungeprueft als `HardenInput`
  durchgereicht werden (`deps.harden(req)`) — dort heisst `initImage` Base64.
- **Der Denoise-Regler hat ZWEI Sichtbarkeitsbedingungen, nicht eine.**
  `controls.initImage` = kann das Backend es, `controls.denoising` = gibt es eine
  Vorlage zu aendern. Seit 0.11 ist die erste Bedingung in BEIDEN Modi erfuellt (builtin kann
  img2img) — die Vorlagen-Zeile ist immer sichtbar, und `.lig-init-row`/`.lig-init-from-result`
  sind aus `MODUS_REGLER` des Smoke-Treibers RAUS (dort gefuehrt, meldete Punkt 17 die gewollte
  Sichtbarkeit als Defekt; gemessen 2026-08-31). Ein Regler ohne Vorlage bewirkt weiter nichts
  und waere dieselbe Attrappe wie ein CFG-Regler ohne CFG. Deshalb steht `.lig-denoise` auch
  NICHT in `MODUS_REGLER`: dort gefuehrt, wuerde Punkt 17 die zweite Stufe als Defekt melden.
- **Der Denoise-Einstiegspunkt wird INTERPOLIERT, und die Formel sitzt im Scheduler.**
  `denoiseEntry(steps, denoising, sigmas, timesteps)` (`src/core/pipeline/scheduler.ts`)
  liefert Einstiegsindex, Sigma und Timestep; beide Engines rufen sie und **ersetzen damit
  den Eintrag in der Folge**. Das Ersetzen ist der Punkt: `schedulerStep` liest sein
  Start-Sigma selbst aus dem Array, ein interpolierter Wert nur im Init-Latent verpufft
  und ergibt ein leise falsches Bild — kein Fehler, nur ein schlechteres Ergebnis.
  Der Timestep wird mitinterpoliert, sonst bekommt das UNet die Konditionierung des Ankers.
  Die Haertung (`hardenParams`) reicht `denoising` unveraendert durch und rechnet nichts.
  *Bis 0.11 war es umgekehrt: die Haertung rasterte auf `steps` Positionen. Gemessen
  2026-09-05 (84 Laeufe) uebersprang der Sprung 0.5 → 0.75 bei 4 Steps genau das Optimum.*
- **SD-Turbo ist im Denoise-Bereich NICHT monoton, und das ist kein Defekt — wer es fuer
  einen haelt, „repariert" die Interpolation kaputt.** Gemessen am Wirt (RMSE zur Vorlage,
  gleicher Seed und Prompt, steps 4): SD-Turbo 14.48 / **23.08** / 21.42 bei denoising
  0.5 / 0.625 / 0.75 — der mittlere Wert liegt WEITER weg als der hoechste. SDXL-Turbo ist
  im selben Lauf monoton (19.13 / 34.89 / 36.59).
  Die Ursache steht in `denoiseEntry`: t = (1−d)·steps, also 0.5 → t=2.0 · 0.625 → t=1.5 ·
  0.75 → t=1.0. **Von den dreien ist nur 0.625 interpoliert** (`frac` 0.5), die anderen
  beiden sind exakte Anker (`frac` 0) — und SD-Turbo ist auf genau vier Timesteps
  destilliert, faehrt bei einem Zwischenwert also off-distribution. Der eine interpolierte
  Punkt ist der eine, der aus der Reihe faellt.
  ⚠️ **Das galt vor 0.12 genauso; die Rasterung machte es nur unerreichbar** — der Umbau
  verursacht es nicht, er macht es sichtbar. Deshalb ist es auch KEIN Smoke-Punkt geworden
  (Entscheidung 2026-09-06): ein Pruefpunkt darauf bewachte eine Eigenschaft des MODELLS,
  die dieses Repo nicht kontrolliert, und wuerde bei einer neuen Modellstufe rot, ohne dass
  etwas kaputt waere. Punkt 26/27 messen ohnehin die Unterscheidbarkeit der Zwischenstufe —
  bewusst NICHT die Reihenfolge, genau deswegen. Der Erklaerungsbedarf liegt beim Nutzer und
  steht in beiden READMEs.
- **Der WebGPU-EP vertraegt nur EINE Session-Erzeugung zugleich.** `webgpuRegisterDevice` im
  Emscripten-Glue setzt ein Flag und wirft `another WebGPU EP inference session is being
  created`, wenn zwei `InferenceSession.create` ueberlappen. Das `Promise.all` ueber
  `loadPart()` war deshalb seit 0.9 ein Timing-Gluecksspiel und riss live, als der 5. Teil
  (der kleine, schnell erzeugte vae_encoder) dazukam. Fix: Erzeugungs-Queue in
  `LocalEngineBackend` (injizierte Grenze, Node-testbar; `getBuffer` bleibt parallel) plus
  Ketten-RESET beim Session-Timeout — ohne ihn haette ein einziger Ewig-Haenger jede weitere
  Erzeugung der gecachten Instanz blockiert (Review-Fund mit Repro). Die Wachhund-Frist
  enthaelt seither auch die Queue-Wartezeit.
- **0.11-Migration: Bestandsinstallationen zeigen wieder „Download" — und laden dabei NUR den
  Encoder nach.** Der Encoder ist Pflichtteil in `assetsFor()`, also ist ein 0.6–0.10-Cache
  `not-downloaded`; der Downloader ueberspringt gecachte Schluessel und holt nur die fehlende
  Datei (68 MB sd / 137 MB sdxl — gemessen im Smoke: 1 s gegen den lokalen Mock). Der
  Bestaetigungsdialog nennt dabei die GESAMTgroesse des Modells, nicht die fehlenden Bytes.
- **`.lig-model-pick` gehoert aus demselben Grund NICHT in `MODUS_REGLER`.** Die
  Modellwahl im Panel hat ebenfalls zwei UNABHAENGIGE Sichtbarkeitsbedingungen —
  `settings.showModelPicker` UND mehr als ein heruntergeladenes Modell — statt der einen
  (`mode`), die `MODUS_REGLER` prueft. Dort gefuehrt, meldete der Modus-Umschalt-Punkt einen
  Defekt in jedem Setup, in dem der Picker aus einem der beiden anderen Gruende zu Recht
  verborgen ist.
- **Ein ComfyUI-Workflow ohne setzbare Steps oder Bildmasse wird ABGEWIESEN, nicht mit
  Luecken uebernommen — und der Grund ist die Ergebnis-Notiz, nicht Vorsicht um ihrer
  selbst willen.** `inspectWorkflow()` (`src/core/comfy/workflow.ts`) prueft, bevor sie
  `ok: true` liefert, ob der gefundene Sampler ein `steps`-Feld hat und der aufgeloeste
  Latent-Node `width`/`height` traegt; fehlt eines, kommt `no-steps-field` bzw.
  `no-size-fields` statt eines Slot-Objekts mit `null`-Luecken zurueck. Grund: `GenParams`
  hat keinen Null-Fall fuer Steps oder Groesse — es gibt keinen ehrlichen Eintrag fuer „das
  Plugin hat den Wert nicht bestimmt", nur einen erfundenen. Ein Fallback (z. B. „dann
  nimm einen Default-Wert und schreib ihn in die Notiz") waere die Keine-Attrappen-Linie an
  genau der Stelle gebrochen, die sie am staerksten schuetzt: die Notiz behauptete einen
  Wert, den der Workflow gar nicht kennt. Wer hier bei einem kuenftigen Umbau eine
  Kulanzregel einbauen will ("wenn kein Steps-Feld da ist, nimm halt 20"), baut den Fehler
  bewusst wieder ein — die Abweisung ist die Spec-Entscheidung (Spec §4), keine
  uebertriebene Strenge, die man sich sparen koennte.
- **`MODUS_REGLER` im GUI-Smoke-Treiber traegt fuer DREI Modi nicht mehr — deshalb Punkt 35
  gegen eine eigene Erwartungstabelle statt gegen dieselbe Liste.** Die Liste ist als „im
  builtin-Modus versteckt, im server-Modus sichtbar" gebaut (eine Bedingung, ein Vergleich).
  Im comfy-Modus stimmt das nur fuer die CFG-Zeilen — `.lig-negative-row` ist dort
  SICHTBAR (der Negativ-Slot ist Teil der Sampler-Erkennung und existiert per Definition),
  waehrend CFG weiterhin verborgen bleibt (`patchWorkflow` fasst CFG bewusst nicht an).
  Ein dritter Durchlauf gegen `MODUS_REGLER` haette die Negativ-Zeile als falsch-roten
  Befund gemeldet. `MODUS_ERWARTUNG` (`scripts/gui-smoke.ts`, Punkt 35) fuehrt stattdessen
  je Modus eine eigene `{ sichtbar, versteckt }`-Zeile — drei Modi, drei Zeilen, keine
  gemeinsame Bedingung, die stillschweigend annimmt, es gaebe nur „kann alles" und „kann
  wenig". `MODUS_REGLER` selbst bleibt daneben bestehen (Punkt 17 prueft weiterhin nur
  builtin/server) — die beiden Listen sind nicht dieselbe Datenquelle mit zwei Namen.
- **`src/core/comfy/workflow.ts` ist KEIN Vendoring mehr, sondern ein FORK von
  `yijing-oracle` mit einer benannten inhaltlichen Abweichung — `client.ts` dagegen liegt
  nahe am Original.** Der Herkunftsstempel in Zeile 1 deklariert beide Male die Uebernahme,
  nicht die Abweichung; wer die Dateien neu zieht und nur den Stempel liest, ueberschreibt
  in `workflow.ts` eine Zusage, die dieses Repo gegeben hat. Der Unterschied zwischen den
  beiden Dateien ist der Punkt dieses Eintrags:
  - **`client.ts`:** technische Anpassungen an diesen Baum, keine Verhaltensaenderung.
    Non-null-Assertions traegt die Datei ⚠️ **keine** — eine frueher hier stehende Fassung
    behauptete das fuer beide Module und war fuer `client.ts` gemessen falsch. Eigene
    Abweichung ist dagegen der gefangene `/history`-Poll in `waitForImage` (I1,
    Branch-Abschlussreview 2026-09-06): ein geworfener Poll beendet den Lauf hier nicht.
    **Zweite eigene Abweichung seit 2026-09-06: `generate` und `waitForImage` kennen ein
    `AbortSignal`** (Provider-API `signal`). Ein Re-Sync aus `yijing-oracle` entfernt sie —
    und damit die halbe Zusage des Vertrags fuer den comfy-Modus.
  - **`workflow.ts`:** vier zusammenhaengende inhaltliche Aenderungen, die zusammen die
    Keine-Attrappen-Zusage fuer Steps und Groesse TRAGEN — (1) `WorkflowSlots.stepsField` ist
    nicht mehr nullable, (2) das Feld `workflowSteps` ist neu (Startwert des Reglers), (3)
    die Fehlerausgaenge `no-steps-field` und `no-size-fields` samt ihrer Pruefungen in
    `inspectWorkflow` sind neu, (4) `patchWorkflow` schreibt Steps deshalb unbedingt statt
    bedingt. Wer diese Datei neu zieht und nur „die `!` wieder einsetzen" abarbeitet, hat
    die ganze Abweisungsregel entfernt — und das Plugin schriebe wieder erfundene Werte in
    die Ergebnis-Notiz (Begruendung im Eintrag „Ein ComfyUI-Workflow ohne setzbare Steps
    oder Bildmasse wird ABGEWIESEN" weiter oben).
  Non-null-Assertions in `workflow.ts` (`noUncheckedIndexedAccess` ist hier `true`, im
  Original nicht) sind daneben die kleinere Sorte Abweichung: an jeder Stelle entweder INTERN
  bewiesen (ein Guard schliesst `undefined` vorher aus, z. B. `candidates[0]!` nach
  ausgeschlossenem `length > 1`) oder EXTERN bedingt und mit Doc-Kommentar versehen (z. B.
  `out[slots.positive]!` in `patchWorkflow`, sicher nur wenn `slots` aus `inspectWorkflow()`
  desselben Graphen stammt). **Ein Re-Sync ist damit keine Kopie, sondern ein Merge** — die
  vier Punkte oben gehoeren danach wieder drin, nicht nur die Assertionen.
- **„Speichern & als Vorlage" speichert wirklich — das ist der Punkt.** Der Knopf legt das
  Ergebnis erst im Vault ab und macht dann dessen Pfad zur Vorlage. Ohne das entstuende eine
  Vorlage ohne benennbare Herkunft, und die Ergebnis-Notiz muesste „Vorlage: das vorige
  Ergebnis" behaupten. Legt nur das Bild an, nie eine Notiz — `createMode` gilt fuer
  Ergebnisse, nicht fuer Zwischenschritte.
- **`cfg: null` heisst „vom Backend bestimmt", `cfg: 1` heisst „keine Guidance" — die zwei
  nicht zusammenlegen.** Die Haertung verzweigt fuer `cfg` ueber `ctx.mode`, nicht ueber
  `caps.cfg`: builtin traegt eine echte 1 (SD-Turbo ist destilliert), comfy traegt `null`
  (`patchWorkflow` fasst das CFG-Feld des Samplers nicht an, der Nutzer-Workflow entscheidet),
  server traegt den gesetzten Wert. `note.ts` laesst das Feld bei `null` weg — wie `denoising`
  und `negative_prompt`. Vorher stand in JEDER ComfyUI-Notiz `cfg: 1`, ein Wert, der nie galt
  (C1, Branch-Abschlussreview 2026-09-06). Das ist dieselbe Erfindung, gegen die die
  Steps-Abweisung steht, nur in die andere Richtung entschieden — wer `caps.cfg === false`
  wieder als „also 1" liest, baut sie zurueck. Zwei Folgestellen haengen daran: die
  Historien-Migration muss FEHLEND (Alt-Eintrag → 7) von ausdruecklich `null` unterscheiden
  (`typeof null` ist "object"), und `applyRecipe` laesst den Regler bei `null` stehen, statt
  ihn ueber die Klemme auf `CFG.min` zu reissen. `apiVersion` bleibt trotzdem 1: `ApiParams`
  ist per Vertrag „was die Haertung still ueberschrieben hat", und im comfy-Modus hat sie
  nichts ueberschrieben.
  **Seit 2026-09-06 ist das LIVE gedeckt, nicht nur unit-getestet: GUI-Smoke-Punkt 39** misst
  am laufenden Wirt, dass die comfy-Notiz keine `cfg:`-Zeile traegt — und prueft davor
  `seed:`/`model:`, weil ein Punkt auf die ABWESENHEIT einer Zeile sonst gerade dann gruen
  waere, wenn die Notiz gar nicht geschrieben wurde. Gegenprobe gefahren (comfy-Zweig auf `1`
  zurueckgestellt → rot mit „Notiz behauptet cfg: 1", waehrend Punkt 38 gruen blieb).
- **`/history` ist ComfyUIs ERGEBNISkanal, nicht sein Fortschritt — ein geworfener Poll darf
  den Lauf nicht beenden.** `comfyTransport().getJson` faehrt bewusst mit kurzem Zeitlimit
  (3 s, im Sekundentakt gepollt) und `httpGetJson` WIRFT beim Ablauf; `waitForImage` faengt
  das und pollt weiter, die Deadline der Schleife ist die Notbremse. Ohne das Fangen beendete
  ein einziger langsamer Poll `generate()`, waehrend das Bild auf dem Server fertig war —
  ComfyUI stallt seinen Loop regelmaessig (Modell-Laden beim ersten Lauf, VAE-Decode grosser
  Bilder). Dieselbe Doktrin wie beim A1111-Fortschritt („Timeout und 5xx sind voruebergehend
  und pollen weiter"), und derselbe Grund, warum der kurze Timeout hier bleiben DARF: er ist
  nur zulaessig, solange das try/catch daneben steht. Die Gesamtfrist setzt der Wirt
  (`makeComfyClient`, 30 min) auf dieselbe Groessenordnung wie den A1111-Weg — der
  Client-Default von 10 min laesst einen Lauf mit Upscaler-Kette an einer Grenze scheitern,
  die in keinem Setting steht (I1, Branch-Abschlussreview 2026-09-06).
- **`signal` ist im builtin-Modus ein ECHTER Abbruch und in den HTTP-Modi nur ein Ende der
  WARTEZEIT — und diese Asymmetrie ist die Zusage, nicht ihr Mangel.** Die eingebaute Engine
  prueft zwischen zwei Diffusionsschritten (`runDiffusion`, `throwIfAborted`) und laesst den
  VAE-Decoder gar nicht erst laufen; `A1111Client` und `ComfyClient` koennen einen laufenden
  Aufruf nicht zuruecknehmen (`requestUrl` kennt weder Abort noch Timeout) und pruefen
  deshalb VOR dem Absenden bzw. zwischen zwei Polls. Der Server rechnet fertig.
  **Nicht „vereinheitlichen"**: ein `signal`, das in beiden Modi dasselbe verspricht, muesste
  im Server-Modus luegen — dieselbe Attrappe wie ein CFG-Regler ohne Wirkung. Der Nutzen im
  Server-Modus ist trotzdem echt und der Grund fuer das Feature: bei einem Stapellauf laeuft
  das begonnene Bild aus, das NAECHSTE startet nicht mehr.
  ⚠️ **`tsc` verengt `req.signal?.aborted` nach der ersten Pruefung auf `false | undefined`**
  und meldet die zweite (nach `await deps.run(...)`) als TS2367 — der Compiler haette hier
  also die noetige Pruefung wegargumentiert, weil er nicht weiss, dass das Feld genau
  waehrend des `await` umspringt. Deshalb steht in `plugin-api.ts` eine kleine Funktion
  (`abgebrochen()`) statt zweier direkter Vergleiche: ein Aufruf sagt „neu lesen". Wer sie
  wieder inline schreibt, bekommt den Typfehler zurueck — oder, schlimmer, loescht die
  zweite Pruefung, und dann meldet ein Abbruch waehrend des Laufs `failed` mit roher
  Backend-Meldung.
  ⚠️ **`reason: "aborted"` steht bewusst NICHT in `ApiFailure`:** den Union teilt sich
  `generate()` mit `status()`, und ein Status kann nicht „abgebrochen" sein — dieselbe
  Trennung wie bei `failed`. `apiVersion` bleibt 1: wer kein `signal` schickt, sieht den Wert
  nie.
  ⓘ Der Abbruch waehrend des Laufs wird am ZUSTAND des Signals erkannt, nie am Meldungstext
  des Backends — ein Textvergleich braeche bei jeder Uebersetzung und bei jedem Backend, das
  anders formuliert. Die Gegenprobe dazu ist ein eigener Test („meldet einen ECHTEN
  Fehlschlag weiter als failed, auch wenn ein Signal mitlaeuft"): ohne ihn verschluckte ein
  gesetztes `signal` jede Backend-Meldung.
- **Die Haertung hat genau eine Quelle** (`src/core/params.ts`, `hardenParams`). Zwei
  Haertungen bedeuten, dass die API andere Werte meldet, als das Panel in die Notiz schreibt.
- **Ein Fremdlauf hinterlaesst im Panel KEINE Spur — auch nicht als Fehler.** `runGeneration`
  faellt im `catch` bei `external` auf `{ kind: "idle" }` zurueck statt auf `error` mit der
  rohen Backend-Meldung (Ruling 2026-08-23, `f223c8f`). Das sieht wie ein verschluckter Fehler
  aus und ist keiner: der Erfolgsfall schrieb schon immer `idle`, der Aufrufer bekommt den
  Fehler als Rueckgabewert, und die Statuszeile gehoert dem eigenen Klick. Wer hier einen
  Fehlerzustand zurueckbaut, laesst das Panel wieder einen FREMDEN Fehlschlag als eigenen
  melden. Der Fix liegt in `main.ts`, der einzigen Schicht ohne Unit-Test-Ebene — seit
  2026-08-30 deckt ihn **GUI-Smoke-Punkt 18c**, gemessen an der gerenderten Statuszeile gegen
  ihren Wert von VORHER (Gegenprobe: den Fallback zurueckgebaut → rot mit „Statuszeile WEICHT
  AB von „Ready""). Diese Zeile ist damit nicht mehr die einzige Deckung.
- **`save()` prueft `created` und `seed`, bevor daraus ein Vault-Pfad wird**
  (`unusableParams` in `src/core/plugin-api.ts`). Sieht redundant aus, weil `ApiParams` beide
  typisiert — TypeScript schuetzt aber keinen JS-Aufrufer, und `buildImageFilename`
  interpoliert beide direkt in den Dateinamen (`lig-NaNNaNNaN-NaNNaNNaN-s7.png` aus einem
  kaputten `created`). Die Abweisung faellt VOR dem Write und als `write-failed`, damit die
  Fehler-Union von v1 unveraendert bleibt.
- **`PanelState.mode` wird ABGELEITET, nicht gespiegelt.** Der gehaltene State ist
  `Omit<PanelState, "mode">`; `mode` entsteht einzig in `getPanelState()` aus
  `settings.engine`. Das `Omit` ist der eigentliche Fix — es macht ein zweites Spiegeln
  typseitig unmoeglich (Gegenprobe: eine Zuweisung `this.state.mode = …` bricht `tsc` mit
  TS2339). Vorher hielten zwei Zuweisungen in `main.ts` die Kopie von Hand synchron, und das
  ViewModel las die Kopie, waehrend alles Neuere `settings.engine` las.
- **Ein Fallback-Argument, das einen injizierten Callback ruft, gehoert lazy.**
  `finite(value, fallback)` in `src/core/params.ts` nimmt deshalb `number | (() => number)`:
  `finite(input.seed, ctx.randomSeed())` haette `randomSeed()` bei JEDER Haertung gezogen, auch
  mit brauchbarem Seed. Konstante Fallbacks bleiben Werte — kein Thunk-Rauschen. Die
  Gegenprobe ist ein Test, der die Ziehungen ZAEHLT; der Rueckgabewert stimmte immer.
- **`ApiParams.created` vs. `GenParams.date`** ist Absicht, kein Versehen: der Vertrag darf
  nicht mitwandern, wenn intern umbenannt wird.
- **Der Erstellungs-Zeitstempel wird AM ANFANG gesetzt, nicht am Ende.** `GenParams.date`
  traegt den Moment der ANFRAGE, nicht der Fertigstellung — die Haertung ist die einzige Quelle
  fuer Panel und API, und eine Doppel-Zeitstempel-Setzung wuerde die zwei berichten
  unterschiedliche Zeiten, im Server-Modus Sekunden, im builtin-Modus Minuten. Folge: eine
  Notiz traegt die Anfrage-Zeit statt der Fertig-Zeit; die Datei traegt diese Zeit im Namen.
- **Der dritte Modus-Wert faellt an rund einem Dutzend Stellen in den else-Zweig — und `tsc`
  warnt dort weiterhin NICHT.** `PanelState.mode` wurde von `"builtin" | "server"` auf
  `EngineChoice` geweitet (noetig, weil `getPanelState()` `settings.engine` hineinschreibt,
  das seit dem comfy-Backend `"comfy"` fuehrt). Vorher haette ein dritter Wert an jeder
  `=== "builtin"`-Verzweigung einen Typfehler erzwungen; seit der Weitung kompiliert `else`
  klaglos durch, egal ob die Behandlung als Server dort richtig ist oder nicht. Der Wächter
  ist damit von `tsc` auf DIESE LISTE gewechselt — genau der Fehlermodus, vor dem der Absatz
  zum verlorenen Session-Wachhund weiter oben warnt (nur in einer Datei festgehalten, die
  beim naechsten Umbau nicht mitgelesen wird) — und bleibt es, denn der Typfehler kommt
  durch keine der folgenden Behebungen zurueck. **Stand nach Abschluss des comfy-Backends
  (Tasks 8–10): die vier ZUERST hier gefuehrten Stellen sind erledigt oder waren nie
  betroffen — wer ihnen noch nachjagt, jagt einem behobenen Befund nach:**
  - **`main.ts::currentModelName`** — war **nie** so kaputt, wie eine frühere Fassung dieses
    Eintrags behauptete: `checkServer()` setzt `state.server.modelName` fuer den comfy-Modus
    auf `null` (ComfyUI hat keinen A1111-Modellnamen-Endpunkt), und die Funktion faellt bei
    `null` seit jeher auf `"unknown"` zurueck statt einen fremden Modellnamen zu erben. Die
    Ergebnis-Notiz traegt in diesem Fall ehrlich „unknown", nie den Namen des A1111-Servers.
  - **`main.ts::apiReadiness`** — behoben in Task 8 (Routing und Bereitschafts-Gate): ein
    eigener `comfy`-Zweig prueft zuerst `state.workflow.kind !== "ok"` (→
    `not-configured`) und faellt erst danach in dieselbe Server-Bedingung. Ein Fremdplugin
    ueber die Provider-API bekommt `ready: true` also nicht mehr allein dafuer, dass
    irgendein Server antwortet — es braucht zusaetzlich einen brauchbaren Workflow.
  - **`main.ts::setEngine`** — ebenfalls Task 8: der Aufraeumzweig haengt jetzt an
    `mode !== "builtin"` statt an `mode === "server"` und greift damit fuer JEDEN
    Nicht-builtin-Zielmodus. Ein Wechsel builtin → comfy bricht einen laufenden
    Modell-Download ab und gibt die GPU-Sessions frei, genau wie builtin → server.
  - **`settings-tab.ts` (Engine-Dropdown-Handler)** — behoben in Task 9 (Bedienung): die
    Ableitung ist jetzt dreiwertig
    (`clean === "server" ? "server" : clean === "comfy" ? "comfy" : "builtin"`), die Auswahl
    „ComfyUI" springt beim Speichern nicht mehr still auf `builtin` zurueck.
  **Ebenfalls inzwischen comfy-bewusst, obwohl nicht Teil der vier oben:** `plugin-api.ts
  ::recheck()` prueft seit Task 8 `deps.getMode() === "server" || deps.getMode() === "comfy"`
  (kein builtin-No-op mehr fuer comfy) und `core/viewmodel.ts::buildViewModel` verzweigt seit
  Task 8/9 explizit fuer comfy (`comfyStatus`/`comfyEmpty`) statt es als Server zu behandeln.
  ⚠️ **Drei weitere Verzweigungen fehlten in dieser Liste (Final-Review 2026-09-06) — und eine
  Liste, die den Compiler ersetzen soll, ist nur so viel wert wie ihre Vollstaendigkeit:**
  - **`main.ts::generate()`s Bereitschafts-Waechter** — korrekt behandelt: die Defensive
    hinter dem ViewModel prueft im Nicht-builtin-Zweig zusaetzlich
    `settings.engine !== "comfy" || state.workflow.kind === "ok"`. Ohne das startete ein Klick
    im comfy-Modus einen Lauf ohne brauchbaren Workflow.
  - **`main.ts::makeComfyClient()`** — korrekt behandelt: sie IST der comfy-Zweig der
    Backend-Wahl in `runGeneration()` und wirft bei nicht-`ok`-Workflow, statt einen leeren
    Graphen zu senden.
  - **die initiale `state.engine`-Zuweisung im `onload`**
    (`settings.engine === "builtin" ? "gpu-checking" : "not-downloaded"`) — folgenlos, aber
    nicht „richtig": der comfy-Modus landet dort im Server-Zweig und traegt einen
    Engine-Zustand, den in diesem Modus niemand liest (`engineStatus`/`engineEmpty` laufen nur
    im builtin-Zweig). Wer den Engine-Zustand je modusuebergreifend liest, muss hier zuerst
    hinsehen.
  **Einzige noch offene Stelle:** `core/viewmodel.ts::recipeUnchanged` faltet den comfy-Fall
  weiterhin in den Server-Vergleich (`s.server.kind === "ok" && s.server.modelName === p?.model`).
  Da `modelName` im comfy-Modus laut obigem Fix immer `null` ist, schlaegt dieser Vergleich
  im comfy-Modus immer fehl — kein Datenfehler (die Notiz bleibt ehrlich), aber
  `generateEnabled` sperrt ein unveraendertes Rezept im comfy-Modus nie, anders als im
  Server- oder builtin-Modus. Ein reiner UI-Komfortverlust, keine Falschaussage — deshalb
  bewusst nicht Teil dieser Task, aber hier vermerkt, damit eine spaetere Aenderung an
  `recipeUnchanged` weiss, dass der comfy-Fall dort noch nie eigens behandelt wurde.
- **Der vierte Modus-Wert (`"playground"`, Welle 13) ist an denselben Stellen eingepasst —
  diesmal VOR dem Release, nicht danach nachgezogen.** 17 Touchpoints (Liste in der
  Welle-13-Ist-Stand-Meldung, Cockpit-Task „Welle 13 — Image-Playground-Backend und
  Anbieter-API v1"): `EngineChoice`+`oneOf`, `runGeneration()`-Ternaerkette,
  `apiReadiness()`, `currentModelName()`, `endpointRole()`/`resolveEndpointFor()`-Ausschluss
  (playground hat KEINEN Endpunkt), `setEngine()`-Aufraeumzweig, `generate()`-Guard,
  Settings-Dropdown-Ternaerkette, `backendCapabilities()`/`toBackendContext()`,
  `buildViewModel()` (builtin/comfy-Booleans → playground dazu). `recipeUnchanged` faellt
  fuer playground bewusst in denselben Server-Vergleich wie comfy (`s.server.kind` bleibt
  fuer playground immer `"unconfigured"`) — derselbe reine UI-Komfortverlust wie oben, kein
  Datenfehler. Wer einen FUENFTEN Modus einfuehrt: dieselbe Liste, nicht neu suchen.
- **Der Kurzbefehl schreibt die Bilddatei direkt in den Vault (Spec `shortcuts-bridge`,
  `expectFile`) — die normale Panel-Pipeline schreibt danach TROTZDEM noch einmal.**
  `PlaygroundBackend.generate()` (`src/obsidian/playground-backend.ts`) liest die vom
  Kurzbefehl gefundene Datei zurueck, base64-kodiert sie (der `ImageBackend`-Vertrag
  verlangt genau das, wie bei den anderen drei Backends) und LOESCHT die Rohdatei danach
  (`fileManager.trashFile`) — sonst laege ein Duplikat im Vault: die Panel-Pipeline
  schreibt das zurueckgegebene Base64-Bild ohnehin noch einmal an den ueblichen Zielpfad
  (`resolveImagePath()`, korrekte Namensgebung/Dedup). Der Zielordner fuer `expectFile` ist
  bewusst `settings.outputFolder` — dieselbe Ablage wie der Rest des Plugins, kein eigenes
  Zielordner-Setting (Auftrag Welle 13: „bestehende Attachment-Logik nutzen").
- **`generateImage()` (Kit-Vertrag `image-gen-provider`) ist ein ZUSAETZLICHER Export auf
  demselben API-Objekt, keine zweite Fassade.** Die bestehende Provider-API
  (`IMAGE_GENERATION_API_VERSION` bleibt 1, `status/generate/save/recheck`) ist unveraendert;
  `ImageGenerationApi extends ImageGenProviderApi` traegt zusaetzlich `version` (Kit-eigenes
  Versionsfeld, ABSICHTLICH ein anderes Feld als `apiVersion` — die beiden Vertraege koennen
  unabhaengig voneinander wachsen) und `generateImage(prompt, opts)`. Schreibt ueber eine
  NEUE `ApiDeps.saveToFolder(folder, params, base64)` in einen vom AUFRUFER benannten Ordner
  (`opts.targetFolder`) — bewusst NICHT ueber `save()`/`resolveImagePath()`, die immer
  `settings.outputFolder` (die Einstellung DIESES Nutzers) verwenden: ein Fremdplugin wie
  Koda soll seine Bilder nicht dorthin mischen.
- **Endpunkte koennen seit 0.15.0 vom LLM Endpoint Manager kommen — zwei ROLLEN an einem
  Manager, nicht zwei Settings-Felder (Entscheidung Johannes 2026-09-17, Welle 7).**
  `src/core/resolve-endpoint.ts::resolveImageEndpoint(role, choice, localEndpoint, manager,
  ping)` loest fuer `role` ("server" | "comfy") GENAU EINEN Endpunkt der Capability "image"
  auf. **Ohne Manager aendert sich NICHTS:** `main.ts::resolveEndpointFor()` gibt dann
  `settings.endpoint.trim() || null` direkt zurueck, ungepingt — ein Ping hier haette eine
  Generierung verhindert, die heute (ohne geklickten „Verbindung testen"-Knopf) trotzdem
  funktioniert. **Mit Manager entscheidet der Kit-Vertrag `resolveEndpointSource` ALLEIN,
  OHNE stillen Ruckfall** auf das geteilte `endpoint`-Feld (dieselbe Regel wie
  yijing-oracle/lingotuner: eine Fehlermeldung soll auf die Manager-Einstellungen zeigen).
  `checkServer()`, `runGeneration()` (Backend-Bau + `ProgressPoller`) und `makeComfyClient()`
  teilen sich EINE Aufloesung pro Lauf/Check — kein zweiter Manager-Zugriff je Baustein.
  ⚠️ **Der Manager filtert die angebotene Liste NICHT nach Provider** (a1111 vs. comfy):
  `buildEndpointSourceSection()` zeigt in BEIDEN Rollen dieselben Capability-"image"-Eintraege,
  die Trennung ist reine Nutzerwahl (zwei unabhaengige `EndpointChoice`, kein Filter). Wer
  einen Draw-Things-Endpunkt versehentlich in der Comfy-Rolle waehlt, bekommt keinen Fehler
  beim Waehlen — erst der naechste Verbindungstest/Lauf zeigt es.
  **Vendoring lief bis Welle 12 EINZELN, ausserhalb von `tools/sync-kit.sh`** (Rahmen-Regel 2
  der Welle-7-Auftragsnote: das damalige Skript pinnte eine gemeinsame Ref fuer alle neun
  gelisteten Module und haette sie beim Aufnehmen dieser vier Dateien auf 0.39.0 gehoben).
  Seit Welle 12 (2026-09-27, zentrales `kit-sync`) sind Einzelpins ein normaler Fall der
  Konfiguration, kein Sonderweg mehr: `tools/kit-sync.json` traegt fuer
  `src/vendor/kit/endpoint-source.ts` und `src/vendor/kit-obsidian/{endpoint-source,
  model-picker}.ts` je `{ "name": …, "ref": "0.39.0" }` (obsidian-kit), fuer
  `src/vendor/kit/{endpoint_config,model-choice}.ts` die Quelle `code-kit@0.6.0` — beide
  VENDOR.json listen die Abweichung seither inline im `vendored`-Schluessel
  (`datei.ts (quelle@version, sha)`), das fruehere Array `vendored_mixed_version` ist damit
  redundant geworden und entfernt. Re-vendor gegen einen neuen Tag: `ref` in
  `tools/kit-sync.json` anheben, `node ../tools/kit-sync/kit-sync.mjs` laufen lassen.

## Vertrieb: Sideloader statt Community-Store (seit 2026-09-02)

Das GitHub-Konto ist geflaggt (anonym 404), alle Plugins sind aus dem Community-Store geflogen.
**Der Vertriebsweg ist seither der eigene:** `anysource-sideloader` installiert aus Releases
jeder Forge, dieses Plugin steht im Katalog
`git.jkaindl.de/jkaindl/obsidian-plugin-catalog` (`catalog.json`), und `npm run release`
erzeugt den noetigen Forgejo-Release mit `main.js`/`manifest.json`/`styles.css`/`checksums.sha256`
von sich aus. **Ein Release ist deshalb NICHT mehr zu blockieren, nur weil GitHub zu ist** —
0.11.1 und 0.11.2 sind so ausgeliefert worden.

**Seit 2026-09-04 ist der Ausstieg vollzogen, nicht nur beschrieben:** das `github`-Remote ist
entfernt und `npm run release` faehrt fest mit `--no-github` (im `package.json` verdrahtet, nicht
als Tipp-Disziplin). ⚠️ **Die Reihenfolge ist Teil der Sache:** ohne das Flag ist ein fehlendes
`github`-Remote ein HARTER ABBRUCH von `release.mjs` — wer nur das Remote loescht, zerstoert die
Releases. Erst das Flag, dann das Remote. Im Dach steht das Repo dafuer in
`tools/mirror_drift_check.py::AUSNAHMEN`; ein fehlender Mirror ist hier kein Drift, sondern der
Zielzustand. `.github/workflows/release.yml` bleibt liegen (Byte-Gleichheit bewacht
`tools/template_drift_check.py`) — sie laeuft nur nicht mehr.

⚠️ **Was weiterhin gesperrt bleibt: der Rescan im Developer Dashboard.** Ein Scan ohne
GitHub-Release meldet „Unable to find a release with the tag" und gilt als DURCHGEFALLEN — das
nimmt das Plugin binnen 24 h aus der Store-Suche. Der Abschnitt unten beschreibt also einen Weg,
der derzeit nicht offen ist; er bleibt stehen, weil die gemessenen Kostensaetze weiter gelten,
falls das Konto wieder freigegeben wird.

## Store-Scorecard (gemessen 2026-08-30, Release 0.10.0)

**Health `Excellent` · Review `Passed`** — zum SECHSTEN Mal in Folge, zum dritten Mal mit
**zero warnings**. Keine `low`/`medium`/`high`-Befunde.

**Die Befundliste ist gegenueber 0.8.0 UNVERAENDERT — Zeile fuer Zeile, in beiden Kategorien.**
Das ist die eigentliche Messung dieser Runde, denn 0.9.0 hat einiges hinzugefuegt, das nach
„das kostet bestimmt eine Warnung" aussieht: ein ZWEITES eingebautes Modell mit **7,0 GB**
Download, ein UNet, das als **13 External-Data-Buckets** geladen wird, ein Bestaetigungsdialog
vor dem grossen Download und ein Modellteil, der bewusst in fp32 ausgeliefert wird. Der Scanner
bewertet davon **nichts** — weder Groesse noch Stueckelung noch die Zahl der Dateien.
`Plugin references unrecognized WASM files` stand schon vorher da und ist nicht gewachsen.

**Kostensatz, der ueber dieses Plugin hinausgeht:** ein weiteres Modell derselben Bauart ist in
der Store-Wertung **gratis**. Was zaehlt, ist die ART des Zugriffs (Netzweg, Vault-Weg,
Code-Ausfuehrung), nicht sein Umfang. Wer eine zweite Modellstufe plant, muss dafuer nichts
einpreisen — wohl aber fuer eine neue Zugriffsart (`vault.getFiles()` kostete in 0.8.0 genau
eine `info`-Zeile, s.u.).

**Zweimal an einem Tag bestaetigt, mit zwei verschiedenen Zuwaechsen.** 0.9.0 und 0.10.0 wurden
am 2026-08-30 nacheinander gescannt (Johannes), und beide Male war die Befundliste Zeile fuer
Zeile identisch mit der von 0.8.0. Der zweite Fall haerten die Aussage von der anderen Seite:
0.10.0 brachte keine Groesse, sondern eine neue oeffentliche API-Methode (`recheck()`) mit einem
zusaetzlichen Netzaufruf — und auch das bewegt nichts, weil es **dieselbe Zugriffsart** ist
(derselbe `requestUrl`-Weg zu demselben Endpunkt, nur zu einem anderen Zeitpunkt).
`Number of network request calls` steht als `info` ohne Zahl da und waechst nicht mit.

Zusammen ergeben die beiden Messungen die Regel: **es zaehlt, WELCHE Sorte Zugriff im Code
vorkommt — nicht wie oft, nicht wie gross, und nicht, wer ihn ausloest.** (Dritter Beleg dafuer
aus 0.7.0: eine oeffentliche `plugin.api`, ueber die ein FREMDES Plugin in den Vault schreiben
laesst, liess `Vault Write` ein `pass` bleiben.)

### Historie: was 0.8.0 gegenueber 0.7.0 gekostet hat

**Die Befundliste hatte sich gegenueber 0.7.0 um GENAU EINE `info`-Zeile veraendert — und die
liess sich auf eine einzige Codezeile zurueckfuehren:**

> `**Vault Enumeration**: Enumerates all files in the vault (vault.getFiles, getMarkdownFiles, …).`

Ursache ist `app.vault.getFiles()` im `ImagePickerModal` (`src/obsidian/image-picker.ts:21`) —
die Vorlagen-Auswahl fuer img2img. In 0.7.0 gab es keinen einzigen `getFiles`-Aufruf; der Scanner
misst also praezise, was dazukam.

**Damit ist ein Kostensatz gemessen, der ueber dieses Plugin hinausgeht:** ein Vault-Datei-Picker
(`FuzzySuggestModal` ueber `vault.getFiles()`) kostet **eine `info`-Zeile und sonst nichts** —
die Note bleibt `Passed`. Wer eine Dateiauswahl plant, muss dafuer nichts einpreisen. `info` ist
eine *Recommendation*, keine *Warning*; nur `medium` und darueber druecken die Note.

`pass` (unveraendert): Attestierungen fuer `main.js`/`styles.css`, `Build reproduced the release
main.js byte-for-byte`, keine verwundbaren Abhaengigkeiten, **`Vault Write`**.

`info`: `AGPL copyleft`, `Number of network request calls`, `runtime base64 encode or decode`,
**`Vault Enumeration`** (neu, s.o.), **`Dynamic Code Execution`** (das `new Function(` der
Emscripten-embind in der ORT-Glue), `Plugin references unrecognized WASM files`.

⚠️ **Drei Pruefungen liefen wieder gar nicht:** `Malware scan not available`,
`Obfuscation scan not available`, `Network requests scan not available` — inzwischen **fuenfte
Version in Folge** (in 0.9.0 unveraendert vorhanden). Das steht unter `info` und sieht wie ein Befund aus, ist aber die Abwesenheit einer
Messung. Nicht als Freibrief lesen: wer eine riskante Bauart plant, hat hier **keine**
Bestaetigung bekommen, nur kein Widerwort.

**Was 0.7.0 schon gezeigt hatte und weiter gilt:** eine oeffentliche `plugin.api`, ueber die ein
FREMDES Plugin Bilder erzeugen und in den Vault schreiben laesst, erzeugt **keine** neue
Kategorie — `Vault Write` bleibt ein `pass`, weil der Scanner den *Weg* bewertet (Obsidian-API
statt `fs`), nicht den Ausloeser. Dasselbe gilt fuer img2img: ein zweiter HTTP-Endpunkt zum
selben Server kostet nichts.

Nachlesen: `python3 <obsidian-store-recherche>/scripts/scorecard.py local-image-generator`.
**Der Scan laeuft nie von selbst an** — nach jedem Release im Developer Dashboard einen
Rescan anstossen (0.9.0: von Johannes am 2026-08-30 angestossen, Ergebnis oben; 0.8.0 am
2026-08-23).

## Historie: die in-process-Engine (bis 0.4) und der Thin-Client (0.5)

0.5 hatte die Engine ganz entfernt (Store-Warnungen durch `child_process`/`fs`/34-MB-Bundle);
0.6 hat sie **im Renderer** zurueckgeholt — ohne mflux, ohne Inline-WASM, mit Assets vom eigenen
HF-Repo (Spike 2026-08-19: Nachladen kostet nur `info`). Die Notizen unten bleiben, weil die
zurueckgeholte Pipeline genau diese Fallen traegt:

- **WASM-Paarung:** Die inline gebundelte ORT-WASM-Variante MUSS zum Glue des importierten
  Bundles passen. ORT 1.27 `onnxruntime-web/webgpu` → `asyncify`, NICHT `jsep`. Falsche
  Paarung = stiller Ewig-Haenger (uncaught rejection, create() resolved nie).
- **fp16-Gewichte ≠ fp16-Inputs:** Die Engine passt Feed-Dtypes an `Session.inputTypes`
  (aus ort `inputMetadata`) an. Nie Dtypes hardcoden.
- **Tokenizer:** CLIP-BPE exact-match (kein `</w>`-Fallback), Pad-Token 0 (OpenCLIP/sd-turbo-
  Referenz, MS-Demo index.js L256).
- **Referenz:** microsoft/onnxruntime-inference-examples `js/sd-turbo/index.js` (nicht main.js).
- **mflux-Kindprozess (0.4):** FLUX.2 klein lief ueber `mflux-generate-flux2` (User-
  installiert, Auto-Detect in mflux-detect.ts, IO-Bindung in mflux-host.ts — Electron erbt
  keinen Shell-PATH). tqdm schreibt Fortschritt auf **stderr mit `\r`**. Uebrig ist davon
  nur das tote Settings-Feld `mfluxPath`.
- **Uebrig im Code:** `src/obsidian/legacy-cache.ts` findet und loescht die ~2,5 GB
  SD-Turbo-Gewichte, die Bestandsinstallationen noch in der Cache API haben.
