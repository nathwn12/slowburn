import { createRef, type CSSProperties } from 'react';
/**
 * UX primitives seam: hit targets, honest semantics, canonical tokens.
 *
 * Direct component renders (no app launch, same pattern as
 * `src/components/__tests__/burn-steppers.test-e2e.tsx`): each test pins one
 * of the audit findings for `src/elements/*` plus `src/global.css`.
 *
 * - Chip renders a `<span>` when it has no action, a `<button>` otherwise.
 * - ButtonIcon keeps a >=28px hit target and the dim idle colour.
 * - Button carries its own `:focus-visible` ring.
 * - Toggle track is 20-24px and the knob throw is derived from geometry.
 * - ViewMessage type follows the `--text-lg` / `--text-sm` ramp.
 * - Scrollable keeps a stable gutter and themed scrollbars.
 * - Link's button variant folds onto the canonical `--surface-hover` token.
 * - The global focus rule uses the real radius token with no positional
 *   side effects, and hover-scale skips drag thumbs.
 */
import { afterEach, expect, test, vi } from 'vite-plus/test';
import { userEvent } from 'vite-plus/test/browser';
import { cleanup, render } from 'vitest-browser-react';

import '../global.css';
import Button from '../elements/Button';
import ButtonIcon from '../elements/ButtonIcon';
import Chip from '../elements/Chip';
import Link from '../elements/Link';
import Scrollable from '../elements/Scrollable';
import Toggle from '../elements/Toggle';
import * as ViewMessage from '../elements/ViewMessage';

afterEach(async () => {
  await cleanup();
});

function box(el: Element): { width: number; height: number; left: number } {
  const b = el.getBoundingClientRect();
  return { width: b.width, height: b.height, left: b.left };
}

function requireEl(selector: string): HTMLElement {
  const el = document.querySelector<HTMLElement>(selector);
  if (el == null) throw new Error(`missing element: ${selector}`);
  return el;
}

/** Raw text of every injected stylesheet (app CSS + StyleX atoms). */
function cssText(): string {
  let out = '';
  document.querySelectorAll('style').forEach((tag) => {
    out += `\n${tag.textContent ?? ''}`;
  });
  return out;
}

test('chip without an action is a span, with an action a button', async () => {
  await render(
    <>
      <Chip>Static filter</Chip>
      <Chip active>Static active</Chip>
      <Chip onClick={vi.fn<() => void>()}>Interactive</Chip>
      <Chip onClick={vi.fn<() => void>()} active>
        Interactive active
      </Chip>
    </>,
  );

  // Static chips are honest non-interactive spans: no button role at all.
  const buttons = document.querySelectorAll('button');
  expect(buttons.length).toBe(2);
  const spans = document.querySelectorAll('span');
  expect(spans.length).toBe(2);
  expect(document.querySelector('button')?.textContent).toContain(
    'Interactive',
  );

  // The interactive active chip keeps its pressed state for screen readers;
  // static chips expose no button semantics to get wrong.
  const activeButton = Array.from(buttons).find((b) =>
    b.textContent?.includes('Interactive active'),
  );
  expect(activeButton?.getAttribute('aria-pressed')).toBe('true');
  for (const span of Array.from(spans)) {
    expect(span.hasAttribute('aria-pressed')).toBe(false);
  }
});

test('icon-only button keeps a 28px hit target and dim idle colour', async () => {
  await render(
    <>
      <ButtonIcon label="Probe mute" icon="volumeMute" />
      <span id="dim-probe" style={{ color: 'var(--text-dim)' }}>
        probe
      </span>
    </>,
  );

  const button = requireEl('[aria-label="Probe mute"]');
  const r = box(button);
  expect(r.width).toBeGreaterThanOrEqual(28);
  expect(r.height).toBeGreaterThanOrEqual(28);

  // Idle icons use the unified dim colour, not full --text.
  const probe = requireEl('#dim-probe');
  expect(getComputedStyle(button).color).toBe(getComputedStyle(probe).color);
});

test('button paints its own focus-visible ring from the keyboard', async () => {
  await render(<Button>Probe action</Button>);

  const button = requireEl('button');
  (document.activeElement as HTMLElement | null)?.blur?.();
  await userEvent.tab();

  expect(document.activeElement).toBe(button);
  expect(button.matches(':focus-visible')).toBe(true);
  const style = getComputedStyle(button);
  expect(style.outlineStyle).not.toBe('none');
  expect(style.outlineWidth).not.toBe('0px');
});

