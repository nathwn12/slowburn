# Volume Strip Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the volume slider with a slim fill bar plus a percentage readout — wheel adjusts, click mutes, no thumb, no accent ring — and delete the dead popover branch around it.

**Architecture:** `VolumeControl.tsx` is currently two components in one file: a dense row (mute button + `base-ui` slider + mono readout) and a hover popover that **nothing calls**. The slider primitive and every thumb style exist only to serve those. The change is mostly deletion: keep the state plumbing, delete the primitives, and render the fill bar as a plain element driven by the existing volume value.

**Tech Stack:** React 19, TypeScript, StyleX (`@stylexjs/stylex`), base-ui (`Slider`, `Popover` — both to be removed), Vitest, Tauri v2.

**Spec:** `docs/specs/minimal-mode-and-sorting.md` §3.6, AC8.

## Global Constraints

- Offline. No new network code of any kind.
- No verification run may produce audio. Test config forces muted output (`--mute-audio`).
- The app is **never launched** by this plan; verification is tests only.
- StyleX only — no CSS modules, no Tailwind, no inline style objects.
- Colour tokens in use: fill `var(--accent)`, empty track `var(--track)`, muted dimming uses the existing `faded` style.
- Do not edit `src/generated/typings.ts` by hand (it is generated).
- One writer per file. Nothing outside the file lists below.

## Review Focus

The spec fixes the _look_ of the volume strip but not these conditions; each is a way a person's
real use breaks a bar that looks correct in a screenshot:

1. **Volume 0 vs muted.** Spec §3.6 requires them to be visually distinguishable. A bar at 0% and
   a muted bar look identical unless the mute state changes something else.
2. **Exactly 100%.** The readout is `Math.round(value * 100)`. Confirm an unsmoothed max volume
   renders `100%` and never `101%`.
3. **Wheel over the bar.** The wheel handler must adjust volume and must not scroll the page or a
   parent list.
4. **Keyboard only.** Deleting the slider removes its keyboard affordance. A bar that is not
   focusable and not arrow-adjustable is a regression in access, not a simplification.
5. **No track loaded.** The strip must still render — §3.4 invariant 1 ("never look empty") and
   the player band surviving every state.

---

### Task 1: The slim bar, with its tests

**Files:**

- Modify: `src/components/VolumeControl.tsx` (283 lines; the dense branch is `57-95`, styles `155-283`)
- Modify: `src/components/PlayerControls.tsx:84` (call site)
- Test: `src/components/__tests__/volume-control.test.tsx` (create)

**Interfaces:**

- Consumes: `player` singleton — `setVolume(volume: number): void` (`src/lib/player.ts:714`),
  `toggleMute(): Promise<void>` (`:732`), `unmute(): Promise<void>` (`:738`);
  `usePlayerState` reads `state.volume: number` (`:56`) and `state.muted: boolean` (`:57`).
- Consumes: `useWheelStep(onSteps: (steps: number) => void, enabled?: boolean)`
  (`src/components/wheel-step.ts:53`) and `STEP` from the same module.
- Produces: `export default function VolumeControl(): JSX.Element` — **the `dense` prop is
  removed**, so the single call site becomes `<VolumeControl />`.

- [ ] **Step 1: Write the failing test**

Create `src/components/__tests__/volume-control.test.tsx` using the repo's observed mocking idiom
(`vi.doMock` on a `src/lib` module, as `src/__tests__/ab-loop.test-e2e.ts:119` does for
`../lib/bridge-config`). Mock `../lib/player` and `../hooks/usePlayer` so the component renders
deterministically.

```tsx
// Assertions, one per Review Focus item.
it('renders the percentage readout', ...)            // volume 0.42 -> text "42%"
it('renders 100% at maximum volume', ...)            // volume 1.0  -> "100%", not "101%"
it('renders 0% when volume is zero and not muted', ...)
it('distinguishes muted from zero volume', ...)      // muted element carries the muted marker; zero-volume does not
it('calls toggleMute when the bar is clicked', ...)
it('renders no slider role and no thumb element', ...)
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vp test run --project unit src/components/__tests__/volume-control.test.tsx`
Expected: FAIL — `VolumeControl` still requires/renders the old slider, so the readout, mute-marker
and no-slider assertions fail.

- [ ] **Step 3: Rewrite `VolumeControl.tsx` as the bar**

Keep, unchanged: the `smoothifyVolume` / `unsmoothifyVolume` pair (`:14-19`), `getVolumeIcon`
(`:21-27`), the state reads (`:34-37`), `setPlayerVolume` (`:39-48`), the readout computation
(`:50-51`), `wheelRef` (`:53-55`).

Replace, entirely:

