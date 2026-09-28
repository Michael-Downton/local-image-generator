# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html) (without a `v` prefix).

## [Unreleased]

### Added

- **Resumable model downloads:** completed portions of large files survive connection failures,
  cancellation and restarts. Temporary failures retry with bounded backoff and smaller ranges.
  The panel and settings show retry countdowns, retained progress, Resume and Discard controls
  in English and German. Files become usable only after size and SHA-256 verification.
- A standalone `npm run smoke:downloads` browser check exercises recovery with small synthetic
  files and real Chromium caching, without downloading model weights.

- The GitHub release now also carries a ready-to-unpack `local-image-generator.zip` (the plugin folder with `main.js`, `manifest.json` and `styles.css`) and a `checksums.sha256` file. For a manual install, download the zip and unpack it into `.obsidian/plugins/` instead of creating the folder and saving three files by hand.
- **A fourth backend: Image Playground — the only one that works on mobile.** Built-in, Server and ComfyUI all need a desktop Obsidian install with either a GPU or a reachable local server; Image Playground runs entirely on-device through Apple's Image Playground via a Shortcut (`Generate Image (Obsidian)` by default, editable in settings) and is the plugin's first mode usable on iPhone/iPad. Requires iOS/macOS 26+ and Apple Intelligence. Only stylized output (animation, illustration, sketch), never photorealistic images — no negative prompt, no size control, no CFG, no starting image (img2img). The generated file is saved through the same attachment logic as the other three backends, no separate output-folder setting. `isDesktopOnly` is now `false`; the other three backends degrade visibly (not silently) when they cannot reach a GPU or a server, on mobile or otherwise. See [Setting up Image Playground](README.md#setting-up-image-playground-mobile) and the central guide at [uplink.jkaindl.de/apple-shortcuts](https://uplink.jkaindl.de/apple-shortcuts).
- **`generateImage(prompt, opts)` — a new, simpler public API alongside the existing one.** In addition to `app.plugins.plugins["local-image-generator"].api`'s existing `status()`/`generate()`/`save()`/`recheck()` contract (unchanged, still `apiVersion: 1`), the same object now also implements the vendored `image-gen-provider` contract (`obsidian-kit`'s cross-plugin pattern for capability owners): `generateImage(prompt, { targetFolder }) → Promise<string | { error, message }>`. It abstracts over all four backends — whichever one is active — and writes into a folder the *caller* names, not this plugin's own output-folder setting, so a consuming plugin's images don't land mixed into this user's own folder. Errors are returned as values, never thrown.

## [0.16.0] — 2026-09-26

### Added

- **Help row at the top of the settings**, with links to the documentation and the issue tracker (the `bug` button). It is the first row of the tab, above the Engine section.

### Changed

- **The ComfyUI hints now name both default ports.** The standalone ComfyUI listens on 8188, the ComfyUI desktop app on 8000; the settings row, the status line and the empty state used to mention only 8188, so anyone running the desktop app saw an address that could never answer. The placeholder in the field stays `http://127.0.0.1:8188`.

## [0.15.0] — 2026-09-24

### Changed

- **Server and ComfyUI endpoints can now come from the LLM Endpoint Manager plugin, if
  installed — two independent roles at the same manager, not two settings fields.** Without
  the manager, nothing changes: the single `endpoint` field remains the one source for both
  modes, exactly as before (no migration, existing values stay valid). With the manager
  installed, the settings row for the server field shows the Kit's endpoint-source picker
  instead (capability `image`); the server mode and the ComfyUI mode each keep their own
  choice against the manager (`serverEndpointChoice` / `comfyEndpointChoice`), so picking a
  Draw Things endpoint for one mode does not affect the other. The plain text field remains
  as the fallback shown when the manager is absent or later disabled.
- **`authorUrl` in the manifest points to the GitHub profile again.**

## [0.14.0] — 2026-09-07

### Added