test('toggle track is 22px and the knob throw is derived', async () => {
  // The track width comes from the `--space-6` theme token (32px in every
  // theme, e.g. `src/themes/dark.json`); the isolated render has no theme,
  // so provide the documented value at the container.
  await render(
    <div style={{ '--space-6': '32px' } as CSSProperties}>
      <Toggle
        checked={false}
        onChange={vi.fn<(next: boolean) => void>()}
        label="Probe off"
      />
      <Toggle
        checked
        onChange={vi.fn<(next: boolean) => void>()}
        label="Probe on"
      />
    </div>,
  );

  const off = requireEl('[aria-label="Probe off"]');
  const on = requireEl('[aria-label="Probe on"]');
  const offKnob = off.firstElementChild;
  const onKnob = on.firstElementChild;
  if (offKnob == null || onKnob == null) throw new Error('missing knob');

  // Track height sits inside the 20-24px band (was a cramped 18px).
  for (const track of [off, on]) {
    const h = box(track).height;
    expect(h).toBeGreaterThanOrEqual(20);
    expect(h).toBeLessThanOrEqual(24);
  }

  // Throw = content width minus knob: track (32) - padding (2*2) -
  // border (2*1) - knob (14) = 12px, never a magic number again. Each knob
  // is anchored to its OWN track: the toggles are inline siblings, so a
  // cross-toggle absolute difference also measures the sibling offset (32).
  const offInset = box(offKnob).left - box(off).left;
  const onInset = box(onKnob).left - box(on).left;
  const travel = onInset - offInset;
  const expected = box(off).width - box(offKnob).width - 2 * 2 - 2 * 1;
  expect(Math.abs(travel - expected)).toBeLessThanOrEqual(1.5);
});

test('empty-state type follows the text ramp, not shout sizes', async () => {
  await render(
    <>
      <ViewMessage.Notice>Nothing here</ViewMessage.Notice>
      <ViewMessage.Sub>Some details</ViewMessage.Sub>
      <span id="lg-probe" style={{ fontSize: 'var(--text-lg)' }}>
        probe
      </span>
      <span id="sm-probe" style={{ fontSize: 'var(--text-sm)' }}>
        probe
      </span>
    </>,
  );

  const title = requireEl('[role="status"]');
  const titleSize = getComputedStyle(title).fontSize;
  expect(titleSize).toBe(getComputedStyle(requireEl('#lg-probe')).fontSize);
  expect(titleSize).not.toBe('25px');

  // Exact text match: ancestor containers also contain the substring.
  const subEl =
    Array.from(document.querySelectorAll('div')).find(
      (d) => d.textContent?.trim() === 'Some details',
    ) ?? null;
  if (subEl == null) throw new Error('missing subtitle');
  expect(getComputedStyle(subEl).fontSize).toBe(
    getComputedStyle(requireEl('#sm-probe')).fontSize,
  );
});

test('scrollable keeps a stable gutter and themed scrollbars', async () => {
  await render(
    <Scrollable id="probe-scroller" ref={createRef<HTMLDivElement>()}>
      <div style={{ height: '200px' }}>tall content</div>
    </Scrollable>,
  );

  const scroller = requireEl('#probe-scroller');
  const style = getComputedStyle(scroller);
  expect(style.overflowY).toBe('auto');
  expect(style.scrollbarGutter).toBe('stable');
  expect(cssText()).toContain('::-webkit-scrollbar-thumb');
});

test('link button variant folds onto the canonical hover token', async () => {
  await render(<Link onClick={vi.fn<() => void>()}>Probe details</Link>);

  const el = requireEl('button');
  expect(el.textContent).toContain('Probe details');

  // The non-canonical `--text-interactive-bg` must be gone from every
  // injected rule; the canonical hover token carries the treatment.
  expect(cssText()).not.toContain('--text-interactive-bg');
  expect(cssText()).toContain('--surface-hover');
});

test('global focus rule uses the real radius token, no side effects', () => {
  const blocks = cssText().match(/:focus-visible\s*\{[^}]*\}/g) ?? [];
  expect(blocks.length).toBeGreaterThan(0);

  for (const block of blocks) {
    expect(block).not.toContain('--border-radius');
    expect(block).not.toContain('z-index');
    expect(block).not.toContain('!important');
    expect(block).not.toContain('position');
  }
  expect(blocks.some((block) => block.includes('var(--radius)'))).toBe(true);
});

test('hover-scale skips drag thumbs, which get glow only', () => {
  // oxfmt normalises attribute selectors to double quotes.
  const css = cssText().replace(/"/g, "'");

  // No bare catch-all scale rule may remain.
  expect(css).not.toContain('[data-museeks-action]:hover');
  // Drag thumbs are excluded two ways: custom role="slider" sliders and
  // Base UI thumbs wrapping a native range input (the Burn strip).
  expect(css).toContain("role='slider'");
  expect(css).toContain(':has(input');
});
