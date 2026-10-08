/**
 * Long-title overflow: the now-playing header block keeps a fixed height no
 * matter how long the title is, and the full string stays discoverable.
 *
 * The owner hit this with a Japanese track name carrying a bracketed English
 * translation: the title wrapped, the block grew, and everything below it
 * jumped between tracks. The fix under test is `src/elements/MarqueeLine` -
 * one-line ellipsis by default, hover/focus reveal only when the text
 * actually overflows, plain ellipsis under `prefers-reduced-motion` - wired
 * into the full-mode header, the mini strip, and the list rows' tooltips.
 *
 * Geometry (not `toBeVisible()`): an ellipsized line is "visible" either way,
 * so these tests read `getBoundingClientRect()`, `scrollWidth/clientWidth`
 * and computed style directly, following `narrow-column.test-e2e.tsx`.
 *
 * Silent: the browser is launched with `--mute-audio`, and here the graph
 * output is forced to 0 (`setSilentTest`) AND the master gain to 0
 * (`setVolume(0)`).
 */
import * as stylex from '@stylexjs/stylex';
import { afterEach, expect, test } from 'vite-plus/test';
import { page, userEvent } from 'vite-plus/test/browser';
import { render } from 'vitest-browser-react';

import MarqueeLine from '../elements/MarqueeLine';
import type { Track } from '../generated/typings';
import {
  beforeEachSetup,
  getTrackByName,
  getTrackList,
  setupScannedLibrary,
} from './e2e-helpers';

beforeEachSetup();

// Deliberately long fixtures: a Japanese title with a bracketed English
// translation (the owner's case) and an artist line that cannot fit.
const LONG_TITLE =
  '鏡の中のマリオネット Dancer in the Hall of Mirrors (Extended Symphonic Translation Version) [feat. Someone With A Very Long Name]';
const LONG_ARTIST =
  'A Performer With An Extremely Long Stage Name, Second Artist With An Equally Long Name, Third Collaborator';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(
  predicate: () => boolean,
  timeoutMs: number,
): Promise<void> {
  const start = performance.now();
  while (!predicate()) {
    if (performance.now() - start > timeoutMs) {
      throw new Error('waitFor timed out');
    }
    await sleep(20);
  }
}

/** Two frames plus a beat: lets React and the ResizeObservers settle. */
async function settle(): Promise<void> {
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
  await sleep(60);
}

/** Force Full mode: the dense header block only renders there. */
async function setMode(mode: 'minimal' | 'full'): Promise<void> {
  const bridge = (await import('../lib/bridge-config')) as unknown as {
    default: { config: { ui_mode: 'minimal' | 'full' } };
  };
  bridge.default.config = { ...bridge.default.config, ui_mode: mode };

  const { default: queryClient } = await import('../lib/query-client');
  const { configQuery } = await import('../lib/queries');
  await queryClient.invalidateQueries({ queryKey: configQuery.queryKey });
}

/** Scan the mock library, silence the graph, and play the first track. */
async function playFirstTrack() {
  await setupScannedLibrary();
  const p = window.__MUSEEKS_PLAYER;
  p.getEffects().setSilentTest(true);
  p.setVolume(0);
  await getTrackByName(/Whiskey Blues/).dblClick();
  await waitFor(() => !p.getState().isPaused, 5000);
  return p;
}

afterEach(() => {
  window.__MUSEEKS_PLAYER.pause();
});

function npTitle(): HTMLElement {
  const el = document.querySelector('[data-testid="np-title"]');
  if (el == null) throw new Error('np-title missing');
  return el as HTMLElement;
}

function npArtist(): HTMLElement {
  const el = document.querySelector('[data-testid="np-artist"]');
  if (el == null) throw new Error('np-artist missing');
  return el as HTMLElement;
}

function npBlock(): HTMLElement {
  const el = document.querySelector('[data-testid="np-header-block"]');
  if (el == null) throw new Error('np-header-block missing');
  return el as HTMLElement;
}

/**
 * Force the motion preference a harness sees. The component reads
 * `matchMedia` at mount and subscribes to it, so stub before rendering.
 * (Headless Chromium reports `reduce` by default, which would make the
 * reveal test vacuous without this.)
 */
function stubMatchMedia(matches: boolean): () => void {
  const original = window.matchMedia;
  window.matchMedia = ((query: string) => {
    if (query.includes('prefers-reduced-motion')) {
      return {
        matches,
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
        onchange: null,
      };
    }
    return original.call(window, query);
  }) as typeof window.matchMedia;
  return () => {
    window.matchMedia = original;
  };
}

