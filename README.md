# Slowburn

**Slow down the hard part of a track and loop it until you can play it.**

Slowburn is a Windows music player for practice. Open a track, slow it down, add reverb, and repeat one passage with an A-B loop.

## Install

There is no downloadable installer yet. The fastest real route is to build it on a Windows machine:

```text
git clone https://github.com/nathwn12/slowburn.git
cd slowburn
vp install
vp run tauri build
```

Run the NSIS installer from `src-tauri/target/release/bundle/nsis/`, launch Slowburn, and add a music folder. You need Windows 10/11, 64-bit.

### Offline or pinned

No release is published to pin. Build from the checked-in 0.23.7 sources with the commands above; `package.json` and `src-tauri/tauri.conf.json` both carry version 0.23.7.

## Use it

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

## What you get

- Slow and reverb effects that stay set per track, with one-click reset to dry
- A-B loop on the seek bar; saved loops reapply when you reopen the track
- Queue with drag-to-reorder, multi-folder library, and search
- Four themes: Light, Dark, Dark Warm, AMOLED
- Plays mp3, flac, ogg, opus, m4a, wav, aac, 3gp, and weba

## Requirements

- Windows 10/11, 64-bit
- To build: Node 24.14.0, pnpm 11.0.9, and a stable Rust toolchain

## Links

- Repository: https://github.com/nathwn12/slowburn
- Issues: https://github.com/nathwn12/slowburn/issues
- License: MIT, see LICENSE
- Upstream player this fork builds on: https://github.com/martpie/museeks
