import { useLingui } from '@lingui/react/macro';
import * as stylex from '@stylexjs/stylex';
import { useEffect, useRef, useState } from 'react';

import type { Track } from '../generated/typings';
import { usePlayerState } from '../hooks/usePlayer';
import { resolveSetA, resolveSetB } from '../lib/dense-ab';
import player from '../lib/player';
import {
  formatTimeInput,
  resolvePointCommit,
  type PointCommitResult,
} from './time-input';

type Props = {
  trackPlaying: Track;
};

type Point = 'A' | 'B';

/**
 * Idle pause after the last keystroke before a parseable field commits on its
 * own. Long enough that char-by-char typing (`5` inside `5:60`) never plants
 * an intermediate point, short enough that the commit still feels instant -
 * no Enter, blur, or button press required.
 */
const INSTANT_COMMIT_MS = 500;

/**
 * The `.ab-row`. A and B are TYPED fields (the owner's ask - no drag fatigue):
 * type a time and it takes effect INSTANTLY - a parseable value commits
 * shortly after typing stops, with no Enter, blur, or button press, and the
 * playhead seeks to the entered time whenever it lands exactly inside the
 * track. The A/B buttons and the `[` / `]` keys remain as the instant
 * capture-the-playhead path. Every write goes through the one engine source
 * of truth (`player.setAbPoint`), so per-file persistence and
 * auto-apply-on-open are unchanged.
 *
 * Two deliberate limits on the seek. The instant commit is debounced, not
 * per-keystroke: char-by-char typing passes through values that parse on
 * their own (`5` inside `5:60`), and committing those would plant a wrong
 * point (and steal an Escape-revert). And a clamped or geometry-moved point
 * commits the region without seeking: jumping to an adjusted value would
 * surprise, and seeking at/past the media end would end the track outright.
 * Invalid input only paints the `!` mark and never commits; an emptied field
 * stays neutral until Enter/blur reverts it to the stored value.
 */
