// Plugin-eigene UI-Chrome-Strings (Buttons, Settings, Notices). registerI18n() wird EINMALIG
// im onload aufgerufen (vor addCommand/addSettingTab/addRibbonIcon/registerView), siehe
// docs/superpowers/specs/2026-07-17-i18n-design.md §2.
//
// Key-Namespaces: cmd.* (Commands) · view.* (View-Titel/Tabs) · generate.* (Generate-Panel) ·
// status.* (Statuszeile) · empty.* (Leerzustände) · notice.* (new Notice(...)) ·
// settings.<gruppe>.* (Settings-Tab) · history.* (History-Panel) · modal.* (confirmAction) ·
// picker.* (Vorlagenbild-Auswahl) · confirm.* (Bestaetigungsdialoge ausserhalb von modal.*,
// z. B. vor einem grossen Modell-Download).
import { defineStrings } from "../vendor/kit/i18n";

export const EN: Record<string, string> = {
  "status.preparingDownload": "Preparing download…",
  "status.downloadPaused": "Download paused · {0} retained",
  "status.downloadRetry": "Retrying {0} in {1}s (attempt {2}/{3}) · {4} retained for this file",
  "empty.downloadPaused": "{0} of your unfinished downloads is saved. Resume when you are ready; verification finishes before the model becomes available.",
  "settings.model.resume": "Resume download",
  "settings.model.discard": "Discard partial download",
  "engine.downloadNetwork": "Download interrupted. Check your connection, then resume. Completed portions are saved.",
  "engine.downloadStorage": "Could not save model files. Free some disk space, then resume.",
  "engine.downloadHttp": "Download source returned HTTP {0}. Check the download source or try again later.",
  "engine.downloadProtocol": "The download source returned an invalid file or byte range. Check the download source before retrying.",
  "cmd.open": "Open generator",

  "view.title": "Local Image Generator",
  "view.tabGenerate": "Generate",
  "view.tabHistory": "History",

  "generate.promptPlaceholder": "Describe the image…",
  "generate.button.generate": "Generate",
  "generate.button.reroll": "Reroll",
  "generate.button.create": "Create",
  "generate.button.insert": "Insert",
  "generate.modelInfo": "Model: {0}",
  "generate.modelInApp": "Model: (chosen in the server app)",
  "generate.negativePrompt": "Negative prompt",
  "generate.negativePromptPlaceholder": "What to avoid…",
  "generate.size": "Size",
  "generate.model": "Model",
  "generate.steps": "Steps",
  "generate.cfg": "Guidance (CFG)",
  "generate.seed": "Seed",
  "generate.randomSeed": "Randomize seed",
  "generate.presetsLabel": "Styles",
  "generate.insertNeedsEditor": "Open a note to insert the image",
  "generate.initImage": "Reference",
  "generate.initImagePick": "Choose…",
  "generate.initImageClear": "Remove",
  "generate.initImageNone": "No reference image",
  "generate.initImageFromResult": "Save & use as reference",
  "generate.denoising": "Change strength",
  "picker.title": "Choose a reference image",

  "status.ready": "Ready",
  "status.error": "Error: {0}",
  "status.noEndpoint": "No image server configured",
  "status.serverChecking": "Checking server…",
  "status.serverUnreachable": "Server unreachable — is the API enabled?",
  "status.contacting": "Contacting server…",
  "status.generatingPct": "Generating… {0}%",
  "status.generatingElapsed": "Generating… ({0})",
  "status.externalRun": "Another plugin is generating an image…",
  "status.externalRunPct": "Another plugin is generating an image… {0}%",

  "status.noWorkflow": "No workflow selected",
  "status.workflowMissing": "Workflow file not found: {0}",
  // Eigene Texte statt der Server-Fassung: der Endpunkt ist zwischen beiden Modi GETEILT, wer
  // aus dem Server-Modus umstellt, behaelt also seinen A1111-Endpunkt. „Is the API enabled?"
  // fuehrt dann in die Irre — der Server ist erreichbar, er ist nur der falsche.
  "status.noComfyEndpoint": "No ComfyUI server configured",
  "status.comfyUnreachable": "No ComfyUI at this address (default port 8188, or 8000 in the ComfyUI desktop app) — is it running?",
  "workflow.err.json": "The file is not valid JSON.",
  "workflow.err.notAnObject":
    "Not a workflow: expected an object of nodes. Export from ComfyUI with 'Save (API format)', not the normal save.",
  "workflow.err.noSampler": "No sampler found — no node takes positive, negative and latent_image together.",
  "workflow.err.ambiguous":
    "Several samplers found ({0}). Refiner chains aren't supported — the plugin can't tell which one to fill in.",
  "workflow.err.dangling": "The sampler's {0} input points to node {1}, which doesn't exist.",
  "workflow.err.noSteps":
    "This sampler has no steps field (SamplerCustom and similar take their step count from a sigmas node). Not supported yet.",
  "workflow.err.noSize":
    "The latent node carries no width/height, so the plugin can't set the size. Use EmptyLatentImage as the sampler's latent_image.",

  "empty.noImage": "Enter a prompt and press Generate.",
  "empty.noServer":
    "Connect a local image server such as Draw Things (enable its API server) or AUTOMATIC1111 (--api), then enter the endpoint in the settings.",
  "empty.noServerCta": "Open settings",
  "empty.unreachable": "The server did not respond. Is it running and the API enabled?",
  "empty.unreachableCta": "Retry",
  "empty.noWorkflow": "Pick a ComfyUI workflow to get started",
  "empty.noWorkflowCta": "Open settings",
  "empty.noComfyServer":
    "Start ComfyUI on this machine and enter its address in the settings — by default that is http://127.0.0.1:8188 (http://127.0.0.1:8000 in the ComfyUI desktop app).",
  "empty.comfyUnreachable":
    "Nothing that looks like ComfyUI answered at that address. ComfyUI listens on port 8188 by default (8000 in the desktop app) — and an endpoint left over from Draw Things or AUTOMATIC1111 will answer, but not to ComfyUI's API.",

  "generate.modelBuiltin": "Model: {0} (built-in)",
  "status.gpuChecking": "Checking GPU…",
  "status.starting": "Starting…",
  "status.gpuMissing.noWebgpu": "WebGPU is not available in this Obsidian — use a server (settings)",
  "status.gpuMissing.noF16": "The GPU has no shader-f16 — use a server (settings)",
  "status.notDownloaded": "Model not downloaded",
  "status.downloading": "Downloading {0} · {1} / {2} (file {3} of {4})",
  "status.verifying": "Verifying {0}…",
  "status.loadingModel": "Loading model into GPU… ({0})",
  "status.outOfMemory": "Not enough memory for this model — free up GPU memory or switch to a server backend.",
  "status.sessionTimeout": "Loading the model into the GPU is taking unusually long or got stuck silently. Click Generate to try again.",
  "empty.gpuMissing": "The built-in engine needs WebGPU with shader-f16. This Obsidian does not offer it — switch to a local image server in the settings.",
  "empty.notDownloaded": "The built-in model ({0}, {1}) is not downloaded yet. Nothing is downloaded before you click.",
  "empty.downloadCta": "Download model ({0})",
  "empty.notDownloadedPartial": "The built-in model ({0}) is partly downloaded — {1} of {2} are still missing. Nothing is downloaded before you click.",
  "empty.downloadCtaPartial": "Download the missing {0}",
  "empty.downloading": "Downloading the model. You can cancel; completed files and portions are kept.",
  "empty.cancelCta": "Cancel download",
  "notice.modelReady": "Model downloaded and verified — ready to generate.",
  "notice.busy": "Not possible while an image is being generated — wait for it to finish.",
  "engine.integrityError": "Checksum mismatch for {0} — the file was discarded. Try the download again.",

  "notice.saveFailed": "Save failed: {0}",
  "notice.saved": "Saved: {0}",
  "notice.noteFailed": "Image saved to {0}, but the note failed: {1}",

  "settings.help.name": "Help",
  "settings.help.desc": "Getting started, how-tos and troubleshooting",
  "settings.help.openDocs": "Open documentation",
  "settings.help.reportIssue": "Report an issue",
  "settings.output.heading": "Output",
  "settings.output.folder": "Image folder",
  "settings.output.folderDesc":
    "Where generated images are saved. Leave empty to use Obsidian's attachment folder.",

  "settings.noteFolder": "Note folder",
  "settings.noteFolderDesc": "Where result notes are saved. Leave empty to put them next to the image.",

  "settings.createMode": "Create button",
  "settings.createModeDesc":
    "Whether Create saves just the image, or also a note with the settings in its frontmatter and the image embedded.",
  "settings.createModeImage": "Image only",
  "settings.createModeNote": "Image + note",

  "settings.defaultSteps": "Default steps",
  "settings.defaultStepsDesc": "Starting value of the steps slider (1–50). More steps trade speed for detail.",

  "settings.engine.heading": "Engine",
  "settings.engine.name": "Engine",
  "settings.engine.desc": "Built-in: an image model runs on your GPU inside Obsidian (downloaded once on request — see the model row below for which one and its size). Server: a local Draw Things / A1111-compatible server with its own models and full controls. ComfyUI: your own workflow file on a running ComfyUI server (default port 8188) — the plugin fills in prompt, seed, steps and size and leaves the rest of the graph alone. Image Playground: the only backend that works on mobile — Built-in, Server and ComfyUI need a desktop Obsidian install with a GPU or a reachable local server.",
  "settings.engine.builtin": "Built-in (on your GPU)",
  "settings.engine.playground": "Image Playground (Apple shortcut, mobile)",
  "settings.engine.server": "Server (Draw Things / A1111)",
  "settings.engine.comfy": "ComfyUI (your workflow)",
  "settings.model.name": "{0} model ({1})",
  "settings.model.desc": "{0} · {1}. Downloaded only when you click, verified by checksum, stored outside your vault.",
  "settings.model.download": "Download",
  "settings.model.cancel": "Cancel",
  "settings.model.remove": "Remove",
  "settings.model.removeConfirm": "Remove the downloaded model ({0}) from this device? You can download it again any time.",
  "settings.model.removed": "Model removed.",
  "settings.model.ready": "Ready",
  "settings.builtinModel.name": "Model",
  "settings.builtinModel.desc": "Which built-in model this engine uses. Switching downloads nothing by itself — the download/remove row below follows the choice.",
  "settings.showModelPicker.name": "Show model picker in the panel",
  "settings.showModelPicker.desc": "Let the model also be switched from the Generate panel. Only shown once more than one built-in model is downloaded.",
  "confirm.bigModel.title": "Download {0}?",
  "confirm.bigModel.body": "Download {0}. Loading it onto the GPU for the first image briefly needs roughly double that — about 13 GB. On devices with 16 GB of memory that can get tight. Cancel downloads nothing.",
  "confirm.bigModel.bodyPartial": "{0} of {1} are missing and will be downloaded — the rest is already in the cache. Loading the full model onto the GPU for the first image still briefly needs roughly double its size — about 13 GB. On devices with 16 GB of memory that can get tight. Cancel downloads nothing.",
  "confirm.bigModel.cta": "Download",
  "settings.advanced.heading": "Advanced",
  "settings.assetBaseUrl.name": "Download source",
  "settings.assetBaseUrl.desc": "Base URL of the model files. Default is the plugin's model repository; change it for a mirror or a local server. Downloaded files stay valid regardless of the URL.",
  "settings.server.name": "Server endpoint",
  "settings.server.desc":
    "A1111-compatible local image server — Draw Things (enable API server), AUTOMATIC1111 (--api), Forge, SD.Next.",
  // Dasselbe Feld, andere Software: der Endpunkt ist zwischen Server- und comfy-Modus
  // geteilt, und ein uebernommener A1111-Endpunkt ist hier der wahrscheinlichste Fehler.
  "settings.comfyServer.name": "ComfyUI endpoint",
  "settings.comfyServer.desc":
    "Address of your running ComfyUI server — by default http://127.0.0.1:8188 (8000 in the ComfyUI desktop app). This is the same field as the server endpoint above: an address left over from Draw Things or AUTOMATIC1111 stays here when you switch, and it will not serve ComfyUI's API.",
  "settings.server.test": "Test connection",
  // Kit-Baustein buildEndpointSourceSection() (Endpoint Manager, seit 0.15.0): zwei
  // UNABHAENGIGE Rollen am selben Manager statt zwei Settings-Felder (Entscheidung Johannes
  // 2026-09-17) — je eine Zeile in Server- und Comfy-Modus, mit rollen-eigenem Hinweistext.
  "settings.endpointSource.managed": "Endpoints come from the LLM Endpoint Manager",
  "settings.endpointSource.managedDescServer":
    "This plugin uses an endpoint configured in the LLM Endpoint Manager plugin (A1111-compatible: Draw Things, AUTOMATIC1111, Forge, SD.Next). Your previously entered endpoint stays saved and is used again if you disable the manager.",
  "settings.endpointSource.managedDescComfy":
    "This plugin uses an endpoint configured in the LLM Endpoint Manager plugin (a running ComfyUI server). Your previously entered endpoint stays saved and is used again if you disable the manager.",
  "settings.endpointSource.openManager": "Open manager settings",
  "settings.endpointSource.pickEndpoint": "Endpoint",
  "settings.endpointSource.automatic": "automatic (first reachable)",
  "settings.endpointSource.model": "Model",
  "settings.endpointSource.importLocal": "Copy your previously entered endpoint into the manager",
  "settings.endpointSource.imported": "Copied: {0} new, {1} merged.",
  "settings.endpointSource.importFailed": "Copying failed.",
  "settings.endpointSource.savedSuffix": "(saved)",
  "settings.endpointSource.refreshModels": "Refresh models",
  "settings.endpointSource.saveFailed": "Could not save the choice.",
  "settings.endpointSource.modelHint.": "",
  "settings.endpointSource.modelHint.unreachable": "Endpoint unreachable — type the model name.",
  "settings.endpointSource.modelHint.no-list": "The endpoint returns no model list — type the name.",
  "settings.workflow.name": "Workflow file",
  "settings.workflow.desc":
    "A workflow exported from ComfyUI in API format. The plugin fills in prompt, negative prompt, seed, steps and size — sampler, scheduler, CFG, LoRAs and upscalers stay as you built them.",
  "settings.workflow.pick": "Choose…",
  "workflow.pickerTitle": "Pick a ComfyUI workflow (.json)",

  // Image Playground (Apple shortcut, Spec Baustein 5): honest about its limits right here,
  // not only in the docs — stylized output only, no negative prompts, no size control, no
  // img2img. Requires iOS/macOS 26+ and Apple Intelligence.
  "settings.playground.name": "Shortcut name",
  "settings.playground.desc":
    "Exact name of the Apple Shortcut that runs Image Playground (see the setup guide, linked above). Requires iOS/macOS 26+ and Apple Intelligence. Image Playground only produces stylized output (animation, illustration, sketch) — never photorealistic images — and takes no negative prompt, no size, no CFG and no starting image. The generated file goes into your attachment folder, same as the other backends.",
  "status.noShortcut": "No Image Playground shortcut configured",
  "empty.noShortcut": "Set the exact Shortcut name in the plugin settings to use Image Playground.",
  "empty.noShortcutCta": "Open settings",
  "generate.modelPlayground": "Model: Image Playground (on-device, Apple Shortcut)",

  "notice.serverOk": "Server OK — model: {0}",
  "notice.serverFail": "Server not reachable. Check that it is running and the API is enabled.",

  "settings.legacy.delete": "Delete old SD-Turbo weights (~2.5 GB)",
  "settings.legacy.done": "Old weights deleted.",
  "notice.legacyHint": "Old in-process model weights found (~2.5 GB). You can delete them in the settings.",

  "settings.presets.heading": "Styles",
  "settings.presets.desc": "Style chips shown under the prompt. Clicking a chip appends its text to the prompt.",
  "settings.presets.label": "Label",
  "settings.presets.suffix": "Prompt text",
  "settings.presets.add": "Add style",
  "settings.presets.delete": "Delete style",

  "history.empty": "No history yet. Generate an image to start.",
  "history.viewRecent": "Recent",
  "history.viewGrouped": "By prompt",
  "history.clear": "Clear all",
  "history.clearConfirm": "Clear the entire generation history? This cannot be undone.",
  "history.delete": "Delete entry",
  "history.recipe": "seed {0} · {1} steps · {2}",
  "history.variations.one": "1 variation",
  "history.variations.other": "{0} variations",

  "modal.cancel": "Cancel",
};

