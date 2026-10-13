# AIMP backend pipeline and staging — ranked take-list (Lane 3)

Clean-room ARCHITECTURE and BEHAVIOUR extraction only. No AIMP algorithm, code, skin, icon, language file or verbatim string is reproduced as a source; AIMP strings appear solely as labelled evidence with file:line. This document is a take-list for possible Slowburn-native implementation, not a copy plan.

- Target: AIMP `v5.40.2727 (08.09.2026)`, build/`VersionBuild` 2727, `Version=5400`.
- Install root: `<AIMP install root>` (Scoop `current` siblings are junctions; `Plugins` and `Profile` under it are junctions to `<Scoop persist root>\aimp`).
- Date of extraction: 2026-10-11. Read-only on the install tree; the running AIMP process (PID 14352) was not touched.
- Scope: (a) output pipeline, (b) gain staging / replay-gain, (c) library indexing and background scan, (d) plugin contract surface, (e) startup and lazy init. DSP algorithms, AIMP's slow/playback effect, reverb and A-B loop are out of scope by rule.

## Evidence base

All paths exact. Line numbers are 1-based.

AIMP install (read-only):
- `<AIMP install root>\Profile\AIMP.ini` — 22254 bytes, UTF-16LE, 368 lines. Sections and keys cited below.
- `<AIMP install root>\history.txt` — 251154 bytes, shipped changelog, 4200+ lines; quoted with their version header line.
- `<AIMP install root>\Langs\english.lng` — 99548 bytes UTF-16LE (read via its UTF-8 conversion, next entry).
- `<AIMP install root>\Plugins\` — 241 files; 32 plugin directories (241 recursive file count).
- `<AIMP install root>\AIMP.exe` (7138752 bytes), `AIMP.Shared.dll` (4643264), `AIMP.Runtime.dll` (15702464), `bass.dll`, `sqlite3.dll` (1662912), `libsoxr.dll`.
- `<AIMP install root>\Profile\AudioLibrary\Bookmarks.adb` (707), `Podcasts.db` (9216); `Profile\AlbumArts.Cache.db` (12810240), `Profile\CDDB.db` (4096).

Prior ledgers consumed (from `<scratch root>\`):
- `aimp-help-evidence.md` — CHM extraction method and resampling/tempo ledger (helper).
- `aimp-form-evidence.md` — `TAIMPDSPDIALOG` DFM decode (used only to confirm slider classes; its DSP content is out of scope here).
- `aimp-native-evidence.md` — sibling native pass on `AIMP.exe` (tempo/pitch/speed). Consumed and cited for cross-reference; the DSP/material there is out of scope.
- `aimp-dsp-evidence.md` — did NOT exist at run time (checked 2026-10-11).
- `help\langs_utf8\english.lng` — UTF-8 conversion of the install `Langs\english.lng`; cited as `english.lng` line numbers.
- `help\en\*.html` — 7-Zip extraction of `Help\AIMP-en.chm`; `faq_asio.html`, `faq_wasapi_ex.html`, `faq_null_out.html`, `internal_options.html` cited.
- `dump_soundout.txt` — DFM decode of `TAIMPOPTIONSFRAMESOUNDOUT` (RT_RCDATA in `AIMP.Shared.dll`), read-only reuse.

Own extraction this pass (scratch, outside the repo): scratch dir `<scratch root>\lane3\` — `inspect_db.py` (sqlite schema dump), `pe_exports.py` (PE export-table parser), `api_names.py` (interface-name string scan), `strings.py` (ASCII/UTF-16 string scan), `hist.py` (history line + version-header join), plus copied `Podcasts.db`, `AlbumArts.Cache.db`, `CDDB.db` (read via shared read handles; originals untouched).

Slowburn contrast surface (read only, not modified): `src-tauri/Cargo.toml`, `src-tauri/src/plugins/{db,stream_server,config,cover}.rs`, `src-tauri/src/libs/{database,track,events}.rs`, `src-tauri/src/migrations/*.sql`, `src-tauri/capabilities/main.json`, `src/lib/{player,effects,volume-curve}.ts`.

### Storage / persistence model observed

- Library sidecars sit under `Profile\AudioLibrary\`: `Bookmarks.adb` (AIMP in-memory DB format, magic `ADLMEMDB`) and `Podcasts.db`.
- SQLite (`sqlite3.dll` shipped in the install root) backs the caches and podcast store, all `encoding UTF-16le`, `journal_mode delete` (own dump `lane3\inspect_db.py`):
  - `Profile\AudioLibrary\Podcasts.db` (9216 bytes, `user_version 0`): tables `PodcastFeeds(FeedID, Name, Category, Copyright, Description, Language, AuthLogin, AuthPassword, Author, URL, URLFeed, URLLogo)`, `PodcastEpisodes(URI, FeedID, GUID, Title, Description, Artist, URL, URLAudio, URLAudioCached, PublishDate, Duration, State, Format, UNIQUE(URI, FeedID))`, `PodcastFeedLogos(ID, Data BLOB)`.
  - `Profile\AlbumArts.Cache.db` (12810240 bytes, `user_version 5`): `Images(Key TEXT, Timestamp DOUBLE, Image BLOB)` + `UNIQUE INDEX ImagesIndex ON Images(Key)` — a keyed cover-art blob cache.
  - `Profile\CDDB.db` (4096 bytes, `user_version 5300`): `DISCS(ID, sCDDB, sALBUMARTIST, sALBUM, sYEAR, sGenre)`, `TRACKS(DISKID, sTRACK, sARTIST, sTITLE)`, `UNKNOWNS(ID, sCDDB)`.
- The music library itself is not in these files: `AIMP.ini` `[MusicLibrary] ActiveDataStorage=TAIMPMLLocalDataStorage` (line 176) names an in-process local data storage, with `AIMP.ini:333-334` `[MusicLibrary.TAIMPMLLocalDataStorage] GroupingTreePreset=...` and `SearchPathCount=0` (line 184) recording only view/search state. Cover-art caching is keyed by a string `Key` with a timestamp for the cache-expiry policy (`english.lng:1150` `L4=Remove record from the cache after:`).

### AIMP.ini keys bearing on (a) output pipeline and (b) gain staging

Section `[AIMPSoundOut]` (header line 125):

| line | key | value |
|---|---|---|
| 126 | `SmoothVolumeChange` | `0` |
| 127 | `Mute` | `0` |
| 128 | `LoudnessCompensation` | `0` |
| 129 | `Volume` | `0.5799999833107` |
| 130 | `Balance` | `0` |
| 131 | `SkipSilenceAmplifyThreshold` | `-60` |
| 132 | `SkipSilenceDuration` | `0.5` |
| 133 | `PausePlaybackAtTrackBeginning` | `0` |
| 134 | `FadingEnabled` | `0` |
| 135 | `PreampForCalculatedValues` | `0` |
| 136 | `PreampForPredefinedValues` | `0` |
| 137 | `ReplayGainDefault` | `0` |
| 138 | `PlaybackPitch` | `0` |
| 139 | `PlaybackSpeed` | `100` |
| 140 | `PlaybackTempo` | `100` |
| 141 | `DeviceName` | `WASAPI: Windows Default` |
| 142 | `DeviceBitDepth` | `4` |
| 143 | `DeviceChannels` | `1` |
| 144 | `DeviceFreq` | `48000` |
| 145 | `VolumeMethod` | `1` |
| 146 | `RepeatMode` | `1` |

Adjacent output-relevant keys: `[Player] VisualSmoothStretch=1` (line 21); `[AIMPSoundOut.Fading.Automatic] Enabled=0` (26), `[AIMPSoundOut.Fading.Manual] Enabled=0` (29); `[BASS Decoder] UserAgent=AIMP/5.30` (120); `[AIMPSoundOut.MixingPresets] Count=0` (324).

Interpretation (inference, marked): `DeviceName` encodes method and target in one string (`WASAPI: Windows Default`), so method selection (WASAPI / DirectSound / ASIO / WASAPI-exclusive) and device choice are one composite. `DeviceBitDepth=4`, `DeviceChannels=1` are coded enum indices (not literal depths/channels); exact mapping is UNKNOWN, but the frame combo is a list and the history records 32-bit-float WASAPI handling (line 359). `DeviceFreq=48000` is a literal sample rate. `VolumeMethod=1` pairs with the "Logarithmic volume control" option (lang line 1493) and `SmoothVolumeChange` pairs with "Smooth volume changing" (lang line 804). `PreampForCalculatedValues` / `PreampForPredefinedValues` / `ReplayGainDefault` are three independent persisted gain-staging scalars (calculated source vs predefined source vs fallback default).

## Ranked take-list

Best first. Each take is an adaptation, not a clone.

### 1. Background library scan as a non-interrupting, monitored, incremental operation
- kind: `pattern`
- provenance: `english.lng` `[AIMPMLMonitoringSettingsDialog]` lines 460-477 (`CB1=Search for moved or renamed files`, `CB2=Delete non-existing files from data base`, `CB3=Reload tags`, `cbMinFD=If duration less than:`, `cbMinFS=If size less than:`, `cbScanOnStartup=Check for new files at application start up`, `cbTrackChanges=Monitor for changes while running`, `GB1=Monitoring`); `history.txt` line 1204 `AIMP v4.70.2210 Beta 1 (31.03.2020) * Music Library: new background operation no longer interrupts active operation`; line 1074 (v4.70.2236) search-for-moved/renamed may block the UI while a background sync runs; line 1489 (v4.51.2070) canceling a background task may hang; line 1437 (v4.51.2080) DB ops active in background; AIMP.ini `[MusicLibrary.TAIMPMLLocalDataStorage.SearchOptions] SearchPathCount=0` (line 184); `english.lng` line 246 `N6=Rescan tags`, line 2050 history (v4.00.1675 RC 3) rescan selected files only.
- what AIMP does: the music library is a pluggable data-storage registry (`AIMP.ini` `[MusicLibrary] ActiveDataStorage=TAIMPMLLocalDataStorage`, lines 174-181) whose scan is a monitored background operation with its own settings model: what to scan (paths, recursive toggle), skip filters (extension, min duration, min size), lifecycle actions (scan on startup, monitor while running, search moved/renamed, delete non-existing, reload tags), and the invariant that a new background operation must not interrupt an active one and must be cancelable without hanging.
- why it is worth taking: Slowburn's `scan_library` (`src-tauri/src/plugins/db.rs:147`) currently walks, parses and inserts in one awaited command that emits `IPCEvent::LibraryScanProgress` (`db.rs:194-220`) and holds the DB lock for the whole scan (`db.rs:153 get_lock`). Large libraries block other DB work and the UI path; AIMP's separation of scan trigger, filters and non-interruption is exactly the missing discipline.
- Slowburn-native form: add a scan-job layer over the existing `db.rs:147` command — a queue that owns the DB write lock only in short batched transactions, reads tags in a `rayon` pool (`db.rs:205` already uses `par_iter`), cancels cooperatively on a flag, and never preempts a running job. Persist a small `library_monitor` settings row (scan-on-startup, monitor-while-running, skip-by-extension, min-duration, min-size, search-moved, delete-missing) in the existing config/DB store. Reuse `walkdir` + `libs/utils.rs` visibility filter. No AIMP algorithm is involved.
- risk/effort: medium — the change is in the DB write path and the lock/transaction boundary; needs a cancellation test.

### 2. Explicit two-source gain-staging model (predefined tags vs on-the-fly analysis)
- kind: `pattern` + `data`
- provenance: `AIMP.ini` line 135 `PreampForCalculatedValues=0`, 136 `PreampForPredefinedValues=0`, 137 `ReplayGainDefault=0`, 145 `VolumeMethod=1`, 129 `Volume=0.5799999833107`; `english.lng` `[DSPDialog]` lines 811-822 (`GB1=Peak normalization`, `GB4=Replay gain normalization`, `L4=Preamp:`, `L9=Default value:`, `L10=Target volume level:`, `R2=Use value from tags`, `R3=Analyse file "on-the-fly"`), `[DSPDialog.cbReplayGainSource]` lines 848-850 (`i[0]=Source: File`, `i[1]=Source: Album`); `[OptionsSoundOutFrame]` lines 1493-1494 (`CB2=Logarithmic volume control`, `CB3=Loudness compensated volume control`); `history.txt` line 2599 (v3.60.1416 Beta 1) and 2600 (same) preamp/default for normalization added; line 1452 (v4.51.2075) preamp for tag values must not affect the default value.
- what AIMP does: gain staging is split into independent persisted scalars — a preamp applied to calculated (analyzed) values, a separate preamp applied to predefined (tag) values, a fallback/default value used as the base for on-the-fly analysis, and a target level — plus a volume method choice (plain vs logarithmic) and an optional loudness compensation. The normalization source (file/track vs album) is a user-selectable mode; values from tags and analyzed values are distinct paths.
- why it is worth taking: Slowburn already has the exact two-stage seam: a perceptual volume curve applied once (`src/lib/player.ts:167` `smoothifyVolume`, `src/lib/volume-curve.ts`) and a Web Audio master gain that owns loudness (`src/lib/effects.ts:124-215`, `masterGain`). But there is no replay-gain model at all. Separating "value from file tags" from "analysis default" prevents the exact class of bug AIMP logged at line 1452 ("preamp for values from tags affects to default replaygain value").
- Slowburn-native form: add replay-gain settings keys (`rg_mode` none/track/album, plus optional preamp) to the config plugin, keep the master-gain node in `effects.ts` as the single loudness owner, and apply one derived linear gain per track at load. Keep `smoothifyVolume` as the sole perceptual curve so the two gains never square. The numeric ranges AIMP stores (e.g. `Normalizer.VolumePreampMax=20`, `Min=-25`, `TargetLevel=0` at `AIMP.ini:51-53`) may be cited only as reference data for sensible bounds, not as an algorithm.
- risk/effort: low-medium — new settings plus a per-track gain step; must not double-apply with the existing element volume (already documented in `effects.ts:141-147`).

### 3. Two-level output configuration: device+method selection separate from a parameters block
- kind: `pattern` + `data`
- provenance: `AIMP.ini` lines 141-145 (`DeviceName=WASAPI: Windows Default`, `DeviceBitDepth=4`, `DeviceChannels=1`, `DeviceFreq=48000`); `dump_soundout.txt` objects `cbDevice : TACLComboBox` (line 143) with a "..." button, `pnlParams : TACLPanel` (157) containing `cbBitDepths` (164), `cbChannelMode` (180), `cbFreq` (191), and `pnlCache` (207) with `tsCache : TACLSlider` (229, `OptionsValue.Page = 2.0`, `OptionsValue.Default = 0.0`); `english.lng` `[OptionsSoundOutFrame]` lines 1490-1499 (`L1=Sound output type:`, `L2=Device:`, `L3=Parameters:`, `L4=Cache size:`, `CB1=Pre-load next track while current is playing (requires more memory)`); exclusive-mode evidence `english.lng` line 1052 "Warning! Other applications will not be able to output sound if this output device type is used in AIMP." and `help\en\faq_wasapi_ex.html:10`; `help\en\faq_asio.html:10` and `faq_null_out.html:10`; `internal_options.html` keys `[BASS Decoder] AccurateSeeking=1`, `[BASS Decoder] ForceOriginalSampleFormat=1`, `[AIMPSoundOut] ShowErrorDialog=0`.
- what AIMP does: output is configured as (1) a device/method picker whose items are grouped and drawn on demand, (2) a separate parameter block of bit depth / channel mode / sample rate combos, (3) a separate cache/buffer slider, and (4) an explicit warning when an exclusive-access method is chosen, because that method takes the device from other apps. Sample format is a decoder concern with hidden options (accurate seeking / original sample format).
- why it is worth taking: Slowburn has no output-device or buffer surface at all; audio goes through an HTML `AudioContext`/`<audio>` element fed by the local `stream_server` (`src-tauri/src/plugins/stream_server.rs`). If output routing is ever exposed, AIMP's split (selection vs parameters vs buffer, plus a first-class exclusive-mode warning) is the correct information architecture and prevents the "no sound / other apps silent" support classes AIMP documents in its FAQ.
- Slowburn-native form: model a typed `OutputConfig { method, device_id, sample_rate, bit_depth, channels, buffer_frames, preload_next }` in the Rust config plugin (`src-tauri/src/plugins/config.rs`), surface the method list and the parameter block as distinct controls, and gate exclusive/ASIO-style methods behind an explicit confirmation string equivalent to the AIMP warning. Tie `buffer_frames` to the `preload`/cache concept and to `stream_server` range serving; keep latency claims out (no measurement in evidence).
- risk/effort: medium-high — cross-platform device enumeration via a Rust audio backend is the real cost; the configuration shape itself is cheap.

### 4. Lazy, on-demand initialization discipline at startup
- kind: `pattern`
- provenance: `history.txt` line 1067 (v4.70.2236) `* General: reduced number of file accesses on app startup`; line 2646 (v3.55.1350) `* Sound engine: options dialog - list of supported formats is populated now on demand, not at options dialog initialization`; line 661 (v5.10.2408 Beta 2) `* Sound engine: unloading of unused ASIO drivers without app restart`; line 630 (v5.10.2414) `restart ASIO-driver on error without restart the app`; line 48 (v5.40.2715) `* Sound Engine: preloading next track starts halfway through the track and at least a minute before the end`; `english.lng` `[OptionsFramePlugins]` line 1370 `B1=Restart now`.
- what AIMP does: expensive or risky work is deferred past startup and made recoverable without an app restart — format lists populate when a dialog opens, unused device drivers unload, a failed device/driver re-initializes in place, next track preloads ahead. Plugin lifecycle likewise supports load/unload and an explicit restart affordance. The changelog also records the failure modes of NOT doing this (crashes and hangs during startup, lines 1791, 1804, 1873).
- why it is worth taking: Slowburn starts Tauri plugins in `src-tauri/src/main.rs` and opens the DB and stream server during setup; heavy work during `setup` delays first paint. AIMP's pattern says: bind cheaply (Slowburn already binds the stream server synchronously to get its port, `stream_server.rs:174-185`), and defer/recover everything else.
- Slowburn-native form: keep startup to cheap synchronous bindings (port, config read) and move DB open, scan scheduling and cache warm-up behind the first command or an idle task; give the audio path a re-initialize-in-place path on device/format change rather than requiring an app restart; preload the next track only within a bounded window. This is a discipline take, not machinery.
- risk/effort: low — mostly reordering existing init; needs a cold-start timing check.

### 5. Plugin package layout plus a minimal single-entry contract
- kind: `pattern`
- provenance: PE export tables (own parse `pe_exports.py`): 13 AIMP-native plugin DLLs export exactly one entry point, `AIMPPluginGetHeader` (plus the Delphi `__dbk_fcall_wrapper` / `dbkFCallWrapperAddr` shims); a recursive export inspection found 19 files exporting that entry point in total, of which six are backup Discord DLLs, so the count is 13 only after excluding those backups — e.g. `Plugins\aimp_scheduler\aimp_scheduler.dll`, `aimp_infobar`, `aimp_webLyrics`, `aimp_cdda\aimp_cdda.dll`, `aimp_inputFFmpeg.dll`, `aimp_podcasts.dll`, `aimp_scrobbler.dll`. BASS decoder add-ons export `BASSplugin` instead (e.g. `Plugins\bass_flac\bass_flac.dll` → `BASS_FLAC_StreamCreateFile(URL)`, `BASSplugin`). Directory convention: one directory per plugin carrying the DLL and its own `Langs\` and resources (`Plugins\aimp_scheduler\` = `aimp_scheduler.dll` + `Langs\*.lng`; `Plugins\enc_opus\` = `enc_opus.xml` + `opusenc.exe`; `Plugins\aimp_webLyrics\` = DLL + `.ini`). Interface surface (ASCII strings in `AIMP.exe`/`AIMP.Shared.dll`, own scan `api_names.py`, 908 distinct `IAIMP*` names): `IAIMPPlugin`, `IAIMPAddonPlugin`, `IAIMPAddonPluginHeader3`, `IAIMPCore`, `IAIMPCoreSystemNotification`; services `IAIMPService{Config,Player,PlaylistManager,FileInfo,FileManager,MusicLibrary,MUI,Threads,Shutdown,OptionsDialog,Actions,...}`; extensions `IAIMPExtension{AudioDecoder,FileFormat,FileInfoProvider,LyricsProvider,AlbumArtProvider,PlaybackQueue,PlaybackBookmarks,PlaylistPreimageFactory,...}`; UI frames `IAIMPOptionsDialogFrame`, `IAIMPUI*`; legacy namespace strings `AIMP.Plugins.Old.SDKCore` / `SDKCommon` / `SDKAddons` and `TAIMPMLPluginBasedDataStorage` (`english.lng` `[OptionsFramePlugins]` lines 1369-1379: `N2=Load selected`, `N4=Unload selected`, `N6=Unload non-standard`; AIMP.ini `[Plugins]` line 225 `aimp_inputFFmpeg.dll=0` and `[Plugins.CachedInfo]` line 228 a `version|author|name|description|supported-formats|timestamp` record).
- what AIMP does: a plugin is a DLL in its own folder exporting one header function; the interface-name strings name a core object (`IAIMPCore`) and the capability interfaces, so a host-supplied core object from which the plugin resolves services and registers extensions is inferred from those names, not observed as a runtime call protocol; the monitor exposes a load/unload surface with a cached metadata record per DLL, which shows metadata is cached separately from code, but whether that cache lets the UI list plugins without loading them is not proven.
- why it is worth taking: Slowburn plugins are compiled-in Tauri plugins (`src-tauri/src/plugins/mod.rs`), so there is no third-party extension seam. AIMP's shape — one directory per plugin, one discoverable entry point, a registry keyed by capability, and metadata cached separately from code — is the right template if Slowburn ever wants out-of-tree decoders or providers, and it costs nothing to adopt the directory/metadata convention now for internal modules.
- Slowburn-native form: do not clone the COM-style interface set. Adopt the pattern: each extension is a folder with a manifest (`id`, `name`, `version`, `capabilities`, `author`) plus an entry descriptor, discovered and cached in the DB/config, with capability registries for decoder/cover/lyrics providers mirroring the existing `bridge-*.ts` plus Rust-command boundary. Keep it in-process and typed; dynamic loading is a separate decision, not this take.
- risk/effort: low for the convention/metadata; high only if dynamic loading is pursued.

## Considered and rejected

- **Full HP/COM-style interface replication** (`IAIMPUIPageControl`, `IAIMPUISlider`, the 908 `IAIMP*` names). Rejected: a Web-UI stack has no analogue and would be dead weight; only the contract *shape* (services + capability extensions + options frames) is portable.
- **On-the-fly analysis cache semantics** (`history.txt` 1104, 1263, 2452, 3418 — analysis quality/cache-reset tuning). Rejected as close to algorithm territory and irrelevant until a replay-gain analysis path exists.
- **Device driver restart/unload machinery** (`history.txt` 630, 661). Rejected as a take of its own and folded into take 4 as a discipline: a cross-platform Rust audio backend is required before the machinery is meaningful.
- **Dedicated ASIO/Windows-Vista era fixes** (`history.txt` 487, 3219, 551, 1719). Rejected: platform-specific to AIMP's engine; no Slowburn benefit.
- **The `[MusicLibrary.*.Presets]` / grouping-tree blob encoding** (`AIMP.ini` lines 329-368, XML/hex presets). Rejected: internal serialization format, not architecture, and not needed to adopt the background-scan behavior.
- **Plugin-based music-library data storage** (`TAIMPMLPluginBasedDataStorage`, `AIMP.ML.PluginDataStorage`) as a separate take. Rejected: folded into takes 1 and 5; adopting it standalone would over-abstract the single local storage Slowburn has.
- **AIMP's composite `DeviceName` string format**. Rejected as a data encoding; take 3 uses a typed struct instead.

## UNKNOWN

- Numeric mapping of `DeviceBitDepth=4` and `DeviceChannels=1` to real bit depth and channel mode. The frame uses list combos (`dump_soundout.txt` `cbBitDepths`, `cbChannelMode`) and the values are coded; the enum tables are not in evidence.
- Real buffer/latency numbers. `tsCache` (`dump_soundout.txt:229`) exposes `OptionsValue.Page = 2.0` only; no min/max/unit, and no latency value anywhere in the ini, lng or history.
- `VolumeMethod=1` semantics (which index is linear vs logarithmic). Correlated with `CB2=Logarithmic volume control` (`english.lng:1493`) but the index-to-mode mapping is not proven.
- `[Plugins] aimp_inputFFmpeg.dll=0` semantics (load state vs flag) versus `[Plugins.CachedInfo] ...=2|...` (line 228). The record shape is visible; the field meanings are inferred, not proven.
- Exact startup ordering and what "reduced number of file accesses on app startup" (history line 1067) changed. Only the intent is in evidence, not the mechanism.
- Whether AIMP monitors folders continuously via an OS watcher or via polling. `cbTrackChanges=Monitor for changes while running` states the behaviour, not the mechanism.
- `Podcasts.db` / `AlbumArts.Cache.db` / `CDDB.db` internal schema beyond the tables dumped (below); both were copied read-only under a shared handle, so live WAL/state was not inspected. `AlbumArts.Cache.db` is 12810240 bytes on 2026-10-11, not the 694272 bytes stated in the brief (stale figure).
- `Bookmarks.adb` is not sqlite; it is AIMP's own in-memory database serialization (magic `ADLMEMDB`, trailing marker `BkmD`; field names visible in the header: `CreatedAt, Duration, FileName, FileSize, Timestamp, Labels, Name, Comment, Source, Type`). Its full binary layout is UNKNOWN.
- Plugin runtime call protocol. The exported `AIMPPluginGetHeader` entry point and the interface-name strings (`IAIMPCore`, `IAIMPPlugin`, `IAIMPAddonPlugin`, the capability extensions) establish an exported-entry and package pattern, but not how the host passes a core object to a plugin or how service resolution and extension registration occur at run time; no call sequence is observed.
- Whether the `[Plugins.CachedInfo]` record (`AIMP.ini` line 228) lets the plugin list be shown without loading each DLL. The record shows metadata is cached per DLL, but the load behaviour that populates and consumes it is not observed, so listing-without-loading is inferred, not proven.

## Excluded by clean-room rule

Deliberately NOT taken: every AIMP DSP effect algorithm (reverb, echo, flanger, chorus, EQ, normalizer, true bass, enhancer, voice remover, silence remover) — only their numeric ranges/defaults were read as reference data; AIMP's slow/playback effect, its reverb, and its A-B loop are banned outright; and no AIMP code, skin, icon, language file or verbatim string is copied. `[AIMPSoundOut.DSP]` (`AIMP.ini:49-63`) and `[Player.CustomEqPreset]`/`[Player.AutoEqPreset]` (277-321) were read for key presence only and are not proposed. Tempo/pitch/speed and resampling are owned by sibling workers and are not duplicated here.
