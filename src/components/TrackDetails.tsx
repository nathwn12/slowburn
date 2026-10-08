import { useLingui } from '@lingui/react/macro';
import * as stylex from '@stylexjs/stylex';

import type { Track } from '../generated/typings';
import { usePlayerState } from '../hooks/usePlayer';
import {
  NO_VALUE,
  audioFormatLabel,
  formatBitDepth,
  formatBitrate,
  formatChannels,
  formatClockMs,
  formatFileSize,
  formatSampleRate,
} from '../lib/dense-format';

type Props = {
  trackPlaying: Track | null;
};

/**
 * The `.detail` panel: essential audio identity on the left (size, format,
 * and the sample-rate / bit-depth / channels / bitrate line), the saved A-B
 * loop's verbatim numbers on the right (A, B, length). Every row is backed
 * by a real data source (the Track record from the Rust scan, or the live
 * A-B loop state). File-management rows (path, added, played) and loop
 * explainer rows (saved, on-open) are gone by explicit owner choice: the
 * audio identity line carries the panel. Rows with nothing to show yet use
 * an honest placeholder instead of a bare dash.
 */
export default function TrackDetails({ trackPlaying }: Props) {
  const abLoop = usePlayerState((state) => state.abLoop);
  const { t } = useLingui();

  const a = abLoop.startSeconds;
  const b = abLoop.endSeconds;
  const saved = a != null || b != null;
  const length = a != null && b != null ? Math.abs(b - a) : null;

  const sizeLabel =
    trackPlaying != null ? formatFileSize(trackPlaying.file_size) : NO_VALUE;
  const sizeValue =
    sizeLabel === NO_VALUE && trackPlaying != null
      ? t`unknown size`
      : sizeLabel;
  const formatLabel =
    trackPlaying != null ? audioFormatLabel(trackPlaying.path) : NO_VALUE;
  const formatValue =
    formatLabel === NO_VALUE && trackPlaying != null
      ? t`unknown format`
      : formatLabel;
  const audioLine =
    trackPlaying != null
      ? [
          formatSampleRate(trackPlaying.sample_rate),
          formatBitDepth(trackPlaying.bit_depth),
          formatChannels(trackPlaying.channels),
          formatBitrate(trackPlaying.bitrate),
        ]
          .filter((part) => part !== NO_VALUE)
          .join(' . ')
      : '';
  const audioValue = audioLine !== '' ? audioLine : t`not available`;

  return (
    <div {...stylex.props(styles.detail)}>
      <div {...stylex.props(styles.dcol)}>
        <div {...stylex.props(styles.dhead)}>{t`TRACK FILE`}</div>
        <FactRow
          label={t`Size`}
          value={sizeValue}
          known={sizeLabel !== NO_VALUE}
        />
        <FactRow
          label={t`Format`}
          value={formatValue}
          known={formatLabel !== NO_VALUE}
        />
        <FactRow label={t`Audio`} value={audioValue} known={audioLine !== ''} />
      </div>

      <div {...stylex.props(styles.dcol)}>
        <div {...stylex.props(styles.dhead)}>
          {saved ? t`SAVED A–B LOOP` : t`A–B LOOP`}{' '}
          <span
            {...stylex.props(saved ? styles.markOn : styles.markOff)}
            aria-hidden="true"
          >
            {saved ? '◆' : '◇'}
          </span>
        </div>
        <FactRow
          label={t`A`}
          value={a != null ? formatClockMs(a) : t`not set`}
          highlighted={a != null}
          known={a != null}
        />
        <FactRow
          label={t`B`}
          value={b != null ? formatClockMs(b) : t`not set`}
          highlighted={b != null}
          known={b != null}
        />
        <FactRow
          label={t`Length`}
          value={length != null ? formatClockMs(length) : t`not set`}
          highlighted={length != null}
          known={length != null}
        />
      </div>
    </div>
  );
}

function FactRow({
  label,
  value,
  title,
  highlighted = false,
  known = true,
}: {
  label: string;
  value: string;
  title?: string;
  highlighted?: boolean;
  // Whether the value is real data (false for translated placeholders such
  // as "not set"). Tracked explicitly: every value here is pre-translated,
  // so comparing against the NO_VALUE sentinel can never be false and would
  // leave the "dry" branch dead.
  known?: boolean;
}) {
  return (
    <div {...stylex.props(styles.drow)}>
      <span {...stylex.props(styles.dk)}>{label}</span>
      <span
        {...stylex.props(
          styles.dv,
          highlighted && styles.dvPin,
          !known && styles.dvDry,
        )}
        title={title ?? value}
      >
        {value}
      </span>
    </div>
  );
}

const styles = stylex.create({
  detail: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 'auto',
    minHeight: 0,
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    backgroundColor: 'var(--surface)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--border-soft)',
    borderRadius: 'var(--radius-lg)',
    overflow: 'hidden',
  },
  dcol: {
    paddingTop: 'var(--space-2)',
    paddingBottom: '6px',
    paddingInline: '10px',
    minWidth: 0,
    borderLeftWidth: {
      ':not(:first-child)': '1px',
    },
    borderLeftStyle: {
      ':not(:first-child)': 'solid',
    },
    borderLeftColor: {
      ':not(:first-child)': 'var(--border-soft)',
    },
  },
  dhead: {
    display: 'flex',
    alignItems: 'center',
    columnGap: '6px',
    fontSize: '9.5px',
    fontWeight: 800,
    lineHeight: 1,
    letterSpacing: '.11em',
    color: 'var(--text-faint)',
    marginBottom: 'var(--space-2)',
  },
  markOn: {
    color: 'var(--accent)',
  },
  markOff: {
    color: 'var(--text-faint)',
  },
  drow: {
    display: 'grid',
    gridTemplateColumns: '58px minmax(0,1fr)',
    columnGap: 'var(--space-2)',
    alignItems: 'center',
    height: '21px',
  },
  dk: {
    fontSize: '9.5px',
    fontWeight: 700,
    lineHeight: 1,
    letterSpacing: '.05em',
    color: 'var(--text-faint)',
    textTransform: 'uppercase',
  },
  dv: {
    fontFamily: 'var(--mono-font)',
    fontSize: 'var(--text-xs)',
    fontWeight: 600,
    lineHeight: 1,
    color: 'var(--text-dim)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  dvPin: {
    color: 'var(--accent-text)',
  },
  dvDry: {
    color: 'var(--text-faint)',
  },
});