export default function LoopControls({ trackPlaying }: Props) {
  const abLoop = usePlayerState((state) => state.abLoop);
  const isPaused = usePlayerState((state) => state.isPaused);
  const { t } = useLingui();
  const [hovered, setHovered] = useState<null | Point>(null);
  const [draft, setDraft] = useState<{ A: string | null; B: string | null }>({
    A: null,
    B: null,
  });
  const [invalid, setInvalid] = useState<{ A: boolean; B: boolean }>({
    A: false,
    B: false,
  });

  const duration = trackPlaying.duration;
  const a = abLoop.startSeconds;
  const b = abLoop.endSeconds;
  const saved = a != null || b != null;
  const looping =
    abLoop.enabled && a != null && b != null && b - a > 0.05 && !isPaused;

  // Pending instant commits, one per field. Fired from `onChange`; cancelled
  // by further typing, Enter/blur (which commit now), Escape, capture, and
  // unmount - so a stale timer can never clobber a newer point.
  const instantTimers = useRef<{
    A: ReturnType<typeof setTimeout> | null;
    B: ReturnType<typeof setTimeout> | null;
  }>({ A: null, B: null });
  useEffect(
    () => () => {
      if (instantTimers.current.A != null) {
        clearTimeout(instantTimers.current.A);
      }
      if (instantTimers.current.B != null) {
        clearTimeout(instantTimers.current.B);
      }
    },
    [],
  );
  const cancelInstant = (point: Point) => {
    const pending = instantTimers.current[point];
    if (pending != null) {
      clearTimeout(pending);
      instantTimers.current[point] = null;
    }
  };

  const stored = (point: Point): string =>
    formatTimeInput(point === 'A' ? a : b);
  const value = (point: Point): string => draft[point] ?? stored(point);

  const revert = (point: Point) => {
    cancelInstant(point);
    setInvalid((prev) => ({ ...prev, [point]: false }));
    setDraft((prev) => ({ ...prev, [point]: null }));
  };

  const applyCommit = (
    point: Point,
    result: PointCommitResult,
    current: { a: number | null; b: number | null },
  ) => {
    if (point === 'A') {
      void player.setAbPoint('A', result.a as number);
      if (result.b != null && result.b !== current.b) {
        void player.setAbPoint('B', result.b);
      }
    } else {
      if (result.a != null && result.a !== current.a) {
        void player.setAbPoint('A', result.a);
      }
      void player.setAbPoint('B', result.b as number);
    }
    // The owner's ask: entering a time moves the playhead there - when the
    // typed point landed exactly inside the track (see `resolvePointCommit`).
    if (result.seek != null) player.setCurrentTime(result.seek);
  };

  const commit = (point: Point) => {
    commitText(point, value(point));
  };

  const commitText = (point: Point, text: string) => {
    // Fresh points, not the render closure's: a debounced timer may fire
    // after a capture button or another field already moved the region.
    const loop = player.getAbLoop();
    const current = { a: loop.startSeconds, b: loop.endSeconds };
    const result = resolvePointCommit(point, text, current, duration);
    // An empty field is not an error: clearing a point leaves the loop
    // untouched and the field stays neutral until something invalid is typed.
    // A dead region reverts the same way (the geometry already prevents it;
    // this is the last-ditch guard).
    if (result.kind === 'empty' || result.kind === 'dead') {
      revert(point);
      return;
    }
    if (result.kind === 'invalid') {
      setInvalid((prev) => ({ ...prev, [point]: true }));
      return;
    }

    applyCommit(point, result, current);
    setInvalid((prev) => ({ ...prev, [point]: false }));
    setDraft((prev) => ({ ...prev, [point]: null }));
  };

  const scheduleInstantCommit = (point: Point, text: string) => {
    cancelInstant(point);
    instantTimers.current[point] = setTimeout(() => {
      instantTimers.current[point] = null;
      // The text travels with the timer: the scheduling render's `draft`
      // still holds the pre-keystroke value, so reading it here would commit
      // stale (usually empty) input. Each keystroke reschedules, so this is
      // always the latest typed value.
      commitText(point, text);
    }, INSTANT_COMMIT_MS);
  };

  const capture = (point: Point) => {
    const current = player.getAbLoop();
    if (point === 'A') {
      const next = resolveSetA(
        player.getCurrentTime(),
        current.endSeconds,
        duration,
      );
      void player.setAbPoint('A', next.a);
      if (next.b != null && next.b !== current.endSeconds) {
        void player.setAbPoint('B', next.b);
      }
    } else {
      const next = resolveSetB(
        current.startSeconds,
        player.getCurrentTime(),
        duration,
      );
      if (next.a != null && next.a !== current.startSeconds) {
        void player.setAbPoint('A', next.a);
      }
      void player.setAbPoint('B', next.b);
    }
    revert(point);
  };

  const pointField = (point: Point) => {
    const armed = (point === 'A' ? a : b) != null;
    const label = point === 'A' ? t`Loop point A` : t`Loop point B`;
    return (
      <>
        <button
          type="button"
          onClick={() => capture(point)}
          onMouseEnter={() => setHovered(point)}
          onMouseLeave={() => setHovered(null)}
          onFocus={() => setHovered(point)}
          onBlur={() => setHovered(null)}
          data-armed={armed ? 'true' : 'false'}
          title={
            point === 'A'
              ? t`Set loop point A at the playhead (key: [)`
              : t`Set loop point B at the playhead (key: ])`
          }
          aria-label={point === 'A' ? t`Set loop point A` : t`Set loop point B`}
          {...stylex.props(styles.abBtn, armed && styles.abBtnArmed)}
        >
          {point}
          <span
            {...stylex.props(
              styles.keycap,
              hovered === point && styles.keycapShown,
            )}
            aria-hidden="true"
          >
            {point === 'A' ? '[' : ']'}
          </span>
        </button>

        <input
          type="text"
          inputMode="numeric"
          value={value(point)}
          placeholder="--:--"
          aria-label={label}
          aria-invalid={invalid[point] ? true : undefined}
          data-invalid={invalid[point] ? 'true' : 'false'}
          title={
            invalid[point] ? t`Invalid time - use minutes:seconds` : undefined
          }
          onFocus={(event) => {
            event.currentTarget.select();
          }}
          onChange={(event) => {
            const next = event.currentTarget.value;
            setDraft((prev) => ({ ...prev, [point]: next }));
            // The instant path: a parseable value commits shortly after
            // typing stops. Invalid input only paints the `!` mark and never
            // commits; an emptied (or dead-region) value stays neutral until
            // Enter/blur decides.
            const live = resolvePointCommit(point, next, { a, b }, duration);
            if (live.kind === 'commit') {
              if (invalid[point]) {
                setInvalid((prev) => ({ ...prev, [point]: false }));
              }
              scheduleInstantCommit(point, next);
            } else if (live.kind === 'invalid') {
              cancelInstant(point);
              if (!invalid[point]) {
                setInvalid((prev) => ({ ...prev, [point]: true }));
              }
            } else {
              cancelInstant(point);
              if (invalid[point]) {
                setInvalid((prev) => ({ ...prev, [point]: false }));
              }
            }
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              // Commit now instead of waiting out the instant timer (which
              // would recommit the same value harmlessly - cancel it first).
              cancelInstant(point);
              event.currentTarget.blur();
              commit(point);
            } else if (event.key === 'Escape') {
              event.preventDefault();
              // Revert without blurring: a blur would commit the stale draft.
              // Cancelling first so no pending instant commit fires after.
              revert(point);
            }
          }}
          onBlur={() => {
            // Commit now instead of waiting out the instant timer.
            cancelInstant(point);
            commit(point);
          }}
          {...stylex.props(
            styles.abInput,
            invalid[point] && styles.abInputInvalid,
          )}
        />
        {invalid[point] && (
          <span
            {...stylex.props(styles.invalidMark)}
            title={t`Invalid time - use minutes:seconds`}
            aria-hidden="true"
          >
            !
          </span>
        )}
      </>
    );
  };

  return (
    <div {...stylex.props(styles.abRow)}>
      {pointField('A')}
      {pointField('B')}

      <span {...stylex.props(styles.spacer)} aria-hidden="true" />
      <span {...stylex.props(styles.trailingGroup)}>
        <span
          {...stylex.props(styles.saved, saved && styles.savedYes)}
          title={
            saved
              ? t`A saved A-B loop exists for this file and auto-applies when reopened.`
              : t`No A-B loop is stored for this file.`
          }
        >
          <span {...stylex.props(styles.savedMark)} aria-hidden="true">
            {saved ? '◆' : '◇'}
          </span>
          {saved ? t`Saved loop` : t`No saved loop`}
        </span>

        {looping && (
          <span
            {...stylex.props(styles.loopLive)}
            title={t`Playback is looping the A-B region`}
          >
            ● LOOPING
          </span>
        )}

        <button
          type="button"
          onClick={() => void player.clearAbLoop()}
          disabled={!saved}
          aria-disabled={!saved ? true : undefined}
          title={t`Clear the A-B region for this track (key: \\)`}
          aria-label={t`Clear the A-B region for this track`}
          {...stylex.props(styles.abClear, !saved && styles.abClearIdle)}
        >
          {t`Clear`}
          <span {...stylex.props(styles.clearKeycap)} aria-hidden="true">
            \
          </span>
        </button>
      </span>
    </div>
  );
}

