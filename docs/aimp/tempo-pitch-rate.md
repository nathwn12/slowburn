# AIMP independent tempo / pitch / rate control — extracted reference

This document records the OBSERVED BEHAVIOUR, PARAMETER DATA, and INTERFACE ARCHITECTURE of AIMP's
independent tempo / pitch / rate control. It is a clean-room reference: behaviour and parameter data
only, no AIMP code, no decompiled listings reproduced as implementation guidance, and no proposal to
copy AIMP's implementation. Every factual claim carries its provenance inline (a ledger name, a
binary address, an Evidence ID, a DFM property offset, a shipped-resource quote, or a live config
key). Anything that could not be sourced is listed once, intact, under `## UNKNOWN`.

AIMP's slow / playback effect, its reverb, and its A-B loop are OUT OF SCOPE for this document and
must not be read as takeaways. The other effect sliders that share the same dialog page (chorus, echo,
enhancer, flanger, reverb, true-bass, balance) are outside this document's subject; they appear here
only where a shipped form or ledger is cited for a cross-check that the subject controls are distinct
from them.

- Application: AIMP 5.40, build 2727 (Scoop install at `<AIMP install root>`).
- Platform: Delphi / VCL, PE32+ x86_64, not packed (`pe` / `x86_64` from `open_binary`, native ledger
  line 7).
- Date of extraction: 2026-10-11.
- Source binaries and their SHA-256:
  - `AIMP.exe` — `436bbec96419f7a5260eade9e6aa79c223432abe9acff087ceab2a1d24baa66b`
    (re-confirmed this pass by `Get-FileHash`; matches native ledger line 6).
  - `AIMP.Shared.dll` — `75d500e66137a94d2505137e2123f401af5e67ab94e372f09bfbf9e4fa366846`
    (re-confirmed this pass by `Get-FileHash`).
  - `libsoxr.dll` — present in the install root, 296384 bytes (re-confirmed this pass by `Get-Item`;
    help ledger line 160).
- Live configuration captured for this reference: `...\5.40.2727\Profile\AIMP.ini` (the `AppData\Roaming`
  profile on this machine is stale, build 2709, and was not used).

## Provenance method

Four methods produced the material below. Each is stated with its exact invocation form, and with the
classes of question it can and cannot answer. The bindings are: `NAT` = `aimp-native-evidence.md`,
`FORM` = `aimp-form-evidence.md`, `HELP` = `aimp-help-evidence.md`. A fourth ledger for the engine
module, `aimp-dsp-evidence.md`, was ABSENT at the time of writing and is marked as such; every
engine-side question it would have answered is therefore UNKNOWN here.

### 1. REA / Ghidra static analysis of `AIMP.exe` (ledger `NAT`)

- Toolchain: the REA `rea-agents` 6.4.0 workflow with the deep provider `ghidra` 12.1.4, on the
  Windows read-only P0 profile (NAT lines 8-10). The profile limitation is stated verbatim on every
  evidence block: "Windows Ghidra P0 accepts approved native x86 and x86-64 PE applications and DLLs;
  managed, hostile, sensitive, and mutable-path targets are unsupported." (NAT line 10).
- Invocation form: an OWNED stdio MCP session, `node node_modules/rea-agents/scripts/rea.mjs --mcp`
  (protocol `2025-11-25`), one `initialize` handshake, one `tools/open_binary`, then all analysis
  tools over the same session; driver `...\<scratch root>\rea-driver.mjs` (NAT lines 14-16). The CLI
  form (`rea search <path> ...`, `rea decompile <path> ...`) exists but pays a fresh Ghidra import per
  call and was rejected for a multi-step study (NAT line 14). Per-process environment only:
  `GHIDRA_INSTALL_DIR=<Ghidra install>`,
  `JAVA_HOME=<JDK home>`,
  `REA_GHIDRA_STARTUP_TIMEOUT_MS=1500000` (NAT line 16).
