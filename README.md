<p align="center">
  <img src="assets/icon.svg" width="120" height="120" alt="Slowburn icon" />
</p>
<h1 align="center">Slowburn</h1>
<p align="center"><strong>Your music room: a Windows player with studio-grade Slow + Reverb and an A-B loop built for practice.</strong></p>
<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/github/license/nathwn12/slowburn" alt="License" /></a>
  <img src="https://img.shields.io/github/languages/top/nathwn12/slowburn" alt="Language" />
  <img src="https://img.shields.io/badge/platform-windows--64bit-2b3137?logo=windows&logoColor=white" alt="Platform" />
</p>

## Project Name and Description

**Slowburn** (v0.23.7) is a Windows-only desktop music player built for practice, not just playback. It pairs studio-grade Slow + Reverb with an A-B loop that is saved per track, wrapped in a four-skin theme gallery, an explicit queue, a mini mode, and a multi-folder library. No telemetry, no account, no network needed for playback: your files stay yours, on your machine.

> [!NOTE]
> Slowburn is a diverged personal fork of [Museeks](https://github.com/martpie/museeks). Windows 10/11 64-bit is the only target — no macOS or Linux builds come from this fork.

## Technology Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Desktop shell | [Tauri](https://tauri.app/) v2 | 2.11.2 |
| Backend language | Rust (edition 2024) | stable toolchain |
| Database | SQLite via `sqlx` | 0.8.6 |
| Async runtime | `tokio` (full) | 1.52.3 |
| Frontend language | TypeScript (strict) | 6.0.3 |
| UI library | React | 19.2.6 |
| Routing | TanStack Router (file-based) | 1.170.8 |
| State | Zustand | 5.0.13 |
| Styling | StyleX | 0.18.3 |
| i18n | Lingui | 6.1.0 |
| Accessibility primitives | Base UI | 1.5.0 |
| Dev toolchain | Vite+ (`vp` CLI: Vite, Vitest, Oxlint, Oxfmt) | Node 24.14.0, pnpm 11.0.9 |
| Type bridge | `ts-rs` (Rust → TS types) | 12.0.1 |

## Project Architecture

Tauri v2 split: a React/TypeScript frontend talks to a Rust backend over Tauri IPC commands — never `invoke` from components directly; all IPC goes through the `bridge-*.ts` helpers in `src/lib`.

```text
React frontend (src/) ── bridge-*.ts ──▶ Tauri IPC commands ──▶ Rust backend (src-tauri/)
        │                                                          ├── libs/ (database, track, playlist, events)
        │                                                          └── plugins/ (db, config, cover, stream_server, …)
        └── Zustand stores + TanStack file routes                   SQLite via sqlx · migrations are frozen
```

Audio plays through a singleton `EventEmitter`-based player (`src/lib/player.ts`). New Tauri commands are declared in `src-tauri/build.rs` and allowed in `src-tauri/capabilities/main.json`. The bundle target is NSIS (`src-tauri/target/release/bundle/nsis/`), app category Music, identifier `com.nathwn.slowburn`, with file associations for mp3, flac, ogg/opus, m4a, wav, aac, 3gp, and weba.

## Getting Started

### Prerequisites

- Windows 10/11, 64-bit.
- The `vp` CLI: install it globally (PowerShell `irm https://vite.plus/ps1 | iex`, then open a new shell) or skip the global install and run the project-local CLI through pnpm (`pnpm exec vp ...`).
- Node + pnpm and a stable Rust toolchain (for building from source).

### Install

1. Build the installer on a Windows machine:

   ```text
   vp install
   vp run tauri build
   ```

2. Run the NSIS installer from `src-tauri/target/release/bundle/nsis/`.
3. Launch Slowburn, add one or more library folders in Settings → Library, press play.

### Run

Import a folder, press play, slow the hard part down, and loop it:

```text
Ctrl+O    import a folder or files
Space     play / pause
[ / ]     set loop points A and B
\         clear the loop
```

Every shortcut is real — press `?` any time inside the app to see them all (`Ctrl+M` flips full/mini mode, `Alt` toggles the menu bar, `Esc` closes the shortcuts panel).

## Project Structure

```text
src/                     # React/TypeScript frontend
  components/            # Feature-level components (Header, Footer, PlayerControls, …)
  elements/              # Reusable business-agnostic UI primitives
  hooks/                 # Custom React hooks (usePlayer, useCover, useAllTracks, …)
  lib/                   # Core logic, IPC bridges, utilities
    bridge-*.ts          # Tauri IPC helpers — new IPC calls go here, never in components
    player.ts            # Singleton EventEmitter-based audio player — side-effect-heavy
  routes/                # File-based routes (TanStack Router)
  stores/                # Zustand stores (useLibraryStore, PlaylistsAPI, SettingsAPI, …)
  translations/          # Lingui .po files
  generated/             # Auto-generated — never hand-edit, regenerate via scripts
  types/                 # TypeScript type definitions

src-tauri/               # Rust/Tauri backend
  src/
    libs/                # Core Rust libraries (database, track, playlist, events, …)
    plugins/             # Custom Tauri plugins (db, config, cover, stream_server, …)
    migrations/          # SQLite migrations — frozen, never edit existing files
    main.rs
  capabilities/
    main.json            # Permissions for Tauri commands (native or custom)
  build.rs               # Rust build, including inlined custom Tauri commands
  Cargo.toml
  tauri.conf.json
```

## Key Features

- Slow effect + Reverb intensity in fine steps, with one-click reset to dry and per-track memory
- A-B loop right on the seek bar, with saved per-track loops that auto-apply on reopen
- Library view showing only tracks with a saved loop
- Stop after current for clean endings to a practice run
- Drag and drop audio files anywhere onto the player to queue them
- ReplayGain support for even loudness across the library
- Explicit queue view with drag-to-reorder and a friendly empty state
- Multi-folder library with automatic refresh when files change
- Sort options and compact/comfortable track views
- Four skins in a built-in gallery: Light, Dark, Dark Warm, and AMOLED — the choice persists and wins over the OS theme
- Live waveform seek bar drawn from the actual audio
- Custom frameless window with its own title bar and menu bar, plus full/mini modes
- Sleep blocker, desktop notifications, and an automatic update checker

## Development Workflow

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

Further reading: [Mini-mode and sorting spec](docs/specs/minimal-mode-and-sorting.md), [CHANGELOG.md](CHANGELOG.md).

## Coding Standards

- Optimize for readability and cognitive load, not line count or cleverness, unless code is performance-sensitive.
- Keep logic co-located: one file per business concern over spreading it across many.
- Node.js is purely infra (dev, build, scripts) — there is no server-side JavaScript.
- Never call `invoke` directly from React components — extend the `bridge-*.ts` helpers.
- `src/elements` are business-agnostic primitives; `src/components` and `src/routes` hold business logic.
- Prefer URL state over Zustand global state unless persistence is required.
- Backend: desktop integrations and Tauri commands go in `src-tauri/src/plugins`; default Rust code lives in `src-tauri/src/libs`.
- Migrations: prefer `DEFAULT` values over backfills; never edit an existing migration file.
- Generated TS types in `src/generated` are committed — regenerate via `gen:types`, never hand-edit.

> [!CAUTION]
> Never hand-edit `src/generated`, and never edit an existing file under `src-tauri/src/migrations` — both are regenerated or frozen by rule.

## Testing

- Frontend unit tests: Vitest; E2E: Vitest Browser Mode with Playwright.
- After UI edits: `vp check` (format, lint, type-check) must pass.
- After Rust edits: `cargo test` inside `src-tauri/` must pass; Clippy is a bonus.
- After changing a Rust struct exposed via `ts-rs`: run `vp run gen:types` and commit the output.
- After editing a route's configuration: regenerate the route tree via `vp build`.
- Pre-commit hook runs `lingui extract --clean --overwrite` and stages `src/translations`.

## Contributing

Issues are welcome. This is a personal fork offered as-is, so please keep contributions narrowly scoped to the fork's practice-player direction:

1. Read [AGENTS.md](AGENTS.md) first — it is the authoritative contributor guide (stack, commands, conventions).
2. Prefer atomic commits; don't fix pre-existing issues unrelated to your change.
3. Run the checks your change touches: `vp check` for UI, `cargo test` in `src-tauri/` for Rust.
4. Never hand-edit `src/generated` and never touch existing migration files — regenerate instead.

## Credits

- Upstream: **[Museeks](https://github.com/martpie/museeks)** by **Pierre-Louis Maugin (martpie)** and contributors. Slowburn is not affiliated with or endorsed by the Museeks authors — everything good inherited here is their work.
- This fork's `package.json` carries `author: nathwn12` and `repository: https://github.com/nathwn12/slowburn`, with the upstream author preserved in `contributors`; the `LICENSE` file keeps `Copyright (c) 2015 Pierre de la Martinière` under MIT.
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
