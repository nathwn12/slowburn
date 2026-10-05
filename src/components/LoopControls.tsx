import { useLingui } from '@lingui/react/macro';
import * as stylex from '@stylexjs/stylex';
import { useState } from 'react';

import type { Track } from '../generated/typings';
import { usePlayerState } from '../hooks/usePlayer';
import { resolveSetA, resolveSetB } from '../lib/dense-ab';
import player from '../lib/player';
import { formatTimeInput, parseTimeInput } from './time-input';

type Props = {
  trackPlaying: Track;
};

type Point = 'A' | 'B';

/**
 * The `.ab-row`. A and B are TYPED fields (the owner's ask — no drag fatigue):
 * type a time, Enter/blur commits, Escape reverts. The A/B buttons and the
 * `[` / `]` keys remain as the instant capture-the-playhead path. Every write
 * goes through the one engine source of truth (`player.setAbPoint`), so
 * per-file persistence and auto-apply-on-open are unchanged.
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

  const stored = (point: Point): string =>
    formatTimeInput(point === 'A' ? a : b);
  const value = (point: Point): string => draft[point] ?? stored(point);

  const commit = (point: Point) => {
    const parsed = parseTimeInput(value(point));
    // Invalid or empty input never changes the loop.
    if (parsed.kind !== 'time') {
      setInvalid((prev) => ({ ...prev, [point]: true }));
      return;
    }

    const seconds = Math.min(duration, Math.max(0, parsed.seconds));
    if (point === 'A') {
      const next = resolveSetA(seconds, b, duration);
      void player.setAbPoint('A', next.a);
      if (next.b != null && next.b !== b) void player.setAbPoint('B', next.b);
    } else {
      const next = resolveSetB(a, seconds, duration);
      if (next.a != null && next.a !== a) void player.setAbPoint('A', next.a);
      void player.setAbPoint('B', next.b);
    }

    setInvalid((prev) => ({ ...prev, [point]: false }));
    setDraft((prev) => ({ ...prev, [point]: null }));
  };

  const revert = (point: Point) => {
    setInvalid((prev) => ({ ...prev, [point]: false }));
    setDraft((prev) => ({ ...prev, [point]: null }));
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
          aria-label={
            point === 'A' ? t`Set loop point A` : t`Set loop point B`
          }
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
          onFocus={(event) => {
            event.currentTarget.select();
          }}
          onChange={(event) => {
            const next = event.currentTarget.value;
            setDraft((prev) => ({ ...prev, [point]: next }));
            if (invalid[point]) {
              setInvalid((prev) => ({ ...prev, [point]: false }));
            }
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              event.currentTarget.blur();
              commit(point);
            } else if (event.key === 'Escape') {
              event.preventDefault();
              // Revert without blurring: a blur would commit the stale draft.
              revert(point);
            }
          }}
          onBlur={() => commit(point)}
          {...stylex.props(
            styles.abInput,
            invalid[point] && styles.abInputInvalid,
          )}
        />
      </>
    );
  };

  return (
    <div {...stylex.props(styles.abRow)}>
      {pointField('A')}
      {pointField('B')}

      <span {...stylex.props(styles.spacer)} />

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

      <span
        {...stylex.props(styles.loopLive, !looping && styles.loopLiveHidden)}
        title={t`Playback is looping the A-B region`}
      >
        ● LOOPING
      </span>

      <button
        type="button"
        onClick={() => void player.clearAbLoop()}
        title={t`Clear the A-B region for this track (key: \\)`}
        aria-label={t`Clear the A-B region for this track`}
        {...stylex.props(styles.abClear, !saved && styles.abClearIdle)}
      >
        {t`Clear`}
        <span {...stylex.props(styles.clearKeycap)} aria-hidden="true">
          \
        </span>
      </button>
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
    minHeight: '22px',
    flexWrap: 'wrap',
  },
  abBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    columnGap: '6px',
    height: '22px',
    paddingInline: '8px',
    borderRadius: 'var(--radius-sm)',
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
    fontSize: '11px',
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
      default: 'var(--pink-soft)',
      ':hover': 'var(--pink-soft)',
    },
    borderColor: 'var(--pink-line)',
    color: {
      default: 'var(--pink-text)',
      ':hover': 'var(--pink-text)',
    },
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
    paddingInline: '4px',
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
    borderRadius: 'var(--radius-sm)',
    backgroundColor: 'var(--surface-2)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--border-soft)',
    color: 'var(--pink-text-soft)',
    fontFamily: 'var(--mono-font)',
    fontSize: '10.5px',
    fontWeight: 600,
    lineHeight: 1,
    fontVariantNumeric: 'tabular-nums',
    outline: 'none',
  },
  abInputInvalid: {
    borderColor: 'var(--danger)',
    color: 'var(--danger)',
    backgroundColor: 'rgba(239,68,68,.08)',
  },
  spacer: {
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
    fontSize: '10px',
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
    color: 'var(--pink-text)',
    backgroundColor: 'var(--pink-soft)',
    borderColor: 'var(--pink-line)',
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
    backgroundColor: 'var(--deep-pink)',
    boxShadow: '0 0 0 1px rgba(255,20,147,.4), 0 0 14px rgba(255,20,147,.35)',
    whiteSpace: 'nowrap',
    visibility: 'visible',
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
  loopLiveHidden: {
    visibility: 'hidden',
  },
  abClear: {
    height: '22px',
    paddingInline: '8px',
    borderRadius: 'var(--radius-sm)',
    color: {
      default: 'var(--text-faint)',
      ':hover': 'var(--danger)',
    },
    backgroundColor: {
      default: 'transparent',
      ':hover': 'rgba(239,68,68,.1)',
    },
    fontSize: '10.5px',
    fontWeight: 600,
    lineHeight: 1,
    borderStyle: 'none',
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    columnGap: '6px',
  },
  clearKeycap: {
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
    paddingInline: '4px',
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