- Analysis tools used: `open_binary`, `binary_overview`, `search_strings`, `search_procedures`,
  `procedure_pseudo_code`, `read_function_instructions`, `read_bytes`, `xrefs`,
  `resolve_containing_procedure` (NAT throughout).
- CAN answer: what strings and imported symbols a module contains; which functions reference them;
  the exact instruction and constant values present in a function body; the import thunk table; which
  interface properties a module registers.
- CANNOT answer: behaviour implemented in another module (the engine lives in `AIMP.Shared.dll`);
  runtime-resolved interfaces that never appear as static imports; and numeric values that live in
  form data rather than code (NAT lines 200-205, 325-328).
- Ledger scope: `AIMP.exe` only. The engine symbols it names are IMPORTED externals
  (`AIMP.SHARED.DLL::_ZN3Aso...`), not analyzed code.

### 2. PE resource inspection and Delphi DFM decode (ledger `FORM`, and `HELP` section)

- `AIMP.exe` forms are `RT_RCDATA` (PE type id 10), not `RT_DIALOG`/`RT_STRING`; there is no second
  DIALOG-template encoding to cross-read (FORM lines 3, 311).
- The subject dialog resource: `TAIMPDSPDIALOG`, `RT_RCDATA`, language 0, codepage 1252, resource
  index 53; RVA `0x6AC9E4`, file offset `0x6A51E4`, payload size 28850 bytes (`0x70B2`); payload
  SHA-256 `b4d672c54222fc426d064f4e0b7547f88fa7fb848293585c0a4ba3e1726b37a1` (FORM lines 3-5).
- Format: Delphi/C++Builder classic BINARY DFM, header ASCII `TPF0`, uncompressed (not zlib/deflate,
  not LZ, not text) (FORM lines 12-13). Decoded by a targeted custom parser that consumed exactly
  28850/28850 bytes, the structural self-check that the form is fully and correctly decoded (FORM
  line 14).
- A second form, `TAIMPOPTIONSFRAMEPLAYER` (file offset `0x6BEBC8`, size 3616 bytes, decoded
  3616/3616), carries the tempo/speed step spin edits (FORM lines 195-197). A third form,
  `TAIMPMAINFORM` (file offset `0x6ACF28`, size 40252 bytes, decoded 40252/40252, 531 objects),
  carries the preview sliders and tempo/speed actions (FORM lines 239-241).
- Invocation form: `npx rea-agents inspect-pe-resources` for resource enumeration, then the custom DFM
  parser (`dump_form.py` in the sibling pass) walking each extracted payload (HELP lines 31-33).
- CAN answer: form control class, name, geometry, tags, event-handler bindings, and every property the
  control actually publishes (for example `TACLSlider.OptionsValue.Page`, `OptionsValue.Default`,
  `Options.MagnetToDefaultValue`); and the `TACLSpinEdit` option values that hold the step range.
- CANNOT answer: any property the custom control does not publish. `TACLSlider` does NOT publish
  `Min` / `Max` / `Frequency` / `TickMarks` / `LargeChange` / `SmallChange`, so the numeric slider
  min/max of the subject controls is not recoverable from the form (FORM line 307). The physical unit
  of `OptionsValue.Page` / `OptionsValue.Default` is not declared (FORM line 310).

### 3. CHM help extraction (ledger `HELP`)

- The `.chm` files are LZX-compressed. Method that worked: 7-Zip 26.04 x64 as a container, no
  `hh.exe`. Exact commands (HELP lines 16-17):
  `& "...\7zip\current\7z.exe" x -y "-o...\help\en" "...\5.40.2727\Help\AIMP-en.chm"` and the same
  for `AIMP-ru.chm`.
- Result: exit code 0, "Everything is Ok", 145 files per language. Topic HTML declares
  `charset=windows-1250` (English) / `charset=windows-1251` (Russian); Cyrillic topics and the shipped
  `Langs\*.lng` (UTF-16LE) were converted to UTF-8 copies for quoting (HELP lines 20-24).
- Shipped language resources `Langs\english.lng` / `Langs\russian.lng` were read for the runtime UI
  captions (HELP lines 130-143, 174-186).
