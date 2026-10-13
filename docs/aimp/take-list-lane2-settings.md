# AIMP settings-architecture take-list (Lane 2)

This document surveys the architecture and behaviour of AIMP's on-disk SETTINGS and CONFIG layer and ranks at most five takes worth adapting for Slowburn. AIMP version surveyed: 5.40, build 2727 (Scoop package `extras/aimp`). Date: 2026-10-11.

This is CLEAN-ROOM behaviour extraction only. AIMP is proprietary and closed-source. Nothing here copies AIMP code, skins, icons, language files, preset values, or verbatim strings, and nothing proposes an AIMP string as Slowburn UI copy. AIMP key names appear only as provenance identifying which file supplied a fact. The AIMP slow-tempo, playback-timing, reverb, and A-B loop domains are out of scope and are not covered.

## Evidence base

AIMP side (read for this document):

- `<AIMP install root>\Profile\AIMP.ini` - the LIVE user profile, 22254 bytes, UTF-16LE, 368 lines, reached through a junction `Profile` -> `<Scoop persist root>\aimp\Profile` (LinkType=Junction, verified). Lines used: 1-7 (`[System]`), 19, 25-29, 31-47 (`[Encoders.*]`), 49-63 (`[AIMPSoundOut.DSP]`), 65-75 (`[Playlist.Manager]`, `[Playlist.Storage]`), 77-79 (`[Skins]`), 81-82, 84-86, 88-109 (`[InfoBar]`), 111-117 (`[Skins.shared]`), 119-120, 122-123, 125-146 (`[AIMPSoundOut]`), 148-149, 151-166 (`[SentTo.*]`), 168-172, 174-181, 183-185, 187-190 (`[Options]`), 192-196, 198-205, 207-215, 217-222 (`[Updater]`), 224-228, 230-246 (`[DiscordPresence]`), 248-250, 252-267, 269-275, 277-298 (`[Player.CustomEqPreset]`), 300-321 (`[Player.AutoEqPreset]`), 323-324, 326-327, 329-331, 333-368.
- `%APPDATA%\AIMP\AIMP.ini` - the STALE user profile, build 2709. Lines used: 18-26 (`[System]`, `VersionBuild=2709`), 58-97 (`[AIMPSoundOut]`), 215-233 (`[AIMPSoundOut.DSP]`), 235-240 (`[Updater]`, `LastVersion=2716`), 289-291, 346-347, 356-358.
- `<AIMP install root>\AIMP.ini` - install-root identity file, 238 bytes (raw head verified), `[System]` at lines 1-7 (`UserMode=0`, `ID={GUID}`, `Build=2727`, `Version=5400`, `DefaultLang=english.lng`).
- `C:\Program Files\AIMP\AIMP.ini` - a third, stale identity file, 238 bytes, build 2709 (`Build=2709`, `Version=5400`, lines 1-6).
- `...\5.40.2727\Profile\EQPresetsLibrary.ini` - the named preset library, 20978 bytes, UTF-16LE with a BOM (its first bytes are `FF FE 5B 00`). Lines used: 1-2 (`[!]`, `LibVersion=2727`), 4-25 (first named preset: `Version=3`, `Band0`..`Band19`), through line 578 for the last. Section-header count = 26 (one reserved `[!]` header plus 25 named presets).
- `%APPDATA%\AIMP\EQPresetsLibrary.ini` - the stale copy of the same library, `LibVersion=2709`, same 25 preset sections.
- `...\5.40.2727\manifest.json` - the Scoop package. Lines used: 2 (`version`), 49-54 (`persist: Icons, Skins, Plugins, Profile`).
- `...\5.40.2727\install.json` - 60 bytes, `bucket`/`architecture` only.
- `<Scoop persist root>\aimp\Profile\Skins\Default.ini` - per-form window/layout state, 7010 bytes, UTF-16LE. Lines used: 1-2 (`[!]`, `ID=...`), 22-33 (`[AIMPMainForm]`), 35-49 (per-panel `Visible`/`SizeStored`), 51-57 (`[shared]`), 59-87 (`[TrayControl]`, `[QFI]`).
- `...\Profile\AIMP-ContextMenu.ini` - a named, versioned action registry, 1909 bytes, ASCII. Lines used: 1-3 (`[Menu]`, `Version=7`, `SubItemsCount=6`), 4-9 (`SubItem1`..`SubItem6`), 16-25 (one entry section).
- `...\Profile\aimp_scheduler.xml` (85 bytes) and `...\Profile\aimp_scrobbler.xml` (714 bytes) - plugin-owned state in the plugin's own XML format.
- `...\System\Catalogs-AlbumArt.ini` - a search-provider registry, lines 1-12 (`[Summary] Count=2`, `[Catalog0]`, `[Catalog1]` with `Title`/`Link`/`Icon`).
- `...\5.40.2727\Profile\Elevator.ini` (70 bytes, `[System]`) - a separate helper tool's profile.

