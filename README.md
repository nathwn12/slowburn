<p align="center">
  <img src="src-tauri/icons/icon.png" width="120" height="120" alt="Slowburn icon" />
</p>
<h1 align="center">Slowburn</h1>
<p align="center"><strong>Slow any track, add reverb, and keep an A-B loop for every song on Windows.</strong></p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/github/license/nathwn12/slowburn" alt="License" /></a>
  <img src="https://img.shields.io/github/languages/top/nathwn12/slowburn" alt="Language" />
  <img src="https://img.shields.io/badge/platform-windows--64bit-2b3137?logo=windows&logoColor=white" alt="Platform" />
</p>

## Why

Slowburn plays your local library at reduced speed with reverb, tempo and pitch control. Each track keeps its own A-B loop, so a section you mark is still there when you reopen the song. It is a Tauri desktop app with a React front end. The code is derived from museeks, credited below.

## Install

No installer is published yet. Build it on Windows:

```powershell
git clone https://github.com/nathwn12/slowburn.git
cd slowburn
bun install --frozen-lockfile
bun run tauri build
```

Then run the NSIS installer from `src-tauri\target\release\bundle\nsis\`.

## Use

Add music with `Ctrl+O`, then press `Space` to play. The header switches the right column between Library, Queue and Playlists.

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

The effects strip under the transport sets SLOW, REVERB, TEMPO and PITCH. Each control has its own reset, and the settings survive a restart.

## Configure

Settings has five panes: Library, Audio, Interface, About and Advanced.

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
```

## Requirements

- Windows 10 or 11, 64-bit, with the WebView2 runtime (preinstalled on Windows 11).
- To build: Node 24.14.0, bun 1.4.4 and a stable Rust toolchain with the MSVC target.

## Links

- [Issues](https://github.com/nathwn12/slowburn/issues)
- [Releases](https://github.com/nathwn12/slowburn/releases)
- [Upstream: museeks by martpie](https://github.com/martpie/museeks)
- [MIT](LICENSE)

<p align="center">Built by nathwn12</p>