- Shipped changelog `history.txt` was read for the only numeric bounds found anywhere (HELP lines
  146-158).
- CAN answer: what the shipped documentation states, what the runtime English/Russian labels are, and
  what the product's own changelog records about limits.
- CANNOT answer: numeric ranges, defaults, steps, or coupling. No help topic states any of those for
  the subject controls; the help is a thin F.A.Q. plus a Hidden-Options table (HELP lines 96-98,
  190-199).

### 4. `AIMP.Shared.dll` resource inspection (ledger `HELP`, resampler section)

- The resampler-quality form is an `RT_RCDATA` resource in `AIMP.Shared.dll`, not in `AIMP.exe`:
  `TAIMPOPTIONSFRAMESOUNDOUTTRANSFORM`, offset `0x4185b4`, size 3633 bytes, SHA-256 prefix
  `6c41bd4c7537b57f`; decoded 3633/3633, 18 objects (HELP lines 104-108).
- CAN answer: the resampler control class and properties, and the shipped endpoint labels.
- CANNOT answer: the number of discrete quality tiers or their values, and whether this resampler
  quality axis is coupled to the tempo/pitch filter at all (HELP lines 197-199).
- The engine module `AIMP.Shared.dll` was NOT statically analyzed for this reference:
  `...\<scratch root>\aimp-dsp-evidence.md` did NOT exist at the time of writing. Its subject
  (the `Aso.Processors.Speedcontrol` filter and the `Aso::Player::TASOPlayer` coupling decision) is
  therefore UNKNOWN here.

## Parameter model

The control is exposed to AIMP's own code as three INDEPENDENT float interface properties, registered
in `AIMP.exe` by `FUN_00701d60` (NAT lines 102-113, Evidence ID
`ev_7135f31322807474ef22bbe233b0858ec171ef8dafe952cd9c82d3b25192ad38`):

- property id `0x1009` = `PlaybackPitch`
- property id `0x100a` = `PlaybackSpeed`
- property id `0x100b` = `PlaybackTempo`

Each property is read back separately from the engine in the dispatcher `FUN_00700d40` (NAT lines
115-134, Evidence ID `ev_944feaeab480c0bde98f29397e1a692a2b502276296036aadd8c47941c025039`).
The engine type is `Aso::Player::TASOPlayer`, imported from `AIMP.Shared.dll` (NAT lines 94-100).

### Tempo (`PlaybackTempo`, id `0x100b`)

- Unit: playback RATIO (float), driven from an INTEGER PERCENT.
  EVIDENCED (NAT lines 155-169, Evidence ID `ev_273355d53ec65eb5af0e99cffb8313b600bfe056626cbb6197bb9a5f634557ea`).
- Conversion: the integer percent is widened to double, divided by the divisor constant below, then
  narrowed to single precision and passed to `SetPlaybackTempo`. EVIDENCED (same Evidence ID).
- Divisor constant: the qword at `0x70a6e8` is `0x4059000000000000` = double `100.0`.
  EVIDENCED (NAT lines 189-193, Evidence ID `ev_e9ed00b3a3294146593f11e0f39c9129f3aabfeb9eb376b96529e091a3fc46c9`).
- Default / neutral: `1.0` (ratio), equal to 100 percent. Constant at `0x70a6f0` is float
  `0x3f800000` = `1.0`; the reset branch passes the float `1.0` to the tempo setter.
  EVIDENCED (NAT lines 189-193 and 214-215, same two Evidence IDs).
- Lower guard: input at or below a coded percent of zero is treated as unset. The reset is
  conditional: it applies only when the "is-modified" flag at `param_1+0xa1` is already set, in which
  case the tempo is reset to `1.0` and the flag is cleared. When that flag is clear, a value at or
  below zero does not call the tempo setter.
  EVIDENCED (NAT lines 174-186, Evidence ID `ev_9863290113cfe52c1e80263564a3f3d1bda06e8fc1f4e37a6c700da3f1973474`).
