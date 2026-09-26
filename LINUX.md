# Lumen OS Linux preview

Lumen is a custom AI desktop on Debian 13 (trixie), with XFCE underneath for a window manager, hardware settings, networking, audio and recovery. The live image can run temporarily in a VM or from a live USB and now includes an experimental graphical installer for installing Lumen onto a disk.

The target is an x86-64 Core i5 computer with 8 GB RAM and integrated graphics. This is a design target, not a completed hardware certification. Cloud inference does not need a GPU. Local model performance depends on available RAM, CPU and GPU support.

## Build an ISO

Use Debian 13 on a dedicated Linux machine or WSL2. The build uses several GB of downloads and disk space. Keep the build directory on the Linux filesystem, not `/mnt/c`.

```sh
sudo apt-get update
sudo apt-get install live-build debootstrap squashfs-tools xorriso grub-pc-bin grub-efi-amd64-bin isolinux syslinux-common curl xz-utils zstd ca-certificates
bash linux/stage-iso.sh /var/tmp/lumen-build-preview
sudo bash linux/build-iso.sh /var/tmp/lumen-build-preview
```

Choose a new directory name for every clean build. Staging refuses to overwrite an existing build. The Node.js 22 and Ollama runtimes are pinned and verified against SHA-256 checksums in `linux/runtime-version.env`. Staging downloads the full official Ollama archive, but includes only its CPU libraries in the image. It is bundled in `/opt/lumen-node`; the distribution's Node package is not replaced. Debian packages are selected from the current trixie repositories, so builds made on different days are not byte-for-byte reproducible.

The output ISO and `SHA256SUMS` appear in the build directory. `LUMEN-PAYLOAD-SHA256.txt` identifies the included application source. The payload excludes credential files, user notes, task history, browser profiles and downloaded models.

The builder uses build-local IPv4 download retries for debootstrap as well as APT. HTTPS certificate checks and Debian archive signature verification remain enabled. Interrupted builds retain their downloaded packages; inspect the managed build directory and logs before resuming.

## Boot and recovery

Boot the ISO as an optical disk in a VM with 8 GB RAM, four virtual CPUs, virtual graphics and networking. No physical disks need to be attached. The recipe supplies BIOS and UEFI boot files; check the progress report for the modes actually tested.

The live account is `lumen`. This temporary preview ships an empty default keyring with no password to avoid a first-boot dialog. It provides Secret Service access but does not encrypt saved credentials at rest until you set a keyring password in **Passwords and Keys** (`seahorse`). Use disposable test credentials in a temporary session. Debian live-config supplies its standard live-session login. The Lumen session opens a sandboxed Chromium application window over XFCE. F11 leaves full screen; Alt+F4 closes the shell to reveal the recovery desktop. Use the XFCE application menu or terminal to reopen `lumen-shell`.

Live-session changes disappear at shutdown unless persistence is separately configured. Use disposable test keys for a temporary live session, or remove keys before sharing a persistent image. No API keys are included in the ISO.

## Install Lumen OS onto a disk

Open **Apps → Install Lumen OS** in the Lumen sidebar. The same launcher is available in XFCE's application menu after closing the full-screen shell with Alt+F4. It starts Debian's maintained Calamares installer through a live-session-only Lumen wrapper, with Lumen branding and bootloader naming.

Back up the target machine first. Test the installer in a VM with a new blank virtual disk before using physical hardware, and disconnect disks that should never be changed. Calamares displays the proposed partition layout and asks for confirmation before it writes to the selected disk. The live image remains temporary until you complete an installation; an installed system keeps normal user data and settings across restarts.

The 0.6.0 ISO passed a clean rebuild, fresh BIOS and UEFI live boots, embedded-file checks, and graphical installer-launch checks against isolated blank 64 GB virtual disks. A complete installation followed by reboot and installed-system acceptance is still pending, so keep installer testing inside a disposable VM. Secure Boot and installation alongside an existing operating system remain uncertified.

## Lumen desktop theme

The live session applies the Lumen GTK 3/4, XFWM, terminal, Papirus-Dark icon, LightDM and Chromium dark-mode settings at login. File Manager, Terminal, Linux Settings and other native GTK launchers therefore use Lumen's deep navy surfaces, violet selection and window accents. Applications that ship their own toolkit or hard-coded theme can still retain parts of their own appearance.

The boot image selects the custom `lumen` Plymouth theme and embeds its 1920×1080 artwork in the initramfs. The same artwork is used as the recovery desktop and login background. The browser shell adds responsive circuit traces as decorative SVG content; they ignore pointer input and stop animating when reduced motion is enabled.

## Use the desktop on an existing Linux installation

Install Node.js 22 or later, Chromium, `libsecret-tools`, `gnome-keyring`, `libpam-gnome-keyring`, `seahorse`, `curl`, and a working graphical user session with systemd and D-Bus. Debian 13's default Node.js package may be older than required; the live ISO bundles its own supported runtime.

As your normal desktop user:

```sh
bash linux/install-user.sh
~/.local/bin/lumen-shell
```

This installs into `~/.local/share/lumen-os/app`, creates a user service and an application-menu entry. It leaves the existing login and autostart settings alone. To uninstall the app while preserving data, run `bash linux/uninstall-user.sh` from the source folder. The uninstaller verifies its managed directory before removing it.

## Keys, models and data

Settings → AI & Voice supports existing ChatGPT and eligible Claude subscriptions when the official Codex and Claude Code runtimes are installed for the desktop user. The current ISO does not bundle those account runtimes. Install them from the official links shown in Settings, sign in through the runtime, and refresh Lumen. OAuth tokens stay in the official runtime's own storage.

Developer API keys are stored through Linux Secret Service. If the keyring is locked or uninitialized, open **Passwords and Keys** (`seahorse`) and create/unlock a password-protected Login keyring, then retry. The application never substitutes plaintext key storage. Workspace features and offline chat can remain available while the keyring is locked.

Data lives in `~/.local/share/lumen-os/state`; the Chromium profile lives in `~/.local/share/lumen-os/browser`. Text notes, agents and task history are ordinary local files protected by user permissions. They are not encrypted by the application. Provider keys are stored separately by the keyring.

Offline models are optional and are not bundled. The live image includes an on-demand CPU engine: choose Start local engine in AI & Voice, then download a supported model. The engine is not enabled at boot. A separately installed full Ollama runtime can provide GPU acceleration; stop the bundled user service before switching runtimes. See [OFFLINE.md](OFFLINE.md), including model licenses. Gemini voice remains a cloud feature when text is set to Offline.

## Diagnostics

```sh
lumen-health
systemctl --user status lumen.service
journalctl --user -u lumen.service -n 50 --no-pager
```

The server listens only on `127.0.0.1:4173` and runs as your normal desktop user. The shell preserves Chromium's sandbox and microphone permission prompt. Automatic jobs have no shell, arbitrary filesystem or native application launch capability. Native apps launch only through the user's desktop controls.

## Acceptance checks

Before using an image as a daily desktop, check: BIOS/UEFI boot, installation to a blank disk, reboot from the installed disk, login, encrypted keyring save/reload, audio input/output, suspend/resume, Wi-Fi, integrated graphics, display scaling, keyboard shortcuts, recovery desktop and updates. Actual provider billing/authentication requires your own accounts. See [PROGRESS.md](PROGRESS.md) for evidence from this build.

Build references: [Debian Live Manual](https://live-team.pages.debian.net/live-manual/html/live-manual/index.en.html), [Debian live-config](https://manpages.debian.org/trixie/live-config/live-config.7.en.html), [Node.js releases](https://nodejs.org/en/download/releases/).
