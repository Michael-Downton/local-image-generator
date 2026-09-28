# GUI-Smoke

Was gegen einen Mock geprüft ist, ist spezifiziert — nicht getestet. Die vitest-Suite deckt
die Rechenlogik ab (Tokenizer, Rezepte, ViewModel, Frontmatter); sie sieht strukturell nicht,
ob das Ergebnis auch im DOM ankommt, ob ein Knopf feuert, ob eine Notiz im Vault landet.
Diese Naht zum Host prüft `scripts/gui-smoke.ts` gegen ein **laufendes** Obsidian
(CORE-TEST-02 b).

## Download-Wiederherstellung ohne Modellgewichte pruefen

Mit installiertem Chromium zuerst `npm ci` und `npm run gate`, danach
`npm run smoke:downloads` ausfuehren (`CHROMIUM_BIN` kann auf die Programmdatei zeigen).
Dieser eigenstaendige Browser-Smoke nutzt ein isoliertes, temporaeres Browser-Profil und
zwei lokale HTTP-Server. Das synthetische Modell ist nur 1 MiB gross.

Der Test prueft echte Cross-Origin-Anfragen, Cache API und Web Locks: abgebrochene HTTP-Streams,
Neuladen der Seite mit anschliessendem Fortsetzen, ignorierte und ungueltige Byte-Bereiche,
beschaedigte Daten, adaptive Wiederholungen, konkurrierende Stores und gezieltes Verwerfen.
Das Skript entfernt sein Profil und beendet seine Server. Es prueft das Download-Subsystem
in Chromium; Obsidian und Bilderzeugung sind dafuer nicht erforderlich.

Der bestehende Server `npm run smoke:assets` unterstuetzt ebenfalls Bereichsanfragen fuer
manuelle Tests mit konvertierten Modell-Dateien. Fuer einen Test der Obsidian-Oberflaeche
einen Download starten, den Server unterbrechen und Countdown sowie Abbruch pruefen.
Obsidian neu starten und den Download fortsetzen. Pruefen, dass Verwerfen den gespeicherten
Teilfortschritt entfernt und die Bilderzeugung bis zum Abschluss der Pruefung gesperrt bleibt.
Auf Englisch und Deutsch wiederholen.

## Voraussetzungen

⚠️ **Zuerst prüfen, wer sonst an Obsidian hängt.** Ein `quit` trifft die Instanz, an der
möglicherweise eine andere Session arbeitet, und zerstört deren Zustand. Der eigene Lauf ist
danach sauber grün; der Schaden entsteht woanders und fällt nicht auf.

⚠️ **Hier stand: „Obsidian ist Single-Instance".** Das ist seit 2026-09-02 gemessen widerlegt
(Dach-`AGENTS.md`): die Sperre hängt am PROFIL, nicht am Rechner — mit eigenem
`--user-data-dir` und eigenem Debug-Port läuft eine zweite Instanz parallel zur regulären.
Für einen Lauf, der die reguläre Instanz nicht anfassen soll, ist das der Ausweg statt einer
Nachfrage. **Den Port dabei nicht aus einem Beispiel abschreiben:** am 2026-09-06 lief bereits
eine fremde Zweitinstanz auf der in der Doku genannten 9333, der eigene Start bekam den Port
nicht, und `curl` beantwortete die Frage „läuft meine Instanz?" mit dem Fenstertitel der
fremden — eine Kollision, die sich nicht als Fehler meldet, sondern als plausibles falsches
Ergebnis.

```bash
lsof -nP -iTCP:9222 -sTCP:LISTEN >/dev/null && echo "läuft bereits — NICHT beenden"
```

Hört der Port schon, dann **mitnutzen statt neu starten**: ein eigenes Fenster per
`vault-open` über IPC öffnen, dann `attachTo("workspace", port, vault)` — der Vault-Name
wählt, nicht die Reihenfolge. ⚠️ Die Port-Prüfung ersetzt die Frage nicht: sie zeigt aktive
CDP-Treiber, aber nicht, wer ein Fenster offen hält oder auf den Port wartet.

Erst wenn nichts läuft — oder nach Absprache mit dem, der es benutzt — gilt das Rezept unten.

1. **Obsidian mit Debug-Port** — der eine Handgriff, der Handarbeit bleibt (Neustart nötig):

   ```bash
   osascript -e 'quit app "Obsidian"'
   open -a Obsidian --args --remote-debugging-port=9222
   ```