test(
  'the now-playing block height is identical with a short and a very long title',
  { timeout: 30_000 },
  async () => {
    await setMode('full');
    const p = await playFirstTrack();
    p.pause();
    await settle();

    const shortHeight = npBlock().getBoundingClientRect().height;
    expect(shortHeight).toBeGreaterThan(0);

    // Drive the long fixtures through the REAL path: the player queue feeds
    // the header, so this re-renders the production block and its
    // ResizeObserver measures genuine overflow.
    const [first, ...rest] = p.getState().queue;
    const longTrack: Track = {
      ...first!,
      title: LONG_TITLE,
      artists: [LONG_ARTIST],
    };
    p.setQueue([longTrack, ...rest]);
    await waitFor(() => npTitle().getAttribute('title') === LONG_TITLE, 5000);
    await settle();

    // 1. THE regression: the block height does not move with the content.
    expect(npBlock().getBoundingClientRect().height).toBe(shortHeight);

    // 2. Ellipsized, not wrapped: one line, hidden overflow, and the content
    //    genuinely overflows (scrollWidth beyond the box).
    const titleStyle = getComputedStyle(npTitle());
    expect(titleStyle.whiteSpace).toBe('nowrap');
    expect(titleStyle.overflow).toBe('hidden');
    expect(titleStyle.textOverflow).toBe('ellipsis');
    expect(npTitle().scrollWidth).toBeGreaterThan(npTitle().clientWidth);
    const artistStyle = getComputedStyle(npArtist());
    expect(artistStyle.whiteSpace).toBe('nowrap');
    expect(artistStyle.textOverflow).toBe('ellipsis');
    expect(npArtist().scrollWidth).toBeGreaterThan(npArtist().clientWidth);

    // 3. The full strings are always available: tooltip + complete content.
    expect(npTitle().textContent).toBe(LONG_TITLE);
    expect(npArtist().textContent).toBe(LONG_ARTIST);

    // 4. The overflow was measured, so hover reveal is armed - but only here,
    //    never for fitting text (covered in the isolated tests below).
    expect(npTitle().getAttribute('data-overflowing')).toBe('true');
    expect(npArtist().getAttribute('data-overflowing')).toBe('true');
  },
);

test(
  'hover reveals overflowing text and resets on leave; fitting text never moves',
  { timeout: 30_000 },
  async () => {
    // Motion allowed: the harness must reveal. Restored afterwards so the
    // reduced-motion test below starts from the real preference.
    const restore = stubMatchMedia(false);
    try {
      await render(
        <div data-testid="reveal-harness" style={{ width: '220px' }}>
          <div data-testid="reveal-short">
            <MarqueeLine
              text="Whiskey Blues"
              xstyle={harnessStyles.line}
              testId="reveal-short-line"
            />
          </div>
          <div data-testid="reveal-long">
            <MarqueeLine
              text={LONG_TITLE}
              xstyle={harnessStyles.line}
              testId="reveal-long-line"
            />
          </div>
        </div>,
      );
      await settle();

      const shortLine = document.querySelector(
        '[data-testid="reveal-short-line"]',
      ) as HTMLElement;
      const longLine = document.querySelector(
        '[data-testid="reveal-long-line"]',
      ) as HTMLElement;
      // Sanity: the short fixture fits, the long one does not.
      expect(shortLine.getAttribute('data-overflowing')).toBe('false');
      expect(longLine.getAttribute('data-overflowing')).toBe('true');
      // Identical heights: the shared element never wraps.
      expect(longLine.getBoundingClientRect().height).toBe(
        shortLine.getBoundingClientRect().height,
      );

      // Fitting text never moves, even under a real pointer hover.
      await userEvent.hover(shortLine);
      await sleep(700);
      expect((shortLine.firstElementChild as HTMLElement).style.transform).toBe(
        '',
      );

      // Overflowing text travels on hover (after the end pause) and resets.
      await userEvent.hover(longLine);
      await waitFor(
        () =>
          (longLine.firstElementChild as HTMLElement).style.transform.includes(
            'translateX(-',
          ),
        5000,
      );
      // Steering the pointer onto the neighbouring fitting line moves it off
      // this one: the reveal must reset to the start.
      await userEvent.hover(shortLine);
      await waitFor(
        () =>
          (longLine.firstElementChild as HTMLElement).style.transform ===
            'translateX(0px)' &&
          longLine.getAttribute('data-revealing') === 'false',
        5000,
      );
    } finally {
      restore();
    }
  },
);