- Live persisted value: `PlaybackTempo=100` in `Profile\AIMP.ini`. EVIDENCED (this pass, `Select-String`).
- Upper bound: no upper clamp exists in the `AIMP.exe` setter. EVIDENCED (NAT line 196). The shipped
  changelog records a tempo ceiling of 2x at v4.60.2113 (2019). EVIDENCED as a changelog statement
  (HELP lines 151-158). The LIVE upper bound is UNKNOWN.
- Step: the Options "Player" frame exposes `seTempoInc : TACLSpinEdit` with
  `OptionsValue.DisplayFormat='%s %%'`, `OptionsValue.MinValue=1`, `OptionsValue.MaxValue=20`,
  `Value=1` (form `TAIMPOPTIONSFRAMEPLAYER`, abs `0x6BF4C4`). EVIDENCED (FORM lines 199-204; HELP
  line 170). Live config key `TempoInc=1`. EVIDENCED (this pass, `Select-String`). The mapping of this
  1..20 spin value onto the DSP-dialog slider step, and the slider step itself, are UNKNOWN.
- Per-track persistence: `FUN_0070c2b0` reads `GetPlaybackTempo`, multiplies by 100, rounds to an
  integer percent, and stores it per track. EVIDENCED (NAT lines 304-322, Evidence ID
  `ev_378db223325959ff5c4f30ec7efe74c4a81118aeed979b2b749716920b5e140d`).

### Speed / rate (`PlaybackSpeed`, id `0x100a`)

- Unit: UNKNOWN. The property getter `GetPlaybackSpeed` is float-typed, but a float-typed getter does
  not establish a ratio unit; only a getter is imported by `AIMP.exe`, with no setter thunk, no clamp,
  and no constant. EVIDENCED as a float-typed getter (NAT lines 197-198, 302-303).
- Default / neutral: no `AIMP.exe`-side defaulting code exists. The live persisted value is
  `PlaybackSpeed=100` in `Profile\AIMP.ini`. EVIDENCED as a live config key (this pass, `Select-String`).
  The engine-side neutral and the numeric bounds are UNKNOWN (NAT line 348).
- Step: `seSpeedInc : TACLSpinEdit` with `OptionsValue.DisplayFormat='%s %%'`,
  `OptionsValue.MinValue=1`, `OptionsValue.MaxValue=20`, `Value=1` (abs `0x6BF578`). EVIDENCED (FORM
  lines 205-210; HELP line 170). Live config key `SpeedInc=1`. EVIDENCED (this pass, `Select-String`).
  The slider step mapping is UNKNOWN.
- Upper bound: the shipped changelog records a speed ceiling of 2x at v4.60.2113 (2019) and 3x at
  v4.70.2210 (2020). EVIDENCED as changelog statements (HELP lines 151-158). The LIVE upper bound is
  UNKNOWN.
- UI naming: the shipped English language section `[DSPDialog]` labels this control `Speed`; the
  Russian resource labels it `Скорость`. EVIDENCED (HELP lines 174-186). The DFM holds a `Rate`
  placeholder caption on `lbSpeed`, overridden at runtime by the shipped resource. EVIDENCED (FORM line
  92; HELP line 188).

### Pitch (`PlaybackPitch`, id `0x1009`)

- Unit: UNKNOWN. The property getter `GetPlaybackPitch` is float-typed, but a float-typed getter does
  not establish a ratio unit; only a getter is imported by `AIMP.exe`, with no setter thunk, no clamp,
  and no constant. EVIDENCED as a float-typed getter (NAT lines 197, 325-326).
- Default / neutral: no `AIMP.exe`-side defaulting code exists. The live persisted value is
  `PlaybackPitch=0` in `Profile\AIMP.ini`. EVIDENCED as a live config key (this pass, `Select-String`).
  The engine-side neutral and the numeric bounds are UNKNOWN (NAT line 348).
