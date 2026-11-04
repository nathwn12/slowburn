<p align="center">
  <img src="src-tauri/icons/icon.png" width="120" height="120" alt="Slowburn icon" />
</p>

# Slowburn

Slowburn is a Windows media player with slowed reverb and an A-B loop. Open a track, slow it down, add reverb, and loop a passage.

## Install

There is no downloadable installer yet. The fastest real route is to build it on a Windows machine:

```text
git clone https://github.com/nathwn12/slowburn.git
cd slowburn
vp install
vp run tauri build
```

Run the NSIS installer from `src-tauri/target/release/bundle/nsis/`, launch Slowburn, and add a music folder. You need Windows 10/11, 64-bit.

No release is published to pin. Build from the checked-in 0.23.7 sources with the commands above; `package.json` and `src-tauri/tauri.conf.json` both carry version 0.23.7.

## Usage

Import music and start it:

```text
Ctrl+O    add a folder or files to the library
Space     play or pause the current track
```

Loop the passage you are learning. Your loop, speed, and reverb settings are remembered per file:

```text
[         set loop point A at the playhead
]         set loop point B at the playhead
\         clear the loop
```

Shape the sound, then shrink the window:

```text
Open Effects, move the slow and reverb sliders, reset to dry when done
Ctrl+M    switch between full and mini mode
?         show every shortcut
```

## What it does

- Slow and reverb effects that stay set per track, with one-click reset to dry
- A-B loop on the seek bar; saved loops reapply when you reopen the track
- Queue with drag-to-reorder, multi-folder library, and search
- Four themes: Light, Dark, Dark Warm, AMOLED
- Plays mp3, flac, ogg, opus, m4a, wav, aac, 3gp, and weba

## Requirements

- Windows 10/11, 64-bit
- To build: Node 24.14.0, pnpm 11.0.9, and a stable Rust toolchain

## Development

```sh
pnpm install --frozen-lockfile
pnpm run test:typings
pnpm exec vp check
pnpm exec vp test run --project e2e
cargo test --locked --manifest-path src-tauri/Cargo.toml
```

Upstream player this fork builds on: museeks by martpie. Issues are tracked in this repository.

## Status

Experimental and still moving. It works today, but it is not a finished
product: interfaces may change, features may be improved or removed, and a
release can break the one before it. This is maintained by one person, not a
team. If it breaks, open an issue with the command you ran and what you saw.

## Links

- [Upstream museeks by martpie](https://github.com/martpie/museeks)
- [Issues](https://github.com/nathwn12/slowburn/issues)
- [Releases](https://github.com/nathwn12/slowburn/releases)
- [MIT](LICENSE)