- **`generate()` can be cancelled: `ApiRequest.signal` takes an `AbortSignal`.** A cancelled
  run comes back as `{ ok: false, reason: "aborted" }`. Additive — a consumer that does not
  pass a signal never sees the new value, and `apiVersion` stays 1 (same pattern as
  `recheck()` in 0.10.0).

  **What "cancel" means depends on the mode, and the difference is a promise, not an
  accident.** In **built-in** mode it is a real stop: the diffusion loop checks between two
  steps and stops computing, and the VAE decoder — the single most expensive step — never
  runs. In **server** and **ComfyUI** mode it only ends the *waiting*: the server finishes
  the image, you just stop looking at it. Obsidian's `requestUrl` knows neither abort nor
  timeout, so there is no way to take back an HTTP call that is already in flight, and
  ComfyUI's `/interrupt` would reach into a queue that may hold other people's jobs.

  Practical consequence for a batch (the case this came from — generating every image slot
  in a slide deck): cancelling lets the *current* image finish on the server, but the *next*
  one never starts. Model loading is not interruptible either way — ORT offers no abort for
  `InferenceSession.create`.

### Changed

- **Documented, not changed: the built-in SD-Turbo is not monotonic at low step counts.**
  Turning the strength slider up does not always move you further from the reference image —
  measured at 4 steps, 0.625 came out *further* from the original than 0.75. That is a
  property of the model: SD-Turbo is distilled onto exactly four noise levels, and of those
  three values only 0.625 lands between two of them, where the model runs slightly out of
  distribution. It behaved this way before 0.12 as well; the old per-step rounding merely
  made the value unreachable. SDXL-Turbo does not show it, and the effect shrinks as you
  raise the step count. Both READMEs now say so instead of leaving you to wonder.

## [0.13.0] — 2026-09-06

### Added

- **A third backend: ComfyUI.** Point the plugin at a running ComfyUI server, hand it a
  workflow you exported in the API format (Save (API Format) in ComfyUI's menu, as a file
  in your vault), and it patches that workflow before every run instead of building a graph
  from scratch — your prompt, negative prompt, seed, steps and size go into the nodes the
  workflow itself names; everything else (sampler, scheduler, LoRAs, upscalers) stays
  exactly as you built it. This is the point of the mode: your workflow keeps doing whatever
  it does, the plugin only fills in what it fills in.
  Client and workflow inspection are carried over from `yijing-oracle`, not built from
  scratch (`src/core/comfy/client.ts`, `src/core/comfy/workflow.ts`).
  One thing to know when switching from server mode: **the endpoint field is shared between
  the two modes.** Your Draw Things / AUTOMATIC1111 address stays in it, and it will answer —
  just not to ComfyUI's API. ComfyUI listens on port 8188 by default; the settings row and
  the panel's empty state say so in this mode.

### What ComfyUI mode does not do (on purpose)

Read this before switching, not after a run comes back looking wrong:

- **No img2img.** The reference-image row and "Save & use as template" stay hidden in this
  mode. Feeding a template through a ComfyUI graph means adding a `LoadImage`/VAE-encode
  chain to the workflow itself — nothing this plugin can patch into an arbitrary graph.
- **No progress bar — the status line counts seconds instead.** ComfyUI reports live
  progress over a WebSocket, and that socket is not used here: ComfyUI 0.30.0 rejects a
  WebSocket connection opened from inside Obsidian's renderer with a 403, because the
  request's `Origin` (`app://obsidian.md`) does not match the ComfyUI host. The plugin polls
  the ordinary history endpoint instead and shows elapsed time, the same fallback already
  used for servers (like Draw Things) that do not expose `/sdapi/v1/progress`.
- **No CFG slider.** `patchWorkflow` deliberately does not touch CFG, sampler, scheduler,
  LoRA or upscaler nodes — those belong to whoever built the workflow. The negative-prompt
  field IS available, because the negative-prompt node is part of how the plugin recognizes
  a usable workflow in the first place.