- the dense early-return (`:57-95`) — the `Slider.Root/Control/Track/Indicator/Thumb` tree becomes
  one fill element: an outer div carrying `denseTrack` (empty track colour) containing an inner div
  carrying `denseRange` (accent fill) at `width: ${sliderValue * 100}%`.
- the non-dense popover branch (`:97-142`) — delete it.
- the styles it served: `sliderRoot`, `sliderTrack`, `sliderRange`, `sliderThumb`,
  `denseSlider`, `denseThumb`, `volumeHoverCard`, `volumeControlContainer`, and the `fadeIn` /
  `fadeOut` keyframes (`:145-153`). Keep `volumeRow`, `muteButton`, `denseTrack`, `denseRange`,
  `readout`, `faded`.
- the `Popover` and `Slider` imports, and the `dense` prop from the `Props` type.

Behaviour to attach to the bar element:

- `onClick` → `player.toggleMute()`
- `ref={wheelRef}` so the wheel adjusts
- `tabIndex={0}`, `role="button"`, an `aria-label` from the existing `t` macro, and `onKeyDown`
  handling ArrowUp/ArrowRight (+STEP) and ArrowDown/ArrowLeft (−STEP) — Review Focus item 4.
- a muted marker distinct from 0%: apply the existing `faded` style _and_ render the muted icon via
  the existing `getVolumeIcon(volume, muted)` — Review Focus item 1.

Then update `src/components/PlayerControls.tsx:84` from `<VolumeControl dense />` to
`<VolumeControl />`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm exec vp test run --project unit src/components/__tests__/volume-control.test.tsx`
Expected: PASS, all listed assertions.

- [ ] **Step 5: Run the full suites and the type check**

Run: `pnpm exec vp test run --project unit`
Expected: PASS, with the previous total plus the new file's tests.

Run: `pnpm exec vp test run --project e2e`
Expected: PASS — in particular `dense-ui.test-e2e.tsx`, which asserts shell regions and already
forces `setVolume(0)`.

Run: `pnpm test:typings`
Expected: exit 0. A leftover `dense` prop or a stale `Slider` import fails here.

- [ ] **Step 6: Commit**

```bash
git add src/components/VolumeControl.tsx src/components/PlayerControls.tsx src/components/__tests__/volume-control.test.tsx
git commit -m "feat(volume): slim fill bar + percentage, drop the slider and dead popover"
```

---

### Task 2: Prove the strip never disappears

**Files:**

- Test: `src/__tests__/dense-ui.test-e2e.tsx` (extend)

**Interfaces:**

- Consumes: `VolumeControl` default export from Task 1 (no props).
- Produces: nothing other code depends on.

- [ ] **Step 1: Write the failing test**

Extend the existing shell-region suite with an assertion that the volume strip is present with **no
track loaded** — the same empty-state condition `dense-ui.test-e2e.tsx:380` already uses for the
status bar:

```tsx
it('keeps the volume strip mounted with no track loaded', ...)
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm exec vp test run --project e2e src/__tests__/dense-ui.test-e2e.tsx`
Expected: FAIL if the strip is conditionally rendered on a loaded track; PASS if it is already
unconditional — in which case record that it passed on the first run rather than claiming a red
step. A test that was never red is not evidence of a fix.

- [ ] **Step 3: Make it pass, if it failed**

If the strip is conditional, remove the condition. Do not add new state to force it.

- [ ] **Step 4: Run the suite and commit**

Run: `pnpm exec vp test run --project e2e`
Expected: PASS.

```bash
git add src/__tests__/dense-ui.test-e2e.tsx
git commit -m "test(volume): volume strip survives the empty state"
```

---

## Self-review

- **Spec coverage:** §3.6 (slim bar, wheel, click mutes, no thumb, no ring) — Task 1.
  AC8 — Task 1 steps 1 and 4. §3.4 invariant 1, as it applies to this band — Task 2.
- **Not covered by this plan, deliberately:** the "no accent ring" requirement is satisfied by
  deleting `denseThumb`; there is no other ring on the bar. Review Focus item 4 is an addition the
  spec does not demand, and it is the one place this plan goes _beyond_ the spec — noted so it is a
  decision rather than a surprise.
- **Type consistency:** `VolumeControl` takes no props in both tasks; `player.toggleMute()`,
  `player.setVolume()`, `useWheelStep`, `STEP`, `sliderValue` and the style names all come from the
  recon file `Slowburn-ops/ui/recon/recon-volume.md` with line references.
- **Known unknowns for the implementer:** the repo has **no existing volume test and no confirmed
  player mock**, so Step 1's mocking approach is modelled on the observed `vi.doMock` idiom rather
  than copied from a peer file. If a player mock already exists, use it instead.
