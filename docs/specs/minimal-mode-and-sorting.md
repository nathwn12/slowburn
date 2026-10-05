# Spec: Minimal/Full mode, sorting model, and the volume strip

Status: **approved** (owner, 2026-10-05). Design source:
`Q:\PROJECTS\PERSONAL\Slowburn-ops\ui\design-minimal-full.md`. This document is the durable
spec; the design doc is the reasoning behind it and does not override it.

## 1. Why

Slowburn is an AIMP replacement for one owner's local FLAC library. Two of its stated
differentiators (slowed + reverb, persistent per-file A-B) already work. What does not yet
match the owner's expectations is the *shell around* the player:

- The layout never adapts — it is one fixed arrangement, so it is either too dense or it
  leaves the player small. The owner asked for **minimal-by-default with a full mode**.
- The owner's acceptance test is absolute: the app must **"never look empty, ever"**.
- Sorting is "all over the place". The default must be **newest-modified first**, and the
  model must be AIMP's (ordered multi-key, per-key direction) rather than a flat list.
- The volume slider was rejected; the owner chose a slim bar + percentage.

## 2. Scope

**In scope**

1. A `ui_mode` setting: `minimal` (default) | `full`.
2. The Minimal composition and the Full additions.
3. The "never looks empty" invariants, as assertable behaviour.
4. Replacement of the sort implementation with an ordered multi-key model, and its UI.
5. Replacement of the volume slider with a slim fill bar + percentage.
6. Adoption of an ordered context-menu grammar (Full mode).

**Out of scope (do not build, do not "fix while here")**

- Themes and Discord RPC (deferred by the owner to a later phase).
- Any network feature. The app is offline; this change adds no outbound call of any kind.
- Rewriting the ledger/queue/rails themselves — Minimal only changes whether they render.
- The A-B feature itself, which is implemented and tested.

## 3. Requirements

### 3.1 The mode rule (normative)

> **The player is never cut. Only lists change.**

`minimal` and `full` differ in *which list surfaces are present*. Cover, the 4-line info
block, transport, the waveform seek, the burn strip, the typed A-B panel, the volume strip
and the bottom bar render in **both** modes. A change that hides any of those in `minimal`
violates this spec.

### 3.2 Mode persistence

- Config key `ui_mode`, values `minimal` | `full`, **default `minimal`**.
- Persisted through the same config path the theme already uses, and toggled from the
  UI settings screen.
- Switching modes must not restart or reload the app, and must not lose playback position,
  the A-B region, or burn values.
- Implementation must be conditional rendering in a single shell. CSS-hiding (leaving
  unmounted components invisible) and maintaining two parallel shells are both rejected.

### 3.3 Minimal composition

Top to bottom: caption row; player zone (cover ‖ 4-line info ‖ transport ‖ mode toggles ‖
far-right icon rail); waveform seek with elapsed pinned left and total pinned right; burn
strip; typed A-B panel; volume strip; one list with tab strip and column headers; bottom bar
with quick-search left and icon cluster right.

Full adds the ledger (`StatusBar`) and the queue column (`Queue`). Everything else is identical.

> **Corrected after recon.** An earlier draft said Full adds "the side rails". No side-rail
> component exists — the term appears only in design notes, and the project has already rejected
> a side nav rail (`Slowburn-ops/decisions.md:20`). Full adds exactly two things: the ledger and
> the queue column. Nothing else exists to mount.
>
> Concrete mapping, from the real shell (`src/routes/__root.tsx`):
> **Minimal** = `Header` + `NowPlaying` + route outlet. **Full** = that plus `StatusBar`
> (`__root.tsx:158`) and the `Queue` column (`__root.tsx:146`). Both bands live inside
> `NowPlaying`, so "the player is never cut" holds by construction.

### 3.4 Never looks empty (normative, testable)

Each of these must hold with an **empty library** and with **no track loaded**:

1. The frame and caption row render in every state.
2. The cover slot renders and never collapses; with no art it shows the logo stub.
3. The info block always occupies four lines; absent values are em-dashes, never blank rows.
4. Tab strips and column headers persist with zero rows.
5. The list totals line always shows numbers (`0 / 00:00:00 / 0 B`), never blank, never a
   spinner.
6. The import action is always reachable.
7. The seek band renders a flat ruler with no track; PEAK and HASH read `—`.

### 3.5 Sorting

**Schema note (recon-derived).** `SortBy` and `SortOrder` are declared in
`src/generated/typings.ts` and the active sort is persisted as `library_sort_by` +
`library_sort_order` in backend config. The config schema is therefore **Rust-owned**, and the
current shape is single-valued. Moving to an ordered multi-key model changes that shape, so it
is a **config migration with a regeneration step** — not a new field alongside the old ones.

