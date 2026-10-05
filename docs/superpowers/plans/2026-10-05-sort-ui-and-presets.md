# Sort UI + Presets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose the ordered multi-key sort — numbered badges, click cycling asc → desc → off, shift-click for a secondary key, a preset list — and fix the queue's sort-after-pagination defect.

**Architecture:** `TrackListHeaderCell` stops writing the legacy sort pair and becomes a control over the `library_sort_keys` array that the sorting-data-model plan introduced. Clicking a field that is not in the stack appends it; clicking the active field cycles its direction and then removes it; shift-click resets the stack to that single field. A numbered badge renders the key's position. Presets are named key stacks applied wholesale. The queue fix moves its sort before pagination.

**Tech Stack:** React 19, StyleX, TanStack Query, `@tauri-apps/api` config bridge, Vitest `e2e` project.

**Spec:** `<workspace-root>\PERSONAL\Slowburn\docs\specs\minimal-mode-and-sorting.md` §3.5, AC5. Recon: `Slowburn-ops\ui\recon\recon-sorting.md`, `recon-menus.md`.

## Global Constraints

- Offline. No new network code.
- **The app is never launched.** Tests only; test audio muted.
- Component tests live in the `e2e` project as `*.test-e2e.tsx` — the `unit` project cannot render
  components (node env, no JSX or StyleX plugins).
- `src/generated/typings.ts` is generated; never hand-edit it.
- **Depends on the sorting-data-model plan having landed**: `SortKey`, `library_sort_keys`, and the
  new `sortTracks(tracks, keys)` signature. Do not start before those commits exist.
- **The key stack is never empty.** If every key is removed, restore the default bundle. An empty
  stack has no defined rendering and Plan A already treats it as a fallback case.
- One writer per file. Nothing outside the file lists below.

## Review Focus

1. **Removing the last key.** Spec §3.5 defines click-cycling to "off", which for the only key means
   an empty stack. Something must decide what renders then; this plan defines it as "restore the
   default bundle" rather than "sort arbitrarily".
2. **The badge is the stack position, not the column position.** Column render order is
   Title, Duration, Artist, Album, Genre; the stack order is whatever the user clicked. A badge drawn
   from render order would look right in a two-key example and be wrong in every other.
3. **Shift-click on a field already in the stack.** The spec says shift-click "adds a secondary key";
   in AIMP it replaces the stack. Pick one, implement it, and test the case where the field is
   already present — that is the ambiguous one.
4. **A preset's badges.** Applying a preset changes the stack, so every currently-visible badge must
   update. A preset that changes the data order but leaves stale badges is a lying UI.
5. **The queue label.** `mostPlayed` currently sorts only the first 20 rows while its label claims
   "sorted: most played". After the fix the label must be true of the whole queue, or the label must
   change. The two must move together.

---

### Task 1: The header sort control

**Files:**
- Modify: `src/components/TrackListHeaderCell.tsx:26-31,33-52,54-63`
- Modify: `src/components/TrackListHeader.tsx:26-50`
- Test: `src/components/__tests__/sort-header.test-e2e.tsx` (create)

**Interfaces:**
- Consumes: `Config.library_sort_keys: SortKey[]` and `SortKey = { field: SortField; direction: SortOrder }`
  from the sorting-data-model plan; `ConfigBridge.multiSet` (`src/lib/bridge-config.ts:45`).
- Produces: nothing other tasks import; the control writes config only.

- [ ] **Step 1: Write the failing tests**

```tsx
it('clicking a field not in the stack appends it as the last key', ...)
it('clicking the active ascending field makes it descending', ...)      // AC5
it('clicking the active descending field removes it', ...)               // AC5, the "off" state
it('removing the only key restores the default bundle', ...)             // Review Focus 1
it('shift-click replaces the stack with the single clicked field', ...)  // Review Focus 3
it('shift-clicking a field already in the stack leaves one key', ...)    // Review Focus 3
it('renders a badge numbered by stack position, not column position', ...) // AC5, Review Focus 2
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm exec vp test run --project e2e src/components/__tests__/sort-header.test-e2e.tsx`
Expected: FAIL — the header still writes the legacy pair.

- [ ] **Step 3: Implement the control**