- A pitch conversion symbol family exists in `AIMP.Shared.dll`
  (`Aso.Utils.PitchConvert.{ToSemitones, FromSemitones, ToOctaves, FromOctaves}`). EVIDENCED as
  observed symbol names from the `AIMP.Shared.dll` symbol pass (this session); the address-level
  Evidence ID for that pass is unavailable because its ledger `aimp-dsp-evidence.md` was not written.
  The exact conversion formula and the pitch unit scale are UNKNOWN; no formula is asserted here.
- UI naming: the shipped English resource labels this control `Pitch`; Russian labels it
  `Тональность`. EVIDENCED (HELP lines 174-186).

### Step range summary

The only evidenced numeric step range for any of the three controls is the Options spin edits:
`seTempoInc` and `seSpeedInc` are each `TACLSpinEdit` with `MinValue=1`, `MaxValue=20`, format
`'%s %%'`, initial `Value=1`. EVIDENCED (FORM lines 199-210). The changelog records the feature
"ability to customize speed / tempo step" at v5.03.2381 (2022). EVIDENCED (HELP lines 154-158). The
number of slider steps and the percent-per-step are UNKNOWN.

### UI slider numeric literals that exist but are not bounds

The `TAIMPDSPDIALOG` decode records `OptionsValue.Page=33` on `tsTempo`, `tsSpeed`, and `tsPitch`
(FORM lines 34, 53, 71) and `OptionsValue.Default=50` on `tsSpeed` only (FORM line 52). `tsTempo` and
`tsPitch` carry no `OptionsValue.Default` property in the decode. These are EVIDENCED DFM literals,
but their physical unit and their relation to a percent or ratio are UNKNOWN (FORM line 310); they
are recorded here as data, not as bounds. All three sliders carry
`Options.MagnetToDefaultValue=True`. EVIDENCED (FORM lines 32, 50, 69).

## Coupling and independence

What is established, at the interface level and only in `AIMP.exe`:

- The control is modelled as THREE INDEPENDENT float properties: `PlaybackPitch` (`0x1009`),
  `PlaybackSpeed` (`0x100a`), `PlaybackTempo` (`0x100b`), each registered separately and each read
  back separately via its own getter. EVIDENCED (NAT lines 288-300, Evidence IDs
  `ev_7135f31322807474ef22bbe233b0858ec171ef8dafe952cd9c82d3b25192ad38` and
  `ev_944feaeab480c0bde98f29397e1a692a2b502276296036aadd8c47941c025039`).
- Of the whole `SetPlayback*` family, ONLY `SetPlaybackTempo` is statically imported by `AIMP.exe`;
  there is NO static `SetPlaybackSpeed` and NO static `SetPlaybackPitch` import. EVIDENCED (NAT lines
  301-303, Evidence ID `ev_e92efb3fa0f845e935e379ef791d00510a5d1b377b8aa14cf2d8b134196dea3e`).
- The `AIMP.exe` tempo path applies a value only through `SetPlaybackTempo` (site `0x70a6a9`).
  EVIDENCED (NAT lines 136-141, 304).
- Getter call sites: `GetPlaybackPitch` -> `0x700f15`, `0x779955`; `GetPlaybackSpeed` -> `0x700ed1`,
  `0x779907`; `GetPlaybackTempo` -> `0x700ef3`, `0x70c2f8`, `0x77992e`; `SetPlaybackTempo` ->
  `0x70a6a9`, `0x70a6cf`. EVIDENCED (NAT lines 138-141).

What is NOT established in `AIMP.exe`, and is therefore engine-side and UNKNOWN:

- Whether changing tempo or speed preserves pitch, and whether changing pitch preserves tempo. The
  decision lives inside `Aso::Player::TASOPlayer` in `AIMP.Shared.dll`; `AIMP.exe` contains no flag,
  no time-stretch branch, and no pitch-shift branch that decides it. EVIDENCED as an absence in
  `AIMP.exe` (NAT lines 324-328). The behaviour itself is UNKNOWN.