Slowburn contrast side (read only; not modified):

- `src-tauri/src/plugins/config.rs` - the serde `Config` struct, `#[serde(default)]` additive keys, TOML via `HomeConfig` at `%CONFIG%/slowburn`. Lines used: 95-146 (struct), 125-131 and 153-159 (`default_view_migrated_v1` / `migrate_default_view`), 164-223 (`Default`), 111-123 (flat `audio_*` scalars), 144-145 (`menu_bar_visible`), 278-285 (`save`), 291-296 (storage dir).
- `src-tauri/src/libs/init.rs` - config load/migrate/save path. Lines used: 11-64; migration call at 45; legacy-dir rename at 18-33.
- `src-tauri/src/migrations/01_create_tables.sql`, `04_add_ab_loops.sql`, `05_track_metadata.sql`, `06_track_modified.sql` - numbered frozen SQL migrations, runner `sqlx::migrate!("src/migrations")` in `src-tauri/src/plugins/db.rs` line 62.
- `src/lib/sort-presets.ts` - the hardcoded named-sort-preset list. Lines used: 7-16, 26-32, 34-93.
- `src/lib/bridge-config.ts` - the UI config bridge. Lines used: 10-58.

## Ranked take-list

### 1. Named preset library as its own versioned artifact

- kind: pattern
- provenance: `...\Profile\EQPresetsLibrary.ini` lines 1-2 (`[!]` header, `LibVersion=2727`) and 4-25 (one bracketed section per named preset, each with a preset `Version=3` and a fixed numbered key set `Band0`..`Band19`), 26 sections total; stale copy `...\AppData\Roaming\AIMP\EQPresetsLibrary.ini` line 2 `LibVersion=2709`; parallel evidence `...\Profile\AIMP-ContextMenu.ini` lines 1-9 (`[Menu]`, `Version=7`, `SubItemsCount=6`, ordered `SubItem1..6`).
- what AIMP does: keeps named presets out of the main config file entirely, in a dedicated library file whose `[!]` header carries a library-level `LibVersion` equal to the app build. Each preset is one section, each section carries its own `Version` field plus a fixed numbered key set (reading that field as a schema version is inference; its meaning is unconfirmed, see UNKNOWN), and a second registry file shows the same convention for ordered named action entries.
- why it is worth taking: Slowburn's named sort presets are hardcoded in `src/lib/sort-presets.ts` (lines 34-93) with no library version and no room for user-defined entries, so any preset change is a code change plus a config `library_sort_keys` rewrite. A versioned data file lets the built-in set evolve and lets users keep their own additions across app updates without enlarging the settings struct.
- Slowburn-native form: add a second persisted artifact (for example `presets.toml`) modelled as a versioned document (`version: u32` plus `presets: Vec<NamedPreset>` where `NamedPreset` is `{ id, label_key, keys: Vec<SortKey> }`), reusing the existing `SortKey` type already exported from `plugins/config.rs` (lines 42-65). Ship the six current presets (lines 35-93 of `sort-presets.ts`) as built-ins merged additively with user entries, and expose reads/writes through a new helper beside `src/lib/bridge-config.ts`. Take the container shape only; do not import AIMP preset names or band data.
- risk/effort: low-medium. One new artifact plus a built-in/user merge rule and a small bridge addition.

### 2. Numeric config version stamp driving ordered migrations