- **No CFG in the result note either — the field is left out, not filled with a guess.**
  Because the plugin does not set CFG, it does not claim one: a result note from a ComfyUI
  run carries no `cfg:` line at all, the same way it carries no `denoising:` line for a
  txt2img run. Writing `cfg: 1` there would have been an invented value — anyone
  reproducing the image would set their workflow to 1 and get a different picture. Built-in
  mode still writes `cfg: 1`, because there it is true: SD-Turbo is distilled and has no
  guidance. (API consumers: `ApiParams.cfg` can now be `null`, meaning "determined by the
  backend, not by the plugin". `apiVersion` stays 1 — this is additive.)
- **`width` and `height` in the result note are the size the plugin ASKED for, not
  necessarily the size of the file.** They are written into the workflow's latent node; what
  a later node in your graph does with that is your graph's business. Upscaler chains are the
  normal case in ComfyUI, so a note may well say 768×768 next to a 3072×3072 image. This is
  not fixable from here without reading the image back and second-guessing the workflow —
  treat those two fields as "what went in", the same way `model` in server mode is whatever
  the server reports rather than something the plugin chose.
- **A workflow without a plain `steps` field on its sampler, or without `width`/`height` on
  its latent node, is rejected outright** — not silently run with a guessed step count or
  size. `SamplerCustom` nodes commonly wire `steps` through a separate scheduler/sigma node
  instead of taking it as a direct number, and some latent nodes (an upscale node fed from
  an `EmptyLatentImage` further upstream, for instance) have no size fields of their own.
  Either shape fails to load with a specific message naming what is missing, rather than
  writing a result note with an invented number. Fix it by pointing the plugin at a workflow
  built around a plain `KSampler`/`KSamplerAdvanced` with an `EmptyLatentImage` node feeding
  it directly.

### Note for API consumers

`ApiStatus.engine` can now report `"comfy"`, in addition to `"builtin"` and `"server"`.
`apiVersion` stays 1 — this is an additive change, not a breaking one. A ComfyUI backend
without a usable workflow reports `ready: false` with `reason: "not-configured"`, the same
reason a server backend reports without an endpoint.

`ApiParams.cfg` is now `number | null`. `null` means the plugin did not determine the value —
it happens only in ComfyUI mode, where the workflow carries its own CFG. If you write the
returned params into a note of your own, leave the field out when it is `null` rather than
substituting a number; that is exactly what this plugin's own result note does. Built-in and
server mode are unchanged (`1` and the requested value).

## [0.12.1] — 2026-09-05

### Added

- **Large image sizes in server mode** — 2048×1152, 1152×2048 and 2048×2048 join the size
  dropdown, so a desktop wallpaper is now possible with a server that can render at that
  scale (Draw Things with Flux, for example). The limit had been sitting in the plugin's own
  size list, not in the backend: server mode always accepted any size, the dropdown just
  never offered one above 1024.
  Every edge is a multiple of 64 — latents are one eighth of the image and the UNet has three
  downsampling stages. That is why the list has 2048×1152 rather than 1920×1080.
  The built-in engine is unaffected: it takes its sizes from the model catalogue, and a
  request for a larger one is still clamped to what the active model can actually render.

## [0.12.0] — 2026-09-05

### Changed

- **The denoising slider is now continuous in the built-in engine.** Until 0.11 the value
  snapped to one of `steps` entry points — with the default of 4 steps that meant 0.25,
  0.5, 0.75 or 1.0, and a requested 0.65 silently became 0.75. The engine now interpolates
  its entry point, so the value you set is the value that is used and the value the result
  note records. Exact former snap points still produce byte-identical images from the engine
  and through the API — but *reloading an older recipe through the slider* can shift it: a
  0.11 recipe made with 3 steps carries 0.333 or 0.667, and the slider's new 0.05 grid snaps
  those to 0.35 and 0.65.
- **`denoising: 0` now really leaves the template alone.** Setting the slider to its left
  end (or sending `denoising: 0` through the API) used to mean "one diffusion step at a
  noise level of zero" — which is a division by zero, and produced a completely black image
  with no error at all. The built-in engine now skips the diffusion run entirely at 0 and
  returns the template itself (through the VAE round-trip). The value is honest either way:
  0 changes nothing, and it says so.
- **The panel's denoising slider itself is now fine-grained too.** It used to set its own
  `min`/`step` DOM attributes from the same per-step raster, so the browser clamped the
  value even after the engine could already use it exactly. It now takes the same 0–1
  range in 0.05 steps as the server backend.
- **The built-in models accept up to 8 steps** (was 4); the default stays at 4. Measured on
  84 runs: 4 → 8 adds real detail for about one extra second, while 12 and above push
  SD-Turbo into over-sharpening.

### Note for API consumers

`capabilities().maxSteps` now reports 8. A request with `denoising: 0.65` returns 0.65
instead of 0.75 — closer to what you asked for, never further away. `denoising: 0` returns
the template through a VAE round-trip instead of a black image — visually the template, not
a byte-identical copy of it. `apiVersion` stays 1.

## [0.11.2] — 2026-09-03

### Fixed

- **The model dropdown in the panel now has a visible label.** It sat unlabelled next to the
  size dropdown, which has one — a control without an accessible label is the same problem as
  an icon-only button. The label hides together with the dropdown: a label without its control
  is worse than none, because it claims a setting that is not there.
- **Switching from the built-in engine back to the server now waits for the GPU sessions to be
  released** instead of letting the disposal run unobserved. Switching straight back would
  otherwise build a second set of sessions alongside ones that were not free yet. The
  equivalent path when changing models already waited; the two had drifted apart.

## [0.11.1] — 2026-09-02

### Fixed

- **The download prompt names what the click actually costs.** Since 0.11 made the VAE encoder
  a required part, an installation from 0.6–0.10 counts as "not downloaded" even though only
  that one file is missing — yet the panel, the button and the confirmation dialog all
  announced the model's FULL size. An SDXL-Turbo user read "7.1 GB" for a 137 MB download
  (SD-Turbo: "2.6 GB" for 68 MB) and might reasonably have cancelled. All three now say what
  is missing, with the total kept as context ("137 MB of 7.1 GB"); the warning about the GPU
  needing roughly double the model size on the first image stays in both cases, because the
  first image still loads the whole model.
  The wording falls back to the total whenever the missing amount is unmeasured or *reads*
  the same as the total — "2.6 GB of 2.6 GB" would be noise, and a guessed partial figure
  would be worse.

## [0.11.0] — 2026-08-30

### Added

- **img2img in the built-in engine.** Both bundled models (SD-Turbo, SDXL-Turbo) can now
  start from a reference image, powered by a newly shipped VAE encoder per model
  (SD-Turbo fp16 ≈ 68 MB; SDXL-Turbo fp32 ≈ 137 MB — its activations exceed the fp16 range
  by ~7×, measured, same class of issue as its decoder). The template row, vault picker and
  "Save & use as template" now work in both modes; the Provider API accepts `initImage` in
  built-in mode too (`apiVersion` stays 1). Built-in mode center-crops the reference to the
  model's square input size before encoding it; server mode hands the file to the server
  unscaled and unchanged.
- **Denoising snaps to real steps in built-in mode.** With `steps` diffusion steps there are
  only `steps` meaningful entry points; the slider snaps to that raster ({1/steps … 1}) and
  the note/history/API report the EFFECTIVE value that was computed — never a wish that was
  silently rounded. Server mode keeps its continuous 0–1 slider.

### Fixed

- **Concurrent ORT session creation race.** The WebGPU execution provider only supports one
  `InferenceSession.create` at a time; loading model parts in parallel could throw
  `another WebGPU EP inference session is being created`. Session creation is now serialized
  (buffers still load in parallel), and the creation chain resets after a session-build
  timeout so a single hung build can no longer block every later attempt.

### Changed

- **Existing installations will show the Download button again after this update** — only
  the missing VAE encoder is fetched (≈ 68 MB for SD-Turbo, ≈ 137 MB for SDXL-Turbo); all
  cached files are reused. The confirmation dialog shows the model's total size, not the
  missing bytes. Totals are now ≈ 2.6 GB (SD-Turbo) and ≈ 7.1 GB (SDXL-Turbo).

## [0.10.0] — 2026-08-30

### Added

- **`api.recheck()` for consuming plugins.** `status()` is synchronous and makes no network
  call, so a server that comes up *after* Obsidian started leaves it reporting a stale
  `unreachable` — and `generate()` refusing — until the user reopens the panel. `recheck()`
  makes one network call and returns the fresh status, which lets a consumer recover on its
  own. Additive, so `apiVersion` stays `1`; in built-in mode it is deliberately a no-op that
  returns the current status, because there is no remote state that could have changed.

## [0.9.0] — 2026-08-25

### Added

- **SDXL-Turbo as a second built-in model**, alongside SD-Turbo, chosen from a dropdown in
  the settings and in the generator panel — sharper output, up to 1024×1024, at the cost of
  a larger download (≈ 7.0 GB) and a higher GPU-memory peak during loading (≈ 13 GB). The
  panel's size picker now offers whichever sizes the active model actually supports; the
  four-session pipeline (two text encoders, UNet, VAE decoder) and its own tokenizer pair
  are this plugin's own ONNX conversion of the official `stabilityai/sdxl-turbo` weights.
- A confirmation dialog before downloading any model other than the default, naming its
  size and the peak-memory note above — cancelling starts no download.
- The model's UNet (≈ 5.1 GB) exceeds both ONNX's and the browser's single-file/single-buffer
  limits, so the conversion pipeline now stripes it across 13 external-data buckets
  (`tools/convert/split_external_data.py`) that the engine reassembles at load.

### Fixed

- **SDXL-Turbo produced a pure black image, with no error.** Its VAE decoder's activations
  exceed fp16's range under the WebGPU execution provider (max 65504 → Inf → NaN in the
  entire output), which renders as solid black — a valid PNG at the right size, so nothing
  else in the pipeline noticed. The CPU execution provider doesn't show this at all, which
  is why it stayed hidden through Node-side testing. The VAE decoder now ships in fp32 while
  everything else in the model stays fp16 (+99 MB, 198 MB vs. 99 MB; a few hundred
  milliseconds slower per image). A new, deliberately expensive smoke check now generates a
  real image with SDXL-Turbo and asserts it isn't a uniform color, so a similar precision
  regression fails loudly instead of shipping silently.