const pulse = stylex.keyframes({
  '0%, 100%': { opacity: 1 },
  '50%': { opacity: 0.65 },
});

const styles = stylex.create({
  abRow: {
    display: 'flex',
    alignItems: 'center',
    columnGap: '6px',
    rowGap: '6px',
    minHeight: '22px',
    flexWrap: 'wrap',
  },
  abBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    columnGap: '6px',
    height: '22px',
    paddingInline: 'var(--space-2)',
    borderRadius: 'var(--radius)',
    backgroundColor: {
      default: 'var(--surface-2)',
      ':hover': 'var(--surface-hover)',
    },
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--control-border)',
    color: {
      default: 'var(--text-dim)',
      ':hover': 'var(--text-bright)',
    },
    fontSize: 'var(--text-xs)',
    fontWeight: 700,
    lineHeight: 1,
    cursor: 'pointer',
    transition:
      'background-color .12s ease, color .12s ease, border-color .12s ease',
    transform: {
      ':active': 'translateY(1px)',
    },
  },
  abBtnArmed: {
    backgroundColor: {
      default: 'var(--accent-soft)',
      ':hover': 'var(--accent-soft)',
    },
    borderColor: 'var(--accent)',
    color: {
      default: 'var(--accent-text)',
      ':hover': 'var(--accent-text)',
    },
    boxShadow: 'var(--glow-hover)',
  },
  keycap: {
    fontFamily: 'var(--mono-font)',
    fontSize: '9px',
    fontWeight: 700,
    lineHeight: 1,
    backgroundColor: 'var(--surface-inset)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--control-border)',
    borderRadius: '3px',
    paddingBlock: '2px',
    paddingInline: 'var(--space-1)',
    color: 'var(--text-faint)',
    opacity: 0,
    transition: 'opacity .12s ease',
  },
  keycapShown: {
    opacity: 1,
  },
  abInput: {
    width: '74px',
    height: '22px',
    paddingInline: '7px',
    borderRadius: 'var(--radius)',
    backgroundColor: 'var(--surface-2)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--border-soft)',
    color: 'var(--accent-text)',
    fontFamily: 'var(--mono-font)',
    fontSize: 'var(--text-xs)',
    fontWeight: 600,
    lineHeight: 1,
    fontVariantNumeric: 'tabular-nums',
    // Explicit local focus ring (the Button.tsx pattern): the global
    // `:focus-visible` rule alone is defeated by the reset the inputs used
    // to carry, so keyboard focus paints from the focus token here.
    outlineStyle: {
      ':focus-visible': 'solid',
    },
    outlineWidth: {
      ':focus-visible': '2px',
    },
    outlineColor: {
      ':focus-visible': 'var(--focus-color)',
    },
    outlineOffset: {
      ':focus-visible': '1px',
    },
    boxShadow: {
      ':focus-visible': 'var(--glow-focus)',
    },
  },
  abInputInvalid: {
    borderColor: 'var(--danger)',
    color: 'var(--danger)',
    backgroundColor: 'var(--danger-soft)',
  },
  invalidMark: {
    color: 'var(--danger)',
    fontSize: 'var(--text-sm)',
    fontWeight: 800,
    lineHeight: 1,
  },
  trailingGroup: {
    display: 'inline-flex',
    alignItems: 'center',
    columnGap: '6px',
    flexWrap: 'wrap',
  },
  spacer: {
    display: 'flex',
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 'auto',
  },
  saved: {
    display: 'inline-flex',
    alignItems: 'center',
    columnGap: '6px',
    height: '22px',
    paddingInline: '9px',
    borderRadius: '9999px',
    fontSize: 'var(--text-xs)',
    fontWeight: 600,
    lineHeight: 1,
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--border-soft)',
    backgroundColor: 'var(--surface-2)',
    color: 'var(--text-faint)',
    whiteSpace: 'nowrap',
  },
  savedMark: {
    fontSize: '9px',
  },
  savedYes: {
    color: 'var(--accent-text)',
    backgroundColor: 'var(--accent-soft)',
    borderColor: 'var(--accent)',
    boxShadow: 'var(--glow-hover)',
  },
  loopLive: {
    display: 'inline-flex',
    alignItems: 'center',
    height: '22px',
    paddingInline: '9px',
    borderRadius: '9999px',
    fontSize: '9.5px',
    fontWeight: 800,
    letterSpacing: '.08em',
    lineHeight: 1,
    color: 'var(--on-accent-ink)',
    backgroundColor: 'var(--accent)',
    boxShadow: '0 0 0 1px var(--accent), 0 0 14px var(--accent-soft)',
    whiteSpace: 'nowrap',
    animationName: {
      '@media (prefers-reduced-motion: no-preference)': pulse,
    },
    animationDuration: {
      '@media (prefers-reduced-motion: no-preference)': '1.8s',
    },
    animationTimingFunction: {
      '@media (prefers-reduced-motion: no-preference)': 'ease-in-out',
    },
    animationIterationCount: {
      '@media (prefers-reduced-motion: no-preference)': 'infinite',
    },
  },
  abClear: {
    position: 'relative',
    display: 'inline-flex',
    alignItems: 'center',
    columnGap: '6px',
    height: '22px',
    paddingInline: '9px',
    borderRadius: 'var(--radius)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--border-soft)',
    color: {
      default: 'var(--text-faint)',
      ':hover': 'var(--danger)',
    },
    backgroundColor: {
      default: 'transparent',
      ':hover': 'var(--danger-soft)',
    },
    fontSize: 'var(--text-xs)',
    fontWeight: 600,
    lineHeight: 1,
    cursor: 'pointer',
  },
  clearKeycap: {
    position: 'absolute',
    right: '4px',
    top: '50%',
    transform: 'translateY(-50%)',
    pointerEvents: 'none',
    fontFamily: 'var(--mono-font)',
    fontSize: '9px',
    fontWeight: 700,
    lineHeight: 1,
    backgroundColor: 'var(--surface-inset)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--control-border)',
    borderRadius: '3px',
    paddingBlock: '2px',
    paddingInline: 'var(--space-1)',
    color: 'var(--text-faint)',
    opacity: {
      default: 0,
      [stylex.when.ancestor(':hover')]: 1,
    },
    transition: 'opacity .12s ease',
  },
  abClearIdle: {
    color: 'var(--text-faint)',
    opacity: 0.6,
  },
});
