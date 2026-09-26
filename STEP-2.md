# Lumen OS 0.2 — Connected desktop prototype

## Run

Requires Node.js 22 or later. In this folder run `node serve.cjs`, then open http://127.0.0.1:4173. No npm install or build is needed. For Windows, run the server as your normal signed-in Windows user. For Linux, install `libsecret-tools` and use an unlocked Secret Service keyring such as GNOME Keyring. A restricted sandbox without the Windows user profile cannot unlock DPAPI.

Open **Settings → AI & Voice**. You can connect an existing ChatGPT subscription through the official Codex runtime or an eligible Claude subscription through the official Claude Code runtime. You can also paste a developer API key into its provider section, choose a model ID, and click **Save securely**, then **Test connection**. Tests make real requests and use the selected account's limits or API credits. Account access, billing, quota and model availability are controlled by each provider.

## What works

- OpenAI Responses API and Claude Messages API conversations, with recent history, bounded output, stop controls, provider errors and token counts when returned.
- ChatGPT account conversations through `codex exec` and Claude account conversations through `claude -p`. Account subprocesses cannot inherit API billing keys; Lumen supplies a no-tools prompt, read-only Codex sandbox, ephemeral sessions and blocked Claude tools.
- Agents as editable sets of instructions for cloud conversations. They have no OS tools yet.
- Gemini voice: hold the microphone (or choose click-to-start/stop), speak up to 30 seconds, and receive a spoken reply. Keyboard activation toggles recording. Voice conversations use Gemini independently of the selected text provider. Each voice request is a separate turn without earlier voice context.
- Voice transcription and reply appear in Conversation. Google receives the audio only after recording finishes. Cancelling during recording discards it. Cancelling a request already sent cannot revoke processing or charges.
- Gemini speech test without microphone access. The orb responds to microphone/audio amplitude; reduced motion still keeps it static.
- The existing desktop, responsive sidebar, local automation drafts, sample files, browser links and simulated terminal.

Voice is turn-based, not streaming or continuously interruptible. Stop cancels recording, an in-flight request, or playback. If speech generation fails but text succeeds, the text reply is retained with an error notice. The preview does not enforce a dollar budget; provider billing links and token counts are supplied. Text output is capped at 2,048 tokens; voice capture at 30 seconds; concurrent API work at two requests. Do not treat these limits as a monetary cap.

## Credentials and privacy

- Permanent API keys are never returned by the backend, stored in localStorage, or included in logs or command-line arguments.
- Windows: the server uses the bundled native credential helper to store a DPAPI-encrypted blob in `runtime-private/credentials.dpapi`, tied to the signed-in Windows account. It does not launch PowerShell. Linux credentials are stored in Secret Service, scoped to this installation path. There is no plaintext fallback.
- Set `LUMEN_DATA_DIR` to choose the Windows encrypted-file directory / Linux keyring instance identity. Keep that location stable. Moving a Linux installation without preserving this setting changes its keyring lookup identity.
- `runtime-private/` is excluded from source control and distribution. The server serves only an explicit list of public assets, binds to loopback, checks Host/Origin and uses a CSRF token for API operations. This is a local single-user prototype, not a remotely hosted service.
- Keys are transmitted over HTTPS only to their provider. The UI sends them to the loopback server when you save. Other processes running as the same OS user are outside this prototype's isolation boundary.
- Text conversations and audio are processed by cloud providers under their terms. OpenAI Responses requests set `store:false`; this does not override provider retention policies. Google free-tier processing may be used to improve its products; see the linked pricing/data terms.
- OAuth credentials remain owned by the official Codex and Claude Code runtimes. Lumen reads only installed/connected status and response text. API keys remain in the OS credential store.

## Validation

Run `node --test tests/*.test.cjs`. The Windows vault round-trip test uses an explicitly fake key; provider network calls in the suite are mocked. Browser tests require Playwright and Microsoft Edge: set `PLAYWRIGHT_MODULE` to your installed package path, then run `node tests/browser.cjs`. Browser tests use an in-memory vault, fake account adapters and a fake microphone, never real credentials or cloud calls.

Validated on this Windows host: provider request mappings, output/error parsing, quota failures, cancellation, Host/Origin/CSRF guards, private-file blocking, secure Windows save/reload/remove through the native DPAPI helper, UI key save/test/remove, no key in browser storage, chat history, agent instructions, speech playback, simulated microphone recording, responsive layout, and no JavaScript runtime errors. Windows system certificates are included in Node's verified TLS trust list so HTTPS inspection software does not cause a false offline error. Live authenticated provider calls and physical microphone/audio quality require user keys and device testing. Linux keyring integration is implemented but has not been exercised on this Windows host. The target 8 GB/Core i5 specification remains unbenchmarked.

## Official implementation references

- [OpenAI text generation](https://developers.openai.com/api/docs/guides/text)
- [Claude Messages API](https://platform.claude.com/docs/en/api/http/messages/create)
- [Gemini audio understanding](https://ai.google.dev/gemini-api/docs/audio)
- [Gemini speech generation](https://ai.google.dev/gemini-api/docs/speech-generation)
- [Gemini pricing and data terms](https://ai.google.dev/gemini-api/docs/pricing)
- [Windows DPAPI](https://learn.microsoft.com/en-us/dotnet/api/system.security.cryptography.protecteddata)
- [Linux secret-tool](https://manpages.debian.org/testing/libsecret-tools/secret-tool.1.en.html)

The local service and live ISO remain a preview. Physical-device validation and a disk installer are later stages.