- The three separate readouts are consistent with independent controls (time-stretch preserving pitch
  when tempo changes; pitch-shift preserving tempo when pitch changes). This is explicitly recorded in
  the native ledger as INFERENCE, not observation (NAT line 326), and is presented here as an
  inference only, never as an established coupling rule.
- How `PlaybackSpeed` and `PlaybackPitch` setters reach the engine if they are not static imports (a
  runtime-resolved interface is one possibility) was not resolved. EVIDENCED as UNKNOWN (NAT line 352).

No shipped help sentence states the coupling in either direction. EVIDENCED as an absence in the help
(HELP lines 96-98, 196). The resolving ledger `aimp-dsp-evidence.md` was absent at the time of writing.

## Quality tiers

- The only quality control in the shipped tree that bears on this processing is a resampling
  SPEED-vs-QUALITY axis, and it lives in `AIMP.Shared.dll`, not in the tempo/pitch dialog:
  resource `TAIMPOPTIONSFRAMESOUNDOUTTRANSFORM`, `RT_RCDATA`, offset `0x4185b4`, size 3633 bytes,
  SHA-256 prefix `6c41bd4c7537b57f`; DFM root `AIMPOptionsFrameSoundOutTransform :
  TAIMPOptionsFrameSoundOutTransform`, decoded 3633/3633, 18 objects. EVIDENCED (HELP lines 104-108).
- The control is `tsResamplerQuality : TACLSlider` with: `Orientation='oHorizontal'`,
  `Options.MarkSize=1`, `OptionsLabels.MaxValue='1'`, `OptionsLabels.MinValue='1'`,
  `OptionsLabels.Layout='sllAfterTrackBar'`, `OptionsValue.Page=1.0` (x87 extended
  `0000000000000080ff3f`), `OptionsValue.Paginate=True`, `OnChange='DoModified'`. EVIDENCED (HELP
  lines 113-123).
- The two endpoint labels are supplied at runtime from the shipped language resource, section
  `[OptionsSoundOutTransformFrame]`: English `L1=Resampling:`, `L2=Speed`, `L3=Quality`; Russian
  `L1=Передискретизация:`, `L2=Скорость`, `L3=Качество`. EVIDENCED (HELP lines 130-143). The form is
  a single horizontal slider spanning `Speed` and `Quality` under a `Resampling:` group box.
- `Paginate=True` with `Page=1.0` is consistent with a discrete, stepped axis; the number of tiers and
  their values are UNKNOWN. Which endpoint is the minimum is not declared in the DFM; the native and
  help ledgers record `min=Speed, max=Quality` as an INFERENCE only (HELP lines 128, 197-199).
- The resampler engine: `AIMP.exe` carries the mangled symbols
  `_ZN3Aso9Resampler4Soxr14initializationEv` and `_ZN3Aso9Resampler4Soxr12FinalizationEv`
  (namespace `Aso::Resampler::Soxr`), and the install root ships `libsoxr.dll` at 296384 bytes.
  EVIDENCED (HELP line 160; re-confirmed this pass by `Get-Item`). The shipped changelog records the
  resampling speed/quality customization at v3.55.1298 (12.09.2013). EVIDENCED (HELP line 150).
- Bounded string searches of `AIMP.exe` found no audio quality, interpolation, algorithm, or mode tier
  for this processing: searches for `"Interpolat"`, `"SoundTouch"`, and `"Algorithm"` returned no
  results, and the only literal `"Quality"` is a GRAPHICS/FONT attribute (`FUN_0051b480`, default
  `"fqDefault"`, applied to a `Vcl.Graphics.TFont`). EVIDENCED (NAT lines 226-241, Evidence ID
  `ev_a196ad9d4d60dcb2c15dcbfc7846e97fb9da76d1cc806a266b7234db8761a893`). These searches do not
  establish product-wide absence; a tier under a name the searches did not cover remains possible and
  is UNKNOWN.
- UNKNOWN, and not resolved by any shipped artifact: the number of quality tiers and their values;
  which endpoint is minimum; and whether this resampler-quality axis is coupled to the tempo/pitch
  filter at all. Also UNKNOWN: any quality tier the `Aso.Processors.Speedcontrol` filter itself might
  carry, which the absent `aimp-dsp-evidence.md` would have covered.