Replace the single-key `handleSort` with stack manipulation over `library_sort_keys`, and render a
numbered badge when a field is present in the stack. Keep the existing `t` macro strings and the
existing aria labels; add the badge as text inside the header cell.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm exec vp test run --project e2e src/components/__tests__/sort-header.test-e2e.tsx`
Expected: PASS, all seven.

- [ ] **Step 5: Commit**

```bash
git add src/components/TrackListHeaderCell.tsx src/components/TrackListHeader.tsx src/components/__tests__/sort-header.test-e2e.tsx
git commit -m "feat(sort): numbered multi-key header control with cycle and shift-click"
```

---

### Task 2: Presets

**Files:**
- Create: `src/lib/sort-presets.ts` (named key stacks)
- Modify: `src/components/TrackListHeader.tsx` (mount the preset control)
- Test: `src/components/__tests__/sort-header.test-e2e.tsx` (extend)

**Interfaces:**
- Consumes: `SortKey` from the sorting-data-model plan.
- Produces: `export type SortPreset = { id: string; labelKey: string; keys: SortKey[] }` and
  `export const SORT_PRESETS: SortPreset[]` — the six from spec §3.5: recently modified, recently
  added, artist/album, album, length, most played.

**Placement decision (recorded, and reversible):** the presets live behind a small `Sort` control in
the track-list header row, not in the context menu — the context menu's sort group belongs to the
deferred menus plan, and a header control keeps sorting in the place where sorting already lives.
The owner has not seen this control; it is a one-line change of placement if he wants it elsewhere.

- [ ] **Step 1: Write the failing tests**

```tsx
it('applying a preset replaces the whole stack', ...)
it('applying a preset updates every visible badge', ...)                 // Review Focus 4
it('each preset sorts a fixture into its own distinct order', ...)       // proves the presets differ
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm exec vp test run --project e2e src/components/__tests__/sort-header.test-e2e.tsx`
Expected: FAIL — no preset control exists.

- [ ] **Step 3: Implement the presets and the control**

Define the six stacks; render a control that lists them and applies the chosen stack via
`ConfigBridge.set('library_sort_keys', keys)`. Use the `t` macro for every label — a hardcoded
English string is a regression the Phase 1 catalog guard will catch later anyway.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm exec vp test run --project e2e src/components/__tests__/sort-header.test-e2e.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/sort-presets.ts src/components/TrackListHeader.tsx src/components/__tests__/sort-header.test-e2e.tsx
git commit -m "feat(sort): presets, with badges updating on apply"
```

---

### Task 3: The queue's sort-before-pagination fix

**Files:**
- Modify: `src/components/QueueList.tsx:37-49`
- Test: `src/components/__tests__/queue-sort.test-e2e.tsx` (create)

**Interfaces:**
- Consumes: `Track.play_count` (`src/generated/typings.ts`), and the existing `mostPlayed` state in
  `src/components/Queue.tsx:26`.
- Produces: nothing.

- [ ] **Step 1: Write the failing test**

With a queue long enough to paginate (more than 20 upcoming rows) and the most-played track
deliberately placed **after** the first page:

```tsx
it('most-played ordering considers the whole queue, not the first page', ...)  // Review Focus 5
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm exec vp test run --project e2e src/components/__tests__/queue-sort.test-e2e.tsx`
Expected: FAIL — `QueueList.tsx:45-47` sorts `view` after it has already been sliced to the page.

- [ ] **Step 3: Reorder the two steps**

Sort the full queue, then paginate. Leave the label untouched if it is now true; change it if not —
Review Focus 5 requires the label and the behaviour to agree, and the test should assert both.

- [ ] **Step 4: Run the suites and commit**

Run: `pnpm exec vp test run --project e2e` and `pnpm exec vp test run --project unit`
Expected: both PASS.

```bash
git add src/components/QueueList.tsx src/components/__tests__/queue-sort.test-e2e.tsx
git commit -m "fix(queue): sort the whole queue before paginating"
```

---

## Self-review

- **Spec coverage:** badges, cycle, shift-click — Task 1, AC5. Presets — Task 2. `mostPlayed`
  correctness — Task 3, and spec §3.5's "the chip must not lie" resolves as "make the behaviour match
  the label".
- **Not covered, deliberately:** the **ignore-articles** toggle. It changes every text comparison's
  output, the spec fixes it as a toggle **without stating its default**, and that is a decision to
  make with the spec's author rather than to guess inside a comparator. Listed as open, not forgotten.
- **Also not covered:** the context menu's Sort group and the whole menu grammar — deferred, because
  the AIMP grammar was never verified against a live AIMP.
- **Type consistency:** `SortKey`, `SortField`, `library_sort_keys`, `SORT_PRESETS`, `SortPreset` —
  each spelled once, matching the sorting-data-model plan's names.