- **The panel understated an SDXL-Turbo download by 4.5 GB.** The "not downloaded" empty
  state and its download button always sized and named themselves after the *default*
  model (SD-Turbo, 2.5 GB), never the one actually selected — with SDXL-Turbo chosen and
  not yet cached, the button read "Download model (2.5 GB)" and fetched 7.0 GB. Both now
  read the selected model.
- A session build that fails with a recognizable out-of-memory signal now shows a readable
  status-line message ("not enough memory for this model") instead of the raw runtime error.
  The classifier is a best-effort heuristic over the error text (no reliable in-browser OOM
  signal is measured for the WebGPU path, only a neighboring WASM-EP case); when it misses,
  the previous raw-message behavior applies unchanged — never a stuck spinner either way,
  since any failed session build already surfaced as an error before this change.
- **A session build that never resolves or rejects** (the historical jsep/asyncify silent
  hang that motivated this plugin's watchdog in the first place) now fails after 5 minutes
  with a readable status-line message, instead of leaving the panel stuck on "Loading
  model into GPU…" forever. Together with the previous two entries this closes the
  two-backend design's robustness section (§8) in full.
- `npm run assets:upload`'s precondition now checks that **both** catalog models are present
  in `dist-assets/` before uploading, not just SD-Turbo.

## [0.8.0] — 2026-08-23

### Added

- **Start from an existing image (img2img)** in server mode: choose a reference image from
  your vault, or turn a result you just made into one with **Save & use as reference**, and
  set how far the model may move away from it. Result notes record `denoising` and link the
  reference; the History tab restores both — but only if the reference file still exists, so
  a recipe never silently comes back as a plain text-to-image run.
- The reference row is absent in built-in mode, where SD-Turbo cannot do it, and the strength
  slider only appears once a reference is actually set.
- Plugin API: `generate()` accepts `initImage` (base64) and `denoising`,
  `status().capabilities.initImage` says whether the active backend can honour them, and the
  returned params carry `denoising`. This is additive — `apiVersion` stays `1`.

### Fixed

- A run started by *another* plugin that fails no longer appears in the panel as if your own
  generation had failed. The status line simply returns to idle — the same way it already did
  when someone else's run succeeded. The calling plugin receives the error and reports it.
- The plugin API's `save()` now refuses parameters whose timestamp or seed it cannot read,
  instead of building a file name out of them. A misbehaving consumer can no longer shape a
  vault path like `lig-NaNNaNNaN-NaNNaNNaN-s7.png`.

## [0.7.0] — 2026-08-22

### Added

- Provider-API for other Obsidian plugins: `status()`, `generate()`, `save()` via
  `app.plugins.plugins["local-image-generator"].api` (version 1). Generation and vault
  writes are separate calls, so a consumer can show the image before asking to save it.
- A run started by another plugin is now visible in the panel and blocks Generate while
  it lasts; its result stays out of your image view and history.

### Changed

- The timestamp on a generated image is now set at the start of the run, not at the end.
  This means the creation time in a result note, the history entry, and the filename carry
  the moment the generation was **requested**, not the moment it finished — in server mode
  that is seconds, in built-in mode it can be minutes. The change ensures the panel and
  the plugin API report the same timestamp, since both use the same hardening source.

## [0.6.1] — 2026-08-21

### Changed

- The built-in model is now downloaded from `huggingface.co/johannes-kaindl/local-image-generator-models`
  — the same name as the plugin's author profile on GitHub, so the source of a 2.5 GB
  download can be matched against the person who publishes the plugin. Existing installs
  keep the repository they were configured with and are unaffected; the previous location
  stays online. You can point `Download source` anywhere, and files already downloaded stay
  valid either way — they are keyed by checksum, not by URL.
- The hub's tab bar (Generate / History) now follows the shared kit styling: tabs size
  themselves to their labels and wrap instead of shrinking, the active one is marked by an
  underline and a hover state instead of bold text, and the spacing comes from the theme's
  own variables rather than fixed pixels.
- Each panel now scrolls on its own instead of scrolling the whole view.
- The tabs follow the ARIA tabs pattern: Left/Right/Home/End move between them, and only
  the active tab is a tab stop — reaching the inactive one now uses the arrow keys instead
  of Tab.

### Fixed

- With the built-in engine, the **negative prompt field was still shown** even though
  SD-Turbo ignores it — an input that did nothing. The panel had marked the row as hidden
  all along; a later stylesheet rule silently won over the one that hides it. CFG and the
  size picker were unaffected, which is why this looked like a deliberate choice rather
  than a bug.
- With the built-in engine, the **step count next to the slider could read 20** while the
  slider sat at its maximum of 4 and generation correctly used 4. Only the label was wrong,
  but it contradicted both the slider and the result.
- A cancelled or restarted model download could write a partial file back into the cache:
  the cache entry was deleted while the write for it was still in flight. The delete now
  waits for that write to settle.
- Cancelling a download no longer risks hanging: the cancel waited on a stream branch that
  only resolves once the other branch is cancelled too.
- A cancel that arrives between two chunks is now seen right away instead of surfacing only
  when the stall timeout hits.
- A truncated download is now reported as `download incomplete` rather than as a checksum
  mismatch, and the size is checked against the server's `content-length` as well as against
  the size pinned in the plugin.
- A workspace layout holding an unknown tab id left the hub blank (every panel hidden). An
  unknown id is now ignored.

### Internal

- Four local modules were replaced by their obsidian-kit 0.27.0 originals (settings schema,
  SHA-256, the cache streaming core, the hub) via `tools/sync-kit.sh`. The behaviour changes
  above are what those originals brought with them; none of them was covered by an existing
  test.

## [0.6.0] — 2026-08-19

### Added

- **The built-in engine is back — without any external software.** A new **Engine**
  setting chooses between *Built-in (SD-Turbo)* and *Server (Draw Things / A1111)*.
  Built-in is the default for new installs: SD-Turbo runs on your GPU inside Obsidian
  through onnxruntime-web/WebGPU. The model (≈ 2.5 GB: text encoder, UNet, VAE decoder,
  tokenizer) plus the ONNX Runtime WASM are downloaded **only when you click Download**
  — from the panel or the settings — streamed into the browser's Cache API outside your
  vault, and every file is verified against a SHA-256 pinned in the plugin before use.
  Cancel keeps finished files; **Remove** deletes them all. The model files are the
  plugin's **own ONNX conversion** of the official `stabilityai/sd-turbo` weights (fp16
  weights, fp32 inputs/outputs; `tools/convert-sd-turbo.sh`, reproducible, no
  third-party conversion) under the Stability AI Community License, published in the
  plugin's model repository on Hugging Face together with license and notice.
  Measured on an M5 Pro: first image 19.5 s (8 s of that is loading the model into
  the GPU, shown as its own phase), warm images in about 10 s.