## Preset and default semantics

A bounded string search of `AIMP.exe` found no named preset for the tempo / pitch / rate control. The
search does not establish product-wide absence: a preset could exist under a name that does not
contain "Preset", or outside `AIMP.exe`. What the search did find is EVIDENCED as follows:

- A string search for `"Preset"` in `AIMP.exe` returns Equalizer and Media-Library grouping tokens
  only (for example `TAIMPEqualizerPreset`, `DEFAULT_EQ_PRESETS`, `EQPresetsLibrary.ini`); it returned
  no tempo/pitch/speed preset and no preset parameter set. EVIDENCED (NAT lines 265-284, Evidence
  ID `ev_7ed8435bb7c517977b3994efd48d025b0eb752a3ed9d27a8c30377cf6d8aba16`).
- The one preset-ish property registered on the player interface is `AutoLoadPresets`, which is
  Equalizer scope. EVIDENCED (NAT lines 279-281, Evidence ID
  `ev_7135f31322807474ef22bbe233b0858ec171ef8dafe952cd9c82d3b25192ad38`).
- The DSP dialog popup `pmPresets` holds only Equalizer items (`miEqLoadPreset`, `miEqSavePreset`,
  `miEqAutoLoadPreset`). EVIDENCED (FORM line 300).
- `DEFAULT_EQ_PRESETS` is an INI-style text resource of 25 named sections, each with 18 `Band0..Band17`
  dB floats; these are Equalizer presets, not tempo/pitch/speed ranges. EVIDENCED (FORM lines 301-303).

The "preset" semantics that DO apply to this control reduce to per-control DEFAULTS plus
reset-to-default:

- A default exists and is restored by right-clicking a slider. Shipped help quote
  (`faq_dsp_manager.html`): "Open the DSP-Manager (see Main Menu \ DSP-Manager) and reset all the
  sliders to their default values (right-click on a slider)". EVIDENCED (HELP lines 56-60). A generic
  version of the gesture appears in `features_player.html`: "To reset track bar value (for example,
  Balance or Preamp track bars) click via right mouse button on it". EVIDENCED (HELP lines 90-94).
- `TAIMPMAINFORM` carries the actions `acPlayerTempoResetToDefaults` and
  `acPlayerSpeedResetToDefaults` (category `Player.PlaybackControl`), each bound to the same handler
  as their increase/decrease siblings (`acPlayerChangeTempoExecute` / `acPlayerChangeSpeedExecute`).
  EVIDENCED (FORM lines 259-280). No pitch reset action appears among the actions listed in that
  decode; whether a pitch reset command exists is UNKNOWN.
- At the interface level the evidenced tempo neutral is a fixed number: `1.0` ratio (100 percent),
  EVIDENCED (NAT lines 214-217). No equivalent interface-level neutral is evidenced for rate. The
  current persisted values are `PlaybackTempo=100`, `PlaybackSpeed=100`, `PlaybackPitch=0` in
  `Profile\AIMP.ini`. EVIDENCED this pass by `Select-String`. The engine-side neutral for pitch and for
  speed is UNKNOWN (NAT line 348).
- All three sliders carry `Options.MagnetToDefaultValue=True`, so the control magnetises to its
  default value. EVIDENCED (FORM lines 32, 50, 69).

## UNKNOWN

This list is a required deliverable. It states plainly what could NOT be established, and it is kept
intact rather than paraphrased into confidence.

1. Numeric MIN and MAX for pitch and rate, and the unit or scale in which those bounds are expressed.
   `AIMP.exe` imports only getters for them; no setter thunk and no clamp constant exist in
   `AIMP.exe`. The engine bounds and the unit are UNKNOWN.
2. Numeric MAX for tempo. `AIMP.exe` has no upper clamp, only the lower guard that treats a percent
   below one as unset. The live engine max is UNKNOWN; the changelog 2x entry is a historical
   statement, not a live bound.
