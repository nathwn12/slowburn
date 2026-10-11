<p align="center">
  <img src="assets/icon.svg" width="120" height="120" alt="Slowburn icon" />
</p>
<h1 align="center">Slowburn</h1>
<p align="center"><strong>Your music room: a Windows player with studio-grade Slow + Reverb and an A-B loop built for practice.</strong></p>
<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/github/license/nathwn12/slowburn" alt="License" /></a>
  <img src="https://img.shields.io/github/languages/top/nathwn12/slowburn" alt="Language" />
  <img src="https://img.shields.io/badge/platform-windows--64bit-2b3137?logo=windows&logoColor=white" alt="Platform" />
  <a href="https://github.com/nathwn12/slowburn/actions/workflows/ci.yml"><img src="https://github.com/nathwn12/slowburn/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
</p>

## What it is

Slowburn is a Windows-only music player built for practice, not just playback. It pairs studio-grade Slow + Reverb with an A-B loop that is saved per track, wrapped in a four-skin theme gallery, an explicit queue, a mini mode, and a multi-folder library. No telemetry, no account, no network needed for playback: your files stay yours, on your machine.

## Why

Slowburn is built for musicians who practise, not just press play. Two tools do the heavy lifting — slow-it-down plus reverb, and an A-B repeat worth using — and everything around them is designed to look good while you drill the same four bars for an hour.

## Features

- Slow effect + Reverb intensity in fine steps, with one-click reset to dry and per-track memory
- A-B loop right on the seek bar, with saved per-track loops that auto-apply on reopen
- Library view showing only tracks with a saved loop
- Stop after current for clean endings to a practice run
- Drag and drop audio files anywhere onto the player to queue them
- ReplayGain support for even loudness across the library
- Explicit queue view with drag-to-reorder and a friendly empty state
- Multi-folder library with automatic refresh when files change
- Sort options and compact/comfortable track views
- Four skins in a built-in gallery: Light, Dark, Dark Warm, and AMOLED
- Chosen skin persists across restarts and wins over the OS theme
- Live waveform seek bar drawn from the actual audio
- Custom frameless window with its own title bar and menu bar (Alt toggles the menu)
- Full mode for library work and mini mode for focused listening (Ctrl+M flips between them)
- Sleep blocker, desktop notifications, and an automatic update checker
- Settings organised by library, look and feel, and playback engine

## Install

1. Requirements: Windows 10/11, 64-bit. No macOS or Linux builds come from this fork.
2. Build the installer on a Windows machine:

```text
vp install
vp run tauri build
```

3. Run the NSIS installer from `src-tauri/target/release/bundle/nsis/`.
4. Launch Slowburn, add one or more library folders in Settings -> Library, press play.

## Usage

Import a folder, press play, slow the hard part down, and loop it:

```text
Ctrl+O    import a folder or files
Space     play / pause
[ / ]     set loop points A and B
\         clear the loop
```

Every shortcut below is real — press `?` any time inside the app to see them all.

| Keys | Does |
| ---- | ---- |
| `Space` | Play / pause |
| `[` | Set loop point A |
| `]` | Set loop point B |
| `\` | Clear the loop |
| `<-` / `->` | Seek 10 seconds |
| `Shift` + `<-` / `->` | Seek 1 second (fine) |
| `Ctrl` + `K` | Focus search |
| `Ctrl` + `O` | Import a folder or files |
| `Ctrl` + `M` | Toggle mini mode |
| `Alt` | Toggle the menu bar |
| `?` | Open the shortcuts panel |
| `Esc` | Close the shortcuts panel |

## Build from source

Requires Node + pnpm (via `vp`) and a Rust toolchain (stable) on Windows.

```text
vp install            # install dependencies
vp run tauri dev      # Vite + Tauri with hot reload
vp check              # formatting (Oxfmt) + lint/typecheck (Oxlint)
vp build              # front-end build only (also regenerates the route tree)
```

```text
cargo test            # run inside src-tauri/: backend tests must pass after Rust edits
vp run clippy         # bonus: Rust linting
```

```text
vp run gen:types         # regenerate TS types from Rust (ts-rs) after changing an exposed struct
vp run gen:translations  # extract i18n strings to .po files
```

Notes:

- Never hand-edit `src/generated` — always regenerate.
- SQLite migrations under `src-tauri/src/migrations` are frozen — new change, new file.
- New Tauri commands go in `build.rs` and need allowing in `src-tauri/capabilities/main.json`.

## Docs

- [Mini-mode and sorting spec](docs/specs/minimal-mode-and-sorting.md) — the in-repo spec for mini mode and sorting.

## Status

**Unverified** — as-is, use at your own risk.
This is a personal fork, offered as-is.

## Credits & licence

- Upstream: **[Museeks](https://github.com/martpie/museeks)** by **Pierre-Louis Maugin (martpie)** and contributors.
- Slowburn is not affiliated with or endorsed by the Museeks authors — everything good inherited here is their work.
- This fork's `package.json` carries `author: Pierre de la Martinière` and `repository: https://github.com/martpie/museeks`; the `LICENSE` file carries `Copyright (c) 2015 Pierre de la Martinière` under the **MIT licence** (`"license": "MIT"`).
- Slowburn-specific work (Slow/Reverb UX, A-B repeat, skins, mini mode, queue, multi-folder UX, title bar) is the fork owner's, on top of the Museeks base. If you like the base player, star and support upstream.

## License

MIT — see [LICENSE](LICENSE).

<!-- nathwn12 house footer: identical in every repo. Do not edit. -->
<p align="center">
  <a href="https://github.com/nathwn12"><img src="assets/signature.svg" width="96" alt="nathwn12" /></a>
</p>
<p align="center">
  <sub>Built by <a href="https://github.com/nathwn12">nathwn12</a> · <a href="https://github.com/nathwn12?tab=repositories">All projects</a></sub>
</p>
