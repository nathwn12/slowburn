# Slowburn

Windows music player for practice: open a track, slow it down, add reverb, and repeat one passage with an A-B loop.

## Install

No installer is published yet. Build on a Windows machine:

```text
git clone https://github.com/nathwn12/slowburn.git
cd slowburn
vp install
vp run tauri build
```

Run the NSIS installer from `src-tauri/target/release/bundle/nsis/`, launch Slowburn, and add a music folder. Requires Windows 10/11, 64-bit.

No release is published to pin. Build from the checked-in 0.23.7 sources with the commands above; `package.json` and `src-tauri/tauri.conf.json` both carry version 0.23.7.

## Usage

Import music and start it:

```text
Ctrl+O    add a folder or files to the library
Space     play or pause the current track
```

Loop the passage being learned. Loop, speed, and reverb settings are remembered per file:

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
- A-B loop on the seek bar; saved loops reapply when the track reopens
- Queue with drag-to-reorder, multi-folder library, and search
- Four themes: Light, Dark, Dark Warm, AMOLED
- Plays mp3, flac, ogg, opus, m4a, wav, aac, 3gp, and weba

## Requirements

- Windows 10/11, 64-bit
- To build: Node 24.14.0, pnpm 11.0.9, and a stable Rust toolchain

## Links

- Repository: https://github.com/nathwn12/slowburn
- Issues: https://github.com/nathwn12/slowburn/issues
- Upstream player this fork builds on: https://github.com/martpie/museeks

## License

MIT. See [LICENSE](LICENSE).