3. The numeric min/max of the Sound Effects sliders `tsTempo`, `tsSpeed`, `tsPitch`. Not in code
   (`resolve_containing_procedure` reports `not_in_procedure` for the slider refs), not in the DFM
   (`TACLSlider` does not publish `Min`/`Max`), not in the help. UNKNOWN.
4. The physical unit and scale mapping (percent, semitones, BPM, Hz) of the slider literals
   `OptionsValue.Page=33` and `OptionsValue.Default=50`. Only the numeric literals are known. UNKNOWN.
5. The engine-side neutral/default for speed and for pitch. `AIMP.exe` contains no defaulting code for
   either; only the persisted live values in `Profile\AIMP.ini` are known. UNKNOWN.
6. The DSP-dialog slider step, and the mapping of the evidenced 1..20 Options spin range onto that
   step. UNKNOWN.
7. Whether changing tempo or rate preserves pitch, and whether changing pitch preserves tempo. The
   deciding branch is inside `Aso::Player::TASOPlayer` in `AIMP.Shared.dll` and is not present in
   `AIMP.exe`. UNKNOWN.
8. The exact pitch conversion formula behind `Aso.Utils.PitchConvert`. Only the symbol names were
   observed; the arithmetic is UNKNOWN.
9. The resampling quality tier count, tier values, and endpoint ordering. The form and shipped labels
   give a `Speed`/`Quality` axis only. UNKNOWN.
10. Whether the resampling-quality axis is coupled to the tempo/pitch filter at all. Not established by
    any shipped artifact. UNKNOWN.
11. Any quality/interpolation/mode tier inside the `Aso.Processors.Speedcontrol` filter itself, any
    such tier elsewhere in the product under a name the bounded string searches did not cover, and the
    resampling math (window size, overlap, interpolation filter). Engine-side; the ledger that would
    cover it, `aimp-dsp-evidence.md`, was ABSENT at the time of writing. UNKNOWN.
12. How `PlaybackSpeed` and `PlaybackPitch` setters reach the engine given they are not static imports
    (runtime-resolved interface or otherwise not resolved). UNKNOWN.
13. Whether a pitch reset-to-default command exists. No such action appears among the actions listed in
    the `TAIMPMAINFORM` decode. UNKNOWN.
14. The complete set of tempo/pitch/speed actions beyond those listed in the form decode. The decode
    was complete (40252/40252 bytes, 531 objects), but the ledger printed a selected subset of objects,
    so absence from that subset is not proof of absence. UNKNOWN.
15. The engine unit or scale of `PlaybackSpeed` and `PlaybackPitch`. Both interface properties are
    float-typed, but a float-typed getter does not establish a ratio, percent, semitone, or other
    unit. UNKNOWN.
16. Whether a named tempo / pitch / rate preset exists under a name that does not contain "Preset", or
    outside `AIMP.exe`. The bounded string search only rules out the names it searched. UNKNOWN.

## Relation to Slowburn

Slowburn's independent tempo/pitch/rate implementation is `src/lib/effects-core/tempo-pitch.ts`. That
module marks every bound it chose as OUR CHOICE and explicitly states that AIMP's live bounds are
UNKNOWN: the tempo floor of 50 percent and ceiling of 200 percent, the pitch range of -12..+12
semitones, and the rate floor of 50 percent and ceiling of 300 percent are all labelled OUR CHOICE in
that file, with the historical changelog ceilings used only as safe references. This reference does
not change those choices: AIMP's live slider min/max, its pitch bounds, and its pitch unit scale remain
UNKNOWN as recorded above.

The only facts this reference confirms as EVIDENCED and carried into Slowburn's design are the tempo
percent-to-ratio conversion (the integer percent divided by the double constant `100.0`, with a neutral
of `1.0` or 100 percent) and the existence of a semitone/octave pitch conversion family in AIMP's
engine. AIMP's slow/playback effect, its reverb, and its A-B loop are explicitly out of scope and were
not taken.