export const DE: Record<string, string> = {
  "status.preparingDownload": "Download wird vorbereitet…",
  "status.downloadPaused": "Download pausiert · {0} gespeichert",
  "status.downloadRetry": "Neuer Versuch für {0} in {1}s ({2}/{3}) · {4} dieser Datei gespeichert",
  "empty.downloadPaused": "{0} deiner unvollständigen Downloads ist gespeichert. Setze den Download fort, wenn du bereit bist; erst nach der Prüfung wird das Modell verfügbar.",
  "settings.model.resume": "Download fortsetzen",
  "settings.model.discard": "Teil-Download verwerfen",
  "engine.downloadNetwork": "Download unterbrochen. Prüfe die Verbindung und setze ihn fort. Fertige Teile bleiben gespeichert.",
  "engine.downloadStorage": "Modelldateien konnten nicht gespeichert werden. Gib Speicherplatz frei und setze den Download fort.",
  "engine.downloadHttp": "Die Download-Quelle meldet HTTP {0}. Prüfe die Quelle oder versuche es später erneut.",
  "engine.downloadProtocol": "Die Download-Quelle lieferte eine ungültige Datei oder einen falschen Byte-Bereich. Prüfe die Quelle vor dem nächsten Versuch.",
  "cmd.open": "Bildgenerator öffnen",

  "view.title": "Lokaler Bildgenerator",
  "view.tabGenerate": "Generieren",
  "view.tabHistory": "Verlauf",

  "generate.promptPlaceholder": "Bild beschreiben…",
  "generate.button.generate": "Generieren",
  "generate.button.reroll": "Neu würfeln",
  "generate.button.create": "Erstellen",
  "generate.button.insert": "Einfügen",
  "generate.modelInfo": "Modell: {0}",
  "generate.modelInApp": "Modell: (in der Server-App gewählt)",
  "generate.negativePrompt": "Negativ-Prompt",
  "generate.negativePromptPlaceholder": "Was vermieden werden soll…",
  "generate.size": "Größe",
  "generate.model": "Modell",
  "generate.steps": "Schritte",
  "generate.cfg": "Guidance (CFG)",
  "generate.seed": "Seed",
  "generate.randomSeed": "Seed zufällig würfeln",
  "generate.presetsLabel": "Stile",
  "generate.insertNeedsEditor": "Notiz öffnen, um das Bild einzufügen",
  "generate.initImage": "Vorlage",
  "generate.initImagePick": "Wählen…",
  "generate.initImageClear": "Entfernen",
  "generate.initImageNone": "Kein Vorlagenbild",
  "generate.initImageFromResult": "Speichern & als Vorlage",
  "generate.denoising": "Änderungsstärke",
  "picker.title": "Vorlagenbild wählen",

  "status.ready": "Bereit",
  "status.error": "Fehler: {0}",
  "status.noEndpoint": "Kein Bildserver konfiguriert",
  "status.serverChecking": "Server wird geprüft…",
  "status.serverUnreachable": "Server nicht erreichbar — ist die API aktiviert?",
  "status.contacting": "Server wird kontaktiert…",
  "status.generatingPct": "Generiert… {0}%",
  "status.generatingElapsed": "Generiert… ({0})",
  "status.externalRun": "Ein anderes Plugin erzeugt gerade ein Bild…",
  "status.externalRunPct": "Ein anderes Plugin erzeugt gerade ein Bild… {0}%",

  "status.noWorkflow": "Kein Workflow gewählt",
  "status.workflowMissing": "Workflow-Datei nicht gefunden: {0}",
  "status.noComfyEndpoint": "Kein ComfyUI-Server konfiguriert",
  "status.comfyUnreachable": "Kein ComfyUI unter dieser Adresse (Standard-Port 8188, in der ComfyUI-Desktop-App 8000) — läuft es?",
  "workflow.err.json": "Die Datei ist kein gültiges JSON.",
  "workflow.err.notAnObject":
    "Kein Workflow: erwartet wird ein Objekt aus Knoten. In ComfyUI mit „Save (API format)“ exportieren, nicht normal speichern.",
  "workflow.err.noSampler": "Kein Sampler gefunden — kein Knoten nimmt positive, negative und latent_image zusammen entgegen.",
  "workflow.err.ambiguous":
    "Mehrere Sampler gefunden ({0}). Refiner-Ketten werden nicht unterstützt — das Plugin kann nicht entscheiden, welchen es füllt.",
  "workflow.err.dangling": "Der {0}-Eingang des Samplers zeigt auf Knoten {1}, den es nicht gibt.",
  "workflow.err.noSteps":
    "Dieser Sampler hat kein Steps-Feld (SamplerCustom und ähnliche beziehen ihre Schrittzahl aus einem sigmas-Knoten). Noch nicht unterstützt.",
  "workflow.err.noSize":
    "Der Latent-Knoten trägt kein width/height, das Plugin kann die Größe nicht setzen. Nimm EmptyLatentImage als latent_image des Samplers.",

  "empty.noImage": "Prompt eingeben und auf Generieren klicken.",
  "empty.noWorkflow": "Wähle einen ComfyUI-Workflow, um loszulegen",
  "empty.noWorkflowCta": "Einstellungen öffnen",
  "empty.noComfyServer":
    "Starte ComfyUI auf diesem Rechner und trage seine Adresse in den Einstellungen ein — standardmäßig ist das http://127.0.0.1:8188 (in der ComfyUI-Desktop-App http://127.0.0.1:8000).",
  "empty.comfyUnreachable":
    "Unter dieser Adresse hat nichts geantwortet, das nach ComfyUI aussieht. ComfyUI hört standardmäßig auf Port 8188 (in der Desktop-App 8000) — und ein Endpunkt, der noch von Draw Things oder AUTOMATIC1111 stammt, antwortet zwar, aber nicht auf ComfyUIs API.",
  "empty.noServer":
    "Verbinde einen lokalen Bildserver wie Draw Things (API-Server aktivieren) oder AUTOMATIC1111 (--api) und trage den Endpunkt in den Einstellungen ein.",
  "empty.noServerCta": "Einstellungen öffnen",
  "empty.unreachable": "Der Server hat nicht geantwortet. Läuft er, und ist die API aktiviert?",
  "empty.unreachableCta": "Erneut versuchen",

  "generate.modelBuiltin": "Modell: {0} (eingebaut)",
  "status.gpuChecking": "Prüfe GPU…",
  "status.starting": "Starte…",
  "status.gpuMissing.noWebgpu": "WebGPU ist in diesem Obsidian nicht verfügbar — Server verwenden (Einstellungen)",
  "status.gpuMissing.noF16": "Die GPU hat kein shader-f16 — Server verwenden (Einstellungen)",
  "status.notDownloaded": "Modell nicht heruntergeladen",
  "status.downloading": "Lade {0} · {1} / {2} (Datei {3} von {4})",
  "status.verifying": "Prüfe {0}…",
  "status.loadingModel": "Lade Modell in die GPU… ({0})",
  "status.outOfMemory": "Nicht genug Speicher für dieses Modell — GPU-Speicher freigeben oder auf einen Server umsteigen.",
  "status.sessionTimeout": "Das Laden des Modells auf die GPU dauert ungewöhnlich lange oder ist lautlos hängen geblieben. Klicke auf Generieren, um es erneut zu versuchen.",
  "empty.gpuMissing": "Die eingebaute Engine braucht WebGPU mit shader-f16. Dieses Obsidian bietet das nicht — in den Einstellungen auf einen lokalen Bild-Server umstellen.",
  "empty.notDownloaded": "Das eingebaute Modell ({0}, {1}) ist noch nicht heruntergeladen. Ohne Klick wird nichts geladen.",
  "empty.downloadCta": "Modell herunterladen ({0})",
  "empty.notDownloadedPartial": "Das eingebaute Modell ({0}) ist teilweise geladen — es fehlen noch {1} von {2}. Ohne Klick wird nichts geladen.",
  "empty.downloadCtaPartial": "Fehlende {0} herunterladen",
  "empty.downloading": "Das Modell wird geladen. Abbrechen ist möglich; fertige Dateien und Teile bleiben.",
  "empty.cancelCta": "Download abbrechen",
  "notice.modelReady": "Modell heruntergeladen und geprüft — bereit zum Generieren.",
  "notice.busy": "Während ein Bild entsteht nicht möglich — bitte das Ende abwarten.",
  "engine.integrityError": "Prüfsumme von {0} stimmt nicht — die Datei wurde verworfen. Download erneut versuchen.",

  "notice.saveFailed": "Speichern fehlgeschlagen: {0}",
  "notice.saved": "Gespeichert: {0}",
  "notice.noteFailed": "Bild wurde unter {0} gespeichert, aber die Notiz ist fehlgeschlagen: {1}",

  "settings.help.name": "Hilfe",
  "settings.help.desc": "Erste Schritte, Anleitungen und Fehlersuche",
  "settings.help.openDocs": "Dokumentation öffnen",
  "settings.help.reportIssue": "Problem melden",
  "settings.output.heading": "Ausgabe",
  "settings.output.folder": "Bilderordner",
  "settings.output.folderDesc":
    "Wo generierte Bilder gespeichert werden. Leer lassen, um Obsidians Anhang-Ordner zu verwenden.",

  "settings.noteFolder": "Notizordner",
  "settings.noteFolderDesc": "Wo Ergebnis-Notizen gespeichert werden. Leer lassen, um sie neben dem Bild abzulegen.",

  "settings.createMode": "Erstellen-Knopf",
  "settings.createModeDesc":
    "Ob „Erstellen“ nur das Bild speichert oder zusätzlich eine Notiz mit den Einstellungen im Frontmatter und eingebettetem Bild.",
  "settings.createModeImage": "Nur Bild",
  "settings.createModeNote": "Bild + Notiz",

  "settings.defaultSteps": "Standard-Schritte",
  "settings.defaultStepsDesc": "Startwert des Schritte-Reglers (1–50). Mehr Schritte tauschen Geschwindigkeit gegen Detail.",

  "settings.engine.heading": "Engine",
  "settings.engine.name": "Engine",
  "settings.engine.desc": "Eingebaut: ein Bildmodell rechnet auf deiner GPU in Obsidian (einmal auf Wunsch geladen — welches und wie groß steht in der Modell-Zeile darunter). Server: ein lokaler Draw-Things-/A1111-kompatibler Server mit eigenen Modellen und vollen Reglern. ComfyUI: dein eigener Workflow auf einem laufenden ComfyUI-Server (Standard-Port 8188) — das Plugin setzt Prompt, Seed, Steps und Größe ein und lässt den Rest des Graphen in Ruhe. Image Playground: das einzige Backend, das mobil funktioniert — Eingebaut, Server und ComfyUI brauchen ein Desktop-Obsidian mit GPU bzw. einen erreichbaren lokalen Server.",
  "settings.engine.builtin": "Eingebaut (auf deiner GPU)",
  "settings.engine.server": "Server (Draw Things / A1111)",
  "settings.engine.comfy": "ComfyUI (dein Workflow)",
  "settings.engine.playground": "Image Playground (Apple-Kurzbefehl, mobil)",
  "settings.model.name": "{0}-Modell ({1})",
  "settings.model.desc": "{0} · {1}. Wird nur nach Klick geladen, per Prüfsumme geprüft, außerhalb des Vaults abgelegt.",
  "settings.model.download": "Herunterladen",
  "settings.model.cancel": "Abbrechen",
  "settings.model.remove": "Entfernen",
  "settings.model.removeConfirm": "Das heruntergeladene Modell ({0}) von diesem Gerät entfernen? Du kannst es jederzeit erneut laden.",
  "settings.model.removed": "Modell entfernt.",
  "settings.model.ready": "Bereit",
  "settings.builtinModel.name": "Modell",
  "settings.builtinModel.desc": "Welches eingebaute Modell diese Engine nutzt. Der Wechsel selbst lädt nichts — die Download-/Entfernen-Zeile darunter folgt der Wahl.",
  "settings.showModelPicker.name": "Modellwahl im Panel anzeigen",
  "settings.showModelPicker.desc": "Erlaubt den Modellwechsel auch aus dem Generate-Panel. Erscheint erst, wenn mehr als ein eingebautes Modell heruntergeladen ist.",
  "confirm.bigModel.title": "{0} herunterladen?",
  "confirm.bigModel.body": "{0} herunterladen. Beim ersten Bild braucht das Laden ins GPU-Gedächtnis kurzzeitig etwa das Doppelte — rund 13 GB. Auf Geräten mit 16 GB Arbeitsspeicher kann das knapp werden. Abbrechen lädt nichts.",
  "confirm.bigModel.bodyPartial": "Es fehlen {0} von {1} — der Rest liegt schon im Zwischenspeicher. Beim ersten Bild wird trotzdem das ganze Modell ins GPU-Gedächtnis geladen, kurzzeitig etwa das Doppelte seiner Größe — rund 13 GB. Auf Geräten mit 16 GB Arbeitsspeicher kann das knapp werden. Abbrechen lädt nichts.",
  "confirm.bigModel.cta": "Herunterladen",
  "settings.advanced.heading": "Erweitert",
  "settings.assetBaseUrl.name": "Download-Quelle",
  "settings.assetBaseUrl.desc": "Basis-URL der Modell-Dateien. Standard ist das Modell-Repository des Plugins; für einen Spiegel oder lokalen Server änderbar. Geladene Dateien bleiben unabhängig von der URL gültig.",
  "settings.server.name": "Server-Endpoint",
  "settings.server.desc":
    "A1111-kompatibler lokaler Bild-Server — Draw Things (API-Server aktivieren), AUTOMATIC1111 (--api), Forge, SD.Next.",
  "settings.comfyServer.name": "ComfyUI-Endpoint",
  "settings.comfyServer.desc":
    "Adresse deines laufenden ComfyUI-Servers — standardmäßig http://127.0.0.1:8188 (in der ComfyUI-Desktop-App 8000). Es ist dasselbe Feld wie der Server-Endpoint darüber: eine Adresse, die noch von Draw Things oder AUTOMATIC1111 stammt, bleibt beim Umschalten stehen und bedient ComfyUIs API nicht.",
  "settings.server.test": "Verbindung testen",
  "settings.endpointSource.managed": "Endpunkte kommen vom LLM Endpoint Manager",
  "settings.endpointSource.managedDescServer":
    "Dieses Plugin nutzt einen im Plugin LLM Endpoint Manager konfigurierten Endpunkt (A1111-kompatibel: Draw Things, AUTOMATIC1111, Forge, SD.Next). Dein bisher eingetragener Endpunkt bleibt gespeichert und gilt wieder, falls du den Manager deaktivierst.",
  "settings.endpointSource.managedDescComfy":
    "Dieses Plugin nutzt einen im Plugin LLM Endpoint Manager konfigurierten Endpunkt (ein laufender ComfyUI-Server). Dein bisher eingetragener Endpunkt bleibt gespeichert und gilt wieder, falls du den Manager deaktivierst.",
  "settings.endpointSource.openManager": "Manager-Einstellungen öffnen",
  "settings.endpointSource.pickEndpoint": "Endpunkt",
  "settings.endpointSource.automatic": "automatisch (erster erreichbarer)",
  "settings.endpointSource.model": "Modell",
  "settings.endpointSource.importLocal": "Deinen bisher eingetragenen Endpunkt in den Manager übernehmen",
  "settings.endpointSource.imported": "Übernommen: {0} neu, {1} zusammengeführt.",
  "settings.endpointSource.importFailed": "Übernahme fehlgeschlagen.",
  "settings.endpointSource.savedSuffix": "(gespeichert)",
  "settings.endpointSource.refreshModels": "Modelle neu laden",
  "settings.endpointSource.saveFailed": "Die Wahl konnte nicht gespeichert werden.",
  "settings.endpointSource.modelHint.": "",
  "settings.endpointSource.modelHint.unreachable": "Endpunkt nicht erreichbar — Modellnamen eintippen.",
  "settings.endpointSource.modelHint.no-list": "Der Endpunkt gibt keine Modell-Liste heraus — Namen eintippen.",
  "settings.workflow.name": "Workflow-Datei",
  "settings.workflow.desc":
    "Ein aus ComfyUI im API-Format exportierter Workflow. Das Plugin setzt Prompt, Negativ-Prompt, Seed, Steps und Größe ein — Sampler, Scheduler, CFG, LoRAs und Upscaler bleiben, wie du sie gebaut hast.",
  "settings.workflow.pick": "Wählen…",
  "workflow.pickerTitle": "ComfyUI-Workflow wählen (.json)",

  "settings.playground.name": "Kurzbefehl-Name",
  "settings.playground.desc":
    "Exakter Name des Apple-Kurzbefehls, der Image Playground ausführt (siehe die verlinkte Einrichtungsanleitung oben). Braucht iOS/macOS 26+ und Apple Intelligence. Image Playground liefert nur stilisierte Ausgaben (Animation, Illustration, Sketch) — nie fotorealistische Bilder — und kennt weder Negativ-Prompt noch Größe, CFG oder ein Ausgangsbild. Die erzeugte Datei landet in deinem Anhang-Ordner, wie bei den anderen Backends.",
  "status.noShortcut": "Kein Image-Playground-Kurzbefehl konfiguriert",
  "empty.noShortcut": "Trage den exakten Kurzbefehl-Namen in den Plugin-Einstellungen ein, um Image Playground zu nutzen.",
  "empty.noShortcutCta": "Einstellungen öffnen",
  "generate.modelPlayground": "Modell: Image Playground (on-device, Apple-Kurzbefehl)",

  "notice.serverOk": "Server OK — Modell: {0}",
  "notice.serverFail": "Server nicht erreichbar. Prüfe, ob er läuft und die API aktiviert ist.",

  "settings.legacy.delete": "Alte SD-Turbo-Gewichte löschen (~2,5 GB)",
  "settings.legacy.done": "Alte Gewichte gelöscht.",
  "notice.legacyHint": "Alte In-Process-Modellgewichte gefunden (~2,5 GB). Du kannst sie in den Einstellungen löschen.",

  "settings.presets.heading": "Stile",
  "settings.presets.desc": "Stil-Chips unter dem Prompt. Ein Klick auf einen Chip hängt dessen Text an den Prompt an.",
  "settings.presets.label": "Beschriftung",
  "settings.presets.suffix": "Prompt-Text",
  "settings.presets.add": "Stil hinzufügen",
  "settings.presets.delete": "Stil löschen",

  "history.empty": "Noch kein Verlauf. Erstelle ein Bild, um zu starten.",
  "history.viewRecent": "Zuletzt",
  "history.viewGrouped": "Nach Prompt",
  "history.clear": "Alles löschen",
  "history.clearConfirm": "Den gesamten Generierungsverlauf löschen? Das kann nicht rückgängig gemacht werden.",
  "history.delete": "Eintrag löschen",
  "history.recipe": "Seed {0} · {1} Schritte · {2}",
  "history.variations.one": "1 Variante",
  "history.variations.other": "{0} Varianten",

  "modal.cancel": "Abbrechen",
};

/** Registriert EN/DE bei der vendorten i18n-Engine. Einmalig vor dem ersten t()-Aufruf
 *  (main.ts ruft dies im onload auf, vor addCommand/addSettingTab/addRibbonIcon/registerView). */
export function registerI18n(): void {
  defineStrings({ en: EN, de: DE });
}