test(
  'prefers-reduced-motion disables the hover reveal entirely',
  { timeout: 30_000 },
  async () => {
    const restore = stubMatchMedia(true);
    try {
      await render(
        <div data-testid="motion-harness" style={{ width: '220px' }}>
          <MarqueeLine
            text={LONG_TITLE}
            xstyle={harnessStyles.line}
            testId="motion-line"
          />
        </div>,
      );
      await settle();

      const line = document.querySelector(
        '[data-testid="motion-line"]',
      ) as HTMLElement;
      expect(line.getAttribute('data-overflowing')).toBe('true');
      // Plain ellipsis still applies, with the full string on the tooltip.
      const style = getComputedStyle(line);
      expect(style.whiteSpace).toBe('nowrap');
      expect(style.textOverflow).toBe('ellipsis');
      expect(line.getAttribute('title')).toBe(LONG_TITLE);

      await userEvent.hover(line);
      await sleep(900);
      expect((line.firstElementChild as HTMLElement).style.transform).toBe('');
    } finally {
      restore();
    }
  },
);

test(
  'the metadata line and the AUDIO row keep the full text on a tooltip',
  { timeout: 30_000 },
  async () => {
    await setMode('full');
    const p = await playFirstTrack();
    p.pause();

    // The album line carries year/track meta: the tooltip must be the whole
    // line, not just the album tag.
    const albumEl = document.querySelector(
      '[data-testid="np-album"]',
    ) as HTMLElement;
    expect(albumEl.getAttribute('title')).toBe(albumEl.textContent);
    expect(getComputedStyle(albumEl).textOverflow).toBe('ellipsis');

    const region = page.getByRole('region', { name: 'Now playing' });
    await region.getByRole('button', { name: 'Details and effects' }).click();
    await waitFor(
      () =>
        region
          .getByRole('button', { name: 'Details and effects' })
          .element()
          .getAttribute('aria-expanded') === 'true',
      3000,
    );

    const tech = document.querySelector(
      '[aria-label="Technical format information"]',
    ) as HTMLElement;
    // The tech strip wraps whole tokens between cells instead of clipping
    // mid-token; every cell names its full value.
    expect(getComputedStyle(tech).flexWrap).toBe('wrap');
    for (const cell of Array.from(tech.children) as Array<HTMLElement>) {
      expect(cell.getAttribute('title')).toBe(cell.textContent);
    }

    // The AUDIO row is a fixed 21px single line: ellipsis keeps the height
    // stable and the tooltip keeps the (never mid-token-truncated) value.
    // Scoped to the live region: the details panel renders inside it.
    const regionEl = document.querySelector(
      '[aria-label="Now playing"]',
    ) as HTMLElement;
    const audioLabel = Array.from(regionEl.querySelectorAll('span')).find(
      (el) => el.textContent === 'Audio',
    );
    expect(audioLabel).toBeDefined();
    const audioValue = audioLabel!.parentElement!.querySelector(
      'span[title]',
    ) as HTMLElement;
    expect(audioValue.getAttribute('title')).toBe(audioValue.textContent);
    expect(audioValue.textContent).not.toBe('');
    expect(audioValue.parentElement!.getBoundingClientRect().height).toBe(21);
  },
);

test(
  'a very long list-row title never moves the duration column',
  { timeout: 30_000 },
  async () => {
    await setMode('full');
    const p = await playFirstTrack();
    p.pause();
    await settle();

    // The queue's duration column keeps its 44px floor (hour-long tracks).
    const queueButton = page.getByRole('button', { name: 'Switch view' });
    await queueButton.click();
    await page.getByRole('menuitem', { name: 'Queue' }).click();
    const queueDur = document.querySelector(
      '[data-testid="queue-duration"]',
    ) as HTMLElement;
    expect(getComputedStyle(queueDur).minWidth).toBe('44px');

    // Back to the library rows for the alignment proof.
    await queueButton.click();
    await page.getByRole('menuitem', { name: 'All tracks' }).click();
    await settle();

    const row = getTrackList().getByRole('option').first().element();
    const titleEl = row.querySelector(
      '[data-testid="track-title"]',
    ) as HTMLElement;
    const durationEl = row.querySelector(
      '[data-testid="track-duration"]',
    ) as HTMLElement;
    // The tooltip already carries the whole title for the short fixture.
    expect(titleEl.getAttribute('title')).toBe(titleEl.textContent);

    const rowHeight = row.getBoundingClientRect().height;
    const durationLeft = durationEl.getBoundingClientRect().left;

    // Flood the row with the long fixture through the DOM (the library rows
    // read the scanned mock tracks, which this test must not rewrite).
    (titleEl.firstChild as Text).data = LONG_TITLE;
    titleEl.setAttribute('title', LONG_TITLE);
    await settle();

    expect(titleEl.scrollWidth).toBeGreaterThan(titleEl.clientWidth);
    expect(row.getBoundingClientRect().height).toBe(rowHeight);
    expect(durationEl.getBoundingClientRect().left).toBe(durationLeft);
  },
);

const harnessStyles = stylex.create({
  line: {
    fontSize: '17px',
    fontWeight: 700,
    lineHeight: 1.2,
  },
});
