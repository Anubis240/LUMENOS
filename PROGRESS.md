# Lumen OS development progress

Version 0.6.0 · September 21, 2026.

Implemented: ChatGPT and Claude subscription connections through their official runtimes, cloud API text and voice, encrypted provider keys, animated orb, persisted agents, scoped workspace notes, recurring schedules, job results and cancellation, optional Ollama model downloads and local text chat, system diagnostics, Linux native launchers, Debian live-build recipe, XFCE recovery session and an experimental graphical disk-installer recipe.

## Verified

- Built the clean 0.6.0 hybrid ISO and verified its embedded Calamares 3.3.14 installer, Debian installer settings, Lumen live-session privilege wrapper, launcher, slideshow and 0.6.0 branding. The 1,660,944,384-byte image has SHA-256 `5828fda62a6b74d5910f025232340bb36758967ab9566588174926ee0d36e5d6`.
- Booted that exact 0.6.0 ISO in fresh isolated BIOS and UEFI QEMU virtual machines, each with only a blank 64 GB virtual disk. Both guests passed the installer/package checks, and the branded graphical installer opened correctly in both modes. Visual inspection confirmed that the welcome artwork scales without cropping.
- Branded the BIOS Syslinux and UEFI GRUB menus with Lumen artwork, violet selection states, clear start/compatibility/tool labels, and an eight-second automatic start. The boot backgrounds are generated reproducibly from the Plymouth artwork.
- Fixed the Gmail connection dialog so its X and Cancel controls remain available while OAuth sign-in is pending.
- Added the Lumen native desktop theme for GTK 3/4, XFWM, XFCE Terminal, Papirus icons, LightDM, and Chromium dark mode. Native Linux windows now use the same deep navy and violet visual language as the Lumen shell.
- Added a 1920×1080 Lumen Plymouth splash and recovery wallpaper with the animated-orb geometry, wordmark, and circuit traces. Plymouth is selected during the image build and embedded in every generated initramfs.
- Restored animated circuit-board traces around the current interface as decorative, pointer-transparent SVG artwork with reduced-motion support and a responsive mobile layout.
- Rebuilt the 0.5.0 hybrid ISO on September 12. A mid-build Debian kernel update was detected during artifact inspection; the SquashFS was rebuilt so the default 6.12.107 kernel and its module tree match. Fresh isolated BIOS and UEFI VMs reached the themed Lumen desktop and passed `guest-acceptance.sh` with exit 0 and zero failures. A native XFCE Terminal visual check confirmed the Lumen window and terminal theme.

- Added a separate Integrations launcher and searchable catalog. Google Account uses a Desktop OAuth client, loopback callback, PKCE, a read-only Gmail scope, and the OS-encrypted vault. Agents must receive the new Read Gmail permission before mail metadata or excerpts can reach their selected provider; connection preflight failures do not consume the daily task limit.