- In built-in mode the panel shows only what SD-Turbo honours — prompt, steps (1–4),
  seed, style chips — and hides negative prompt, CFG and the size picker; the result
  note records `model: sd-turbo`, `cfg: 1` and 512 × 512. Switching to a server brings
  the full controls back.
- **Advanced → Download source** lets you point the model download at a mirror or a
  local server; downloaded files stay valid regardless of the URL.
- Existing 0.5 users with a server endpoint configured stay in server mode after the
  update; everyone else starts with the built-in engine.
- The GUI smoke gained four checks for the built-in engine (mode switch, download via
  the panel button, image + note with `model: sd-turbo`, switching back) — run against
  a local asset server (`npm run smoke:assets`) with the plugin's own conversion.
- The README now shows the plugin instead of describing it: a full-window shot with a
  generated image, the generator panel, the style chips, the history list, a result note
  with its recipe in the frontmatter, and the settings tab. All six are produced by
  `npm run shots`, a tracked recipe that drives a running Obsidian — not by hand, so they
  can be renewed when the UI changes. The three motifs that show a generated image were
  recorded against a real image server with fixed seeds, so a second run yields the same
  pictures.

### Changed

- The progress poll stops asking after the first `404` on `/sdapi/v1/progress`. Draw Things
  does not implement that endpoint, so on a four-minute FLUX run the plugin fired roughly
  240 requests that were guaranteed to fail — against a server busy rendering. The status
  line still counts seconds; a timeout or a `5xx` is treated as transient and keeps polling.
