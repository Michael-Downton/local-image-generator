# Local Image Generator

Bilder in Obsidian erzeugen — auf dem eigenen Rechner, ohne Cloud und ohne Konto. Vier
Wege, wählbar in den Einstellungen:

- **Eingebaut (Standard):** ein Modell rechnet **auf deiner GPU in Obsidian** per
  WebGPU — wählbar in den Einstellungen. **SD-Turbo** (≈ 2,6 GB, 512×512) ist die
  Vorgabe; **SDXL-Turbo** (≈ 7,1 GB, bis 1024×1024, schärfere Bilder) ist ein
  optionales zweites Modell, auf das du selbst umstellst. Nichts zu installieren:
  **Modell herunterladen** klicken (per Prüfsumme geprüft, außerhalb des Vaults
  abgelegt), dann Prompt eingeben und Generieren.
- **Server:** ein lokaler Bild-Server, den du selbst betreibst —
  [Draw Things](https://drawthings.ai/),
  [AUTOMATIC1111](https://github.com/AUTOMATIC1111/stable-diffusion-webui),
  [Forge](https://github.com/lllyasviel/stable-diffusion-webui-forge) oder
  [SD.Next](https://github.com/vladmandic/sdnext) über deren gemeinsame, A1111-kompatible
  HTTP-API — mit den Modellen, die er geladen hat, und allen Reglern (Negativ-Prompt,
  Guidance, Größen).
- **ComfyUI:** zeigt auf deinen eigenen laufenden ComfyUI-Server und übernimmt einen
  Workflow, den du im API-Format exportiert hast — das Plugin patcht vor jedem Lauf
  Prompt, Seed, Schrittzahl und Größe in genau diesen Workflow hinein und lässt alles
  andere (Sampler, Scheduler, LoRAs, Upscaler) unangetastet, wie du es gebaut hast. Kein
  img2img, kein Fortschrittsbalken (ComfyUIs eigener Server weist eine WebSocket-Verbindung
  aus Obsidian heraus ab, deshalb zählt die Statuszeile stattdessen Sekunden), kein
  CFG-Regler — die vollständige Liste dessen, was dieser Modus nicht kann, steht im
  Changelog.
- **Image Playground (mobil):** der einzige Modus, der auf dem Handy funktioniert —
  alle anderen brauchen ein Desktop-Obsidian mit GPU bzw. einen erreichbaren
  lokalen Server. Läuft vollständig on-device über Apples Image Playground per
  einem einmalig installierten Kurzbefehl (siehe
  [Image Playground einrichten](#image-playground-mobil-einrichten) unten); die
  erzeugte Datei landet wie bei jedem anderen Backend in deinem Anhang-Ordner.
  Nur stilisierte Ausgaben — Animation, Illustration, Sketch — nie
  fotorealistische Bilder, und weder Negativ-Prompt noch Größenwahl, CFG oder
  ein Ausgangsbild. Braucht iOS/macOS 26+ und Apple Intelligence.

In jedem Fall verlassen Prompts und Bilder deinen Rechner nie.

[![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-blue.svg)](https://github.com/johannes-kaindl/local-image-generator/blob/main/LICENSE)
[![Docs: CC BY-SA 4.0](https://img.shields.io/badge/docs-CC%20BY--SA%204.0-lightgrey.svg)](https://github.com/johannes-kaindl/local-image-generator/blob/main/LICENSE-DOCS)
[![Release](https://img.shields.io/github/v/release/johannes-kaindl/local-image-generator?label=release)](https://github.com/johannes-kaindl/local-image-generator/releases)
[![Obsidian](https://img.shields.io/badge/obsidian-1.8.7%2B-purple)](https://obsidian.md)

> **Hinweis:** Diese Übersetzung folgt der englischen [`README.md`](README.md).
> Bei Abweichungen gilt die englische Fassung.

<p align="center">
  <img src="https://raw.githubusercontent.com/johannes-kaindl/local-image-generator/main/docs/images/hero.png" alt="Obsidian mit einem Bild der eingebauten Engine: die Notiz in der Mitte zeigt das fertige Bild, das Generator-Panel rechts dasselbe Ergebnis samt Prompt, Schrittzahl und Seed und nennt SD-Turbo als verwendetes Modell." width="600">
</p>

## Features

<p align="center">
  <img src="https://raw.githubusercontent.com/johannes-kaindl/local-image-generator/main/docs/images/generate-panel.png" alt="Das Generator-Panel in Obsidians rechter Seitenleiste mit einsatzbereiter eingebauter Engine: Prompt-Feld, Stil-Chips sowie Regler für Schritte und Seed. Negativ-Prompt, Guidance und Größe fehlen, weil SD-Turbo sie nicht unterstützt." width="456">
</p>

- Den Generator über das Ribbon-Icon oder den Befehl **Generator öffnen** aufrufen.
- Einen Prompt eingeben, optional einen **Negativ-Prompt** (was vermieden werden soll),
  eine **Größe** aus 10 kuratierten Seitenverhältnissen wählen (quadratisch, hoch, quer, bis 2048)
  und **Schritte** (1–50), **CFG** (Führungsstärke, 1–15) sowie den **Seed** nach
  Geschmack einstellen. Ein Klick auf einen Stil-Chip (Sumi-e, Watercolor, Photo, Oil —
  in den Einstellungen änder- und erweiterbar) hängt dessen Anmutung an den Prompt; ein
  zweiter Klick nimmt sie wieder weg.
- **Erzeugen** nutzt den Seed aus dem Feld (würfelt nie neu) und wird ausgegraut, sobald
  Prompt, Negativ-Prompt, Seed, Schritte, Größe und CFG exakt deinem letzten Ergebnis
  entsprechen — ein erneuter Lauf ohne Änderung brächte dasselbe Bild. **Neu würfeln**
  zieht einen frischen Seed und erzeugt trotzdem eine neue Variante; das Würfel-Symbol
  würfelt den Seed, ohne zu erzeugen.
- **Von einem vorhandenen Bild ausgehen** (img2img, beide Engines): eine Vorlage aus
  dem Vault wählen — oder am gerade erzeugten Bild auf **Speichern & als Vorlage**
  klicken — und einstellen, wie weit sich das Modell davon entfernen darf. Der
  Stärke-Regler ist in beiden Modi ein stufenloser Bereich von 0 bis 1 und erscheint
  erst, wenn wirklich eine Vorlage gesetzt ist. Der eingebaute Modus schneidet die
  Vorlage per Center-Crop auf die quadratische Eingabegröße des Modells zu (ein
  16:9-Bild wird beschnitten, nicht verzerrt); der Server-Modus reicht die Datei
  unverändert weiter und der Server skaliert selbst. Mehr Schritte geben auch dem
  Denoise-Regler mehr Spielraum. Achtung: der eingestellte Wert *bedeutet* bei anderer
  Schrittzahl etwas anderes — ein bei 4 Schritten gespeichertes Rezept sieht bei 8
  Schritten anders aus.
  Ein ehrlicher Vorbehalt für die eingebaute **SD-Turbo** bei wenigen Schritten: den Regler
  höher zu stellen entfernt das Ergebnis nicht immer weiter von der Vorlage. Bei 4 Schritten
  gemessen lag 0,625 *weiter* vom Original weg als 0,75. Das ist eine Eigenschaft des
  Modells, kein Fehler des Reglers — SD-Turbo ist auf genau vier Rauschstufen destilliert,
  und 0,625 ist von den dreien der einzige Wert, der zwischen zweien davon landet, wo das
  Modell leicht außerhalb seines Erfahrungsbereichs rechnet. Mit steigender Schrittzahl wird
  der Effekt kleiner, und SDXL-Turbo zeigt ihn nicht. Sieht ein Wert falsch aus, lohnt eher
  der Blick auf seine Nachbarn als noch weiter in dieselbe Richtung.
- Der Reiter **Verlauf** zeigt frühere Erzeugungen als vollständige Rezepte
  (Prompt · Negativ-Prompt · Seed · Schritte · Größe · CFG · Zeit) — nach Prompt
  gruppierbar, per Klick zurück in den Generator ladbar, einzeln löschbar oder komplett
  leerbar.
- **Anlegen** speichert das Bild als neuen Anhang. Standardmäßig ist das alles (es
  öffnet das Bild außerdem) — stellt man die Auswahl **Anlegen-Schaltfläche** in den
  Einstellungen auf **Bild + Notiz**, entsteht zusätzlich eine Notiz mit Prompt, Seed,
  Schritten, Größe und Datum im Frontmatter und eingebettetem Bild, und diese Notiz wird
  geöffnet. **Einfügen** speichert das Bild immer nur und bettet es an der
  Cursorposition der aktuellen Notiz ein.
- **Eingebaute Engine:** beide Katalog-Modelle sind destilliert — 1–8 Schritte, keine
  Guidance — deshalb zeigt das Panel in diesem Modus nur, was ein Modell auch beachtet:
  Prompt, Schritte (1–8), Seed und die Stil-Chips, dazu eine Größenwahl, sobald es mehr
  als eine Größe gibt (SD-Turbo ist fest auf 512×512; SDXL-Turbo bietet zusätzlich
  1024×1024). Negativ-Prompt und CFG bleiben so oder so server-only — kein eingebautes
  Modell kennt Guidance.
- **Server:** Welches Modell tatsächlich läuft, entscheidest du in deiner Server-App (Draw
  Things, AUTOMATIC1111, …), nicht in diesem Plugin — es schickt generische
  Erzeugungsparameter und zeigt den Namen des aktiven Modells als Statushinweis.

Die Oberfläche gibt es auf Englisch und Deutsch und folgt automatisch der
Spracheinstellung von Obsidian — eine eigene Sprachoption gibt es nicht.

<p align="center">
  <img src="https://raw.githubusercontent.com/johannes-kaindl/local-image-generator/main/docs/images/style-chips.png" alt="Die Stil-Chips unter dem Prompt-Feld: Sumi-e, Watercolor, Photo und Oil." width="380">
</p>

## Für Plugin-Entwickler

Dieses Plugin macht Bilderzeugung für andere Obsidian-Plugins nutzbar. Defensiv abfragen —
es kann fehlen oder deaktiviert sein:

```ts
const api = (app as any).plugins?.plugins?.["local-image-generator"]?.api;
if (api?.apiVersion === 1) {
  const s = api.status();               // synchron, kein Netzwerk
  if (s.ready) {
    const r = await api.generate({ prompt: "a quiet lake at dawn" });
    if (r.ok) {
      // r.image.base64 — PNG, ohne data:-Präfix
      // r.image.params — was TATSÄCHLICH berechnet wurde, nicht was angefragt war
      await api.save(r.image);          // optional: schreibt in den Ausgabeordner des Nutzers
    }
  }
}
```

`status().capabilities` sagt dir, was das aktive Backend wirklich kann. Die eingebaute Engine
ist guidance-frei und fest auf 512×512 — ein CFG- oder Größenregler in deiner Oberfläche wäre
in diesem Modus eine Attrappe. `capabilities.initImage` ist bei der eingebauten Engine und
beim Server `true` und im ComfyUI-Modus `false` — frag das Feld, nicht den Modus.

`r.image.params.cfg` kann `null` sein: das heißt, das Plugin hat den Wert nicht bestimmt —
im ComfyUI-Modus trägt der Workflow des Nutzers sein eigenes CFG. Wer die Params in eine
eigene Notiz schreibt, lässt das Feld dann weg, statt eine Zahl einzusetzen.

Für einen Lauf mit Vorlage: das Bild als Base64 (ohne `data:`-Präfix) mitgeben, dazu
optional `denoising` zwischen 0 und 1 (Vorgabe `0.75` — höher heißt weiter weg vom Original):

```ts
if (api.status().capabilities.initImage) {
  const r = await api.generate({ prompt: "derselbe See, in der Dämmerung", initImage: pngBase64, denoising: 0.4 });
  // r.image.params.denoising sagt, was tatsächlich angewandt wurde — null heißt, es wurde
  // ignoriert (es wurde keine Vorlage geschickt).
}
```

Die eingebaute Engine kann nur einen Teil ihres festen Schritte-Zeitplans neu durchrechnen,
interpoliert den Einstiegspunkt aber statt darauf zu rastern — `denoising` ist deshalb auch
dort kontinuierlich, genau wie beim Server-Backend. In beiden Fällen ist
`r.image.params.denoising` der Wert, der tatsächlich gilt — als Quelle der Wahrheit
behandeln, nicht den eingegebenen Wert. Mehr Schritte geben ihm auch mehr Spielraum: derselbe
`denoising`-Wert wirkt bei 4 Schritten anders als bei 8.

Die API startet nie selbst einen Download. Fehlt das Modell, bekommst du
`{ ok: false, reason: "model-not-downloaded" }` — den Knopf muss der Nutzer selbst klicken.

**`status()` kann veraltet sein.** Es ist synchron und macht keinen Netzaufruf — im
Server-Modus meldet es die *zuletzt bekannte* Erreichbarkeit, geprüft beim Laden, nach einem
fehlgeschlagenen Lauf, bei einem Moduswechsel oder wenn der Nutzer **Verbindung testen**
klickt. Kommt ein zuvor nicht erreichbarer Server wieder hoch, bleibt `status().ready` `false`
(und `generate()` lehnt weiter ab), bis der Nutzer das Panel öffnet und neu verbindet — einen
erzwungenen Recheck bietet die API derzeit nicht.

Die `reason` bei einem Fehlschlag von `generate()`:

| `reason` | wann |
| --- | --- |
| `busy` | es läuft bereits eine Erzeugung (deine, die eines anderen Plugins oder die des Panels) |
| `not-configured` | Server-Modus, kein Endpunkt in den Einstellungen gesetzt |
| `unreachable` | Server-Modus, Endpunkt gesetzt, antwortet aber nicht — siehe den Hinweis zur Veraltung oben |
| `model-not-downloaded` | eingebauter Modus, das Modell ist nicht heruntergeladen — dieses Plugin lädt nie von selbst |
| `no-gpu` | eingebauter Modus, die GPU erfüllt die Anforderungen der eingebauten Engine nicht |
| `failed` | das Backend hat beim Rechnen geworfen; `message` trägt seinen rohen, unübersetzten Text |

`save(image, opts?)` liefert `{ ok: true, imagePath, notePath }` — `notePath` ist `null`, wenn
keine Notiz angefragt war (`opts.createNote === false`, oder es gilt die eigene Einstellung des
Nutzers) oder wenn das Schreiben der Notiz selbst fehlschlug, nachdem das Bild schon
gespeichert war (der Bild-Save zählt trotzdem als Erfolg) — oder `{ ok: false, reason:
"write-failed", message }`, wenn das Schreiben des *Bildes* fehlschlug (Datenträgerfehler, oder
das Plugin wurde zwischen deinem `generate()`- und `save()`-Aufruf deaktiviert).

`onProgress?(pct, phase)` in der Anfrage lässt dich eine Ladephase statt eines Hängers zeigen:
`phase` ist `"loading-model"` oder `"generating"`; `pct` liegt zwischen `0` und `100`, oder ist
`null`, wenn das Backend keinen Fortschritt meldet (Draw Things hat keinen Fortschritts-Endpunkt)
— zeig in dem Fall einen unbestimmten Spinner.


### Einen Lauf abbrechen

Ein `AbortSignal` mitgeben, dann kommt der Lauf als `{ ok: false, reason: "aborted" }` zurück:

```js
const ctl = new AbortController();
const r = await api.generate({ prompt: "ein See in der Dämmerung", signal: ctl.signal });
```

**Was ein Abbruch bewirkt, hängt vom Modus ab.** Eingebaut: ein echter Stopp — die
Diffusionsschleife hört zwischen zwei Schritten auf, der Decoder läuft gar nicht erst.
Server und ComfyUI: es endet nur das *Warten*; der Server rechnet das Bild fertig, wir sehen
es nur nicht mehr an. Obsidians `requestUrl` kennt weder Abort noch Timeout, ein laufender
HTTP-Aufruf lässt sich also nicht zurücknehmen.

Für einen Stapellauf ist das trotzdem die nützliche Hälfte: das begonnene Bild läuft aus, das
nächste startet nicht mehr. Ohne Signal ändert sich nichts — `apiVersion` bleibt 1.

## Installation

Es gibt zwei Wege, das Plugin zu bekommen.

**Empfohlen — über den [AnySource Sideloader](https://github.com/johannes-kaindl/anysource-sideloader)**,
der Plugins von jeder git-Forge installiert und aktuell hält. Diesen Katalog einmal abonnieren:

```
https://git.jkaindl.de/jkaindl/obsidian-catalog/raw/branch/main/catalog.json
```

Local Image Generator taucht danach in der Plugin-Liste des Sideloaders auf und aktualisiert
sich wie jedes andere Plugin — kein Kopieren von Hand, und jeder Download wird gegen seine
Prüfsumme geprüft. Wer nur dieses eine Plugin will, trägt statt des Katalogs seine
Repository-URL als Quelle ein: `https://github.com/johannes-kaindl/local-image-generator`.

**Von Hand**, wer sich kein weiteres Plugin dafür installieren möchte:

1. `main.js`, `manifest.json` und `styles.css` aus dem
   [letzten Release](https://github.com/johannes-kaindl/local-image-generator/releases) laden.
2. Nach `<vault>/.obsidian/plugins/local-image-generator/` kopieren.
3. Obsidian → Einstellungen → Community-Plugins → **Local Image Generator** aktivieren.

Aktualisieren heißt dann: dasselbe noch einmal. Genau dafür gibt es den Sideloader-Weg.

Nach der Installation:

1. **Eingebaute Engine (Standard):** den Generator öffnen und **Modell herunterladen**
   klicken — oder in **Einstellungen → Local Image Generator → Engine**. Der Knopf nennt
   die Größe des gerade gewählten Modells (Vorgabe SD-Turbo, ≈ 2,6 GB); dort zuerst
   SDXL-Turbo wählen, wenn stattdessen das schärfere, größere Modell gewünscht ist. Sobald
   der Status *Bereit* meldet, generieren. Das ist die ganze Einrichtung.
2. **Lieber ein Server?** **Engine** auf *Server (Draw Things / A1111)* stellen, die URL
   des Servers unter **Server-Endpunkt** eintragen und **Verbindung testen** klicken.

<p align="center">
  <img src="https://raw.githubusercontent.com/johannes-kaindl/local-image-generator/main/docs/images/first-run.png" alt="Das Generator-Panel direkt nach der Installation: Prompt-Feld, Stil-Chips und Regler, darunter der Hinweis, dass das eingebaute Modell noch nicht geladen ist, mit dem Knopf „Download model (2.5 GB)“." width="380">
</p>

### Einen Server einrichten (optional)

Einen davon auswählen — das Plugin spricht mit allen auf dieselbe Weise:

**Draw Things** (macOS, der einfachste Einstieg — keine Kommandozeile):
1. Draw Things aus dem Mac App Store installieren.
2. In den Einstellungen von Draw Things den **API-Server** aktivieren. Die
   Standardadresse ist `http://127.0.0.1:7860`.
3. Diese Adresse als **Server-Endpunkt** des Plugins eintragen.

**AUTOMATIC1111** (`stable-diffusion-webui`):
Mit dem Schalter `--api` starten (z.B. `--api` zu `COMMANDLINE_ARGS` hinzufügen). Die
API liegt standardmäßig ebenfalls auf `http://127.0.0.1:7860`.

**Forge** (`stable-diffusion-webui-forge`):
Dieselbe A1111-kompatible API — mit `--api` starten, gleiche Standardadresse.

**SD.Next**:
Dieselbe A1111-kompatible API-Familie — falls die API nicht standardmäßig an ist, den
passenden Startschalter in der dortigen Doku nachsehen.

In allen vier Fällen gilt: sobald der Server läuft und seine API erreichbar ist, die URL
in den Plugin-Einstellungen eintragen und **Verbindung testen** klicken. Statuszeile und
Einstellungen zeigen danach den Namen des aktiven Modells.

<p align="center">
  <img src="https://raw.githubusercontent.com/johannes-kaindl/local-image-generator/main/docs/images/settings-server.png" alt="Der Engine-Abschnitt der Einstellungen im Server-Modus: die Engine-Auswahl mit „Server (Draw Things / A1111)“ und das Feld für den Server-Endpunkt samt Knopf „Test connection“." width="380">
</p>

### Image Playground (mobil) einrichten

Braucht **iOS/macOS 26+ und Apple Intelligence**. Das Plugin spricht Image Playground
über einen einmalig installierten Kurzbefehl an — auf iOS gibt es für eine
Drittanbieter-App keinen anderen Weg dorthin.

1. Den Kurzbefehl **`Generate Image (Obsidian)`** besorgen — entweder Johannes Kaindls
   geteilte Fassung importieren (Link und Einrichtungsanleitung:
   [uplink.jkaindl.de/apple-shortcuts](https://uplink.jkaindl.de/apple-shortcuts))
   oder selbst bauen: ein Kurzbefehl, der den übergebenen Text als Prompt nimmt, damit
   eine **Image Playground**-Aktion ausführt und das Ergebnis per **Datei sichern** in
   den Vault schreibt.
2. In den Plugin-Einstellungen **Engine** auf *Image Playground (Apple-Kurzbefehl,
   mobil)* umstellen.
3. Den exakten Kurzbefehl-Namen bei **Kurzbefehl-Name** eintragen — Vorgabe ist
   `Generate Image (Obsidian)`, passend zum geteilten Kurzbefehl oben; bei einem
   umbenannten eigenen Kurzbefehl muss das Feld genau übereinstimmen.
4. Wie gewohnt generieren. Der Lauf wechselt kurz in die Kurzbefehle-App und zurück —
   dieser Wechsel ist normal (aktiviertes „Bewegung reduzieren" in den
   Bedienungshilfen von iOS macht ihn spürbar kürzer).

Der zentrale Guide — die Import-Fragen des Kurzbefehls, die vollständige Fehlertabelle
(Guardrail-Ablehnungen, ein fehlender Kurzbefehl, Timeouts) und alle Voraussetzungen im
Detail — steht unter
[uplink.jkaindl.de/apple-shortcuts](https://uplink.jkaindl.de/apple-shortcuts).

## Verwendung

1. Eingebaute Engine: sicherstellen, dass das Modell geladen ist (das Panel bietet den
   Knopf an, wenn nicht). Server-Modus: sicherstellen, dass dein Bild-Server (Draw Things,
   AUTOMATIC1111, Forge oder SD.Next) läuft und seine API erreichbar ist — das Panel sagt
   dir, wenn nicht.
2. Den Generator öffnen (Ribbon-Icon oder Befehl **Generator öffnen**).
3. Einen Prompt eingeben, Schritte / Seed (und im Server-Modus Negativ-Prompt / Größe /
   CFG) einstellen und **Erzeugen** drücken. Das erste Bild nach einem Obsidian-Start
   dauert mit der eingebauten Engine ein paar Sekunden länger — das Modell wird in die
   GPU geladen; die Statuszeile zählt mit.
4. **Anlegen** speichert das Bild als neuen Anhang und öffnet es, **Einfügen** speichert
   es und bettet es an der Cursorposition ein. Wenn zusätzlich eine Notiz mit den Daten
   der Erzeugung im Frontmatter entstehen soll, vorher die Auswahl
   **Anlegen-Schaltfläche** in den Einstellungen auf **Bild + Notiz** stellen.
5. Frühere Erzeugungen findest du jederzeit im Reiter **Verlauf**.

<p align="center">
  <img src="https://raw.githubusercontent.com/johannes-kaindl/local-image-generator/main/docs/images/history.png" alt="Der History-Reiter mit zwei Läufen, jeder mit Prompt, Seed, Schrittzahl und Uhrzeit, nach Aktualität sortiert, mit den Umschaltern Recent und By prompt und einem Knopf Clear all." width="456">
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/johannes-kaindl/local-image-generator/main/docs/images/result-note.png" alt="Eine Ergebnis-Notiz: das Rezept im Frontmatter — Prompt, Seed, Schritte, CFG, Modell, Größe und Bilddatei — darunter das eingebettete Bild." width="496">
</p>

## Voraussetzungen

- **Mobil funktioniert nur Image Playground.** Eingebaut, Server und ComfyUI brauchen
  alle ein Desktop-Obsidian — eine GPU oder einen erreichbaren lokalen Server. Image
  Playground braucht **iOS/macOS 26+ und Apple Intelligence**; ohne passendes Gerät
  oder OS ist dieser Modus schlicht nicht nutzbar — dann einen der drei anderen auf
  dem Desktop wählen.
- **Eingebaute Engine:** eine GPU, die Obsidians WebGPU mit 16-Bit-Shadern
  (`shader-f16`) nutzen kann — Apple-Silicon-Macs erfüllen das, ebenso die meisten
  aktuellen dedizierten GPUs. Plattenplatz und Speicherspitze hängen vom gewählten
  Modell ab: **SD-Turbo** braucht ≈ 2,6 GB Platz und rund 4 GB freien Speicher, während
  ein Bild entsteht; **SDXL-Turbo** braucht ≈ 7,1 GB Platz und beim ersten Sitzungsaufbau
  kurzzeitig etwa das *Doppelte* davon im GPU-Speicher (die Gewichte liegen bis zum Ende
  des Ladens sowohl im JS-Heap als auch auf der GPU) — rund 13 GB Spitze. Auf einem
  16-GB-Rechner kann das knapp werden. Das Panel sagt dir, wenn die GPU gar nicht
  reicht; dann ist der Server-Modus der Ausweg.
- **Server-Modus:** ein beliebiger A1111-kompatibler lokaler Bild-Server, laufend und
  erreichbar — Draw Things, AUTOMATIC1111, Forge oder SD.Next. Die Server-App besitzt das
  Modell, seine Hardware-Anforderungen und seinen Speicherbedarf.

## Konfiguration

<p align="center">
  <img src="https://raw.githubusercontent.com/johannes-kaindl/local-image-generator/main/docs/images/settings.png" alt="Die Einstellungen des Plugins mit gewählter eingebauter Engine: die Engine-Auswahl, die SD-Turbo-Modellzeile mit dem Zustand Ready und einem Remove-Knopf, Bilder- und Notizordner, Modus des Create-Knopfes, Standard-Schrittzahl, die editierbare Liste der Stil-Chips und die Download-Quelle unter Advanced." width="515">
</p>

**Einstellungen → Local Image Generator**:

- **Engine** — *Eingebaut (auf deiner GPU)* oder *Server (Draw Things / A1111)*.
  - Eingebaut zeigt eine **Modell**-Auswahl (SD-Turbo / SDXL-Turbo) und darunter dessen
    **Zeile**: Größe, Lizenz, Status und **Herunterladen** / **Abbrechen** / **Entfernen**.
    Ein Wechsel auf ein anderes Modell als SD-Turbo fragt vor dem Download nach
    Bestätigung. Ohne Klick auf Herunterladen wird nichts geladen.
  - Server zeigt den **Server-Endpunkt** — die URL deines lokalen Bild-Servers (z.B.
    `http://127.0.0.1:7860`), dazu eine Schaltfläche **Verbindung testen**, die
    Erreichbarkeit prüft und das aktive Modell des Servers meldet.
- **Ausgabe** — der Bildordner (leer lassen für Obsidians Anhang-Ordner, mit
  Autovervollständigung über bestehende Ordner), der Notiz-Ordner für den Fall, dass
  Anlegen eine Notiz erzeugt (leer lassen, um die Notiz neben das Bild zu legen), die
  Auswahl **Anlegen-Schaltfläche** (nur Bild oder Bild + Notiz) und der Startwert des
  Schritte-Reglers (1–50).
- **Stile** — dieselben Stil-Vorlagen, die als Chips unter dem Prompt-Feld erscheinen.
  Beschriftung oder Prompt-Text einer Vorlage ändern, sie löschen oder eine neue
  anlegen.
- **Erweitert → Download-Quelle** — die Basis-URL, von der die Modell-Dateien geholt
  werden. Standard ist das Modell-Repository dieses Plugins auf Hugging Face; für einen
  Spiegel oder einen lokalen Server änderbar. Bereits geladene Dateien bleiben gültig,
  egal was die URL sagt.
- **Alte SD-Turbo-Gewichte löschen** (nur sichtbar, wenn welche gefunden werden) — wer
  von einer Version vor 0.5 kommt, die eine andere Konversion des Modells in der
  Cache-API des Browsers ablegte, löscht diese ~2,5 GB hier mit einem Klick. Die
  0.6-Engine nutzt eigene Dateien und liest die alten nie.

## Funktionsweise

Das Plugin besitzt die Oberfläche — Prompt, Stile, Verlauf, Ablageort — und eines von
zwei **Backends** besitzt die Erzeugung:

**Eingebaute Engine.** Das gewählte Katalog-Modell (SD-Turbo oder SDXL-Turbo) läuft in
Obsidian über [onnxruntime-web](https://onnxruntime.ai/docs/tutorials/web/) auf dem
WebGPU-Backend. Die Modell-Dateien sind die **eigene ONNX-Konversion** dieses Plugins aus
den offiziellen `stabilityai/sd-turbo`- bzw. `stabilityai/sdxl-turbo`-Gewichten
(fp16-Gewichte, fp32-Ein-/Ausgänge), veröffentlicht im Modell-Repository des Plugins samt
Lizenz und Hinweis; das Konversionsskript liegt in `tools/convert/`. Beim ersten Lauf nach
dem Start von Obsidian (oder nach einem Modellwechsel) werden die Sessions des Modells
geladen — drei bei SD-Turbo (Text-Encoder, UNet, VAE-Decoder), vier bei SDXL-Turbo (zwei
Text-Encoder, UNet, VAE-Decoder) — die Statuszeile zählt die Sekunden —, danach kostet
jedes Bild einen Text-Encoder-Durchlauf, 1–8 UNet-Schritte und einen VAE-Decode. SDXL-Turbos
UNet allein ist ≈ 5 GB groß und sprengt sowohl die Einzeldatei-Grenze von ONNX als auch die
des JS-Heaps im Browser — die Konversion stückelt es deshalb in External-Data-Buckets, die
die Engine beim Laden wieder zusammensetzt. Die Pipeline (CLIP-Tokenizer,
Euler-Ancestral-Scheduler, geseedetes Rauschen) ist reines TypeScript und gegen
Fake-Sessions getestet.

**Server.** Eine Erzeugung ist ein `POST /sdapi/v1/txt2img` gegen den eingetragenen
Endpunkt, mit nichts als den generischen Parametern des Panels (Prompt, Negativ-Prompt,
Größe, Schritte, CFG, Seed). Währenddessen fragt das Panel einmal pro Sekunde
`GET /sdapi/v1/progress` nach einem Prozentwert — ein Server ohne diesen Endpunkt (Draw
Things antwortet 404) zeigt stattdessen einen Sekundenzähler, und das Plugin fragt nach
dem ersten 404 nicht mehr. Verbindungstest und Modellname in der Statuszeile kommen aus
`GET /sdapi/v1/options`. Alle drei Aufrufe gehen über Obsidians eigenes `requestUrl`, das
keinen Browser-CORS-Regeln unterliegt, und tragen ein eigenes kurzes Zeitlimit:
`requestUrl` kennt weder Abbruch noch Timeout — ohne eigenes Limit hinge das Panel an
einem unerreichbaren Server ewig, statt ihn als unerreichbar zu melden.

So oder so landet das Bild als gewöhnlicher Anhang im Vault. Das Rezept dahinter (Prompt,
Seed, Schritte, Größe, CFG, Modell, Zeit) wandert in die lokale Datendatei des Plugins,
aus der der Verlaufs-Tab liest — die Bilddatei selbst hängt nicht vom Plugin ab.

## Wie Netzwerk und Speicher genutzt werden

**Ab Werk lädt das Plugin nichts herunter.** Die eingebaute Engine braucht
Modell-Dateien und holt sie **je Modell einmal, nur wenn du auf Herunterladen klickst**
(im Generator-Panel oder in den Einstellungen) — welches der beiden Katalog-Modelle
geladen wird, entscheidest du; nichts anderes wird automatisch geholt. Beide kommen aus
dem Modell-Repository dieses Plugins auf Hugging Face:

**SD-Turbo** (Vorgabe, ≈ 2,6 GB gesamt):

| Datei | Größe | Was es ist | Lizenz |
|---|---|---|---|
| `sd-turbo/text_encoder/model.onnx` | ≈ 681 MB | CLIP-Text-Encoder (fp16) | Stability AI Community License |
| `sd-turbo/unet/model.onnx` | ≈ 1,7 GB | UNet (fp16) | Stability AI Community License |
| `sd-turbo/vae_decoder/model.onnx` | ≈ 99 MB | VAE-Decoder (fp16) | Stability AI Community License |
| `sd-turbo/vae_encoder/model.onnx` | ≈ 68 MB | VAE-Encoder (fp16) — für img2img | Stability AI Community License |
| `sd-turbo/tokenizer/vocab.json`, `merges.txt` | ≈ 1,6 MB | CLIP-BPE-Tokenizer-Daten | (Teil des Modell-Releases) |

**SDXL-Turbo** (optionales zweites Modell, ≈ 7,1 GB gesamt):

| Datei | Größe | Was es ist | Lizenz |
|---|---|---|---|
| `sdxl-turbo/text_encoder/model.onnx` | ≈ 246 MB | CLIP-L-Text-Encoder (fp16) | Stability AI Community License |
| `sdxl-turbo/text_encoder_2/model.onnx` | ≈ 1,4 GB | OpenCLIP-bigG-Text-Encoder (fp16) | Stability AI Community License |
| `sdxl-turbo/unet/model.onnx` + 13 External-Data-Buckets | ≈ 5,1 GB | UNet (fp16, auf mehrere Dateien gestückelt — keine Einzeldatei über 2 GB) | Stability AI Community License |
| `sdxl-turbo/vae_decoder/model.onnx` | ≈ 198 MB | VAE-Decoder (fp32 — siehe Hinweis unten) | Stability AI Community License |
| `sdxl-turbo/vae_encoder/model.onnx` | ≈ 137 MB | VAE-Encoder (fp32 — dieselbe gemessene fp16-Bereichsgrenze wie beim Decoder) — für img2img | Stability AI Community License |
| `sdxl-turbo/tokenizer{,_2}/vocab.json`, `merges.txt` | ≈ 3,2 MB | CLIP-BPE-Tokenizer-Daten, beide Encoder | (Teil des Modell-Releases) |

SDXL-Turbos VAE-Decoder **und** VAE-Encoder bleiben beide **fp32** — beide gemessenen Aktivierungen überschreiten unter der WebGPU-Ausführung den fp16-Wertebereich (der Encoder-Peak liegt bei rund 300.000–500.000), und beim Decoder erzeugte das ein stilles, fehlerfreies rein schwarzes Bild ohne jedes andere Symptom. Alles andere in beiden Modellen bleibt fp16.

Gemeinsam für beide Modelle:

| Datei | Größe | Was es ist | Lizenz |
|---|---|---|---|
| `runtime/ort-<version>/ort-wasm-simd-threaded.asyncify.wasm` | ≈ 24 MB | ONNX Runtime Web (dieselbe Version, gegen die das Plugin gebaut ist) | MIT |

Jede Datei wird vor der Verwendung gegen eine im Plugin hinterlegte SHA-256 geprüft; bei
Abweichung wird sie verworfen und gemeldet. Vor dem Download jedes anderen Modells als
der Vorgabe (derzeit nur SDXL-Turbo) zeigt das Plugin einen Bestätigungsdialog mit dessen
Größe und dem Hinweis zur Speicherspitze oben — Abbrechen lädt nichts. Die Dateien liegen
in der Cache-API des Browsers im Obsidian-Profil — **außerhalb deines Vaults**, werden
also nie gesynct — und **Entfernen** in den Einstellungen löscht sie wieder. Ein Download
lässt sich jederzeit abbrechen; fertige Dateien und abgeschlossene Teile bleiben gespeichert.
Bei vorübergehenden Verbindungsproblemen versucht das Plugin es automatisch erneut.
Um später weiterzuladen, wähle **Download fortsetzen**. Hilfe findest du unter
[Troubleshooting](docs/troubleshooting.md#interrupted-or-paused-downloads).

Die Download-Quelle ist die einzige Netzwerkverbindung der eingebauten Engine. Im
Server-Modus ist die einzige Verbindung der Server-Endpunkt, den du konfigurierst — und
das nur beim Generieren, beim Verbindungstest und beim Abfragen des Fortschritts. Kein
anderer Netzzugriff, keine Telemetrie.

- Prompts und erzeugte Bilder verlassen deinen Rechner nie.
- Erzeugte Bilder werden als normale Anhänge in deinem Vault gespeichert, genau wie ein
  Bild, das du selbst hinzufügst. Der Verlauf (Prompts, Seeds, Einstellungen) liegt in der
  lokalen Datendatei des Plugins, ebenfalls auf deinem Rechner.
- **Upgrade von einer Version vor 0.5?** Diese Fassungen legten eine andere
  Modell-Konversion (~2,5 GB) in der Cache-API ab. Die 0.6-Engine nutzt sie nicht; das
  Plugin zeigt einmalig einen Hinweis, wenn es sie findet, und **Einstellungen → Alte
  SD-Turbo-Gewichte löschen** entfernt sie.

## Datenschutz

- **Keine Telemetrie.** Das Plugin erhebt, überträgt und meldet keinerlei
  Nutzungsdaten, Prompts oder Bilder.
- **Kein Netzzugriff** außer (a) dem Modell-Download, den du selbst anstößt, von der in
  den Einstellungen gezeigten Download-Quelle, und (b) im Server-Modus dem lokalen
  Server-Endpunkt, den du konfigurierst. Ohne deinen Klick wird nichts geholt.

## Modell & Lizenzen

- **Plugin-Code:** AGPL-3.0-or-later (siehe [`LICENSE`](https://github.com/johannes-kaindl/local-image-generator/blob/main/LICENSE)).
- **Eingebaute Modelle:** zwei Katalog-Einträge, beide von Stability AI, beide
  weiterverteilt als eigene ONNX-Konversion dieses Plugins (fp16-Gewichte,
  fp32-Ein-/Ausgänge) unter der
  [Stability AI Community License](https://huggingface.co/stabilityai/sd-turbo/blob/main/LICENSE.md)
  — frei für Forschung, nicht-kommerzielle und begrenzt kommerzielle Nutzung; lies die
  Lizenz, bevor du erzeugte Bilder kommerziell verwendest. *Powered by Stability AI.*
  Konversionen sind aus den offiziellen Gewichten mit
  `tools/convert-model.sh <sd-turbo|sdxl-turbo>` reproduzierbar; keine Drittkonversion ist
  beteiligt.
  - [SD-Turbo](https://huggingface.co/stabilityai/sd-turbo) — die Vorgabe.
  - [SDXL-Turbo](https://huggingface.co/stabilityai/sdxl-turbo) — das optionale zweite
    Modell, schärfere Bilder bis 1024×1024, ≈ 7,0 GB.
- **Server-Modus:** das Modell ist, was deine Server-App geladen hat — seine Lizenz gilt
  für die Bilder, die es erzeugt. Prüfe seine Modellkarte, bevor du erzeugte Bilder
  verwendest, besonders kommerziell.

## Ausblick

Das Zwei-Backend-Design hält beide Hälften austauschbar — img2img, die Anbieter-API für
andere Obsidian-Plugins und SDXL-Turbo als zweites eingebautes Modell standen hier einmal
als Ideen und sind seither erschienen. Weitere eingebaute Katalogeinträge bleiben eine
Option, sobald sich das Format bewährt hat.

## Dokumentation

- [Dokumentations-Index](https://github.com/johannes-kaindl/local-image-generator/blob/main/docs/README.md) — alle Anleitungen an einem Ort (englisch).
- [Getting started](https://github.com/johannes-kaindl/local-image-generator/blob/main/docs/getting-started.md) — von der Installation zum ersten Bild.
- [Troubleshooting](https://github.com/johannes-kaindl/local-image-generator/blob/main/docs/troubleshooting.md) — die genaue Meldung, ihre Ursache und die Abhilfe.

## Lizenz

AGPL-3.0-or-later — siehe [LICENSE](https://github.com/johannes-kaindl/local-image-generator/blob/main/LICENSE). Die Lizenzierung der Modelle ist eine
eigene Sache — siehe [Modell & Lizenzen](#modell--lizenzen) oben.