- kind: pattern
- provenance: live `...\Profile\AIMP.ini` lines 6-7 (`Version=5400`, `VersionBuild=2727`); stale `...\AppData\Roaming\AIMP\AIMP.ini` lines 24-25 (`Version=5400`, `VersionBuild=2709`); install-root forms `...\5.40.2727\AIMP.ini` lines 4-6 (`Build=2727`, `Version=5400`) and `C:\Program Files\AIMP\AIMP.ini` lines 5-6 (`Build=2709`). Slowburn contrast: `src-tauri/src/plugins/config.rs` lines 130-131 and 153-159.
- what AIMP does: writes an explicit generation pair (a product version plus a build number) into the persisted config, and a stale file keeps the older build number, so a loader can identify which build wrote a file and branch on it. The stamp is duplicated in the install-identity scope as `Build`, distinct from the profile scope's `VersionBuild`.
- why it is worth taking: one numeric stamp lets a single ordered migration table select steps by source version, instead of accumulating a bespoke per-change flag; this is the same shape Slowburn already trusts for the database (numbered `sqlx` migrations). The take is the pattern AIMP demonstrates in its persisted profile, and it stands on that pattern rather than on any claim about Slowburn's own current config-migration state.
- Slowburn-native form: add `config_version: u32` to the `Config` struct, and replace the one-off flag with a `migrate(config_version)` routine invoked in `src-tauri/src/libs/init.rs` at line 45 that runs version-gated, idempotent steps and writes the new number once. The field's serde default MUST be the LEGACY sentinel (the oldest known version, 0), never the current constant: a config file that lacks the key predates versioning and must deserialize as legacy so the migration chain runs, whereas defaulting a missing key to current would stamp a legacy file as up to date and skip every version-gated migration. Keep TOML and serde; do not adopt the INI format. Note that AIMP's `[Updater] LastVersion` (live line 220 `2727`, stale line 240 `2716`) sits in the updater scope and is not evidence of a config-migration key.
- risk/effort: low. Touches the `Config` struct, `init.rs`, and one unit test.

### 3. Transient layout and window state kept out of user preferences

- kind: pattern
- provenance: `...\Profile\Skins\Default.ini` lines 22-33 (`[AIMPMainForm]` with `Position`, `DPI`, `WindowState`, `PositionMagnets`, `ScreenIndex`), 35-49 (per-panel `Visible`/`SizeStored`), 51-57 (`[shared]` with per-form locked/stay-on-top flags), 59-87 (`[TrayControl]`, `[QFI]`). Slowburn contrast: `src-tauri/src/plugins/config.rs` lines 105-110 (`ui_details_open`, `ui_ab_open`) and 144-145 (`menu_bar_visible`).
- what AIMP does: keeps momentary, display-specific UI geometry (window position, DPI, docked state, per-panel visibility and stored sizes) in a skin/layout file, separate both from user preferences and from the main profile.
- why it is worth taking: Slowburn already mixes user choices and UI disclosure state into the settings struct (config.rs lines 105-145). Adding window geometry and panel sizes there enlarges the blast radius of any config reset and mixes machine-specific display data with portable preferences, which also complicates the portability goal in take 4.
- Slowburn-native form: give layout state its own scope - either a `layout` sub-object or a separate `layout.toml` handled by a dedicated manager - holding typed fields (window rect, maximised flag, panel visibility), leaving the user-facing `Config` stable. Persist through its own save path so a settings reset does not carry geometry with it.
- risk/effort: low-medium. One new persisted artifact plus window-event wiring.

### 4. Profile portability with a separate install-identity scope

