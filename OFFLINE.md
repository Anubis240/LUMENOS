# Optional offline models

Lumen defaults to cloud AI. Offline text chat is optional and uses an Ollama installation on the same computer. No API key is required for this mode. The Linux live image includes an optional CPU engine, but no models are downloaded until you choose a download in Settings.

## Set up

1. In the Lumen Linux image, choose **Start local engine** in Settings → AI & Voice. On other installations, install Ollama using its [official Linux guide](https://docs.ollama.com/linux) or [official desktop downloads](https://ollama.com/download). This is a separate runtime installation.
2. Start Ollama with its default loopback address, `127.0.0.1:11434`. Lumen deliberately does not offer a remote Ollama address.
3. For local-only operation, set `OLLAMA_NO_CLOUD=1` in the Ollama service environment and restart Ollama. Follow the platform-specific environment instructions in the [Ollama FAQ](https://docs.ollama.com/faq). This disables Ollama's cloud model and web search features; model downloads still need internet access.
4. Open Lumen Settings, refresh offline status, and download a model from the catalog. Keep Ollama and the Lumen service running while it downloads.
5. Select the installed model for offline conversations. Once downloaded, text generation can work without an internet connection. Gemini voice remains a separate cloud feature; selecting an offline text model does not make voice offline.

## Model choices and hardware

| Model | Approximate download | Use | License |
| --- | --- | --- | --- |
| [Qwen 2.5 1.5B](https://ollama.com/library/qwen2.5:1.5b) | 986 MB | First choice to try on an 8 GB computer | Apache 2.0 |
| [Qwen 2.5 3B](https://ollama.com/library/qwen2.5:3b) | 1.9 GB | Larger model when more memory is available | Qwen Research License |

These download sizes are from the official model listings, checked September 7, 2026. Download size is not total runtime RAM use. Leave additional free disk space for download layers, and close memory-heavy applications before using an offline model on an 8 GB machine. The catalog is a conservative starting point, not a performance certification for every Core i5 generation. No GPU is required by Lumen's offline integration; Ollama decides whether supported hardware acceleration is available. Integrated graphics and discrete GPU support depend on Ollama, drivers, and hardware.

The 3B model has different license terms from the 1.5B model; review the license linked on its model page before use or redistribution. Lumen's package contains no model weights.

## Current limits

- Text conversations only. These models do not provide microphone recognition or speech output.
- One local text generation at a time. A second call returns a busy response.
- A 4,096-token context, a maximum 1,024 generated tokens, and a 120-second request timeout. Lumen asks Ollama to unload the model after each reply to free memory; subsequent replies may need to load it again.
- A conservative 2,800-byte UTF-8 input budget includes Lumen's system text, assistant preferences, messages, and an allowance for chat formatting. Longer inputs return a clear error to shorten the request or start a new conversation. History is not silently removed by Lumen.
- One model download at a time, with cancellation, progress updates, a two-hour timeout, and at most 20 recent jobs kept in memory. Job history is lost when the Lumen service restarts. Ollama owns the downloaded files and cache.
- Download progress covers model layers reported so far. The percentage may adjust as additional layers become known; it reaches 100% only when Ollama reports success. An interrupted stream is an error, not a completed installation.
- Cancelling closes Lumen's pull request. Ollama can reuse partial downloads on the next attempt. If another application is pulling the same model, its download may continue; Lumen does not terminate Ollama or delete model files. See Ollama's [pull API behavior](https://github.com/ollama/ollama/blob/main/docs/api.md#pull-a-model).
- If Ollama is missing, busy, or unable to load the model, Lumen reports the problem. It never automatically substitutes a cloud provider.

## Privacy and service boundary

The module calls only `http://127.0.0.1:11434`, rejects HTTP redirects, and accepts only the two exact catalog model identifiers. Listing models does not download or load them. Download requests name a catalog model and instruct the local Ollama runtime to fetch it; they do not contain conversations or API keys.

Before sending chat content, Lumen checks that the model appears installed and verifies its local GGUF metadata with `/api/show`. Models declaring `remote_model` or `remote_host` are rejected. The response is checked for those fields too. Ollama's [API type definitions](https://github.com/ollama/ollama/blob/main/api/types.go) describe these local/remote model fields. This relies on the integrity of the local Ollama service; it is not a substitute for an OS sandbox or firewall.

This backend module does not persist chat text or call a shell. The desktop's own conversation storage and permission settings apply separately. Only explicitly selected cloud features send content to cloud providers.

## Module contract

`backend/offline.cjs` exports `createOffline({fetcher = fetch} = {})` and `CATALOG`. Production callers use the fixed built-in endpoint; the injected fetcher exists for tests.

| Method | Result |
| --- | --- |
| `await status()` | `{available, models: [{name, size}], catalog, downloads, endpoint, message}`; a missing runtime returns `available: false` rather than throwing |
| `await chat(model, messages, signal, instructions = '')` | `{text, provider: 'offline', model, truncated, usage: {input, output}}` |
| `pull(model)` | A queued job snapshot immediately; download begins asynchronously |
| `downloads()` | Newest-first snapshots of retained jobs |
| `getDownload(id)` | One job snapshot; unknown IDs return an `ApiError` with status 404 |
| `cancelDownload(id)` | Updated snapshot; terminal jobs remain unchanged |
| `close()` | Cancels active work and prevents new requests; does not stop Ollama |

Jobs contain `id`, `model`, `status`, `progress` (0–100), `completed` and `total` (bytes, when known), `detail`, and ISO timestamps. Failed jobs also contain a sanitized `error`. Status is one of `queued`, `downloading`, `completed`, `error`, or `cancelled`. Internal abort controllers are never returned. Catalog entries contain `id`, `name`, `description`, `size` (display text), `downloadBytes` (approximation), `source`, and `license`.

The HTTP server must apply its normal same-origin and CSRF checks to download creation and cancellation. It must also explicitly route the selected offline provider and model to this module; this module does not choose providers or grant filesystem permissions.

## Verification

Run `node --test tests/offline.test.cjs` from the Lumen directory. The suite uses simulated transport responses only and covers the fixed endpoint, redirect policy, request bounds, local model checks, cancellation, concurrency, chunked NDJSON progress, stream errors, completion markers, and retained-job limits. The automated unit suite downloads no models. A separate real Linux VM test is described below.

The chat request and usage fields follow Ollama's [chat API](https://docs.ollama.com/api/chat); installed model discovery follows the [model list API](https://docs.ollama.com/api/tags).

## Included Linux engine

The Lumen live image bundles Ollama 0.33.3 with CPU libraries only. It starts only when you choose **Start local engine** in AI & Voice. No models are included or downloaded automatically. The user service is `lumen-offline.service`, binds to loopback, disables Ollama cloud features and has a 4 GB memory ceiling. Models are stored in `~/.local/share/lumen-os/models`.

For GPU acceleration, install the full official Ollama runtime, stop the bundled engine with `systemctl --user stop lumen-offline.service`, and run the full runtime on its default loopback port. Lumen connects to an existing local Ollama service before offering to start its bundled one. Hardware and driver compatibility still need testing.

Verified in an 8 GB, four-vCPU Linux VM without a GPU: download of Qwen 2.5 1.5B through the Lumen adapter and a real local reply. One short 16-token reply completed in approximately 3.4 seconds including model loading. This is a single modern-host VM measurement, not a Core i5 performance guarantee.