- Built a real Debian 13 live ISO and booted the Lumen desktop in both BIOS and UEFI virtual machines, each configured with 8 GB RAM and four virtual CPUs. Screenshots are included.
- The Linux desktop service ran as the normal `lumen` user. Its health check returned zero failures. Approximately 0.9 GB of guest RAM was in use during an initial idle check, before loading a local model.
- Linux Secret Service saved, reloaded and removed a disposable test credential. Windows DPAPI passed a dummy-credential persistence test through the native helper, without PowerShell. The Windows preview also reached OpenAI through the system TLS trust store; the configured account returned a quota/rate-limit response.
- The Windows preview discovered Codex CLI 0.153.4 and Claude Code 2.1.231 outside the service PATH, detected both signed-in accounts, and completed a minimal live response through each subscription connector. Account subprocesses are prevented from inheriting OpenAI or Anthropic API billing keys.
- ChatGPT Account and Claude Account now receive explicitly granted System, Files and Web capabilities through a private local MCP bridge. Both account runtimes completed a live System tool call. Codex receives an exact MCP tool allowlist and server-only approval policy; Claude receives the same allowlist under restricted mode. Shell, patching, built-in file/web tools, apps and subagents remain disabled. Permission changes are re-read on every tool list and call, so revocation takes effect immediately.
- Automations now show their assigned agent and friendly provider name directly on each card. The agent can be changed there without opening the details editor, and new/edit forms explain that the agent controls provider, instructions and access. Missing-connection errors name the exact agent and provider. Fresh installations assign the built-in agents to ChatGPT Account by default instead of assuming an OpenAI API key.
- Real workspace notes, agents and paused automations survived a Linux service restart.
- Downloaded Qwen 2.5 1.5B through the Lumen adapter and generated a real CPU-only reply in the 8 GB live VM. One 16-token reply took about 3.4 seconds including loading; the model reported about 23 generated tokens/second. This single modern-host VM test is not a performance guarantee for all Core i5 processors.
- ChatGPT Account generated a real raster image through Codex's built-in image generation. Claude Account generated a real sanitized SVG through Claude Code safe mode with all tools disabled. Neither route inherited an API billing key. Generated images can be downloaded, deleted, or opened full screen.
- Spoken image requests work: a voice transcript such as "make me a picture of a cat" is detected and routed to the selected image provider instead of returning the model's plain-text reply.
- A ChatGPT device-login timer race that could dereference cleared login state was fixed in `backend/accounts.cjs` (`codexLogin` holds a local `attempt` object). Codex subscription usage-limit errors that arrive on stdout with a zero exit code are now surfaced with the reset time instead of a generic failure.
- The current feature tests pass, including the MCP bridge, immediate permission revocation, account image isolation, malicious SVG rejection, installer checks and Codex stdout stream-limit detection. The full Windows run passes 46 of 47 tests while Norton blocks the disposable DPAPI credential-store helper; this is the same local antivirus interference documented previously, not an installer or MCP failure. Browser validation passed with mocked providers and accounts, including the full-screen image viewer and Escape-key close behavior.
- 2026-09-09 evening: after the `accounts.cjs` fix and this documentation update, a full `lb clean` + `lb build` rebuilt the ISO from scratch. Fresh isolated BIOS and UEFI VMs booted the rebuilt ISO to the Lumen desktop and passed `guest-acceptance.sh` with exit 0 and "0 failure(s)". The source ZIP and both SHA-256 manifests were regenerated so source, ZIP, and ISO stay in sync. Exact SHA-256 values are recorded in the adjacent `BUILD-STATUS.txt` and in `LUMEN-HANDOFF-CLAUDE.md` (both live outside the image).

The final image refresh includes the optional CPU engine and a Settings button to start it. No engine startup or model download is enabled by default. See the adjacent `BUILD-STATUS.txt` for the latest export status. The base image's original BIOS/UEFI boot evidence and CPU inference test precede this packaging refresh; the 2026-09-09 evening rebuild re-ran BIOS and UEFI guest acceptance on the current ISO.

## Remaining work

The current Windows preview can use the signed-in ChatGPT and Claude accounts without API keys. The live ISO still needs the official Codex and Claude Code runtimes installed before those account options work there. Physical Core i5 hardware, integrated/discrete GPU acceleration, Wi-Fi, suspend/resume and real audio devices still need testing. Secure Boot has not been certified.

The build recipe now includes Debian's Calamares installer, a Lumen launcher in the app grid and XFCE menu, and Lumen installer branding. The clean ISO rebuild plus BIOS and UEFI live boot and installer-launch checks pass. A complete blank-disk installation followed by rebooting and accepting the installed system in both firmware modes is still pending. Until that passes, use the installer only in a disposable VM. Live-session changes are still temporary unless Lumen is installed or persistence is separately configured.

Agents can use ChatGPT Account, OpenAI API, Claude Account or Claude API and have only explicit system-read, workspace-read and new-note permissions. Interactive ChatGPT and Claude account conversations can also use the same individually granted System, Files and Web capabilities through Lumen's MCP bridge. Offline models currently support text conversations. This release does not give a model unrestricted administrative control, arbitrary file access, shell execution or permission to message people.

## Start here

Use the live ISO in a VM with 8 GB RAM. At first launch, create a password for the Linux keyring if prompted. Configure cloud keys in Settings → AI & Voice, or choose Start local engine and download an optional model. For the Windows development preview, run `node serve.cjs` and visit `http://127.0.0.1:4173/`.

See [LINUX.md](LINUX.md) and [OFFLINE.md](OFFLINE.md) for setup and recovery. The source package excludes private runtime data, keys and model weights.
