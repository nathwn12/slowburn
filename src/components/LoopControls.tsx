import { useLingui } from '@lingui/react/macro';
import * as stylex from '@stylexjs/stylex';
import { useState } from 'react';

import type { Track } from '../generated/typings';
import { usePlayerState } from '../hooks/usePlayer';
import { resolveSetA, resolveSetB } from '../lib/dense-ab';
import { formatClock } from '../lib/dense-format';
import player from '../lib/player';

type Props = {
  trackPlaying: Track;
};

/**
 * The `.ab-row`: A/B buttons, live times, the saved badge, the pulsing
 * LOOPING pill and Clear. All state comes from the real engine via
 * `player.getAbLoop()`; the cross/gap rules live in `dense-ab`.
 */
export default function LoopControls({ trackPlaying }: Props) {
  const abLoop = usePlayerState((state) => state.abLoop);
  const isPaused = usePlayerState((state) => state.isPaused);
  const { t } = useLingui();
  const [hovered, setHovered] = useState<null | 'A' | 'B'>(null);

  const duration = trackPlaying.duration;
  const a = abLoop.startSeconds;
  const b = abLoop.endSeconds;
  const saved = a != null || b != null;
  const looping =
    abLoop.enabled && a != null && b != null && b - a > 0.05 && !isPaused;

  const setA = () => {
    const next = resolveSetA(player.getCurrentTime(), b, duration);
    void player.setAbPoint('A', next.a);
    if (next.b !== b && next.b != null) void player.setAbPoint('B', next.b);
  };

  const setB = () => {
    const next = resolveSetB(a, player.getCurrentTime(), duration);
    if (next.a !== a && next.a != null) void player.setAbPoint('A', next.a);
    void player.setAbPoint('B', next.b);
  };

  return (
    <div {...stylex.props(styles.abRow)}>
      <button
        type="button"
        onClick={setA}
        onMouseEnter={() => setHovered('A')}
        onMouseLeave={() => setHovered(null)}
        onFocus={() => setHovered('A')}
        onBlur={() => setHovered(null)}
        data-armed={a != null ? 'true' : 'false'}
        title={t`Set loop point A at the cursor (key: [)`}
        aria-label={t`Set loop point A`}
        {...stylex.props(styles.abBtn, a != null && styles.abBtnArmed)}
      >
        A
        <span
          {...stylex.props(
            styles.keycap,
            hovered === 'A' && styles.keycapShown,
          )}
          aria-hidden="true"
        >
          [
        </span>
      </button>
      <span
        {...stylex.props(styles.abTime, a != null && styles.abTimeSet)}
        aria-label={t`Loop point A`}
      >
        {a != null ? formatClock(a) : '--:--'}
      </span>

      <button
        type="button"
        onClick={setB}
        onMouseEnter={() => setHovered('B')}
        onMouseLeave={() => setHovered(null)}
        onFocus={() => setHovered('B')}
        onBlur={() => setHovered(null)}
        data-armed={b != null ? 'true' : 'false'}
        title={t`Set loop point B at the cursor (key: ])`}
        aria-label={t`Set loop point B`}
        {...stylex.props(styles.abBtn, b != null && styles.abBtnArmed)}
      >
        B
        <span
          {...stylex.props(
            styles.keycap,
            hovered === 'B' && styles.keycapShown,
          )}
          aria-hidden="true"
        >
          ]
        </span>
      </button>
      <span
        {...stylex.props(styles.abTime, b != null && styles.abTimeSet)}
        aria-label={t`Loop point B`}
      >
        {b != null ? formatClock(b) : '--:--'}
      </span>

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
        title={t`Clear the A-B region for this track (key: \\)`}
        aria-label={t`Clear the A-B region for this track`}
        {...stylex.props(styles.abClear, !saved && styles.abClearIdle)}
      >
        {t`Clear`}
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
    columnGap: '8px',
    minHeight: '22px',
    flexWrap: 'wrap',
  },
  abBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    columnGap: '6px',
    height: '22px',
    paddingInline: '9px',
    borderRadius: 'var(--radius-sm)',
    backgroundColor: {
      default: 'var(--surface-2)',
      ':hover': 'var(--surface-hover)',
    },
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: '#414141',
    color: {
      default: 'var(--text-dim)',
      ':hover': 'var(--text-bright)',
    },
    fontSize: '11px',
    fontWeight: 700,
    lineHeight: 1,
    transition: 'background-color .12s ease, color .12s ease, border-color .12s ease',
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
      default: '#ffd0e9',
      ':hover': '#ffd0e9',
    },
  },
  keycap: {
    fontFamily: 'var(--mono-font)',
    fontSize: '9px',
    fontWeight: 700,
    lineHeight: 1,
    backgroundColor: '#262626',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: '#454545',
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
  abTime: {
    fontFamily: 'var(--mono-font)',
    fontSize: '10.5px',
    fontWeight: 600,
    lineHeight: 1,
    color: 'var(--text-dim)',
    minWidth: '34px',
    fontVariantNumeric: 'tabular-nums',
  },
  abTimeSet: {
    color: '#ffb8dd',
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
    color: '#ffd0e9',
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
    color: '#12030b',
    backgroundColor: 'var(--deep-pink)',
    boxShadow: '0 0 0 1px rgba(255,20,147,.4), 0 0 14px rgba(255,20,147,.35)',
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
    height: '22px',
    paddingInline: '8px',
    borderRadius: 'var(--radius-sm)',
    color: {
      default: 'var(--text-faint)',
      ':hover': 'var(--danger)',
    },
    backgroundColor: {
      ':hover': 'rgba(239,68,68,.1)',
    },
    fontSize: '10.5px',
    fontWeight: 600,
    lineHeight: 1,
  },
  abClearIdle: {
    color: 'var(--text-faint)',
    opacity: 0.6,
  },
});