- **Model:** an ordered list of sort keys. Each key has a field and a direction
  (ascending/descending). A numbered badge (`1 2 3`) in the header shows the order.
  Clicking a header cycles asc → desc → off. Clicking a column that is not yet in the stack **appends** it as the last key; shift-click resets
  the stack to that single field. (An earlier draft, following AIMP's documented behaviour, said
  shift-click *adds* a secondary key. The implementation adds on a plain click instead, which is more
  discoverable and reserves the modifier for "sort by only this". The AIMP claim itself was never
  verified against a running AIMP — that capture was cancelled — so it should not outweigh a working,
  tested implementation.)
- **Comparison:** `Intl.Collator` with `{ numeric: true, sensitivity: 'base' }`.
  Missing tags sort **last**, regardless of direction, and regardless of key position.
- **Default key set:** `Modified desc → Artist asc → Album asc → Disk asc → Track asc`.
- **Presets:** Recently modified · Recently added · Artist/Album · Album · Length ·
  Most played.
- **Sort is a view, never a mutation.** Applying a sort must not reorder or rewrite the
  stored list. (AIMP does rewrite; we explicitly do not.)
- **Ignore-articles** is a toggle affecting text-key comparison.
- **The `mostPlayed` chip is already a real sort, applied in the wrong place.** It sorts by
  `play_count` descending, but *after* pagination, so it ranks only the first 20 upcoming
  rows: "most played" currently means "most played among the rows already on screen", and
  the top row is not reliably the most-played track. Fix it to sort the whole queue before
  paginating. (An earlier draft of this spec recorded this as "a filter pretending to be a
  sort"; recon shows that was wrong, and the real defect is the ordering of the two steps.)
- Sorting by modified date requires the file's modification time to be **stored**; it is not
  today. Storing it (schema change + migration + backfill on rescan) is in scope.

### 3.6 Volume

No slider. A hair-thin fill bar with the percentage beside it; the wheel adjusts; a click
mutes; **no thumb and no accent ring**. Mute state must be visually distinguishable from
zero volume.

### 3.7 Context menus

Full mode adopts one ordered grammar across every context menu:
`Add → Play → Queue → Remove → Send to → Sort → Manage`, with destructive actions last.
Minimal exposes the Add → Play → Remove → Sort subset. Any menu that does not fit the
grammar is reported rather than silently reshaped.

## 4. Acceptance criteria

A change is acceptable when all of these are demonstrated, not asserted:

- **AC1** A fresh install starts in `minimal`; the setting toggles to `full` and back
  without restart, and survives a relaunch.
- **AC2** Every one of §3.4's seven invariants is checked by a test against an empty
  library, and each passes.
- **AC3** Every element listed in §3.1 renders in `minimal`, proven by the UI test, not by
  reading the code.
- **AC4** Sorting produces the default order (`Modified desc` first) on a fixture whose
  modified times are deliberately out of filename order.
- **AC5** Clicking a header cycles asc → desc → off; shift-click adds a secondary key;
  the numbered badge reflects key order.
- **AC6** A track with no artist/album/track/duration sorts last under every direction and
  every key position.
- **AC7** Applying any sort leaves the persisted underlying list order unchanged.
- **AC8** The volume control adjusts by wheel, mutes on click, shows a percentage, and
  renders no thumb.
- **AC9** The app performs no outbound network call at rest or on launch (unchanged from
  Phase 1, re-asserted).

## 5. Constraints

- **Offline.** No new network code, no updater, no telemetry. Non-negotiable.
- **Silent during verification.** No test or verification run may produce audio. Test
  configuration forces muted output; any harness that launches the app forces volume to
  zero before launch and restores it afterwards.
- **Never play a track during verification unless muted.** The owner has been disturbed by
  test audio twice; this is the reason every launch harness mutes by construction.
- Everything lives under `Q:\PROJECTS\PERSONAL\`. Nothing under `INSPIRATIONS`.
- One writer per file. Lanes do not edit a file another lane owns.
- AIMP is never modified, and AIMP is never driven while the owner is playing a game.
- Existing behaviour not named in §3 is unchanged. No opportunistic cleanup.

## 6. Open questions

- Whether the mtime backfill runs at scan time only, or also migrates existing rows on first
  launch. (Resolve during planning; either is acceptable if AC4 passes on a migrated
  database.)
- Whether the ledger's vertical clipping defect (found in Phase 1, deliberately not fixed
  blind) is in scope here. **Default: not in scope** — it needs a rendered repro first, and
  it is a Full-mode defect that this spec does not own.