- kind: pattern
- provenance: `...\5.40.2727\manifest.json` lines 49-54 (`persist: Icons, Skins, Plugins, Profile`); verified junctions (`Profile`, `Icons`, `Skins`, `Plugins` all LinkType=Junction into `<Scoop persist root>\aimp\`); install-root `...\5.40.2727\AIMP.ini` lines 1-7 (tiny `[System]` holding only `UserMode`, `ID={GUID}`, `Build`, `Version`, `DefaultLang`); `C:\Program Files\AIMP\AIMP.ini` lines 1-6 (same shape, stale). Slowburn contrast: `src-tauri/src/plugins/config.rs` lines 291-296 and `src-tauri/src/libs/init.rs` lines 18-33.
- what AIMP does: splits a very small install-identity file (machine/install id, user mode, default language, build) from a much larger user profile, and stores the user profile outside the install tree so an application update replaces the install without touching the profile. The Scoop package formalises this by declaring the profile directory persistent.
- why it is worth taking: it makes the "what survives an update" boundary explicit. Slowburn already places config at `%CONFIG%/slowburn` (config.rs lines 291-296) and already migrates legacy `museeks` directories (init.rs lines 18-33), but it has no stated separation between install/machine identity and the portable user profile, so identity-like fields could drift into the user's settings file.
- Slowburn-native form: keep `config.toml` as the portable user profile; if install or machine identity is ever needed, give it its own small file (for example an install id) rather than adding fields to `Config`, and document the portability contract in the config plugin. Do not adopt AIMP directory names or id values.
- risk/effort: low. Mostly a documented contract, plus one small file only if identity is actually needed.

### 5. Output-device settings grouped in one audio scope

- kind: pattern
- provenance: live `...\Profile\AIMP.ini` lines 125 and 141-145 (`[AIMPSoundOut]`, and within it `DeviceName=WASAPI: Windows Default`, `DeviceBitDepth=4`, `DeviceChannels=1`, `DeviceFreq=48000`, `VolumeMethod=1`); stale `...\AppData\Roaming\AIMP\AIMP.ini` lines 88-96 with the same keys at `DeviceBitDepth=5`. Slowburn contrast: `src-tauri/src/plugins/config.rs` lines 111-123 (flat `audio_*` scalars with no device or output concept).
- what AIMP does: keeps a selected output-device name and a set of persisted output parameters (bit depth, channels, sample rate, volume method) together in one audio scope. The file establishes persisted field values only; that these are negotiated parameters, or synchronised with the active driver, is inference and not demonstrated by the config (see UNKNOWN).
- why it is worth taking: Slowburn has no persistence at all for output-device selection or negotiated parameters (config.rs lines 111-123), and any WASAPI or device-selection story will need it. Grouping the device facts keeps them from being scattered as top-level scalars and keeps them additively serializable beside the existing audio keys.
- Slowburn-native form: add an `audio_output` sub-struct (`device_name`, `bit_depth`, `channels`, `sample_rate`, `volume_method`) that serializes additively, following the established additive-key precedent in config.rs (lines 144-145), leaving existing `audio_*` scalars untouched for backward compatibility.
- risk/effort: medium. Only worth doing if Slowburn adds output-device selection; otherwise park it.

## Considered and rejected

- Whole-file flat INI as the config format. The live profile is a single UTF-16LE INI with bracketed sections and dot-suffixed flat keys (for example `Normalizer.VolumePreampMax` at line 51, `FFTEqualizer.Bands` at line 61, and the nested-looking section `[MusicLibrary.TAIMPMLLocalDataStorage.SearchOptions]` at line 183). Rejected: Slowburn's TOML plus serde gives the same scoping with type safety and no encoding churn.
- `Count` plus `ItemN` list encoding. Seen at `[Playlist.Storage]` lines 73-75 (`Count=1`, `Item1=...`), `[SentTo.RenameTemplates]` lines 165-166, `[AIMPSoundOut.MixingPresets]` lines 323-324, and the ordered `OrderC=4` / `Order00..Order03` list at lines 177-181. Rejected: TOML arrays are typed, ordered, and appendable; the indexed-key form invites off-by-one and stale-index bugs.
- Opaque encoded blobs for UI state. Seen at line 257 (`Table.ColumnsData` hex), line 330 (`GroupingTree.Raw` base64-encoded XML), and lines 331, 339, 351, 359 (`TableView.Default` hex). Rejected: unreadable, unmergeable, and unevolvable without the encoder.
- Credentials inside the config file. Line 245 (`[DiscordPresence] CoverToken`) holds a live plaintext credential; the value is withheld here and must never be copied. Rejected as an anti-pattern: Slowburn routes secrets by pointer to the vault, not into `config.toml`.
- AIMP EQ preset values and band models as Slowburn data. `EQPresetsLibrary.ini` (lines 4-578) is preset tuning data. Rejected as a data take: it is asset-like third-party tuning rather than architecture, and it sits adjacent to the excluded audio-effects domain. Take 1 imports only the container shape.
- Packed positional strings for geometry and fonts. Seen at `[DSPDialog] WindowRect=1331,666,1977,1203` (line 86) and `InfoBar=Segoe UI,16777215,-28,2` (line 108). Rejected: typed fields (a rect struct, a font descriptor) are self-describing and safe to extend.
- Divergent duplicate config copies. Three AIMP config files exist and disagree on the same keys: `Normalizer.VolumePreampMax` is 20 in the live profile (line 51) and 10 in the stale profile (line 82); `DeviceBitDepth` is 4 live (line 142) and 5 stale (line 89). Rejected as a pattern: a second divergent copy is a hazard, not a design. Slowburn keeps one config dir and should keep one source of truth.
- Catalog/provider registry for album-art and radio search. Seen at `System\Catalogs-AlbumArt.ini` lines 1-12 (`[Summary] Count=2`, `[Catalog0]`, `[Catalog1]` with `Title`/`Link`/`Icon`) and `Catalogs-Radio.ini`. Rejected for now: a pluggable search-provider registry is a real pattern, but it is outside the settings scope of this lane and not requested.
- File-extension class lists as a `data` take. Seen at `AIMP-ContextMenu.ini` lines 11-13 (`ExtsPlay`, `ExtsLists`, `ExtsEdit`). Rejected: Slowburn's metadata layer already derives format facts (migration `05_track_metadata.sql` lines 23-24, `format` and `is_lossless`), and the extension lists add little.
- Plugin-owned state files as a settings target. Seen at `Profile\aimp_scheduler.xml` and `Profile\aimp_scrobbler.xml` (each a small self-describing XML option store) and `Profile\Elevator.ini`. Not taken: it is evidence that per-feature state is already well separated in take 3 and take 4, but there is no Slowburn plugin surface that needs its own settings file yet.

No `data` take is proposed. The genuinely reusable settings material is all structural; the AIMP data values that could be lifted (preset tuning, provider links, embedded icons) are asset-like or proprietary and are barred by the clean-room posture.

## UNKNOWN

- Whether AIMP's loader branches numerically on `VersionBuild` to run key migrations. The stamp exists in every profile (live lines 6-7; stale lines 24-25), but no loader source was read, so the branching behaviour is unproven.
- Whether AIMP backfills missing keys on save or writes only the keys it knows. Only the resulting files were observed.
- Read/write precedence among the three AIMP config files (live profile, `AppData\Roaming\AIMP\AIMP.ini`, `Program Files\AIMP\AIMP.ini`) when more than one exists. The persist junction resolves the live path, but which file AIMP treats as canonical is not evidenced.
- The exact semantics of `[Updater] LastVersion` (live line 220 `2727`; stale line 240 `2716`). It sits in the updater scope, so it appears to be update bookkeeping rather than a config-migration marker, but this is not confirmed.
- The meaning of the `[!]` reserved header section (`EQPresetsLibrary.ini` line 1, `Skins\Default.ini` line 1) and of the per-preset `Version=3` field (`EQPresetsLibrary.ini` line 5). Likely a schema-version convention; unconfirmed.
- Whether the paired sections `[AIMPSoundOut]` and `[AIMPSoundOut.DSP]` are both read at load, or one is a legacy shadow. Both carry overlapping keys (compare lines 49-63 with lines 57-84 of the stale file).
- Whether the EQ library `LibVersion` drives any migration of preset sections, or is informational only.
- Whether AIMP writes the whole profile file on every change or diffs it. The many `*.bak` siblings in the live profile directory (for example `AIMP.ini.bak`) were not evidenced as AIMP-generated and may be external.
- Whether the `[AIMPSoundOut]` device fields (`DeviceName`, `DeviceBitDepth`, `DeviceChannels`, `DeviceFreq`, `VolumeMethod`) are negotiated output parameters or synchronised with the active driver, or are merely the last persisted values. Only the stored values were observed.
