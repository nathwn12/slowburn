# Slowburn

**Your music room: a Windows player with studio-grade Slow + Reverb and an A-B loop built for practice.**

> **Personal project, full credit upstream.** Slowburn is a personal fork of
> [Museeks](https://github.com/martpie/museeks) by Pierre-Louis Maugin
> (martpie). It is not affiliated with or endorsed by the Museeks authors -
> everything good inherited here is their work. See
> [Credits & licence](#credits--licence).

## Why this exists

Slowburn is built for musicians who practise, not just press play. Two tools
do the heavy lifting, and everything around them is designed to look good
while you drill the same four bars for an hour:

1. **Slow + Reverb, done right.** Drop the speed to learn a part, wash it in
   reverb, all inside the player. Both are remembered **per track**, adjust in
   fine 1% steps, and snap back to dry with one click.
2. **A-B repeat worth using.** Mark any passage on the seek bar, loop it, clear
   it with one key. Loops are **saved per track** and re-apply themselves the
   next time you open it - and the library can show only tracks that have a
   saved loop.

## Features

### Player

- Slow effect + Reverb intensity in fine steps, with one-click reset to dry
  and per-track memory
- A-B loop right on the seek bar, with saved per-track loops that auto-apply
- **Stop after current** for clean endings to a practice run
- Drag and drop audio files anywhere onto the player to queue them
- ReplayGain support for even loudness across your library
- An explicit queue view with drag-to-reorder and a friendly empty state

### Library

- A multi-folder library - point it at every music folder you own
- Per-track memory travels with the file: saved A-B loops, speed, and reverb
- Sort options, compact/comfortable track views, and automatic refresh when
  files change

### Look and feel

- **Four skins in a built-in gallery: Light, Dark, Dark Warm, and AMOLED**
  (true pure-black for OLED screens)
- Your chosen skin sticks - it wins over the OS theme and survives restarts
- A cohesive glow-and-elevation design language: soft accent glows, lifted
  surfaces, and consistent tokens across every screen
- A live **waveform seek bar** drawn from your actual audio, so you can see
  the loud parts before you jump to them

### Window & modes

- A custom frameless window with its own title bar and menu bar - Alt toggles
  the menu, and the bar stays out of your way when you don't need it
- **Full mode** for library work, **mini mode** for focused listening: a
  condensed player card stacked over the queue (Ctrl+M flips between them)
- Sleep blocker so practice sessions never get interrupted, desktop
  notifications, and an automatic update checker

### Settings

- Settings organised the way you'd look for them: library, look and feel,
  and playback engine - no config-file spelunking

## Keyboard shortcuts

Every shortcut below is real - press `?` any time inside the app to see them
all.

| Keys                  | Does                      |
| --------------------- | ------------------------- |
| `Space`               | Play / pause              |
| `[`                   | Set loop point A          |
| `]`                   | Set loop point B          |
| `\`                   | Clear the loop            |
| `<-` / `->`           | Seek 10 seconds           |
| `Shift` + `<-` / `->` | Seek 1 second (fine)      |
| `Ctrl` + `K`          | Focus search              |
| `Ctrl` + `O`          | Import a folder or files  |
| `Ctrl` + `M`          | Toggle mini mode          |
| `Alt`                 | Toggle the menu bar       |
| `?`                   | Open the shortcuts panel  |
| `Esc`                 | Close the shortcuts panel |

## What it is / what it is not

- **It is:** a fast, focused Windows player for listening and practice.
- **It is not:** cross-platform - Windows 10/11 64-bit is the only target.
- **No telemetry, no account, no network needed for playback.** Your files stay
  yours, on your machine.

## Requirements & install (Windows)

- **OS:** Windows 10/11, 64-bit. That is the only supported platform - there
  are no macOS or Linux builds from this fork.
- **Install:** build the Windows installer on this machine with `vp install`
  then `vp run tauri build` (NSIS installer lands in
  `src-tauri/target/release/bundle/nsis/`), run it, add one or more library
  folders in Settings -> Library.
- **Run:** launch Slowburn, import, press play. No account, no server, no
  network needed for playback.

## Development setup

Drawn from `AGENTS.md` - the real commands, nothing invented:

```bash
vp install            # install dependencies
vp run tauri dev      # Vite + Tauri with hot reload
vp check              # formatting (Oxfmt) + lint/typecheck (Oxlint)
vp build              # front-end build only (also regenerates the route tree)
```

```bash
# Rust (run inside src-tauri/)
cargo test            # backend tests must pass after Rust edits
vp run clippy         # bonus: Rust linting
```

```bash
vp run gen:types         # regenerate TS types from Rust (ts-rs) after changing an exposed struct
vp run gen:translations  # extract i18n strings to .po files
```

Notes:

- Never hand-edit `src/generated` - always regenerate.
- SQLite migrations under `src-tauri/src/migrations` are frozen - new change,
  new file.
- New Tauri commands go in `build.rs` and need allowing in
  `src-tauri/capabilities/main.json`.

## Credits & licence

- Upstream: **[Museeks](https://github.com/martpie/museeks)** by
  **Pierre-Louis Maugin (martpie)** and contributors.
- This fork's `package.json` carries `author: Pierre de la Martinière`
  and `repository: https://github.com/martpie/museeks`; the `LICENSE` file
  carries `Copyright (c) 2015 Pierre de la Martinière` under the **MIT
  licence** (`"license": "MIT"`).
- Slowburn-specific work (Slow/Reverb UX, A-B repeat, skins, mini mode,
  queue, multi-folder UX, title bar) is the fork owner's, on top of the
  Museeks base. If you like the base player, star and support upstream.

## Windows-only, personal-use

Slowburn is a personal project, and that's exactly why it can say what it
is: a great single-platform player for Windows listening and practice. No
telemetry, no accounts, no cross-platform compromises - and no invented
numbers, because a player this focused doesn't need them. If it's useful to
you on Windows, enjoy it.