2. **Ein laufender A1111-kompatibler Bildserver** auf dem Endpunkt aus den Plugin-Settings
   (Draw Things, AUTOMATIC1111, Forge, SD.Next) — ein abwesender Server ist kein
   Plugin-Defekt, und der Treiber meldet ihn auch nicht als einen. Er prüft die
   Erreichbarkeit **vorab** und sagt an, was fehlt:

   - **Voller Lauf:** Abbruch mit Ansage — die Punkte 5–11 erzeugen ein echtes Bild.
   - **`--quick`:** läuft weiter, überspringt die Punkte 2, 3, 4 — **und seit 2026-09-06
     auch 18e und 19**. Gemessen werden 1, 12, 17, 18a/18b und (bei laufendem Mock) 35–39
     — die Punkte, die ohne Server-Verbindung eine Aussage haben. Punkt 4 gehört zu den
     übersprungenen, obwohl er nur die Bedienbarkeit eines Knopfes prüft: `generateEnabled`
     verlangt `server.kind === "ok"`, der Knopf ist ohne Server also zurecht gesperrt.

     **Warum 18e und 19 nachgezogen wurden — der Guard deckte nicht, was er zu decken schien.**
     Gemessen am 2026-09-06 beim ComfyUI-Lauf: 2/3/4 wurden korrekt übersprungen, 18e
     (`recheck()`) und 19 (img2img) dagegen **rot**, obwohl sie denselben Server brauchen.
     Punkt 19 trug sogar einen eigenen Guard — er prüfte nur das Falsche: die Zählerdatei
     `.mock-a1111-counts.json` **überlebt den Mock-Prozess**, ein Altbestand liest sich also
     als „Mock läuft". Gefährlich war es, weil `recheck()` in derselben Arbeit geändert worden
     war: die naheliegende Reaktion („bekannt rot, betrifft den A1111-Pfad, nicht meine
     Änderung") hätte die einzige Messung dieser Änderung ausfallen lassen — mit einer
     Begründung, die sich richtig anfühlt. Aufgefallen ist es, weil der Lauf wiederholt wurde,
     nicht weil der Treiber es sagte (CORE-TEST-02 g).

     ⚠️ **Der Server-Guard ist nicht die einzige Umgebungsbedingung, die falsch-rot färbt.**
     Im selben Lauf blieb Punkt 36 rot, weil der Treiber die Sprache aus
     `localStorage.getItem("language")` ableitete — und Obsidian schreibt diesen Key **nur bei
     einer expliziten Sprachumstellung**. Auf der Systemsprache ist er leer, während der
     Renderer sehr wohl übersetzt (gemessen: `ls: null`, `i18next.language: "de"`,
     `documentElement.lang: "de"`), also verglich der Treiber englische Erwartungen gegen
     deutsche Darstellung. Erste Quelle ist seither `document.documentElement.lang` — dort
     spiegelt Obsidian die GELADENE Sprache, also das, was `getLanguage()` liefert und woraus
     auch das Plugin selbst seine Sprache zieht (`src/main.ts`); `localStorage` bleibt
     Rückfallebene.

     ⓘ **Der Fix ist übernommen, nicht erfunden** — `vault-rag/scripts/gui-smoke.ts:347`
     (2026-09-03) und, noch früher, `apple-health/scripts/shots.ts:676` (2026-08-18), dort mit
     der schärferen Beobachtung: `localStorage` sagte „de", während die Oberfläche auf Englisch
     stand. Damit ist es die **dritte unabhängige Entdeckung derselben Sache in drei Repos** —
     und keine der beiden früheren stand in der `REGISTRY.md`, war also nicht auffindbar.
     Gemessen am 2026-09-06 über alle 24 Treiber im Dach: **sechs tragen die defekte Fassung
     weiter** (`audio-interface`, `epub-exporter`, `obsidian-transmute` ×2, `vault-crews`,
     `yijing-oracle` — durchweg `shots.ts`, wo eine falsch erkannte Sprache falsch beschriftete
     README-Bilder erzeugt statt nur roter Prüfpunkte).

   Übersprungene Punkte stehen in der Abschlusszeile (`… · N übersprungen (NICHT gemessen)`),
   damit ein Teil-Lauf nicht als bestandener Smoke zitiert wird. Antwortet der Server dagegen
   **falsch** (HTTP-Fehler, kein Modellname), bleibt es ein Abbruch: das ist ein Befund.

3. **Deployter Stand:**

   ```bash
   OBSIDIAN_PLUGIN_DIR="<vault>/.obsidian/plugins/local-image-generator" npm run deploy
   ```

   **Seit 2026-09-02 prüft der Treiber das selbst, statt es zu glauben** (`requireEigenerBuild`
   aus `tools/obsidian-cdp/vault.ts`, zentral). Er vergleicht `main.js` **und** `styles.css` im
   gemessenen Vault byteweise gegen den Repo-Stand und bricht bei nachgewiesener Abweichung ab —
   mit beiden Größen im Text, weil „Repo 215.423 / Vault 209.118" beim Lesen sofort erklärt, was
   passiert ist, während ein Hash-Mismatch nur „anders" sagt.

   Drei Punkte, die den Guard tragen und beim Anfassen leicht verlorengehen:

   - **Der Vault-Pfad kommt aus der laufenden Instanz** (`app.vault.adapter.basePath` +
     `app.vault.configDir`), nicht aus `stagingVaultDir(...)`. Ein Treiber dockt per `--vault` an
     ein beliebiges Fenster an; ein Check gegen den *konfigurierten* Ort prüft dann eine Datei,
     die mit dem Lauf nichts zu tun hat — er versagt genau im Anlassfall (Lesson 2026-09-02,
     kuro-gamification: **geprüft wird, was gemessen wird**).
   - **`styles.css` wird mitgeprüft, obwohl der zentrale Guard nur `main.js` kennt.** Punkt 17
     misst gerendertes CSS über `getComputedStyle`, und die `.is-hidden`-Reihenfolge ist ein
     reiner Stylesheet-Defekt: ein altes Stylesheet neben frischer `main.js` erschiene als
     Plugin-Befund.
   - **Abbruch nur bei nachgewiesener Abweichung.** Fehlt der Vergleichsstand (kein gebautes
     `main.js` im Repo), warnt der Guard und läuft weiter — eine fehlende Umgebung ist kein
     Befund (CORE-TEST-02 g). Die Abschlusszeile trägt die Warnung dann mit, damit ein so
     gelaufener Smoke nicht als Beleg für den Repo-Stand zitiert wird.

   ⚠️ **Die Zeile „Plugin-Version im Vault: X" ist kein Ersatz und war nie einer.**
   `enablePlugin` lädt den Code neu, das **Manifest nicht** — die Version stammt aus dem
   Vault-Start. Der Treiber stellt deshalb den Plattenstand daneben, sobald beide auseinanderlaufen.

4. **Für die eingebaute Engine (Punkte 13–16, seit 0.6) ein lokaler Asset-Server** — in einem
   zweiten Terminal `npm run smoke:assets` (serviert `dist-assets/`, also die eigene Konversion
   aus `tools/convert-model.sh sd-turbo` plus ORT-WASM, auf `http://127.0.0.1:7862` mit CORS). Die
   Punkte laufen nur mit `--builtin` **und** erreichbarem Asset-Server; sie **löschen die
   Modell-Dateien aus dem Plugin-Cache und laden sie neu** (2,5 GB) — deshalb nie gegen das
   HF-Repo, sondern nur gegen diesen Server. Der Server-Teil (1–11) läuft ohne Bild-Server
   gegen `node scripts/mock-a1111.mjs` (Port 7861, Plugin-Endpunkt darauf stellen).

5. **Für das ComfyUI-Backend (Punkte 35–38, seit 0.13-dev) ein eigener Mock** — in einem
   weiteren Terminal `npm run smoke:comfy` (`scripts/mock-comfy.mjs`, Port 8189, überschreibbar
   mit `MOCK_COMFY_PORT` bzw. `--comfy <url>` am Treiber). **Bewusst NICHT
   `scripts/mock-a1111.mjs`** — der hat seit 2026-09-02 einen fremden Konsumenten
   (`epub-exporter`s Naht-Lauf), s. AGENTS.md. Ohne den Mock werden alle vier Punkte
   übersprungen, nicht geraten.

Dann:

```bash
npm run smoke:gui -- --vault <vault-name>
npm run smoke:gui -- --vault <name> --steps 8 --timeout 1200 --keep
npm run smoke:gui -- --vault <name> --builtin          # + 13–16, braucht npm run smoke:assets
npm run smoke:gui -- --vault <name> --comfy http://127.0.0.1:8199   # abweichender Mock-Port
```

`--steps` (Default 4) und die fest kleinste Größe halten den Lauf kurz: geprüft wird die
Kette, nicht die Bildqualität. `--keep` lässt den Smoke-Ordner liegen.

## Was der Treiber prüft

| # | Prüfpunkt | Warum gerade der |
|---|---|---|
| 1 | Hub öffnet sich per Command mit dem Generate-Panel | Lebenszeichen der View-Registrierung |
| 2 | „Verbindung testen" meldet den Modellnamen | Kette Knopf → `checkServer` → Notice |
| 3 | Generate-Panel zeigt den **echten** Modellnamen | Regression zu `1d1c046` (s.u.) |
| 4 | „Generieren" ist mit gesetztem Prompt bedienbar | `generateEnabled` am echten Knopf |
| 5 | Der Klick startet einen sichtbaren Lauf | Statuszeile verlässt „Bereit" |
| 6 | Die Statuszeile bewegt sich während des Laufs | eine eingefrorene Zeile ist von einem Hänger nicht zu unterscheiden |
| 7 | Die Generierung liefert ein Bild in die Karte | Ende-zu-Ende über echtes HTTP |
| 8 | Die Ergebnis-Notiz trägt den echten Modellnamen | **die Nutzlast** von `1d1c046` |
| 9 | Die Ergebnis-Notiz bettet das Bild ein | das Produkt, nicht der Zustand |
| 10 | Historien-Klick stellt Prompt **und** Seed her | Jays 0.2-Befund („merkt sich nur den Prompt") |
| 11 | „Reroll" würfelt neu und startet | der Knopf, der sich vom Nachbarn unterscheiden muss |
| 12 | Die Einstellungen erscheinen in der Settings-**Suche** | der Store-Linter prüft nur, DASS `getSettingDefinitions()` existiert — nicht, ob die Zeilen beim Nutzer ankommen |
| 13 | Engine auf „Eingebaut" — Panel zeigt den Modellzustand, Negativ-Prompt weg, CTA da | der Moduswechsel muss die Regler ehrlich machen (Spec 0.6 §6) |
| 14 | Download über den **Panel**-Knopf endet auf „bereit" | der Zero-Setup-Weg darf nicht in den Settings versteckt sein; Fortschritt muss sichtbar sein |
| 15 | Die eingebaute Engine liefert ein Bild, die Notiz trägt `model: sd-turbo` und `steps ≤ 4` | Ende-zu-Ende ohne Server: Ladephase, Schritte, Rezept-Ehrlichkeit |
| 16 | Zurück auf „Server" bringt die Regler zurück | der Wechsel darf nichts hinterlassen |
| 17 | Die modusabhängigen Regler sind auch **gerendert** weg — und kommen zurück | `getComputedStyle`, nicht `classList`: die Klasse war beim Bug vom 2026-08-21 gesetzt, das CSS zog nicht |
| 18a/b | Die Provider-API ist am laufenden Obsidian registriert und formtreu | `this.api` im onload und die Erreichbarkeit über `app.plugins.plugins` sieht man nur am Wirt |
| 18c | Ein **gescheiterter** Fremdlauf hinterlässt keine Spur im Panel | die Entscheidung liegt in `main.ts` — der einzigen Schicht ohne Unit-Test-Ebene; gemessen wird die **gerenderte** Zeile gegen ihren Wert von **vorher**, nicht gegen „kein Fehlertext" |
| 18d | `generate()` im builtin-Modus lädt ohne Klick **kein Byte** | „Ohne Klick fließt kein Byte" rechtfertigt den 2,5-GB-Download überhaupt; getragen wurde die Zusage bis dahin nur strukturell (`matchOrThrow` wirft, statt zu laden) |
| 18e | `recheck()` heilt einen **veralteten** `unreachable`-Zustand | drei Schritte, und der mittlere trägt den Beweis: nachdem der Server wieder erreichbar ist, muss `status()` **weiter** `unreachable` melden — sonst hat sich der Zustand nebenbei aufgefrischt und der Punkt hätte `recheck()` nie berührt |
| 19 | Ein Lauf **mit Vorlage** geht an `/sdapi/v1/img2img` | am **Zähler des Servers** gemessen, nicht am Panel-Zustand — der kann korrekt sein, während die Anfrage am falschen Endpunkt landet |
| 20 | Modellwechsel im Settings-Tab ändert die Download-Zeile (Name + Größe) | über das echte **Dropdown**, nicht über einen Settings-Write — nur `onChange` löst `setBuiltinModel()` + Re-Render aus |
| 21 | `.lig-model-pick` zeigt sich erst ab **zwei geladenen** Modellen, nicht schon beim Toggle allein | zweite, unabhängige Sichtbarkeitsbedingung wie `.lig-denoise` — braucht einen echten Zwei-Modell-Cache-Zustand |
| 22 | Die Größen-Zeile folgt dem gewählten Modell (SD-Turbo weg, SDXL-Turbo sichtbar mit 2 Optionen) | `getComputedStyle`, nicht der State — dieselbe Lehre wie 17 |
| 23 | Abbruch am Bestätigungsdialog vor SDXL-Turbo lädt **kein** Byte | am **Zähler des Asset-Mocks** gemessen (Spec §4: „ohne Klick fließt kein Byte" gilt auch für den falschen Knopf) |
| 24 | SD-Turbo liefert ein Bild mit echtem **Inhalt** (Luma-Stddev + distinkte Farben) | billige Zusatzabsicherung, misst dasselbe Bild wie 15 |
| 25 | SDXL-Turbo liefert ein Bild mit echtem **Inhalt**, nicht Schwarz/uniform | der eigentliche Regressionswächter aus Phase 4 des SDXL-Turbo-Debuggings — s. u. |
| 26 | builtin-img2img (SD-Turbo): str 0.25 bleibt **nah** an der Vorlage (RMSE ≤ 35), str 1.0 entfernt sich (≥ 40) | die inhaltliche Prüfung des ganzen Weges Base64 → `decodeInitImage` → VAE-Encoder → Teil-Denoising; der C-Lauf (str 1.0) ist die **eingebaute Gegenprobe**: wäre die Vorlage wirkungslos, lägen beide Läufe gleich weit weg |
| 27 | builtin-img2img (SDXL-Turbo): dasselbe mit Grenzen 28/30 | der **Live-Beweis** für den fp32-VAE-Encoder unter WebGPU — torch-Hooks maßen 300k–500k Aktivierungs-Peak, ein Node/CPU-Test kann diesen Fehlermodus prinzipiell nicht sehen |
| 35 | Modus-Wechsel zu ComfyUI blendet Negativ-Prompt/CFG richtig um (drei Modi, **eigene** Erwartungstabelle) | `MODUS_REGLER`/Punkt 17 ist als „builtin versteckt, server sichtbar" gebaut und stimmt für comfy nur bei CFG — der Negativ-Prompt ist dort **sichtbar** (der Sampler garantiert ihn). Eine dritte Zeile in derselben Liste hätte den Negativ-Prompt falsch-rot gemeldet |
| 36 | Ein kaputter Workflow (kein Sampler-Node) zeigt seinen **Klartext** — eine gültige Datei bringt `is-ok` | beide Richtungen wie Punkt 17: eine Prüfung, die nur die Fehlermeldung liest, besteht mit einer Statuszeile, die immer denselben Text zeigt |
| 37 | Ein echter Lauf gegen den ComfyUI-Mock (`scripts/mock-comfy.mjs`) liefert ein Bild | am **Zähler/den Bytes des Mocks** gemessen, den der Treiber selbst per `fetch` abfragt — dieselbe Form wie Punkt 2/3, nicht „der Prüfling behauptet Erfolg" |
| 38 | Die Ergebnis-Notiz trägt die vom Mock **empfangene** Schrittzahl, nicht den Workflow-Default | misst Spec §4 direkt: der Workflow-Default (20) und die angefragte Zahl (3) sind absichtlich verschieden, damit ein Test, der den falschen Wert liest, nicht zufällig grün bleibt |
| 39 | Die comfy-Notiz trägt **keine** `cfg:`-Zeile — der Workflow bestimmt den Wert | prüft eine ABWESENHEIT und muss deshalb zuerst belegen, dass überhaupt ein Rezept-Frontmatter dasteht (`seed:`/`model:`, beide unbedingt geschrieben) — sonst wäre der Punkt gerade dann grün, wenn die Notiz gar nicht entstand |
| 40 | Die grossen Formate (0.12.1) stehen im **Server**-Dropdown und **nicht** im builtin | beide Richtungen, und die zweite ist die Aussage: dass `2048x1152` im Server auftaucht, belegt nur, dass die Liste ankommt — dass es im builtin FEHLT, belegt die Trennung der Quellen (dort speist der Modellkatalog, nicht `SIZES`) |

Punkt 12 läuft trotz seiner Nummer im `--quick`-Teil, direkt nach 4: er braucht keine
Generierung. Die Nummer ist ein **Name**, keine Reihenfolge — eine Umnummerierung von 5–11
würde die Befund-Rückverweise weiter unten („Punkt 4 war ein Falsch-Rot", „Punkt 3 und 8")
stillschweigend auf andere Prüfungen zeigen lassen.

Er holt seine Erwartung aus `getSettingDefinitions()` selbst statt aus einer Literal-Liste
— sonst misst er nach dem nächsten Umbenennen oder in einer anderen UI-Sprache am eigenen
Gedächtnis vorbei. (Beim Bau genau das zweimal passiert: gesucht wurde „Ausgabeordner", die
Zeile heißt „Bilderordner" — das las sich zwei Runden lang wie ein Produktdefekt.) Zeilen mit
falschem `visible`-Prädikat sind ausgenommen; sie sollen ja gerade **nicht** auftauchen.
Dazu eine Negativkontrolle: findet die Suche auch einen Unsinnsbegriff, beweist ein Treffer
nichts. Fehlt die Suche ganz (Obsidian < 1.13), wird der Punkt übersprungen statt rot.

### Warum Punkt 19 am Zähler misst und nicht am Panel

Die Vorlage kann gesetzt, `controls.denoising` sichtbar und das Rezept korrekt sein — und
die Anfrage trotzdem am txt2img-Endpunkt landen. Ein Prüfpunkt, der `state.initImage` liest,
sieht davon nichts (dieselbe Fehlerklasse wie beim Regler-Bug vom 2026-08-21: korrekter
Zustand, falsche Wirkung). Deshalb liest er `.mock-a1111-counts.json` **vor und nach** dem
Lauf und vergleicht die Differenz; der Mock antwortet zusätzlich mit 400, wenn ein
`img2img` ohne `init_images` ankommt, was ein reiner Endpunkt-Zähler durchließe.

Ohne laufenden Mock ist die Zählerdatei nicht da — dann wird der Punkt **übersprungen**
statt geraten. Der Lauf geht bewusst über die Provider-API: dort ist die Vorlage ein
Base64-Parameter, der Punkt braucht also keine Vault-Datei und keinen Klickpfad und misst
denselben `runGeneration`-Weg wie der Generate-Knopf.

**Nicht automatisiert** — dafür bleibt die Hand-Runde: „sieht gut aus", Bildqualität,
Layout-Gefühl, Theme-Ästhetik.

### Warum Punkt 3 und 8 doppelt aussehen, aber nicht dasselbe sind

`1d1c046`: Draw Things meldet das aktive Modell als `model`, A1111/Forge/SD.Next als
`sd_model_checkpoint`. `parseOptionsModel` las nur letzteres → `modelName` blieb `null` →
`main.ts` schrieb via `modelName ?? "unknown"` ein `model: unknown` ins Frontmatter **jeder**
Ergebnis-Notiz, also genau in das Feld, das ein Rezept reproduzierbar machen soll.

Punkt 3 misst die Anzeige, Punkt 8 das Produkt. Der Fehler war auf beiden Ebenen sichtbar,
aber nur Ebene 8 richtet dauerhaften Schaden an: eine falsche Anzeige verschwindet beim
nächsten Blick, ein falsches Frontmatter bleibt in der Notiz stehen.

**Der Treiber holt seine Erwartung selbst vom Server** (eigener `fetch` auf
`/sdapi/v1/options`, `sd_model_checkpoint ?? model`) — er fragt nicht das Plugin. Ein
Prüfwerkzeug, das seine Erwartung aus dem Prüfling bezieht, bestätigt nur dessen Meinung;
genau so blieb der Fehlgriff so lange unentdeckt.

### Warum Punkt 17 nicht in 13 und 16 aufgeht

13 und 16 fragen, ob das Panel den Zustand richtig **setzt**. 17 fragt, ob das CSS ihn auch
**durchsetzt**. Das ist nicht dieselbe Frage: am 2026-08-21 war die Klasse `is-hidden` auf der
Negativ-Prompt-Zeile korrekt gesetzt, 237 Unit-Tests und 16 Smoke-Punkte waren grün — und die
Zeile stand trotzdem im builtin-Modus im Bild, weil `.lig-prompt-row { display: flex }` weiter
unten in `styles.css` stand und bei gleicher Spezifität gewinnt. Ein Prüfpunkt auf
`classList.contains("is-hidden")` kann das prinzipiell nicht sehen: er fragt den Prüfling nach
seiner **Absicht**, nicht nach dem **Ergebnis**.

Punkt 17 hängt deshalb an nichts — kein Download, kein Asset-Server, keine Generierung. Er
wechselt den Modus und liest `getComputedStyle`, und läuft damit auch im `--quick`-Lauf. Ein
CSS-Regressionsschutz, der nur im Vollauf mitläuft, fehlt genau dann, wenn man ihn braucht.

Er misst **beide Richtungen** (builtin versteckt, server bringt zurück): ein Punkt, der nur das
Verstecken prüft, wäre mit einem globalen `display: none !important` zu bestehen.

Zwei Ja-Sager derselben Bauart sind bei der Gelegenheit mit umgestellt worden — der CTA-Knopf in
13 und die Bildkarte in 7 fragten ebenfalls die Klasse statt die gerenderte Sichtbarkeit.

**Die Vorbedingung eines Bugs gehört in den Prüfpunkt, der ihn sucht.** Die Steps-Beschriftung
(zweiter Bug vom 2026-08-21: Regler auf 4, Beschriftung „20") kann nur danebenliegen, wenn der
Browser den Wert beim Sinken von `max` überhaupt klemmt.

| Aufbau | Defekt eingebaut? | Ergebnis |
|---|---|---|
| Regler auf dem Standardwert 4 (erste Fassung) | ja | **grün** — kein Klemmen, also kann die Beschriftung gar nicht abweichen |
| Regler vorher über das builtin-Maximum geschoben (heutige Fassung) | ja | rot |
| dieselbe Fassung | nein | grün |

Die erste Zeile ist der Grund für die Umstellung: der Punkt war nicht zu lasch, er kam am
Prüfling nie an. Er schiebt den Regler seitdem selbst über das builtin-Maximum und meldet als
eigenen Befund, **wenn kein Klemmen stattfand** — sonst wäre die Zeile drei Jahre später
wieder still, sobald jemand den Standardwert ändert.

### § 2026-09-06 — Punkte 35–38 (ComfyUI-Backend, Task 10)

**Warum Punkt 35 `MODUS_REGLER`/Punkt 17 nicht einfach um „comfy" erweitert.** Jene Liste ist
als „im builtin versteckt, im server sichtbar" gebaut — ein zweiwertiges Modell. Im comfy-Modus
stimmt das nur für die CFG-Selektoren: `.lig-negative-row` ist dort **sichtbar**, weil
`backendCapabilities` (`src/core/generation.ts`) den Negativ-Prompt als vom Sampler garantiert
führt, sobald ein gültiger Workflow geladen ist. Eine dritte Zeile in derselben Liste hätte den
Negativ-Prompt in jedem comfy-Lauf falsch-rot gemeldet. Punkt 35 trägt deshalb eine eigene
`MODUS_ERWARTUNG` mit drei vollständigen Zeilen (`sichtbar`/`versteckt` je Modus) statt einer
Erweiterung der zweiwertigen Liste — und läuft **vor** builtin und server ebenfalls durch, nicht
nur für comfy: eine Erwartungstabelle, die nur den neuen Fall prüft, könnte eine Verschiebung in
den beiden alten Fällen nicht sehen.

**Warum Punkt 35 einen bereits gültigen Workflow braucht, bevor er misst.** Ohne brauchbaren
Workflow (`slots === null`) liefert `backendCapabilities` im comfy-Modus `negativePrompt: false`
— dieselbe Antwort wie im builtin-Modus, aus einem anderen Grund (kein Sampler gefunden, also
keine Zusage möglich). Der Aufrufer (`runComfyChecks`) hinterlegt deshalb VOR Punkt 35 einen
gültigen Workflow; Punkt 36 wechselt danach absichtlich auf einen kaputten und wieder zurück.

**Warum Punkt 37 seine Erwartung selbst beim Mock holt statt beim Plugin.** Dieselbe Lehre wie
bei Punkt 2/3 (s.o.): ein Prüfwerkzeug, das seine Erwartung aus dem Prüfling bezieht, bestätigt
nur dessen Meinung. Der Treiber ruft `/view` deshalb selbst per `fetch` auf und vergleicht die
zurückgegebenen Bytes 1:1 mit dem, was `generate()` geliefert hat — stimmen sie nicht überein,
ist es kein echter Roundtrip gewesen, ganz gleich, was der Rückgabewert behauptet.

**Warum der Workflow-Default (20 Steps) bewusst von den angefragten Steps (3) abweicht.** Punkt
38 vergleicht die `steps` im Frontmatter der Notiz mit den `steps`, die der Mock im Graphen
EMPFANGEN hat (`.mock-comfy-counts.json`, Feld `graph`) — nicht mit dem Workflow-Default und
nicht mit einem angenommenen Wert. Wären Default und Anfrage identisch, würde ein Test, der aus
Versehen den Default statt des empfangenen Werts liest, trotzdem grün bleiben — die Differenz
macht genau diesen Fehlgriff sichtbar.

**Eigener Mock, eigene Datei.** `scripts/mock-comfy.mjs` ist bewusst NICHT Teil von
`scripts/mock-a1111.mjs` — letzterer hat seit 2026-09-02 einen fremden Konsumenten
(`epub-exporter`s Naht-Lauf), eine Änderung an dessen Form bricht einen Treiber in einem anderen
Repo, still, weil er hier nicht mitläuft (s. AGENTS.md). Start: `npm run smoke:comfy` (Port
8189, überschreibbar mit `MOCK_COMFY_PORT`).

**Gegenprobe:** gefahren — 35–38 am 2026-09-06 im Freigabe-Lauf zu 0.13.0 (15/15, zwei
verifizierte Gegenproben), Punkt 39 am selben Tag nachmittags (s. den Lauf-Eintrag unten).

### § 2026-09-06 (nachmittags) — Punkt 39: was NICHT in der Notiz steht

**Warum die cfg-Zeile einen eigenen Prüfpunkt bekommt statt einer Zeile in Punkt 38.** Der
Critical des Branch-Reviews war, dass jede ComfyUI-Notiz `cfg: 1` behauptete, während
`patchWorkflow` das CFG-Feld des Samplers gar nicht anfasst — der Nutzer-Workflow rechnet mit
seinem eigenen Wert. Behoben ist das seit 0.13.0 (`cfg` ist `number | null`, `note.ts` lässt das
Feld weg), gedeckt war es aber nur durch Unit-Tests und **eine einmalige Live-Messung von Hand**
— also durch nichts, was ein späterer Umbau wieder auslösen würde. Punkt 38 misst, was
DRINSTEHT (die empfangene Schrittzahl); Punkt 39 misst, was NICHT drinsteht. Beide teilen sich
denselben Lauf, aber nicht denselben Namen: ein Punkt, der zwei Aussagen trägt, meldet bei Rot
nicht, welche der beiden gebrochen ist.

**Warum Punkt 39 zuerst `seed:` und `model:` prüft.** Ein Prüfpunkt auf die ABWESENHEIT einer
Zeile ist grün, sobald die Notiz leer, unvollständig oder gar nicht geschrieben ist — er wäre
also genau dann am freundlichsten, wenn am meisten kaputt ist. `buildImageNote` schreibt `seed`
und `model` **unbedingt** (kein `...(bedingung ? … : {})`), sie können deshalb nicht aus
demselben Grund fehlen wie `cfg`. Ohne beide meldet der Punkt Rot mit dem Klartext, dass die
Abwesenheit von `cfg` hier ohne Aussage wäre.

**Gegenprobe (gefahren 2026-09-06):** in `src/core/params.ts` den comfy-Zweig von
`cfg: ctx.mode === "comfy" ? null : …` auf `cfg: caps.cfg ? … : 1` zurückgestellt, deployt,
Lauf wiederholt → Punkt 39 **rot** mit „Notiz behauptet cfg: 1 — der Workflow rechnet mit
seinem eigenen Wert, das Plugin setzt ihn nie", Punkt 38 blieb dabei **grün**. Die zwei Punkte
trennen also tatsächlich, statt gemeinsam auf denselben Defekt zu reagieren.

### § 2026-08-24 (Phase 4) — Punkte 24/25: Bild-INHALT, nicht nur Bild-Form

SDXL-Turbo produzierte live ein rein schwarzes Bild — gültige PNG-Datei, richtige Größe,
Status „Bereit". 355 Unit-Tests, alle acht Gate-Schritte und die damals 24 Smoke-Punkte waren
grün, weil **keiner davon den Bildinhalt liest**. Ursache (s. `tools/convert/convert_model.py`,
Modulkopf): SDXLs VAE-Decoder überschreitet in fp16 unter dem WebGPU-EP den Wertebereich →
Inf → NaN im gesamten Ausgang, was als reines Schwarz rendert. ORTs CPU-Kernel zeigen den
Defekt nicht — ein Node-seitiger Test hätte ihn nie gesehen, nur ein Live-Lauf im Renderer.
Der Fix (`95471fd`) hält den VAE-Decoder fp32.

Punkt 25 ist die Gegenprobe dafür, dass ein künftiger fp16-Rückfall wieder auffällt. Er misst
über `pixelStats()` zwei unabhängige Größen am aktuell angezeigten `.lig-image`:

- **Luma-Standardabweichung** über alle Pixel (0–255-Skala), Grenze `CONTENT_STDDEV_MIN = 8`.
- **Zahl distinkter Farben** nach 4-Bit-Quantisierung je Kanal (max. 4096 Buckets), Grenze
  `CONTENT_COLORS_MIN = 64`.

Beide Grenzen müssen gleichzeitig reißen. Ein Grund allein reicht nicht: ein reines Schwarz
steht bei beiden auf 0/1, aber ein schwacher Farbverlauf könnte bei EINEM der beiden Maße knapp
über der Grenze liegen — bei beiden zugleich ist das unwahrscheinlich.

**Verifiziert gegen den Vor-Fix-Zustand** (nicht im laufenden Treiber selbst, sondern per
Live-Session-Swap, dieselbe Technik wie `phase1b-webgpu-bisect.md`/`phase3-fp32-vae-test.md`):
mit dem alten fp16-VAE-Decoder maß derselbe `pixelStats()`-Code Luma-Stddev **0,0** und **1**
distinkte Farbe an einem tatsächlich generierten Bild — der Punkt wäre korrekt ROT gewesen. Mit
dem fp32-Decoder aus `95471fd` maß er die Werte einer echten Fotografie (Stddev und
Farbenzahl weit über beiden Grenzen) — GRÜN. Kein Guard, den niemand rot gesehen hat.

Punkt 25 ist teuer (echte SDXL-Turbo-Session + echte Generierung, ~6,9 GB) und läuft deshalb
nur in derselben Bedingung wie 20–23 (`--builtin`, nicht `--quick`, Asset-Server erreichbar) —
ein übersprungener Lauf steht wie jeder andere in der Abschlusszeile, nie lautlos.

Punkt 24 kostet dagegen nichts Zusätzliches: er misst dasselbe Bild, das Punkt 15 (SD-Turbo)
ohnehin schon generiert. SD-Turbo hat keinen bekannten fp16-Defekt dieser Art — aber die
Prüfkette war bis Phase 4 komplett blind gegen ein rein schwarzes/uniformes Bild, und ob ein
späteres ORT-/Treiber-Upgrade dieselbe Fehlerklasse einträgt, ist unbekannt. Für eine
zusätzliche Messung an einem ohnehin vorhandenen Bild lohnt sich die Absicherung.

### § 2026-08-24 — Punkte 20–23 (zweite Modellstufe, SDXL-Turbo)

Vier neue Prüfpunkte für Spec 0.9 (SDXL-Turbo neben SD-Turbo). Alle vier hängen an
`--builtin` **und** einem erreichbaren `npm run smoke:assets` (lokaler Asset-Server auf
Port 7862) — ohne den überspringen sie sich **laut**, mit Begründung in derselben Zeile wie
jeder andere `skip`, nach der Lehre von `c984f47` (dort hatte sich ein Punkt lautlos
übersprungen, weil sein Pfad relativ zu `import.meta.url` statt `process.cwd()` auflöste).

**`.lig-model-pick` steht bewusst NICHT in `MODUS_REGLER`** (derselbe Grund wie
`.lig-denoise`, s. Kommentar dort): es hängt an ZWEI unabhängigen Bedingungen
(`showModelPicker` UND `downloadedModels.length > 1`), nicht am Modus allein. In
`MODUS_REGLER` geführt, würde Punkt 17 die zweite Sichtbarkeitsstufe als Defekt melden.

**`.lig-size-slot` steht seit 2026-08-25 aus demselben Grund NICHT mehr in `MODUS_REGLER`**
(Fund beim Release-Beweis von 0.9-dev, s. `§ 2026-08-25` unten): die Zeile hängt ebenfalls an
ZWEI unabhängigen Bedingungen — Modus UND `sizes.length > 1` (`viewmodel.ts`: `sizes` ist im
Server-Modus `null`, im builtin-Modus abhängig vom gewählten Modell). SDXL-Turbo hat zwei
Größen; im builtin-Modus MIT SDXL-Turbo ist die Zeile deshalb korrekt sichtbar. Punkt 17
wechselt aber nur den MODUS, nie das Modell — welches Modell dabei aktiv ist, erbt er aus
`settings.builtinModel`, wie es gerade in `data.json` steht. Stand dort `sdxl-turbo` (etwa
aus einer vorherigen Session oder einem vorher abgebrochenen Lauf), meldete Punkt 17
`.lig-size-slot → display:block` als Defekt, obwohl das Panel korrekt war. Die frühere
Absicherung (`runModelStageChecks` stellt `builtinModel` in seinem eigenen `finally` wieder
her, s. `§ 2026-08-24`) deckt nur ab, dass der EIGENE Lauf des Treibers nichts hinterlässt —
sie deckt nicht den Fall, dass der Vault den Wert schon VOR dem Start des Treibers trägt.
`.lig-size-slot` aus `MODUS_REGLER` zu nehmen behebt die Fehlerklasse strukturell, statt sie
an einer weiteren Stelle abzufangen: Punkt 22 misst die Zeile bereits explizit für beide
Modelle und bleibt die einzige Quelle dafür.

**Punkt 21 und Punkt 23 können sich beide selbst überspringen** — 21, wenn der
Zwei-Modell-Cache-Zustand weder schon vorliegt noch ohne Mock herstellbar ist, 23, wenn die
Zählerdatei des Asset-Mocks fehlt (kein Mock aktiv). Beide melden das LAUT, mit Begründung in
derselben Zeile wie jeder andere `skip` — ein Lauf ohne `npm run smoke:assets` protokolliert
das im Ergebnis, statt eine Lücke unsichtbar zu lassen.

Bei Punkt 21 gibt es zusätzlich eine Gegenprobe auf den Skip-Pfad selbst: übersprungen wird
NUR, wenn `downloadedModels.length < 2` **und** der Asset-Mock nicht erreichbar ist — liegt
der Zustand schon vor (ein früherer `--builtin`-Lauf hat beide Modelle dagelassen), misst der
Punkt trotzdem, ohne einen einzigen neuen Download. Ohne diese Unterscheidung würde ein
zufällig schon vollständiger Cache den Skip-Zweig nie zeigen und die Gegenprobe selbst wäre
ungeprüft. Aus demselben Grund misst Punkt 21 die Stufe „Toggle aus" ERST, nachdem der
Zwei-Modell-Zustand hergestellt ist, nicht davor (Review-Fund, zweite Runde): mit nur einem
geladenen Modell wäre diese Stufe auch dann grün, wenn `showModelPicker` komplett ignoriert
und die Sichtbarkeit allein an der Modellzahl hinge — sie testet den TOGGLE erst dann
wirklich, wenn die Modellzahl bereits als Erklärung ausscheidet.

Der Zwei-Modell-Zustand kommt bewusst über `npm run smoke:assets` (lokaler Spiegel von
`dist-assets/`), nicht über das HF-Repo — SDXL-Turbo ist 6,4 GB, und das wäre ein Missbrauch
der Leitung für einen Test. Es sind trotzdem echte Bytes, real durch `ModelStore.download()`
und die SHA-256-Prüfung gestreamt: kein Attrappen-Cache-Eintrag, sondern derselbe Weg wie ein
Nutzer-Download, nur von localhost statt huggingface.co.

Punkt 23 braucht eine eigene Zählerdatei: `.mock-assets-counts.json`
(`scripts/mock-assets.mjs`, seit diesem Task, Muster wie `.mock-a1111-counts.json`) — ohne
sie könnte ein abgebrochener Download nur am PANEL-Zustand gemessen werden, und genau das ist
die Fehlerklasse, die Punkt 19 schon einmal am Bild-Server gezeigt hat: der Zustand kann
korrekt aussehen, während Bytes trotzdem geflossen sind.

**Punkt 23 stellt seine eigene Vorbedingung her, statt sie anzunehmen** (Review-Fund, zweite
Runde): läuft er nach Punkt 21, liegt `sdxl-turbo` bereits vollständig im Cache —
`ModelStore.download()` filtert gecachte Dateien VOR jedem Netzaufruf heraus
(`src/obsidian/model-store.ts`), also wäre die Null-Messung unten bedeutungslos, ganz gleich
ob der Abbruch-Klick überhaupt wirkte. Der Punkt entfernt `sdxl-turbo` deshalb zuerst selbst
und bestätigt die Entfernung, unabhängig von der Aufrufreihenfolge. **Und er trägt eine
Positiv-Kontrolle:** nach der Null-Messung bestätigt er einen zweiten Download-Versuch und
verlangt dort eine echte Zunahme im Zähler — ohne sie bewiese die Null-Messung nichts über
den Abbruch, sie sähe identisch aus, wenn der Zähler aus irgendeinem Grund (etwa demselben
Slash-Fehler, den die Selbstprüfung dieses Tasks schon einmal fand) permanent 0 meldete. Eine
nicht lesbare Zählerdatei nach einer der beiden Messungen zählt als ROT, nicht als 0 —
`mockAssetCounts()` gibt bei einem fehlenden ODER kaputten (torn write) Read `null` zurück,
und ein `null ?? vorher`-Fallback hätte einen Messfehler in einen stillen Erfolg verwandelt.

### § 2026-08-25 — Treiber-Defekte aus dem Release-Beweis von 0.9-dev

Ein voller Lauf mit `builtinModel: "sdxl-turbo"` in der Vault-`data.json` kam 18/23 mit fünf
roten/übersprungenen Punkten zurück. Gemessen, nicht vermutet: vier davon (14, und die
Folge-Skips 15/16/24) gingen auf eine einzige Ursache zurück, ein fünfter (17, s. u.) war
unabhängig. Beide Ursachen sind Treiber-Defekte, keine Produktregression.

1. **Punkt 14s Download-Frist war fix und die Fehlermeldung falsch.** Die Konstante
   `30 * 60_000` stammte aus der Zeit, in der SD-Turbo (~2,5 GB) das einzige eingebaute Modell
   war; die Meldung bei Zeitüberschreitung sprach aber von „15 min" — nie angepasst, seit
   irgendjemand die Frist zuletzt änderte. SDXL-Turbo ist mit ~6,4 GiB das 2,8-Fache, und ein
   voller lokaler Download (inkl. SHA-256-Verifikation + Cache-API-Schreiben) lief in diesem
   Lauf über die alten 30 min hinaus — der Mock-Server-Log zeigt alle 21 SDXL-Dateien
   vollständig ausgeliefert, zweimal (ein zu spät fertiggewordener erster Versuch, ein zweiter
   aus `runModelStageChecks`). Fix: `downloadDeadlineMs()` — ein Sockel (10 min, deckt
   Verbindungsaufbau/Cache-API-Vorbereitung auch bei einem winzigen Modell) plus ein Aufschlag
   je GB (8 min/GB), aus der Bytezahl des gerade AKTIVEN Modells berechnet, nicht mehr
   hartcodiert. Kalibrierungspunkt: SD-Turbos ~2,5 GB ergeben ≈ 30 min (die alte Konstante,
   also keine Regression für das kleinere Modell); SDXL-Turbo ergibt ≈ 61 min. Die
   Fehlermeldung liest jetzt denselben Wert, den `pollUntil` auch bekommen hat — sie kann
   nicht mehr von ihm abweichen.

2. **Punkt 17 nahm eine Vorbedingung an, statt sie herzustellen.** `.lig-size-slot` stand in
   `MODUS_REGLER`, obwohl seine Sichtbarkeit — seit SDXL-Turbo zwei Größen hat — an ZWEI
   unabhängigen Bedingungen hängt, nicht am Modus allein (dieselbe Fehlerklasse wie
   `.lig-model-pick`/`.lig-denoise`, s. oben). Punkt 17 wechselt nur `setEngine()`, nie das
   Modell — welches Modell dabei aktiv ist, erbt er unverändert aus `settings.builtinModel`.
   Stand dort (wie in diesem Lauf) `sdxl-turbo`, ist die Zeile im builtin-Modus ZU RECHT
   sichtbar, und Punkt 17 meldete das trotzdem als „builtin trotzdem sichtbar". Eine frühere
   Absicherung (`runModelStageChecks` stellt `builtinModel` im eigenen `finally` wieder her,
   s. `§ 2026-08-24`) deckt nur den eigenen Lauf des Treibers ab, nicht den Fall, dass der
   Vault den Wert schon vor dem Start trägt. Fix: `.lig-size-slot` aus `MODUS_REGLER` entfernt
   (Kommentar dort erklärt die zwei Bedingungen) — Punkt 22 misst die Zeile bereits explizit
   für beide Modelle und bleibt die einzige Quelle dafür, statt dass Punkt 17 sie ein zweites
   Mal, aber falsch, mitprüft.

3. **Punkte 13–15 erbten `builtinModel` ebenfalls, aus demselben Grund wie Punkt 17.** Sie
   setzen nur `setEngine("builtin")` (Punkt 13), messen aber gegen SD-Turbo (Punkt 15 prüft
   `model: sd-turbo` in der Notiz) — welches Modell dabei tatsächlich aktiv ist, kam
   unverändert aus `data.json`. Stand dort `sdxl-turbo` (derselbe Vault-Zustand, der schon
   Punkt 17 traf), schlug Punkt 13 den 7-GB-CTA statt des 2,5-GB-CTA vor, Punkt 14 lief 66 min
   statt der kalibrierten ≈30 min, 15/16/24 wurden mangels Vorbedingung übersprungen. Fix:
   Punkt 13 stellt `builtinModel` jetzt selbst auf `DEFAULT_BUILTIN_MODEL_ID` (sd-turbo), ein
   gemerkter Originalwert wird in einem `finally` um den gesamten Block 13–16/24
   zurückgestellt — auch bei jedem frühen `return` (GPU fehlt, Vorbedingung nicht erreicht),
   nicht nur beim regulären Durchlauf.

**Die Klasse hinter allen drei Funden: der Treiber ETABLIERT Modi (`setEngine`), aber ERBT
Modelle/Cache-Zustand aus `data.json`, statt sie ebenso zu etablieren.** Das ist kein
Einzelfall — es ist beim dritten Mal an derselben Stelle (Punkt 23 am 2026-08-24, Punkt 17 und
13–15 am 2026-08-25) aufgetreten, immer mit demselben Symptom: ein zufälliger Vault-Vorwert
lässt einen Punkt eine falsche Ursache messen oder eine harmlose Kombination als Defekt
melden. **Wer einen neuen Punkt schreibt, der von `builtinModel`, `engine`, Cache-Inhalt oder
einem Download-/Nicht-Download-Zustand abhängt, muss diesen Zustand selbst herstellen — nicht
annehmen, dass ein vorheriger Punkt ihn schon passend hinterlassen hat.** Ein Blick in
`scripts/gui-smoke.ts` zeigt das Muster an den Stellen, die es schon richtig machen:
`runModelStageChecks()` und `runSdxlContentCheck()` merken den Ausgangswert vor einem Block
und stellen ihn in einem `try`/`finally` wieder her, unabhängig vom Ausgang.

Kein neuer Lauf ist an dieser Stelle festgehalten — alle drei Fixes wurden gegen Lesen + `npm
run gate` verifiziert, nicht gegen einen echten Download (der reale Beweislauf folgt separat
und trägt dann seinen eigenen Log-Eintrag oben in diesem Abschnitt).

## Was der Treiber am Wirt verändert (und zurücksetzt)

Alles davon wird vorher gemerkt und im `finally` zurückgeschrieben — auch nach einem Abbruch:

- `createMode` → `"note"` (sonst gäbe es keine Notiz zu prüfen)
- `outputFolder` / `noteFolder` → `_lig-gui-smoke`
- **die Historie** — der Lauf schreibt zwei Einträge, die niemand bestellt hat
- **der Steps-Regler** — Punkt 17 schiebt ihn auf das Server-Maximum, um das Klemmen zu
  erzwingen, und stellt den Vorwert danach wieder her (UI-Zustand, kein Setting: der
  `finally`-Block erfasst ihn nicht)
- `engine` → `"server"` für 1–11 (und zurück), mit `--builtin` außerdem `assetBaseUrl` → der
  lokale Asset-Server; **der Modell-Cache** der eingebauten Engine wird in Punkt 13 geleert und
  in 14 neu gefüllt — er wird NICHT zurückgesetzt (ein Wiederholungslauf überspringt den Download
  nicht, weil 13 ihn wieder leert; das ist Absicht: 14 misst den echten Weg)
- `builtinModel` / `showModelPicker` — Punkte 20–23 schalten beide mehrfach um, `engine` geht
  für ihre Dauer zusätzlich auf `"builtin"` (Punkt 19 direkt danach braucht wieder `"server"`).
  Beides wird wie oben gemerkt und im `finally` zurückgeschrieben; **der SDXL-Turbo-Cache-
  Eintrag bleibt NACH dem Lauf bestehen**, aus demselben Grund wie beim SD-Turbo-Cache oben —
  ein Wiederholungslauf von Punkt 21 soll den 6,4-GB-Download nicht jedes Mal neu erzwingen.
- `endpoint` / `comfyWorkflowPath` / `engine` → für Punkte 35–38 (`runComfyChecks`): eigener
  `finally`, unabhängig vom Rest (Muster wie Punkt 18e/`runRecheckCheck`) — beide Werte werden
  vor dem ersten Zugriff gemerkt und exakt zurückgeschrieben, nicht auf einen Default gesetzt.
  Zwei zusätzliche Dateien `_lig-gui-smoke/comfy-valid.json` und `comfy-broken.json` entstehen
  dabei und werden mit dem Ordner selbst entfernt (kein eigenes Aufräumen nötig).

Der Ordner `_lig-gui-smoke` wird angelegt und gelöscht. **Existiert er bereits, bricht der
Treiber ab** statt zu löschen: ein vorgefundener Ordner könnte fremde Dateien tragen.

Der Reroll-Lauf (Punkt 11) wird bewusst ausgewartet, bevor die Historie zurückgesetzt wird —
sonst schöbe er seinen Eintrag hinterher nach und der Smoke hinterließe genau das, was er
aufräumen wollte.

## Durchläufe

<!-- Neueste zuerst. CORE-TEST-02 verlangt den festgehaltenen Lauf als Nachweis. -->

### 2026-09-05 (abends) · 0.12-dev, Final-Review-Fixes · Staging-Vault · beide Mocks · **34/34 grün** — nach zwei roten Zwischenständen, die beide echte Befunde waren

Lauf nach der Fix-Welle zum Final-Review (K1 `denoising 0`, W1 API-Vertrag, W2 Aufräumen von
Punkt 30, G1–G5). Vier Anläufe, und die drei ersten sind der eigentliche Ertrag:

| Anlauf | Ergebnis | Was daran echt war |
|---|---|---|
| 1 | **33/34** — Punkt 26 rot | Das NEUE Kriterium war falsch, nicht das Plugin: strikte Monotonie `RMSE(A,0.5) < RMSE(A,0.625) < RMSE(A,0.75)` reißt bei SD-Turbo (14.48 / **23.08** / 21.42), während SDXL-Turbo im selben Lauf monoton ist (19.13 / 34.89 / 36.59). Kriterium auf **Unterscheidbarkeit** umgestellt (s. Punkte 26/27 oben). |
| 2, 3 | **Abbruch nach Punkt 4**: `Zeitüberschreitung: Runtime.evaluate` | Treiber-Defekt, durch Anlauf 1 erst ausgelöst: Punkt 12 fuhr **alle** Settings-Suchen in EINEM `Runtime.evaluate`, dessen Laufzeit linear mit der Zahl sichtbarer Zeilen wächst. Nach Anlauf 1 lagen **beide** eingebauten Modelle im Cache → zwei bedingte Zeilen mehr („Modell", „Modellwahl im Panel anzeigen"), 8 Suchen wurden 10, und der Aufruf riss `Cdp.send`s 30-s-Grenze. Am Plugin war nichts defekt. |
| 4 | **34/34 grün** | — |

**Was Anlauf 2/3 lehren, über diesen Treiber hinaus:** es ist derselbe Fehlermodus wie beim
alten `waitFor` (AGENTS: *Mutation und Wartephase trennen*) — eine Wartezeit im Renderer ist
unsichtbar, bis genug davon zusammenkommt, und die Schwelle wandert mit dem **Datenstand**, nicht
mit dem Code. Punkt 12 stand seit Monaten knapp unter der Grenze; erst ein voller Modell-Cache
schob ihn darüber. Die Reparatur zieht die Schleife nach Node: eine Suche = ein `evaluate`, jeder
Aufruf rund zwei Sekunden, unabhängig von der Zeilenzahl. **Ein Prüfpunkt, dessen Laufzeit an der
gemessenen Datenmenge hängt, ist eine Zeitbombe — auch wenn er jahrelang grün war.**

Bestätigt in Anlauf 4 (Zahlen deterministisch identisch zu Anlauf 1): Punkt **25** grün
(Luma-Stddev 45.1, 62 Stufen) — er misst nach dem W2-Fix wieder txt2img, nicht mehr die in
Punkt 30 gesetzte Vorlage; Punkte **26/27** grün mit der Zwischenstufe 0.625 (SD-Turbo 17.82 von
0.5 und 19.59 von 0.75 entfernt, SDXL-Turbo 29.88 / 23.12 — Schwelle 2, Rasterung wäre exakt 0).
Die Aufräum-Warnung aus Punkt 30 („Vorlage ließ sich nicht entfernen") blieb in allen Anläufen
aus.

### § 2026-09-06 (abends) — Punkt 40: die Groessenliste, gerendert

**Warum ein eigener Punkt und nicht eine Zeile in 17.** Punkt 17 misst SICHTBARKEIT von
Reglern über `getComputedStyle`; hier geht es um den INHALT eines Dropdowns. Beide wechseln
den Modus, aber ein Punkt, der zwei verschiedene Fragen trägt, meldet bei Rot nicht, welche
davon gebrochen ist — dieselbe Trennung wie bei 38/39.

**Warum die builtin-Richtung die wichtigere ist.** Der Anlass von 0.12.1 war eine
Beschränkung, die in der `SIZES`-Liste saß statt im Backend: Draw Things mit Flux kann bis
2048, das Dropdown bot nur 1024. Die naheliegende Reparatur — „dann nimm überall `SIZES`" —
wäre der Fehler in die andere Richtung gewesen: das Panel böte dann Formate an, die die
eingebaute Engine gar nicht rechnen kann. Ein Punkt, der nur prüft, dass `2048x1152`
*auftaucht*, bliebe dabei grün.

**Robust gegen die Modellwahl, gemessen statt angenommen:** SD-Turbos Katalog ist
`[512x512]`, SDXL-Turbos `[512x512, 1024x1024]` — `2048x1152` kommt in keinem builtin-Katalog
vor. Der Punkt braucht deshalb weder ein geladenes Modell noch einen bestimmten
`builtinModel`-Stand. Käme je ein Modell mit großem Katalog dazu, ist diese Zeile die Stelle,
an der man es merkt.

**Zwei Gegenproben, je eine pro Richtung — gefahren 2026-09-06 abends:**

| Mutation | Meldung | Ergebnis |
|---|---|---|
| `2048x1152` aus `SIZES` entfernt | „Server-Dropdown ohne 2048x1152 (hat: 512x512, …)" | ✅ rot, 5/6 |
| `sizeOptions = SIZES` statt `vm.controls.sizes ?? SIZES` | „builtin-Dropdown bietet 2048x1152 an — dort speist der Modellkatalog, nicht SIZES" | ✅ rot, 5/6 |
| beide zurückgenommen | — | grün, 6/6 |

Erst die zweite Zeile belegt, dass der Punkt die Trennung der Quellen misst und nicht bloß
das Vorhandensein einer Zeichenkette. Eine einzelne Gegenprobe hätte hier gereicht, um sich
sicher zu fühlen, und die falsche Hälfte abgesichert.

### 2026-09-06 (abends) · 0.14-dev (Punkt 40) · **Zweitinstanz** (eigenes Profil, Port 9347) · ohne Mocks · **6/6 grün, 14 übersprungen**

`--quick` gegen den Staging-Vault, weder A1111- noch ComfyUI-Mock gestartet — der neue Punkt
braucht beides nicht (er wechselt den Modus und liest Optionen). Gemessen im builtin-Modus mit
**SDXL-Turbo** als gewähltem Modell, daher die zwei Optionen in der Erfolgsmeldung:

```
✓ 40. Die grossen Formate stehen im Server-Dropdown und NICHT im builtin
     — server 10 Optionen inkl. 2048x1152 · builtin 2 ohne 2048x1152 (512x512, 1024x1024)
```

Die 14 übersprungenen sind dieselben wie im Lauf davor (kein Server, keine Assets, kein
ComfyUI-Mock) — ein `--quick`-Lauf ohne Mocks ist kein bestandener Smoke, sondern ein
Teil-Lauf, und die Abschlusszeile sagt das.

### 2026-09-06 (nachmittags) · 0.13.0 + Punkt 39 · **Zweitinstanz** (eigenes Profil, Port 9347) · ComfyUI-Mock (8189), **A1111 bewusst AUS** · **10/10 grün, 9 übersprungen**

Zweck des Laufs war die Umgebung selbst: gemessen wurde, ob ein Treiberlauf **ohne**
A1111-Server rote Punkte hinterlässt, die nichts über den Prüfling sagen — plus die Gegenprobe
für den neuen Punkt 39.

**Aufbau, der die Aussage trägt:** Der A1111-Mock lief NICHT, seine Zählerdatei
`.mock-a1111-counts.json` lag aber vom Vormittag noch da — genau der Zustand, in dem Punkt 19
seinen eigenen Guard für erfüllt hielt und rot wurde. Der ComfyUI-Mock lief. Gemessen wurde
gegen eine **zweite Obsidian-Instanz** mit eigenem `--user-data-dir` und Port 9347, weil an der
regulären zwei fremde Vaults offen standen (`10_Pallas`, `AUSDRUCKEN_UND_LOESCHEN`) und die
Treiber `clickReal` benutzen, das Fenster nach vorn reißt.

**Ergebnis, drei Läufe:**

| Lauf | 18e / 19 | 36 | 39 |
|---|---|---|---|
| vorher (Bestand) | **rot** | **rot** (Sprache) | — (existierte nicht) |
| nachher | übersprungen | grün | **grün** |
| Mutation in `hardenParams` | übersprungen | grün | **rot** — „Notiz behauptet cfg: 1" |

Abschlusszeile des Bestätigungslaufs: **10/10 grün · 9 übersprungen (NICHT gemessen)** — kein
roter Punkt übrig, der nur an der Umgebung liegt. Das war die Abnahmebedingung.

⚠️ **Was dieser Lauf NICHT belegt:** 18e und 19 selbst. Sie sind übersprungen, also ungemessen —
der Lauf zeigt, dass ihr Ausbleiben jetzt als Ausbleiben gemeldet wird, nicht dass sie
funktionieren. Ihre letzte echte Messung ist der 0.13.0-Freigabe-Lauf vom Vormittag. Ein
Freigabe-Smoke braucht weiterhin beide Mocks.

**Drei Umgebungs-Fallen, gemessen statt vermutet:**

- **`obsidian://open?path=…` registriert den Staging-Vault unter Obsidian 1.14.0 nicht mehr.**
  Zweimal versucht (URL-kodiert und mit rohen Slashes), beide Male ohne Wirkung: kein neues
  Fenster, kein Eintrag in `obsidian.json`. Die Dach-`AGENTS.md` führt diesen Weg als Ausweg für
  genau diesen Fall — gemessen wurde er dort unter 1.13.7. Ob 1.14 ihn absichtlich geschlossen
  hat, ist offen; der Weg über ein eigenes Profil mit selbst geschriebener `obsidian.json` trägt.
- **Port 9333 aus dem Doku-Beispiel war belegt** (eine `vault-rag`-Session), der eigene Start
  bekam ihn nicht, und `curl` antwortete mit dem Fenstertitel der FREMDEN Instanz — was sich wie
  „meine Instanz hat den falschen Vault geöffnet" liest. Aufgefallen ist es an einer
  Cross-Session-Nachricht, nicht an einer Fehlermeldung.
- **Die Sprache kommt nicht aus `localStorage`** (s. Voraussetzungen oben) — das war Punkt 36.

### 2026-09-05 · 0.12-dev (img2img-Steuerung A+B) · Staging-Vault · A1111-Mock (7861) + Asset-Mock (7862) · **34/34 grün**, zwei neue Punkte mit Gegenprobe

Task 7 des Plans `2026-09-05-img2img-steuerung-plan`: Tasks 1–4 haben den Steps-Katalog auf
`max: 8` erweitert (statt 4), `denoiseEntry` interpolieren lassen, `hardenParams` reicht
`denoising` seither unquantisiert durch, und `controls.denoiseRaster`/`rasterFor()` sind
ersatzlos entfernt (der Denoise-Regler nutzt seither konstant `DENOISING.min`/`.step`, nicht
mehr `1/steps`). Zwei neue Punkte messen das am Wirt:

- **29. Steps-Regler erreicht 8.** Gemessen am gerenderten `max`-Attribut von `.lig-steps`
  (nicht am Zustand) — direkt nach dem Umschalten auf „Eingebaut“, unabhängig vom GPU-Zustand,
  weil `stepsMax` rein aus dem Katalog kommt (`backendCapabilities`).
- **30. Denoise-Wert (0.6) kommt UNVERÄNDERT in der Ergebnis-Notiz an.** Baut auf dem Bild aus
  Punkt 15 auf: „als Vorlage“ (`.lig-init-from-result`) speichert es und macht es zur Vorlage,
  danach ist `.lig-denoise` sichtbar. Regler auf 0.6, „Generieren“, dann „Erstellen“
  (Knopf-Label `generate.button.create`) — Ergebnis-Notiz gelesen, `denoising:`-Zeile geprüft.
  ⚠️ Der zweite Klick ist **„Erstellen“**, nicht „Speichern & als Vorlage“ — letzteres war der
  Klick DAVOR (`.lig-init-from-result`, setzt die Vorlage). Wer die Gegenprobe nach der
  ursprünglichen Fassung dieses Absatzes nachfuhr, klickte zweimal denselben Knopf und bekam
  nie eine Notiz.
  Bis 0.11 hätte hier 0.75 gestanden (1/steps-Raster).

**Beide Gegenproben rot gesehen, danach zurückgenommen (`git diff` leer):**

| Eingriff | Ergebnis |
|---|---|
| `sd-turbo.steps.max` in `model-manifest.ts` auf `4` zurückgesetzt | `✗ 29. Steps-Regler erreicht 8 (Katalog-Erweiterung Task 1) — max=4` |
| in `params.ts` nach `const rawDenoising = …` die Quantisierung wieder eingebaut: `const denoising = rawDenoising === null ? null : Math.round(rawDenoising * steps) / steps;` | `✗ 30. Denoise-Wert (0.6) kommt UNVERAENDERT in der Ergebnis-Notiz an — 4 s · denoising: 0.5 in der Notiz` (0.6 aufs 1/4-Raster gerundet) |

**Dritter Befund, kein neuer Punkt, sondern eine Reparatur an Punkt 17.** Dessen
Denoise-Raster-Teilmessung (seit 2026-08-31) prüfte genau die jetzt entfernte Kopplung: Steps
4→3 sollte den Denoise-Regler auf ein 1/3-Raster ziehen. Nach Task 4 ist das Gegenteil richtig
— eine Steps-Änderung darf `.lig-denoise` gar nicht mehr anfassen —, und der erste volle Lauf
dieser Runde bestätigte das als echten Fund, nicht als Treiber-Defekt: `✗ 17 … Denoise-Raster
(Steps 4→3): min/step 0/0.05 (erwartet 0.3333…), value 0.75 (erwartet 0.6666…)`. Die
Teilmessung ist umgedreht: Steps 4→3, Denoise auf 0.75, danach müssen min/step/value/Beschriftung
unverändert bleiben (`0`/`0.05`/`0.75`/„0.75"). Kein Treiber-Nebenbefund im Sinne von
`docs/SMOKE.md`s sonstigen Einträgen — die Reparatur folgt direkt aus der in Task 4
dokumentierten Verhaltensänderung, nicht aus einem Bug im Treiber selbst.

Punkte **26/27** (RMSE zur Vorlage, die Regressionsbremse für den Engine-Umbau) blieben in
allen drei vollen Läufen dieser Runde unverändert grün (SD-Turbo 10.0/51.2, SDXL-Turbo
9.1/46.5 — identisch zum 2026-08-31-Lauf): der Umbau von Task 1–4 hat die Bildwirkung nicht
verändert.

⚠️ **Nachtrag Final-Review 2026-09-05: dieser Absatz war schwächer, als er klang.** Beide Punkte
maßen nur `str 0.25` und `str 1.0` — bei steps=4 sind das **exakte Punkte des alten
1/steps-Rasters**, dort ist „neu == alt" per Konstruktion, und „unverändert grün" belegte für den
Umbau folglich nichts. Seit dem Review messen sie zusätzlich `0.5 / 0.625 / 0.75`; **0.625 ist im
alten Raster gar nicht erreichbar** — käme die Quantisierung zurück, wäre sein Bild mit dem von
0.5 oder 0.75 **byte-identisch** (gleicher Seed, gleicher Prompt, gleiche Rechnung), RMSE also
exakt 0. Genau das prüft der Punkt: `RMSE(0.5, 0.625)` und `RMSE(0.625, 0.75)` müssen über
`ZWISCHENSTUFE_MIN_RMSE` liegen. Kosten: drei zusätzliche Generierungen je Modell.

⚠️ **Der erste Entwurf dieses Kriteriums forderte stattdessen strikte Monotonie
`RMSE(A,0.5) < RMSE(A,0.625) < RMSE(A,0.75)` — und wurde im Lauf vom 2026-09-05 zu Recht rot.**
Gemessen: SD-Turbo `14.48 / 23.08 / 21.42` (0.625 liegt **weiter** von der Vorlage weg als 0.75),
SDXL-Turbo im selben Lauf monoton `19.13 / 34.89 / 36.59`. Das ist kein Defekt, sondern der
Aufbau: bei steps=4 startet 0.5 am Anker 2 (zwei UNet-Schritte), 0.625 und 0.75 beide am Anker 1
(drei Schritte) mit interpoliertem Sigma **und** interpoliertem Timestep — und SD-Turbo ist auf
genau vier Timesteps destilliert, ein Zwischenwert liegt für sein UNet leicht außerhalb der
Verteilung. „Mehr denoising = weiter weg" gilt grob (das prüft die 0.25-gegen-1.0-Monotonie
weiterhin), aber **nicht zwischen benachbarten Ankern**. Ein Kriterium, das nur bei einem der
beiden Modelle stimmt, misst das Modell statt den Umbau — die Lehre ist dieselbe wie beim
Roundtrip-Boden: die Schwelle gehört an die Messung, nicht an die Erwartung.

### 2026-09-03 · 0.11.1 + Nachlese · Staging-Vault · beide Mocks · **32/32 grün**, Punkt 21 mit Gegenprobe

Das Modell-Dropdown im Panel hatte keine sichtbare Beschriftung, während das Größen-Dropdown
direkt daneben eine hat (Nachlese 0.9.0). Ergänzt als `t("generate.model")` mit eigener Klasse
`.lig-model-pick-label` — eigene Klasse, weil sie **mit** dem Dropdown verschwinden muss: ein
Label ohne sein Bedienelement ist schlimmer als gar keines, es behauptet eine Einstellung, die
nicht da ist. Dieselbe Lösung wie bei `.lig-cfg-label`.

**Punkt 21 misst die Beschriftung mit, statt sie in einen eigenen Punkt zu legen.** Zwei
getrennte Punkte könnten auseinanderlaufen, ohne dass einer rot wird — genau die Lage, die hier
überhaupt erst entstanden ist.

| Lauf | Punkt 21 | |
|---|---|---|
| mit Label-Toggle | `aus:none · 1 Modell:none · 2 Modelle:block · Label an:block/aus:none` | ✅ 32/32 |
| Toggle ausgebaut (Gegenprobe) | „Beschriftung bei verborgenem Picker: display block (erwartet none)" | ✅ rot, 31/32 |

Die Gegenprobe ist der Punkt: ohne sie wäre die neue Zeile eine Behauptung. Sie hat auch den
richtigen Defekt benannt — nicht „irgendetwas stimmt nicht", sondern welche Hälfte.

### 2026-09-03 (nachts) · 0.11.1 · Staging-Vault · A1111-Mock (7861) · `--quick` **11/11 grün** — Notices sind eine geteilte Region

Punkt 2 räumte vor dem Klick jede vorhandene `.notice` per `remove()` weg und las danach die
erste im DOM. Der zweite Teil war bekannt (Dach-Task, 10 von 16 Treibern); **der erste ist der
schlimmere und stand in keiner Task**: die Klasse gehört allen Plugins, das Leerräumen löscht
also fremde Meldungen — an einer Instanz mit siebzehn offenen Fenstern ein Eingriff in eine
fremde Session, den niemand bemerkt, weil der eigene Lauf danach grün ist.

Drei Läufe, drei hergestellte Zustände:

| Zustand | Erwartet | Gemessen |
|---|---|---|
| fremde Notice steht **vor** dem Klick da | Punkt grün, fremde Notice **unversehrt** | ✅ grün; danach im DOM nachgesehen: `{"fremd":1}` — sie lebt |
| fremde Notice erscheint **im Messfenster** | Punkt grün, fremde ignoriert | ✅ „Server OK — Modell: mock-model.ckpt · 1 fremde Notice(s) ignoriert" |
| kein Eingriff | Punkt grün, keine Hinweise | ✅ 11/11 |

**Die zweite Gegenprobe hat die erste Lösung widerlegt** — der eigentliche Ertrag der Nacht. Der
erste Entwurf sammelte alle *neuen* Notices und übersprang den Punkt als „nicht entscheidbar",
wenn mehrere auftauchten (Referenzform aus `koda-agent`, `e907f4c`). Gemessen wurde er dabei
**rot mit „fremde Meldung"**: das `waitFor` bricht bei der ersten neuen Notice ab, und eine
fremde, die vor der eigenen erscheint, ist dann der einzige Treffer. Die
„mehrere-neue"-Erkennung greift nur, wenn beide im selben Poll-Fenster landen — ein Zufall.

Die tragfähige Lösung erkennt die **Herkunft**, und zwar ohne sie zu duplizieren: `t(key,
SENTINEL)` am Sentinel gespalten liefert das Präfix vor der Einsetzstelle („Server OK — Modell:
"). Der Punkt wartet auf eine Notice mit diesem Präfix (oder auf den `serverFail`-Text) und
ignoriert alles andere, protokolliert es aber. Das ist **nicht** zirkulär: die Herkunft erkennt
das Präfix, gemessen wird der Modellname dahinter. Bricht die Vorlage (kein `{0}` mehr), wirft
der Treiber — eine stille Rückkehr zum Raten ist ausgeschlossen.

⚠️ Falle des String-Splicing-Entwurfs, hier zum zweiten Mal: der Block steht **in** einem
Template-Literal. Ein Backtick im Kommentar beendet es, und der Fehler kommt als `TS1005` an
ganz anderer Stelle an. Steht jetzt als Warnung über dem Block.

### 2026-09-02 (abends) · 0.12-dev (Teil-Nachladung) · Staging-Vault · A1111-Mock (7861) + Asset-Mock (7862) · **32/32 grün** — und Punkt 13 hat den Fix korrigiert

Neuer **Punkt 28**: er nimmt EINE Datei aus dem Cache (den `vae_encoder` — den echten
0.11-Migrationsfall) und liest, was das Panel dann verspricht. Gemessen: CTA „Fehlende 68 MB
herunterladen", Text nennt beide Zahlen, Knopf nennt die Gesamtgröße nicht. Er stellt den Zustand
selbst her und räumt ihn wieder auf, weil die Punkte danach ein geladenes Modell brauchen.

**Der eigentliche Ertrag des Laufs war aber ein Nebenbefund an Punkt 13** — und er ist ein
Musterfall für „grün heißt nicht richtig":

| Lauf | Punkt 13 (leerer Modell-Cache) | Bewertung |
|---|---|---|
| 1 | CTA „**Fehlende 2.6 GB** herunterladen" | grün — aber falsch |
| 2 | CTA „Modell herunterladen (2.6 GB)" | grün und richtig |

Punkt 13 lief im ersten Lauf **grün durch**, weil er den CTA nur auf „nicht leer" prüfte. Die
Formulierung stimmte trotzdem nicht: `removeModel()` entfernt das Modell, **nicht die ORT-WASM** —
die gehört keinem Modell und bleibt im Cache. Damit war `missingBytes` auch bei leerem
Modell-Cache echt kleiner als die Summe, die Teil-Bedingung griff, und ein Nutzer vor einem
Komplett-Download las „Fehlende 2.6 GB". Wahr und irreführend zugleich.

Zwei Konsequenzen, beide im Code:

- Die Entscheidung vergleicht jetzt, was der Nutzer **liest** (`partialDownloadLabel`:
  `formatBytes(fehlend) !== formatBytes(gesamt)`), nicht die Zahlen. Ein Zahlenvergleich mit
  Toleranz wäre eine willkürliche Schwelle gewesen.
- **Punkt 13 vergleicht den CTA jetzt exakt** gegen die Gesamt-Formulierung. Ein Prüfpunkt, der
  „irgendein Text" akzeptiert, kann eine falsche Formulierung nicht sehen — er war gegen genau
  den Defekt blind, den der Fix daneben einführte.

Nebenmessung, weil sie eine verbreitete Kostenannahme widerlegt (Anlass: Meldung aus der
`epub-exporter`-Session): ein echtes builtin-Bild (SD-Turbo, 4 Steps, warmes Modell) braucht
**11 s**, der komplette Modell-Download gegen den lokalen Mock **19 s**. „Braucht eine GPU und
dauert Minuten" stimmt nirgends; die großen Zahlen im Treiber sind Obergrenzen, keine Erwartung.

### 2026-09-02 · 0.11.0 · Staging-Vault · A1111-Mock (7861) · **18/18 grün, 2 übersprungen** — Build-Guard mit drei Gegenproben

Anlass war nicht ein Prüfpunkt, sondern die Vorbedingung: der Treiber prüft seit heute selbst,
ob er überhaupt diesen Checkout misst (s. § Voraussetzungen, Punkt 3). Ein Guard, der nur im
Gutfall gesehen wurde, ist unbelegt — deshalb **alle drei Ausgänge einzeln hergestellt**:

| Hergestellter Zustand | Erwartet | Gemessen |
|---|---|---|
| 58 Bytes an die `main.js` **im Vault** angehängt | Abbruch, beide Größen im Text | ✅ „im Vault: 215.481 / gebaut: 215.423", sha1 gekürzt daneben |
| 29 Bytes an das `styles.css` **im Vault** angehängt | Abbruch, CSS-Begründung | ✅ „im Vault: 9.053 / gebaut: 9.024 · Punkt 17 misst gerendertes CSS" |
| `main.js` im **Repo** weggenommen (kein Vergleichsstand) | Warnung, Lauf geht weiter | ✅ 11/11 grün **plus** „⚠️ Herkunft des gemessenen Builds UNGEPRUEFT" in der Abschlusszeile |

Danach regulär deployt und voll gefahren: **18/18 grün**, übersprungen 24 und 18d (ohne
`--builtin`). Im Gutfall sagt der Guard nichts — das ist Absicht: er meldet sich, wenn etwas
nicht stimmt, nicht wenn alles stimmt.

⚠️ **Das Fenster für den Staging-Vault ließ sich nicht per IPC öffnen.** `ipcRenderer.send(
"vault-open", pfad, true)` aus dem Renderer eines fremden Fensters bewirkte nichts (die
Fensterliste blieb unverändert) — der Weg, der funktioniert, ist `open
"obsidian://open?vault=local-image-generator"`. Der Kopfkommentar des Treibers empfiehlt noch
den IPC-Weg; das deckt sich mit dem Dach-Nachtrag vom 2026-09-01 und ist dort nachzuziehen.

Nebenbefund aus demselben Lauf: an der Instanz hingen vier fremde Vaults
(`10_Pallas`, `3d-codeblocks`, `json_viewer`, `koda-agent`) — der Lauf lief per Mitnutzung,
ohne Quit, und der CDP-Lock ging danach an die wartende koda-agent-Session zurück.

### 2026-08-30 (abends) · 0.10.0-dev (`recheck()`) · Staging-Vault · A1111-Mock (7861) + Asset-Mock (7862) · **29/29 grün**

Derselbe Aufbau wie der Lauf darunter, ein Prüfpunkt mehr: **18e** misst `recheck()` an der
`main.ts`-Naht. Sein mittlerer Schritt ist der eigentliche Beweis — nachdem der Endpunkt wieder
auf den erreichbaren Mock zeigt, muss `status()` **weiter** `unreachable` melden. Täte es das
nicht, hätte sich der Zustand nebenbei aufgefrischt und der Punkt könnte über `recheck()` nichts
aussagen, obwohl er grün wäre. Gegenprobe: den Netzaufruf aus `recheck()` entfernt → rot mit
*„recheck() → ready=false, reason=unreachable"*.

**Dabei fiel eine Lücke in 18a auf.** Die Formprüfung listete `["status", "generate", "save"]`
und verlangte `keys.length === 3` — eine neue Vertragsmethode wäre ihr nie aufgefallen, und mit
`recheck` an Bord hätte sie ein Fehlen davon weiter als „formtreu" gemeldet. Auf vier erweitert.
Verallgemeinert: **eine Formprüfung gegen eine Literal-Liste altert mit dem Vertrag, ohne rot zu
werden** — dieselbe Fehlerklasse, aus der Punkt 12 seine Erwartung aus `getSettingDefinitions()`
selbst holt statt aus einer Liste im Treiber.

Der builtin-Zweig von `recheck()` (No-op, kein Netzaufruf) wird hier bewusst **nicht** gemessen:
das prüft `tests/plugin-api.test.ts` am injizierten Fake durch **Zählen** der Netzaufrufe — eine
Aussage, die am Wirt gar nicht formulierbar wäre.

### 2026-08-30 · 0.9.0 · Obsidian 1.13.7 (**Staging-Vault**, nicht `10_Pallas`) · A1111-Mock (Port 7861) + lokaler Asset-Mock (Port 7862) · **28/28 grün**

**Der Lauf war seit dem 28.08. rot — und der gemeldete Grund war der falsche.** Die
GUI-Smoke-Runde jenes Tages führte das Repo als „Plugin im Vault deaktiviert" (Treiber-Abbruch
`Plugin local-image-generator ist nicht aktiv`). Gemessen am 30.08. stand das Plugin in Pallas'
`community-plugins.json` durchaus drin; der eigentliche Rückstand war ein anderer und lag eine
Ebene höher: **der Treiber lief überhaupt gegen den Produktivvault.** Dort misst er laut
Dach-Doktrin den *installierten* Store-Build, nicht den gebauten Repo-Stand — die
`manifest.version` verrät den Unterschied nicht, weil beide dieselbe Nummer tragen. Umgestellt
auf den eigenen Staging-Vault (`$STAGING_VAULTS_DIR/local-image-generator`, dort deployt der
Lauf den Repo-Stand selbst). Kein „Wiedereinschalten" nötig, das wäre die Reparatur des
Symptoms gewesen.

**Ohne Neustart von Obsidian gefahren.** Die App lief bereits mit `--remote-debugging-port=9222`
und trug an dem Tag die Fenster mehrerer paralleler Sessions. Das eigene Fenster kam per IPC
dazu (`window.electron.ipcRenderer.send("vault-open", pfad)` aus einem beliebigen Renderer),
ausgewählt wird es über `attachTo("workspace", port, vault)`. Der Rezept-Kopf oben („Obsidian
beenden und neu starten") gilt nur, wenn sonst niemand an der Instanz hängt.

**Neu in diesem Lauf: 18c und 18d** — die zwei Zusagen der Provider-API, die bis dahin auf
Argumenten statt auf Messungen ruhten. Beide mit Gegenprobe belegt:

| Punkt | Mutation | Ergebnis |
|---|---|---|
| 18c | `this.state.run = { kind: "error", … }` auch für `external` (der Fix `f223c8f` zurückgebaut) | rot: *Statuszeile „Error: txt2img HTTP 500" (is-error) WEICHT AB von „Ready" (is-ok)* |
| 18d | `void this.startDownload()` in `ApiDeps.readiness` — ein Ladepfad in der API, genau was der Punkt ausschließt | rot: *Engine bleibt „downloading"* |

**Was die 18d-Gegenprobe gelehrt hat, und warum die dritte Bedingung bleibt:** rot wurde der
Punkt allein über den **Engine-Zustand**. Die Cache-Zählung stand nach den drei Sekunden
Wartezeit noch unverändert auf 22 — der Download war längst angelaufen, hatte aber noch keine
Datei fertig geschrieben. Eine Prüfung nur auf „Cache-Einträge unverändert" wäre in genau
diesem Zeitfenster grün geblieben. Die Wartezeit zu verlängern wäre die schlechtere Antwort:
sie verlangsamt jeden Lauf und bleibt eine Wette auf die Schreibgeschwindigkeit der Quelle.

**Für 18c brauchte der Mock einen Fehlermodus** (`GET /mock/fail?on=1`, schaltet txt2img/img2img
auf HTTP 500). Ein Umschalter zur Laufzeit statt einer Env-Variablen, weil der Punkt den
Fehlerfall *mitten* im Lauf braucht und der Rest des Laufs echte Bilder erwartet. Derselbe Pfad
dient dem Treiber als Erkennungsmerkmal: antwortet er nicht, läuft kein Mock, und 18c
überspringt sich mit klarem Grund — einen echten Bild-Server kann man nicht zum Scheitern
bringen.

**Ein Zwischenfall, der zum Verfahren gehört:** der Abbruch des Gegenproben-Laufs per SIGTERM
(Zeitgrenze der Aufruf-Schicht, nicht des Treibers) übersprang dessen `finally` und ließ einen
angefangenen Download im Renderer zurück. Der Folgelauf hing daraufhin bei Punkt 14 nach der
ersten Datei. Geheilt durch ein `location.reload()` im Fenster des Staging-Vaults; danach
28/28. Wer einen Lauf hart abbricht, muss mit einem verwaisten Stream rechnen — der Vault ist
dann nicht kaputt, aber der nächste Lauf misst ihn.


### 2026-08-24 · 0.9-dev (zweite Modellstufe) · Obsidian 1.13.7 (Vault `10_Pallas`) · A1111-Mock (Port 7860) + lokaler Asset-Mock (Port 7862) · **24/24 grün**

**Baseline zuerst gefahren, unveränderter Treiber (Ruling des Controllers):** vor jeder
Code-Änderung an `scripts/gui-smoke.ts`, gegen den zu diesem Zeitpunkt deployten Repo-Stand
(0.8.0, frisch gebaut) — `--builtin --steps 2 --timeout 300`. Ergebnis: **20/20 grün**, keine
Übersprungenen. Dabei wurde der Modell-Cache mit `sd-turbo` befüllt (Punkt 14).

**Nach dem Bau der vier neuen Punkte, erster Lauf: 21/23 grün, 1 rot, 1 übersprungen.**
Punkt 23 übersprang sich korrekt und laut („kein Asset-Mock (Zählerdatei fehlt)") — der
lokale Mock lief zu dem Zeitpunkt noch mit dem VORHER gestarteten Prozess, der die
Zähler-Persistenz (Teil dieses Tasks) noch nicht kannte; nach dem Neustart des Mocks lief der
zweite Versuch (s.u.) durch. **Zwei echte Treiber-Defekte, beide vor dem grünen Lauf
behoben:**

1. **Punkt 20 fand weder Dropdown noch Zeile.** Ursache: Obsidian 1.13 cacht
   `getSettingDefinitions()` und wertet sie nicht bei jedem `openTabById()` neu aus (der
   AGENTS.md-Gotcha, hier zum ersten Mal am eigenen Treiber getroffen statt nur gelesen) — der
   Engine-Wechsel auf „builtin" davor lief über `plugin.setEngine()` direkt (richtig für die
   Panel-Punkte 13–19, aber der SETTINGS-Tab wusste nichts davon, weil dessen `refreshUi()`
   nie aufgerufen wurde). Fix: `app.setting.activeTab.update?.()` erzwingt den Re-Render vor
   dem ersten Lesen; der Wechsel selbst geht weiterhin über das echte Dropdown und löst
   `refreshUi()` danach selbst aus.
2. **Punkt 17 wurde rot, obwohl das Plugin korrekt war.** `runModelStageChecks` (20–23) ließ
   `settings.builtinModel` auf `sdxl-turbo` stehen; Punkt 17 danach maß `.lig-size-slot` im
   builtin-Modus und fand sie sichtbar — mit SDXL-Turbo aktiv **zu Recht** (zwei Größen). Der
   Fehler war ein fehlender Restore im TREIBER (`builtinModel` wurde vorher nicht Teil des
   `previous`-Zustands, den `runModelStageChecks` selbst zurückschreibt), keine
   Produktregression. Fix: `runModelStageChecks` merkt sich das Modell vor dem Block und
   stellt es im eigenen `finally` wieder her — parallel zum bestehenden Restore von `engine`.

**Dritter Defekt, erst bei der Zählerdatei selbst aufgefallen (Selbstprüfung, nicht der
Lauf):** die Schlüssel in `.mock-assets-counts.json` tragen den führenden Slash aus der
URL-Pathname (`/sdxl-turbo/…`, nicht `sdxl-turbo/…`). Punkt 23s ursprünglicher
`startsWith("sdxl-turbo/")`-Filter hätte **nie** getroffen — der Punkt wäre immer grün
gewesen, unabhängig davon, ob Bytes geflossen sind. Genau die Art Prüfpunkt, die wie Deckung
aussieht und keine ist. Vor dem finalen Lauf auf `startsWith("/sdxl-turbo/")` korrigiert und
am tatsächlichen Zähler-Dump verifiziert.

**Zweiter Lauf nach allen drei Fixes: 24/24 grün**, u. a.:

```
✓ 20. Modellwechsel im Settings-Tab ändert die Download-Zeile — „SD-Turbo-Modell (2.5 GB)" → „SDXL-Turbo-Modell (6.9 GB)"
✓ 21. Panel-Modell-Picker zeigt sich erst ab zwei geladenen Modellen — aus:none · 1 Modell:none · 2 Modelle:block
✓ 22. Die Größen-Zeile folgt dem gewählten Modell — sd-turbo:none · sdxl-turbo:block (2 Optionen)
✓ 23. Abbruch am Bestätigungsdialog lädt kein Byte — Dialog abgebrochen, 0 SDXL-Anfragen
```

Punkt 21 durchlief dabei den **teureren** der beiden Zweige (schon zwei Modelle vorhanden,
weil Punkt 13 nur `sd-turbo` entfernt und `sdxl-turbo` aus dem ersten Lauf liegen geblieben
war): dritte Stufe zuerst kostenlos gemessen, `sdxl-turbo` mit `removeModel()` für die
Ein-Modell-Stufe entfernt, danach über `npm run smoke:assets` wiederhergestellt — damit ist
bei dieser Gelegenheit auch der Task-10-Befund „`removeModel(id)` löscht nur das eine Modell"
(gap 5 dort) am echten Wirt mitbelegt: `sd-turbo` blieb während des Entfernens von
`sdxl-turbo` unangetastet nutzbar.

Alle Downloads liefen ausschließlich gegen `npm run smoke:assets` (lokaler Spiegel von
`dist-assets/`) — kein einziges Byte gegen das HF-Repo, trotz insgesamt weit über 10 GB
gestreamter (echter) Modell-Dateien über den Lauf hinweg.

Vault-Zustand nachher geprüft: kein `_lig-gui-smoke`, `engine`/`assetBaseUrl`/`builtinModel`/
`showModelPicker`/`outputFolder`/`noteFolder`/`createMode` auf den Ausgangswerten
(`builtin` · das alte `v6t2b9`-HF-Repo · `sd-turbo` · `false` · unverändert), Historie
unverändert bei 20 Einträgen.

### 2026-08-23 · 0.8-dev (img2img) · Obsidian 1.13.7 · A1111-Mock (Port 7861) · **16/16 grün, Punkt 19 mit Gegenprobe**

Erster Lauf mit img2img. Punkt 17 misst jetzt **7 Regler** je Richtung (die Vorlagen-Zeile
und „Speichern & als Vorlage" kamen dazu), 18b meldet `initImage: true`, Punkt 19 ist grün:
`img2img +1, txt2img +0, denoising 0.4`.

**Punkt 19 hat sich im ersten Lauf selbst übersprungen — und das war ein echter Defekt, kein
fehlender Mock.** Gemeldet wurde „kein Mock-Server (Zählerdatei fehlt)", während der Mock lief
und die Datei gefüllt im Repo-Root lag. Ursache: `mockCounts()` löste den Pfad über
`new URL("../.mock-a1111-counts.json", import.meta.url)` auf — aus `scripts/mock-a1111.mjs`
heraus ist das richtig, aber der **Treiber wird nach `.gui-smoke.mjs` ins Repo-Root gebundelt**,
und von dort zeigt `../` eine Ebene zu hoch. Der Pfad kommt jetzt aus `process.cwd()`
(npm-Skripte laufen im Paket-Root).

Das ist die Lehre in Reinform: der Punkt war gebaut, getippt und plausibel — und hätte bei
jedem künftigen Lauf „übersprungen" gemeldet, also **nie** etwas gemessen, ohne je rot zu
werden. Ein übersprungener Prüfpunkt, dessen Grund man nicht nachrechnet, ist ein blinder Fleck
mit grünem Anstrich.

**Gegenprobe gefahren** (`const img2img = false` in `A1111Client.generate`, deployt, gemessen,
zurückgenommen): Punkt 19 wird rot mit
`img2img-Anfragen: 0 (erwartet 1) · txt2img-Anfragen: 1 (erwartet 0) — die Vorlage kam nicht an`.
Damit ist belegt, dass er misst und nicht bloß grün ist.

**Zusätzlich von Hand am Wirt geprüft (kein Prüfpunkt, per CDP):** der **Klickpfad** durchs
Panel, den Punkt 19 nicht abdeckt — er geht über die Provider-API. Vorlage über
`setInitImage` gesetzt → Vorschaubild, Pfad-Text und Regler erscheinen; Regler auf 0.35
geschoben, **Generate geklickt** → `denoising 0.35`, `initImage` gesetzt; Notiz geschrieben →
Frontmatter trägt `denoising: 0.35` und `init_image: "[[…]]"` an der vorgesehenen Stelle.
Beide Sichtbarkeitsstufen einzeln belegt: ohne Vorlage ist die Zeile da, aber Regler und
„Entfernen" sind weg; im builtin-Modus ist die ganze Zeile weg samt
„Speichern & als Vorlage"; zurück im Server-Modus ist sie wieder da.

⚠️ Beim Wiederholen dieser Handprüfung: **die Vorbedingung herstellen, nicht annehmen.** Der
erste Durchgang meldete die Zeile „Regler noch nicht sichtbar" fälschlich als rot — die Vorlage
aus dem vorigen Durchgang lebte noch im State. Dieselbe Falle, die Punkt 19 durch seine
Vorher-Messung vermeidet.

Vault-Zustand nachher geprüft: kein `_lig-gui-smoke`, Settings auf den Ausgangswerten
(`engine: builtin`, leerer Endpunkt), Historie unverändert, Testartefakte entfernt.

### 2026-08-22 · 0.6.1 · Obsidian 1.13.7 · A1111-Mock (Port 7860) · Punkt 18 (Provider-API) · **`--quick` 8/8 grün, voller Lauf 15/15 grün**

Lauf zum Bau von Punkt 18 (`app.plugins.plugins["local-image-generator"].api` am laufenden
Wirt). `--quick` mass 1, 2, 3, 4, 12, 17, 18a, 18b — 8/8 grün, unverändert gegenüber der
6/6-Baseline vor diesem Task plus die zwei neuen Records. Voller Lauf (ohne `--quick`, echte
Generierung gegen den Mock) danach 15/15 grün — **erste Messung** der von Task 5/6
refaktorierten Erzeugungsstrecke (Punkte 5–11: Statuszeile, Bild in der Karte, Notiz mit
Frontmatter, Historie, Reroll) — keine Regression.

**Mit Gegenprobe** — `this.api = createImageGenerationApi(...)` in `src/main.ts` auskommentiert,
deployt, `--quick` erneut gefahren:

```
✗ 18a. Die Provider-API ist registriert und formtreu — apiVersion=null, Methoden=keine
✗ 18b. status() meldet Faehigkeiten typgerecht — null
6/8 grün
```

Genau der erwartete Befund. Nach dem Rückbau (Diff wieder leer) erneut deployt: 8/8 grün,
`apiVersion=1, Methoden=status,generate,save`.

**18b beweist nur die Form, nicht den Wert — und nur den Server-Zweig.** Wenn 18b läuft, steht
der Modus auf `server` (Punkt 17 lässt ihn dort stehen); geprüft wird nur, dass
`capabilities.negativePrompt` ein Boolean und `capabilities.maxSteps` eine Zahl ist. Der
builtin-Zweig und der Wert von `status().reason` bleiben live UNGEMESSEN.

Zweite Hälfte des Punkts (`generate()` sagt im builtin-Modus ohne Assets `model-not-downloaded`
ab) bewusst NICHT gebaut: dafür müsste der Treiber den Engine-Modus wechseln und zurücksetzen,
und ob dieser Vault gerade Assets im Cache hat, war zum Bauzeitpunkt unbekannt (frühere
`--builtin`-Läufe könnten sie hinterlassen haben) — ein Wechsel ohne bekannten Ausgangszustand
hätte im Zweifel nichts geprüft, aber sehr wohl den Wirt verändert.

Was die Download-Zusage trägt, ist stattdessen strukturell, nicht gemessen: `ModelStore.getBuffer`/
`getText` gehen über `matchOrThrow` (`src/obsidian/model-store.ts`), das bei einem
Cache-Fehltreffer **wirft** und nie lädt. Der einzige Ladepfad ist `ModelStore.download`,
aufgerufen ausschließlich von `startDownload()`, das an genau zwei vom Nutzer geklickte
Bedienelemente hängt und in `ApiDeps` nicht vorkommt. Selbst ohne das Bereitschafts-Gate endet
ein builtin-`generate()` ohne Assets als `{ ok: false, reason: "failed" }`.

### 2026-08-22 · 0.6.1 · Obsidian 1.13.7 · `--quick`, ohne Bild-Server · **3/3 grün, 3 übersprungen**

Lauf zum Bau von Punkt 17. Gemessen wurden 1, 12 und 17; 2–4 übersprungen (kein Server),
5–11 und 13–16 nicht angefordert.

**Mit Gegenprobe** — ohne sie wäre das Grün nicht interpretierbar. Beide Bugs vom 2026-08-21
wurden künstlich wieder eingebaut (`.lig-prompt-row { display: flex }` ans Ende von
`styles.css`; die Spar-Bedingung vor `stepsValueEl.setText`) und der Punkt meldete:

```
✗ 17. … — builtin trotzdem sichtbar: .lig-negative-row → display:flex ·
     Steps-Beschriftung ≠ Regler: „50" bei value 4 (max 4), „50" bei value 4 (max 50)
```

Die Gegenprobe fand dabei einen Defekt **im Prüfpunkt selbst**: im ersten Anlauf blieb die
Steps-Hälfte grün, weil der Regler bei 4 stand und gar nicht geklemmt wurde. Siehe oben,
§ „Warum Punkt 17 nicht in 13 und 16 aufgeht".

Nach dem Rückbau: 3/3 grün, `Steps geklemmt 50 → 4/4, zurück 4/50`.

### 2026-08-21 · 0.6.0 + Kit-0.27.0-Vendoring · Obsidian 1.12.4 · A1111-Mock + lokaler Asset-Server · **16/16 grün**

Nachlauf zum Vendoring-Merge (`7390204`): der Umbau tauschte vier Module gegen ihre
Kit-Fassungen, darunter den Hub — und **beide Live-Treiber waren seitdem nicht gelaufen**.
Baseline: 16/16 vom 2026-08-19. Ergebnis nach zwei Werkzeug-Reparaturen wieder 16/16;
Download der 2,5 GB lokal in 36 s, Bild der eingebauten Engine in 15 s, Notiz `model: sd-turbo`.

Drei Befunde, **alle in den Prüfwerkzeugen, keiner im Plugin** — das Muster dieses Repos hält:

1. **Der erste Lauf maß den falschen Prüfling: 15/16, aber gegen den ALTEN Code.**
   `npm run deploy` kopiert Dateien; Obsidian lädt sie nicht nach. Der DOM trug noch das
   `lig-hub-`-Präfix, während die deployte `main.js` ausschließlich `okit-hub-` enthielt (8×,
   kein einziges `lig-hub-tab`) — Punkt 10 fand seinen Reiter nicht und meldete „keine
   Historien-Zeile". Die Manifest-Version verrät das nicht: sie ist zwischen zwei Bauten
   desselben Standes identisch. **Der Treiber lädt das Plugin jetzt selbst neu** (disable +
   enable, ~1,5 s) und sagt es an: „Plugin neu geladen — gemessen wird der deployte Stand".
   Gegenprobe: eine von Hand auf `lig-hub-tab` zurückgepatchte `main.js` deployt — der DOM zeigte
   VOR dem Reload `okit-hub-tab`, danach `lig-hub-tab`. Der Reload liest also wirklich die Platte.
2. **Punkt 10 war flaky — und die Ursache ist eine echte Verhaltensänderung des Kit-Hubs.**
   `setTab` steigt bei gleichem Tab sofort aus („if (id === navState) return"), also ohne
   `onShow()` und damit ohne `render()`. Der aktive Reiter überlebt im Workspace-State: ab dem
   zweiten Lauf stand er schon auf `history`, der Klick des Prüfpunkts war ein No-op, und die
   Liste zeigte den Stand **vor** dem Lauf — während der neue Eintrag längst im State lag
   (belegt per Instrumentierung: `state[0] = 2096352854@14:19:23`, `dom[0] = 972872909@09:58`).
   Deshalb Lauf 2 grün und Lauf 3 rot, ohne eine Zeile Codeänderung dazwischen. Der Prüfpunkt
   **erzwingt den Wechsel jetzt** (erst `generate`, dann `history`) statt ihn anzunehmen.
   Verifiziert im hergestellten Defektzustand (Reiter vorher auf `history` gesetzt): 12/12.
3. **`scripts/mock-assets.mjs` starb an einer Verzeichnis-Anfrage.** Ein `curl` auf `/` ließ
   `createReadStream` mit EISDIR ein unbehandeltes `error`-Event werfen — der Server war weg,
   und der nächste Download des Prüflings hätte eine tote Verbindung gesehen. Verzeichnisse
   sind jetzt 404.

Nicht gelaufen: `npm run shots`. Die Bilder brauchen den Aufnahme-Vault (Vault-Wechsel im
laufenden Obsidian) und einen echten Bild-Server — gegen den Mock entstünden Mock-Motive in der
README. Gemessen wurde stattdessen gezielt die Geometrie, wegen der `scripts/shots.ts:338`
bewusst `.okit-hub-content` aufnimmt: die Box ist 216 × 832 (nicht 0), das Panel scrollt jetzt
selbst (`overflow-y: auto`, `scrollHeight` 4384 bei 832 sichtbar), `.lig-hist-list` misst
4290 statt 0. Die Selektorwahl des Rezepts bleibt damit richtig; der Bildlauf selbst steht aus.

### 2026-08-19 · 0.6.0-dev · Obsidian 1.12.4 · A1111-Mock + **echtes HF-Repo** (`v6t2b9/local-image-generator-models`) · **16/16 grün**

Freigabe-Lauf für 0.6.0 mit `--assets https://huggingface.co/v6t2b9/local-image-generator-models/resolve/main`:
Download der 2,5 GB aus dem Netz in **1169 s** (~2,2 MB/s), SHA-256 aller sechs Dateien gegen
das Manifest bestanden, Bild 8 s, Notiz `model: sd-turbo`. Die Download-Frist des Prüfpunkts
wurde dafür von 15 auf 30 min angehoben (ein erster Versuch endete bei ~10 min, weil der
Treiber-Autor das Plugin währenddessen neu lud — Eigenverschulden, kein Befund).

### 2026-08-19 · 0.6.0-dev · Obsidian 1.12.4 (Electron 39) · A1111-Mock + lokaler Asset-Server · **16/16 grün**

Erster Lauf mit den Punkten 13–16 (eingebaute Engine, Spec 0.6). Baseline: 12/12 vom
2026-08-18 (`598f050`). Server-Teil gegen `scripts/mock-a1111.mjs`, Engine-Teil gegen
`scripts/mock-assets.mjs` mit der eigenen SD-Turbo-Konversion. Gemessen: Download + SHA-256 der
2,5 GB in 30 s (lokal), Bild der eingebauten Engine in 10 s (warm; kalt 19,5 s mit 8 s
Modell-Laden), Notiz `model: sd-turbo`, `steps: 4`. Der Lauf wurde **ohne** Plugin-Reload
zwischen zwei Läufen gefahren — absichtlich der härteste Fall.

Drei Befunde in den Prüfwerkzeugen, keiner im Plugin:

1. **Punkt 14 endete sofort rot**, weil das Poll-Prädikat `not-downloaded` als Endzustand nahm —
   das war der **Start**zustand. Jetzt gilt er erst nach gesehenem Fortschritt (Abbruch) als Ende.
2. **Punkt 7 nahm das Bild des vorigen Laufs.** Ohne Reload zeigt die Karte noch das letzte Bild;
   „ist ein Bild da" war grün, bevor der neue Lauf fertig war — 8 las die alte Notiz-Quelle
   (`model: sd-turbo` statt Mock), 10 klickte in eine Historie ohne den neuen Eintrag. Dieselbe
   Falle wie beim Aufnahme-Rezept am 2026-08-17. Punkt 7 und 15 verlangen jetzt ein **neues** Bild
   (Signatur vor dem Klick gemerkt).
3. **Der A1111-Mock lieferte für jeden Seed dieselben Bytes** — damit gab es nie ein „neues" Bild,
   Punkt 7 saß die Frist ab. Der Mock ist jetzt seed-treu wie ein echter Server.

### 2026-08-17 · 0.5.2 · Obsidian 1.13.7 · Draw Things, FLUX.2 klein 9B · **12/12 grün**

**Der erste vollständige Freigabe-Smoke seit 0.5.0.** Alle zwölf Prüfpunkte grün, darunter
erstmals die ganze Generierungs-Kette: Bild in der Karte (280 KB Data-URL), Ergebnis-Notiz
mit `model: flux_2_klein_9b_kv_f16.ckpt` im Frontmatter, eingebettetes Bild, Historien-Klick
stellt Prompt **und** Seed wieder her, Reroll würfelt neu (1292222129 → 169117011) und
startet.

Möglich wurde das, nachdem in Draw Things ein Modell aktiviert wurde, das der Server auch
laden kann — der Lauf davor scheiterte an einem Modellnamen, den die App meldete und die
Engine nicht kannte.

Vault-Zustand nachher geprüft: kein `_lig-gui-smoke`, Settings auf den echten Werten,
Historie unverändert bei 20 Einträgen.

### 2026-08-17 · 0.5.2 · Obsidian 1.13.7 · Draw Things **mit** API, aber ohne ladbares Modell

**7 grün, 1 rot, 4 nicht erreicht.** Erstmals seit dem 2026-08-06 wieder gegen einen
erreichbaren Server gefahren: **Punkt 2 und 3 sind gemessen** (Verbindungstest und echter
Modellname, beide grün). Punkt 7 ist rot — und das ist ein Zustand des Servers, nicht des
Prüflings: Draw Things meldet unter `/sdapi/v1/options` das Modell `flux_2_dev_i8x.ckpt`,
weist es bei `/sdapi/v1/txt2img` aber mit **HTTP 422 „Unrecognized model name"** zurück. Die
Datei existiert nicht mehr; im Modellordner liegt `flux_2_klein_9b_kv_f16.ckpt`. Das aktive
Modell lässt sich nur in der App wechseln (`POST /sdapi/v1/options` → 404).

**Das Plugin verhält sich dabei richtig**: die Statuszeile zeigt binnen Sekunden
„Fehler: txt2img HTTP 422", kein Hänger, kein stiller Fehlschlag.

**Zwei Befunde im Treiber** — beide erst durch diesen Serverzustand sichtbar:

1. **Punkt 5 meldete grün, obwohl nie ein Lauf startete.** Er prüfte „Text ≠ Bereit", und ein
   Fehlertext erfüllt das. Der Prüfpunkt kannte nur ein falsches Ende (Statuszeile bewegt sich
   nicht), nicht das zweite (sie bewegt sich in einen Fehler).
2. **Punkt 7 saß die volle Frist ab — zwanzig Minuten**, während der Grund die ganze Zeit in
   der Statuszeile stand. Schlimmer als die Wartezeit war die Meldung: „kein Bild innerhalb
   der Frist" liest sich wie ein langsamer Server und verschweigt, dass der Prüfling den
   Grund längst genannt hatte.

Beide haben jetzt **zwei Ausgänge** (dieselbe Regel wie beim Server-Guard, CORE-TEST-02 g):
Punkt 5 ist rot, wenn der „gestartete Lauf" ein Fehlertext ist; Punkt 7 bricht ab, sobald das
Plugin einen Fehlschlag meldet, und zitiert ihn. Verifiziert im selben Lauf: aus zwanzig
Minuten Frist wurden Sekunden, und die rote Zeile nennt jetzt den Servertext.

**Offen bleiben 8–11** (Ergebnis-Notiz, Bild-Einbettung, Historien-Klick, Reroll). Sie
brauchen ein erzeugtes Bild — also ein Modell, das der Server auch laden kann.

Vault-Zustand nachher geprüft: kein `_lig-gui-smoke`, Settings auf den echten Werten,
Historie unverändert bei 20 Einträgen.

### 2026-08-17 · 0.5.2 · Obsidian 1.13.7 · **ohne** Bild-Server (nach der Brücken-Migration)

`--quick`: **2/2 grün · 3 übersprungen** — identisch zum Lauf vom 2026-08-14. Der Treiber
trägt die CDP-Brücke seit diesem Lauf nicht mehr inline, sondern importiert sie aus
`obsidian-plugins/tools/obsidian-cdp/`; `attachTo("workspace", …)` wählt das Fenster jetzt
über die Sache (nur das Hauptfenster hat einen Workspace) statt über den lokalisierten
Titel. Beim Anschluss fielen zwei Typfehler **in der zentralen Brücke** auf, die nur unter
`noUncheckedIndexedAccess` sichtbar sind — dort behoben, nicht hier umgangen.

**Weiterhin offen: der vollständige Freigabe-Smoke** (Punkte 2, 3 und 5–11). Er braucht
einen laufenden Bild-Server; Draw Things' API-Server ist nur in dessen Oberfläche
einschaltbar (die App rendert in Metal — weder Menübefehl noch Voreinstellung auf der
Platte, per Skript nicht erreichbar).

### 2026-08-14 · 0.5.2 · Obsidian 1.13.7 · **ohne** Bild-Server

**`--quick`: 2/2 grün · 3 übersprungen.** Punkt 12 lief hier zum ersten Mal überhaupt im
Treiber — er war beim Bau (2026-08-06) nie ausgeführt worden, weil der Server tot war und
der Treiber deshalb schon vor dem ersten Prüfpunkt abbrach. Ergebnis: **6/6 Settings-Zeilen
in der Suche**, Negativkontrolle sauber. Damit ist die Wirkung der Settings-Migration am
Produkt gemessen, nicht nur am Store-Urteil abgelesen.

**Gegenprobe** (eigenes `getSettingDefinitions()` umbenannt, deployt, Plugin per CDP neu
geladen): **Punkt 12 rot, Punkt 1 grün** — kein Kollateralschaden. Danach zurückgesetzt,
neu deployt, neu geladen: wieder grün. Der Prüfpunkt ist als Detektor belegt.

**Zwei Befunde im Treiber**, beide durch den Server-Guard aufgedeckt:

1. **Punkt 4 war server-abhängig, ohne es zu wissen.** Der erste Lauf mit Guard meldete ihn
   rot („Knopf ist gesperrt") — zu Unrecht: `generateEnabled` verlangt `server.kind === "ok"`
   (`src/core/viewmodel.ts`), ohne Server ist der Knopf zurecht tot. Der Prüfpunkt warf dem
   Plugin also vor, die fehlende Umgebung korrekt abzubilden. Jetzt wird er mit übersprungen.
2. **Der Typ-Guard von Punkt 12 war toter Code.** `typeof tab.getSettingDefinitions ===
   "function"` ist unter 1.13 **immer** wahr: Obsidian bringt die Methode in
   `PluginSettingTab` selbst mit. Aufgefallen erst an der Gegenprobe — nach dem Rückbau hiess
   die eigene Methode anders, und der Ausdruck blieb trotzdem wahr. Geprüft wird jetzt, ob
   das Plugin sie auf dem Prototyp seiner Klasse **selbst definiert**; genau das meint der
   Store-Linter. Zudem war dieser Fall als `skip` geführt — der gesuchte Defekt wäre als
   Nichtmessung verbucht worden, die Gegenprobe hätte ihn nicht rot gesehen.

Der Vault-Zustand nachher geprüft: kein `_lig-gui-smoke`, Settings auf den echten Werten,
Historie unverändert bei 20 Einträgen, `community-plugins.json` unberührt (das Plugin war in
Pallas deaktiviert und wurde per `enablePlugin()` nur in den Speicher geladen — das
persistiert nicht).

### 2026-08-06 · 0.5.0 (Freigabe-Smoke) · Obsidian 1.13.5 · Draw Things, FLUX.2 dev int8

**Voller Lauf: 10/11 grün.** Rot war allein Punkt 2 — und das war ein Fehler im Treiber,
nicht im Plugin (s.u.). Nach der Korrektur `--quick`: 4/4.

**Gegenprobe** (den Fix aus `1d1c046` zurückgebaut, deployt, Plugin per CDP neu geladen):
**2/4** — genau die Punkte 2 und 3 rot, mit dem historischen Symptom im Text („Modell: –",
„Platzhalter statt Name"). Punkte 1 und 4 blieben grün: kein Kollateralschaden. Damit ist
der Smoke als Detektor belegt, nicht nur grün gelaufen.

Nachher geprüft: `_lig-gui-smoke/` entfernt, `createMode`/`outputFolder`/`noteFolder`
zurückgesetzt, Historie wieder bei 20 Einträgen ohne Smoke-Reste.

**Drei Befunde im Treiber selbst** — die Ausbeute, für die es den Gegenprobe-Schritt gibt:

1. **Das Settings-Modal öffnet in einem anderen Fenster.** Sind mehrere Obsidian-Fenster
   desselben Vaults offen, hängt `app.setting.open()` das Modal ins aktuelle Fenster der
   App — nicht zwingend in das, an dem CDP klebt. `document.querySelectorAll(".modal")`
   blieb leer, während `app.setting.activeTab.id` korrekt gesetzt war. Das las sich als
   „Modal hat sich nicht geöffnet" und sah wie ein Plugin-Defekt aus. Gegriffen wird jetzt
   am Tab-Container; die Notice wird über alle beteiligten Dokumente gesucht.
2. **Punkt 4 war ein Falsch-Rot.** Der Prüfpunkt setzte ein Rezept, das zeichengleich dem
   Bild des vorigen Laufs entsprach — `recipeUnchanged` sperrt den Generate-Knopf dann
   völlig zu Recht. Der Prüfpunkt stellt seine Voraussetzung jetzt selbst her (Würfel-Knopf).
3. **Namenskollision mit dem eingespleißten `waitFor`.** Eine eigene Warteschleife neben
   einem `waitFor()` darf ihre Variable nicht `deadline` nennen — sonst SyntaxError, der
   als „Renderer: Uncaught" ankommt. Deshalb liest `evaluate()` jetzt auch
   `exceptionDetails.exception.description`: eine Fehlermeldung ohne Inhalt macht blind.

**Offen:** Der Detektor von Punkt 8 (Frontmatter-Modellname) ist nicht live gegengeprüft —
das bräuchte einen vollen Lauf mit zurückgebautem Fix (~20 min). Strukturell ist er
abgesichert (eigener `note === null`-Zweig, frischer Ordner pro Lauf, Vergleich gegen das
Server-Orakel); die Gegenprobe steht beim nächsten vollständigen Lauf aus.

### 2026-08-31 · 0.11.0-dev (builtin-img2img) · Staging-Vault · A1111-Mock (7861) + Asset-Mock (7862) · **31/31 grün**

Neu: Punkte **26/27** (builtin-img2img, s. Tabelle) und die **Punkt-17-Erweiterung** (Denoise-Raster:
Steps 4→3 schieben, `min`/`step`/Wert/Beschriftung von `.lig-denoise` messen — value rastet auf 2/3,
Beschriftung „0.67"). Damit ist die bis dahin **unbelegte** Browser-Zusage gemessen, dass ein
range-Input seinen `value` auch bei einer `step`-Änderung neu rastet (für `max` war das seit
2026-08-21 gemessen, für `step` nur aus der HTML-Spec abgeleitet).

**Gegenprobe der neuen Punkte (Mutation B-Lauf auf str 1.0, ein voller Lauf):** 26 und 27 fallen
ROT an allen drei Bedingungen zugleich — gemeldeter `denoising`-Wert (1 statt 0.25), nah-Schwelle
(51.2 > 35 bzw. 46.5 > 45) und Monotonie (fern == nah). Danach Mutation zurück → 31/31. Die
Live-Werte (SD: 10.0/51.2 · SDXL: 9.1/46.5) liegen deutlich innerhalb der aus dem Spike
(Node/CPU: str25 ≈ 19, str100 ≈ 51) abgeleiteten Schwellen; die Schwellen bleiben bewusst
großzügig — sie sollen kaputte Encoder/Crops fangen, nicht Seed-Varianz.

**Punkt-27-nah-Schwelle danach festgeschrieben (Spec-§7-Auftrag „am Live-Lauf kalibrieren"):**
die provisorische 45 war gegen den gemessenen Live-Wert 9.1 (str 0.25) nur mit ~3 % Marge zur
Mutations-Gegenprobe 46.5 rot; auf 28 gesenkt, damit sie dieselbe relative Luft haelt wie
SD-Turbos Punkt 26 (9.1→28 ≈ Faktor 3, wie SD-Turbos 10.0→35).

**Drei Befunde des ersten Laufs (28/31), alle behoben:**

1. **Punkt 25 rot: „another WebGPU EP inference session is being created" — ein ECHTER
   Produktions-Race, kein Treiber-Fehler.** Der WebGPU-EP von onnxruntime-web verträgt nur EINE
   Session-Erzeugung zugleich (`webgpuRegisterDevice`-Flag im Emscripten-Glue wirft bei
   Überlappung); `load()` erzeugte bis zu 5 Sessions parallel (`Promise.all` über `loadPart`).
   Mit 4 Teilen ging das Rennen seit 0.9 zufällig gut — der 5. Teil (der kleine, schnell erzeugte
   vae_encoder) hat es kippen lassen. Fix: Erzeugungs-Queue an der injizierten Grenze
   (`e08b11d`), plus Ketten-Reset nach Session-Timeout (`68129b3`, Review-Fund: eine vergiftete
   Kette hätte jeden Retry der gecachten Instanz blockiert).
2. **Punkt 14 rot: „1 s · Fortschritt gesehen: false"** — der Treiber räumte den Cache nur bei
   `kind === "ready"`. Nach der Manifest-Erweiterung ist eine Bestandslage `not-downloaded` MIT
   fast vollem Cache; der Download war dann nur der 68-MB-Encoder und zu schnell für die
   Fortschritts-Messung. Treiber-Fix: `removeModel()` bedingungslos. **Nebenbefund mit Wert:
   genau dieser 1-s-Lauf ist der gemessene Beleg, dass Bestandsinstallationen beim 0.11-Upgrade
   nur den Encoder nachladen** (68 MB / 137 MB), nicht 2,6/7,1 GB — der Bestätigungsdialog nennt
   allerdings die Gesamtgröße (CHANGELOG-Hinweis).
3. **Punkt 17 rot: `.lig-init-row`/`.lig-init-from-result` sichtbar im builtin** — kein Defekt,
   sondern die seit 0.11 GEWOLLTE Sichtbarkeit (builtin kann img2img); die beiden Selektoren
   standen noch in `MODUS_REGLER`. Aus der Liste entfernt.
