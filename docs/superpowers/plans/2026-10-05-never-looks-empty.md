# Never-Looks-Empty Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make spec §3.4's seven invariants true in an empty library with no track loaded, and pin each one with a test.

**Architecture:** One new e2e suite renders the shell against an **empty** library and an idle player, and asserts all seven invariants at once. The suite is written before any fix, so its per-invariant results are the work list. That ordering is deliberate: nobody, including the author of the design doc, currently knows which of the seven already hold, and guessing would produce seven tests written to pass rather than seven tests written to check.

**Tech Stack:** React 19, StyleX, Vitest `e2e` project (the only project that renders components — the `unit` project is node-only and loads no JSX plugins), TanStack Query.

**Spec:** `Q:\PROJECTS\PERSONAL\Slowburn\docs\specs\minimal-mode-and-sorting.md` §3.4, AC2, AC3. Recon: `Slowburn-ops\ui\recon\recon-shell-mode.md` (component tree with line numbers), `recon-sorting.md` (mock paths).

## Global Constraints

- Offline. No new network code.
- **The app is never launched.** This plan is tests only. Test config forces muted output.
- Component tests must live in the `e2e` vitest project and be named `*.test-e2e.tsx` — the `unit`
  project's include pattern is `**/*.test.ts`, its environment is `node`, and it attaches neither the
  lingui macro transform nor StyleX. A component test placed there cannot run at all. (Established
  by the volume lane, with the failure output as evidence.)
- An invariant is satisfied by **rendering**, not by the absence of an error. A test that only
  asserts "did not throw" does not test §3.4.
- One writer per file. Nothing outside the file lists below.

## Review Focus

§3.4 is a list of seven invariants; these are the conditions that decide whether they hold in
reality rather than in a screenshot:

1. **Genuinely empty versus loading.** An empty library and a library that has not loaded yet look
   identical on screen. Invariant 5 forbids a spinner, so the suite must drive the settled-empty
   state, not race it.
2. **Zero versus em-dash.** Invariants 3 and 7 require `—`, not `0`, not `""`, not `N/A`. A test
   matching `—` is the whole point; a test matching "not empty" would pass on `undefined`.
3. **The same state in both modes.** Full mode renders the ledger and the queue column; minimal
   renders neither. An invariant asserted only in one mode is half-tested — the suite runs both.
4. **An empty _playlist_, not just an empty library.** The invariant set is about surfaces, and the
   playlist route is a different component with a different totals line.
5. **A window too narrow for the content.** §3.4 exists because the owner's acceptance test is
   visual. A band can be present and still collapse to nothing at 720px.

---

### Task 1: The invariant suite (probe, then work list)

**Files:**

- Test: `src/__tests__/empty-state.test-e2e.tsx` (create)
- Read (not modified): `src/lib/__mocks__/bridge-database.ts`, `src/lib/__mocks__/bridge-config.ts`,
  `src/__tests__/e2e-helpers.tsx`

**Interfaces:**

- Consumes: the mocks — an empty track list from the database bridge, and a config whose
  `ui_mode` is set per test (the UI-mode plan supplies that key; if it has not landed, assert the
  current shell and note it).
- Produces: a recorded per-invariant pass/fail list. **This list is the input to Task 2** and must
  appear in the report verbatim.

- [ ] **Step 1: Write the seven tests**

```tsx
// §3.4 invariant 1
it('1. renders the frame and caption row with an empty library', ...)
it('2. renders the cover slot, falling back to the logo stub', ...)
it('3. renders four info lines, absent values as em-dashes', ...)
it('4. renders tab strips and column headers with zero rows', ...)
it('5. renders a numeric totals line (0 / 00:00:00 / 0 B), never a spinner', ...)
it('6. keeps the import action reachable', ...)
it('7. renders a flat seek ruler with PEAK and HASH as em-dashes', ...)
```

Each asserts on the rendered output. Do not assert "renders without throwing" for any of them.

- [ ] **Step 2: Run the suite and record which fail**

