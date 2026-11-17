<p align="center">
  <img src="src-tauri/icons/icon.png" width="120" height="120" alt="Slowburn icon" />
</p>

<h1 align="center">Slowburn</h1>

**A Windows media player with slowed playback, reverb, and a saved A-B loop for every track.**

## Install

No installer is published yet, so build it on Windows:

```powershell
git clone https://github.com/nathwn12/slowburn.git
cd slowburn
bun install --frozen-lockfile
bun run tauri build
```

Then run the NSIS installer from `src-tauri\target\release\bundle\nsis\`.

## Use it

Add music with `Ctrl+O`, then press `Space` to play. The header switches the right column between Library, Queue, and Playlists.

```text
Ctrl+O    add folders or files
Ctrl+K    focus search
Space     play or pause
Ctrl+M    toggle mini mode
?         show every shortcut
```

Set a loop on the seek bar; it is saved per track and reapplied when you reopen the track.

```text
[         set loop point A
]         set loop point B
\         clear the loop
```

The effects strip under the transport sets SLOW, REVERB, TEMPO, and PITCH. Each control has its own reset, and the settings survive a restart.

## Configure it

Settings has five panes: Library, Audio, Interface, About, and Advanced.

| Setting | Default | Pane |
| --- | --- | --- |
| Theme | System | Interface |
| Mode | Full | Interface |
| Accent color | `#459ce7` | Interface |
| Tint accent from cover art | Off | Interface |
| Notifications | Off | Interface |
| Stream server | Off | Advanced |
| Refresh library on startup | Off | Advanced |

```text
Settings > Interface > Theme: Dark
Settings > Interface > Mode: Mini
Settings > Interface > Accent color: #459ce7
```

## Requirements

- Windows 10/11, 64-bit, with the WebView2 runtime (preinstalled on Windows 11)
- To build: Node 24.14.0, bun 1.4.4, and a stable Rust toolchain with the MSVC target

## Development

```sh
bun install --frozen-lockfile
bun run test:typings
bunx vp check
bunx vp test run --project e2e
cargo test --locked --manifest-path src-tauri/Cargo.toml
```

CI runs the same steps on Windows. The repo pins bun 1.4.4 and commits `bun.lock`; install with bun so an npm or pnpm tree never replaces the lockfile.

## Status

**Experimental** — pre-release; interfaces may change.

## Links

- [Issues](https://github.com/nathwn12/slowburn/issues)
- [Releases](https://github.com/nathwn12/slowburn/releases)
- [Upstream: museeks by martpie](https://github.com/martpie/museeks)
- [MIT](LICENSE)