- Internal: the GUI smoke driver no longer dies on a missing image server. It probes
  reachability up front and says what is missing; `--quick` then runs the checks that do not
  need a server and lists the rest as skipped rather than failed. A server that answers
  *wrongly* is still an abort — that is a finding, not a missing prerequisite.

### Fixed

- Internal: two smoke checks treated a reported failure as progress. Check 5 ("a run starts
  visibly") only tested "status text is not Ready", which an error message satisfies, and
  check 7 waited out its full deadline — twenty minutes in the run that surfaced this —
  while the reason sat in the status line the whole time. Both now have a second exit: a
  failure the plugin reports is quoted, not waited out.
- Internal: the settings-search check (12) could not detect the very defect it was written
  for. It treated a missing `getSettingDefinitions()` as "skipped", and its type guard was
  dead code — Obsidian 1.13 supplies the method on `PluginSettingTab` itself, so the check
  was always true. It now tests whether the plugin defines it, and reports a miss as red.

## [0.5.2] — 2026-08-14

### Changed

- Internal: the two HTTP helpers share one `withTimeout` from the bundled kit
  instead of each carrying its own `Promise.race`. No behaviour change.
- Internal: the release script now refuses to build unless `HEAD` sits on the
  tag being released and the tree is clean — a build from a moved working tree
  can otherwise ship code the tag does not contain.

### Note

- The `main.js` asset of the 0.5.1 GitHub release was replaced shortly after
  publication. The original upload had been built from a working tree that had
  moved past the tag, so it contained code absent from `0.5.1`. The replacement
  is a clean `npm ci` build of the tagged source, byte-identical under Node 20
  and Node 24. The Forgejo release was unaffected.

## [0.5.1] — 2026-08-06

### Changed

- **Settings now appear in Obsidian's settings search** (1.13 and later). The
  settings tab was migrated to the declarative settings API: a single
  `getSettingDefinitions()` describes every row, and the classic imperative
  renderer draws that same structure as a fallback for Obsidian 1.8.7–1.12.
  Nothing about the visible settings changes; they just became findable by
  typing their name instead of only by opening the tab. This was the one
  warning that kept the 0.5.0 store review at "Satisfactory" instead of
  "Passed".
- The two folder fields (image output, note output) use Obsidian's own folder
  suggester on 1.13 and later, and the plugin's bundled one below that.

## [0.5.0] — 2026-08-06

### Breaking

- **In-process image generation is gone.** Both the SD-Turbo engine
  (ONNX/WebGPU, running inside the plugin) and the FLUX.2 klein 4B engine
  (via a local `mflux` child process) have been removed entirely, along with
  the model catalog that drove them. The plugin now requires a **separately
  running local A1111-compatible image server** — [Draw Things](https://drawthings.ai/),
  [AUTOMATIC1111](https://github.com/AUTOMATIC1111/stable-diffusion-webui),
  [Forge](https://github.com/lllyasviel/stable-diffusion-webui-forge), or
  [SD.Next](https://github.com/vladmandic/sdnext) — configured via a new
  **Server endpoint** setting. See the rewritten README for setup
  instructions.

### Added

- **Thin-client architecture**: the plugin talks to `/sdapi/v1/txt2img`,
  `/sdapi/v1/options`, and `/sdapi/v1/progress` over HTTP instead of running
  a model in-process. Model choice now lives entirely in the server app; the
  plugin sends generic parameters and shows the server's active model as a
  status hint.
- **Real negative prompt and CFG (guidance scale) controls** — previously
  impossible, since both old models (SD-Turbo, FLUX.2 klein 4B) were
  guidance-distilled and didn't support them meaningfully. Server-hosted
  models generally do.
- Generic **size** (7 curated aspect ratios), **steps** (1–50) and **CFG**
  (1–15) controls replace the old per-model catalog and its fixed
  SD-Turbo resolution / FLUX.2-only size dropdown.
- **Test connection** button in settings, checking reachability and
  reporting the server's active model.
- **Legacy-cache cleanup**: upgraders from pre-0.5 versions may still have
  ~2.5 GB of old SD-Turbo model weights cached in the browser's Cache API
  from the old in-process architecture. The plugin detects this once on
  load and shows a one-time notice; a new settings button deletes the
  cache in one click.

### Changed

- Generation history is preserved across the upgrade: existing entries are
  loaded with default values for the new fields (`negativePrompt: ""`,
  `cfg: 7`) rather than being discarded or breaking.
- Bundle size dropped from ~34 MB (including the bundled ONNX-runtime-web
  WASM runtime) to ~39.7 KB, since no inference runtime or model code ships
  with the plugin anymore.
- Confirmation dialogs now follow the shared UI convention (cancel on the
  left, standard button container).

### Removed

- SD-Turbo (ONNX/WebGPU) and FLUX.2 klein 4B (`mflux`) engines, the model
  catalog, and all associated settings (model download, `mflux` path, FLUX
  weights location).

### Fixed

- **Draw Things' model name is now detected.** Draw Things reports the active
  model under `model` in `/sdapi/v1/options`, while A1111, Forge and SD.Next
  use `sd_model_checkpoint`; only the latter was read. As a result the status
  hint stayed at "(chosen in server)" and — more importantly — every generated
  note got `model: unknown` in its frontmatter, the very field meant to make a
  recipe reproducible.

## [0.4.4] — 2026-07-23

### Changed
- **Settings sections no longer collapse.** They are all open now, separated by headings.
  This is a trade: collapsible sections and Obsidian's settings **search** (1.13+) are
  mutually exclusive, and search solves the underlying problem of a long page better — you
  no longer need to know which section holds a setting, you type its name. Your stored
  open/closed state is kept in the configuration and simply ignored. The collapsible groups
  in the history panel are unaffected.

## [0.4.3] — 2026-07-19

### Internal

- Popout-window-safe timers: `window.setTimeout`/`window.clearTimeout` throughout,
  and the `raceTimeout` helper moved into the obsidian layer (the core stays
  node-pure). Resolves the remaining `prefer-window-timers` review warnings.

## [0.4.2] — 2026-07-19

### Changed

- Renamed to **Local Image Generator** (title case) in the manifest, view title
  and docs.

### Internal

- Community-store review compliance: the manifest description no longer contains
  the word "Obsidian"; global `fetch`/`setTimeout`/`globalThis`/`document.createElement`
  were replaced with their popout-window-safe Obsidian equivalents where applicable
  (`activeWindow.fetch`, `createEl`, …); unnecessary type assertions removed.
- Added `eslint-plugin-obsidianmd` as a local lint gate (`npm run lint`) so
  store-review findings surface before submission instead of after.

## [0.4.1] — 2026-07-19

### Added

- First public release. Generate images locally inside Obsidian — no external
  server, no cloud, weights downloaded on explicit opt-in.
- **SD-Turbo** in-process via onnxruntime-web (WebGPU), bundled runtime, no code
  loaded at runtime.
- **FLUX.2 klein 4B** via a local `mflux` child process (user-installed), with
  selectable resolutions / aspect ratios and a cold-start hint in the status line.
- Model catalog driving the UI controls and engine dispatch — adding a model is a
  catalog entry, not a rewrite.
- Sidebar hub view with **Generate** and **History** tabs; history stores full
  recipes (prompt, seed, steps, model, size) with dedup and a Reroll button.
- Style presets (editable), seed control, prompt history.
- **Create as note** — result note with frontmatter (prompt/seed/steps/model/size)
  and an embedded image.
- Selectable output folder (with autocomplete) and selectable model storage
  location (`HF_HOME`).
- Robustness: per-file download progress that survives settings re-render, a
  distinct "loading model into GPU" status phase, a watchdog around session
  creation, and an `unhandledrejection` guard.
- Generate button gates on an unchanged recipe; Reroll stays independently active.
- Automatic DE/EN localization following Obsidian's UI language.