Run: `pnpm exec vp test run --project e2e src/__tests__/empty-state.test-e2e.tsx`
Expected: **mixed** — some pass, some fail. For each invariant, record pass or fail with the exact
assertion text on failure. If all seven pass on the first run, that is a real result: report it as
"already satisfied, no fix required", and the plan ends after Task 3's regression guard. Do not
invent a fix for a passing invariant.

- [ ] **Step 3: Repeat for the two other states (Review Focus 3 and 4)**

Run the same seven against full mode, and against an empty playlist rather than an empty library.
Record the deltas — an invariant that holds in minimal but not full is the interesting finding here.

- [ ] **Step 4: Do not fix anything in this task**

Commit the suite as the recorded probe.

```bash
git add src/__tests__/empty-state.test-e2e.tsx
git commit -m "test(shell): pin the seven never-looks-empty invariants"
```

---

### Task 2: Fix what actually failed

**Files:**

- Modify: only the components Task 1's results name. Candidates by invariant, from the recon tree:
  - 2, 3, 7 → `src/components/NowPlaying.tsx:100-117` and its children (`Cover`, `PlayingBarInfo`,
    `TrackProgress.tsx`, `LoopControls.tsx`, `EffectControls.tsx`)
  - 4, 5 → `src/components/TrackList.tsx`, `TrackListGrouped.tsx`, `StatusBar.tsx`
  - 6 → whichever band holds the import action

**Interfaces:**

- Consumes: Task 1's recorded pass/fail list.
- Produces: nothing other code depends on.

- [ ] **Step 1: Fix the first failing invariant only**

Change the smallest thing that makes that one test pass. An empty value that should be an em-dash
becomes an em-dash; a band that unmounts becomes a band that renders its empty state.

- [ ] **Step 2: Run that invariant's test**

Run: `pnpm exec vp test run --project e2e src/__tests__/empty-state.test-e2e.tsx -t "<invariant name>"`
Expected: PASS, and the previously-passing six still pass.

- [ ] **Step 3: Repeat for each remaining failure, one at a time**

One invariant per commit, so a regression is attributable.

```bash
git add src/components/<component>.tsx
git commit -m "fix(shell): invariant N - <what was empty>"
```

- [ ] **Step 4: Confirm every failure is fixed and nothing else broke**

Run: `pnpm exec vp test run --project e2e src/__tests__/empty-state.test-e2e.tsx`
Expected: PASS, all seven, in all three states from Task 1.

Run: `pnpm exec vp test run --project e2e` and `pnpm test:typings`
Expected: both PASS; typings exit 0.

---

### Task 3: The narrow-window guard

**Files:**

- Test: `src/__tests__/empty-state.test-e2e.tsx` (extend)

**Interfaces:**

- Consumes: Task 1's suite.
- Produces: nothing.

- [ ] **Step 1: Add the resize case**

Re-run the seven invariants at a 720px-wide viewport — Review Focus 5. The prior resize sweep
(`Slowburn-ops\release\sweep-resize.ps1`) already found the frame collapses below a 388px column,
so the narrow case is where an invariant is most likely to fail.

- [ ] **Step 2: Run it and record**

Run: `pnpm exec vp test run --project e2e src/__tests__/empty-state.test-e2e.tsx`
Expected: PASS or FAIL; either way it is a real datum, and a failure here is a finding to report
rather than to paper over by widening the viewport.

---

## Self-review

- **Spec coverage:** all seven §3.4 invariants — Task 1. AC2 — Tasks 1 and 2. AC3 is the UI-mode
  plan's; this plan covers §3.4 only, and the two overlap on invariant 1, deliberately.
- **Why Task 1 fixes nothing:** the spec asserts these seven hold; no one has checked. Writing the
  fixes first would encode the author's assumptions about which bands are broken, and the suite would
  then prove only that the author was right. The probe-then-fix order is the point of the plan.
- **Not covered:** invariant coverage for the ledger's vertical clipping defect. Phase 1 found it,
  and it was deliberately not fixed blind; if Task 1's invariant 4 or 5 fails _because_ of clipping,
  record it as that known defect rather than rediscovering it as new.
- **Type consistency:** none needed — this plan adds no signatures.
