# Troubleshooting

Each entry starts with what you see — the wording is the plugin's own English text — then the cause and what to do. If yours is not here, see [Getting help](#getting-help).

## The model is not downloaded

> The built-in model (SD-Turbo, …) is not downloaded yet. Nothing is downloaded before you click.

**Cause:** the built-in engine needs its model files, and the plugin never fetches them on its own.

**Fix:** click **Download model** in the panel, or use the model row under **Settings → Local Image Generator → Engine**. If the panel says the model is *partly downloaded*, the button reads **Download the missing …** and fetches only what is left.

## Interrupted or paused downloads

> Download paused · … retained

**Cause:** the download was cancelled or interrupted before it finished. Completed files and completed portions of large files are saved.

**Fix:** click **Resume download** in the panel or settings. After restarting Obsidian, downloading resumes only when you click. Files are verified before the model becomes available.

To remove saved portions and start them again, choose **Discard partial download**. Already verified files remain installed.

## The download keeps retrying

> Retrying … in …s (attempt …/…) · … retained for this file

**Cause:** a temporary connection or server problem interrupted the current transfer. The plugin waits before retrying and uses smaller portions after connection interruptions.

**Fix:** let the countdown finish. You can cancel without losing completed portions. If retries stop with the following message, check your connection and click **Resume download**:

> Download interrupted. Check your connection, then resume. Completed portions are saved.

If your download source does not support resuming, an interrupted file must restart from the beginning. Completed files are still kept.

## Model files could not be saved

> Could not save model files. Free some disk space, then resume.

**Cause:** Obsidian could not write the downloaded files, usually because disk space or its browser storage allowance ran out. Verifying and assembling a large file temporarily needs space for another copy — up to about 1.7 GB for SD-Turbo's UNet.

**Fix:** free space on the drive containing Obsidian's profile, then click **Resume download**. Model files are stored outside the vault.

## The download source returned an error

> Download source returned HTTP … . Check the download source or try again later.

> The download source returned an invalid file or byte range. Check the download source before retrying.

**Cause:** the source could not serve the requested file or returned an unexpected response.

**Fix:** check **Advanced → Download source**. If you changed it, restore the default and try again. If the server is busy or limiting requests, wait before retrying. The plugin respects the server's requested waiting time; delays longer than one minute require you to try again later.

## Checksum mismatch

> Checksum mismatch for … — the file was discarded. Try the download again.

**Cause:** a downloaded file did not match the checksum pinned in the plugin, so it was thrown away. Usually a broken connection or a mirror that serves a different file.

**Fix:** click the download button again; finished, valid files are kept. If you changed **Download source** under **Advanced**, set it back to the default and try again.

## The built-in engine is unavailable

> WebGPU is not available in this Obsidian — use a server (settings)

> The GPU has no shader-f16 — use a server (settings)

**Cause:** the built-in engine needs WebGPU with 16-bit shaders. Apple Silicon Macs and most current discrete GPUs have it; older or virtualised GPUs do not.

**Fix:** switch **Engine** to **Server (Draw Things / A1111)** or **ComfyUI (your workflow)** under **Settings → Local Image Generator**.

## Not enough memory

> Not enough memory for this model — free up GPU memory or switch to a server backend.

**Cause:** the model does not fit. SDXL-Turbo needs roughly 13 GB at its peak while the session is built; SD-Turbo about 4 GB.

**Fix:** close other GPU-heavy apps, or choose the smaller model (SD-Turbo) under **Model**, or use a server.

## Loading the model takes forever

> Loading the model into the GPU is taking unusually long or got stuck silently. Click Generate to try again.

**Cause:** the plugin stops waiting after five minutes, because the runtime offers no way to cancel a stuck load.

**Fix:** click **Generate** again. If it keeps happening, restart Obsidian and retry.

## Server unreachable

> Server unreachable — is the API enabled?

**Cause:** in server mode nothing answered at the **Server endpoint**. The server app is not running, its API is off, or the address is wrong.

**Fix:** start the server and enable its API (Draw Things: switch on the API server in its settings; AUTOMATIC1111 and Forge: launch with `--api`). Then press **Test connection** in the settings, or **Retry** in the panel. A server that is up shows "Server OK — model: …".

## No ComfyUI at this address

> No ComfyUI at this address (default port 8188, or 8000 in the ComfyUI desktop app) — is it running?

**Cause:** the endpoint is shared between Server and ComfyUI mode. An address left over from Draw Things or AUTOMATIC1111 answers, but not with ComfyUI's API.

**Fix:** enter the address of your ComfyUI server under **ComfyUI endpoint**: `http://127.0.0.1:8188`, or `http://127.0.0.1:8000` in the ComfyUI desktop app.

## The workflow is not accepted

The **Workflow file** must be a workflow exported from ComfyUI in API format. The plugin names the problem:

| Message | Cause and fix |
|---|---|
| The file is not valid JSON. | The file is damaged or not a workflow. Export it again. |
| Not a workflow: expected an object of nodes. Export from ComfyUI with 'Save (API format)', not the normal save. | Use **Save (API format)** in ComfyUI. |
| No sampler found — no node takes positive, negative and latent_image together. | The plugin looks for one sampler node; without it there is nothing to fill in. |
| Several samplers found (…). Refiner chains aren't supported — the plugin can't tell which one to fill in. | Reduce the workflow to a single sampler. |
| This sampler has no steps field … | Use a sampler with a `steps` field (for example KSampler). |
| The latent node carries no width/height … Use EmptyLatentImage as the sampler's latent_image. | Feed the sampler from an **EmptyLatentImage** node. |

"Workflow file not found: …" means the file was moved or deleted; pick it again with **Choose…**.

## Nothing happens when I press Generate

> Not possible while an image is being generated — wait for it to finish.

**Cause:** only one image is made at a time — by this panel or by another plugin using the generator (the status line then reads "Another plugin is generating an image…").

**Fix:** wait for the running image to finish.

## Getting help

Still stuck? [Open an issue](https://github.com/johannes-kaindl/local-image-generator/issues) with your Obsidian version, the plugin version (Settings → Community plugins) and what you expected to happen.
