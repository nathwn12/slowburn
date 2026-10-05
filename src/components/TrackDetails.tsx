import { useLingui } from '@lingui/react/macro';
import * as stylex from '@stylexjs/stylex';

import type { Track } from '../generated/typings';
import { usePlayerState } from '../hooks/usePlayer';
import { NO_VALUE, formatClockMs } from '../lib/dense-format';

type Props = {
  trackPlaying: Track | null;
};

/**
 * The `.detail` panel: file facts on the left, the saved A-B loop's verbatim
 * numbers on the right. Everything the app genuinely owns is rendered; every
 * field with no data source renders an em-dash (see the report).
 */
export default function TrackDetails({ trackPlaying }: Props) {
  const abLoop = usePlayerState((state) => state.abLoop);
  const { t } = useLingui();

  const a = abLoop.startSeconds;
  const b = abLoop.endSeconds;
  const saved = a != null || b != null;
  const length = a != null && b != null ? Math.abs(b - a) : null;

  return (
    <div {...stylex.props(styles.detail)}>
      <div {...stylex.props(styles.dcol)}>
        <div {...stylex.props(styles.dhead)}>{t`TRACK FILE`}</div>
        <FactRow
          label={t`Path`}
          value={trackPlaying?.path ?? NO_VALUE}
          title={trackPlaying?.path}
        />
        <FactRow label={t`Added`} value={NO_VALUE} />
        <FactRow label={t`Played`} value={NO_VALUE} />
        <FactRow label={t`Peak`} value={NO_VALUE} />
        <FactRow label={t`Hash`} value={NO_VALUE} />
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
          value={a != null ? formatClockMs(a) : NO_VALUE}
          highlighted={a != null}
        />
        <FactRow
          label={t`B`}
          value={b != null ? formatClockMs(b) : NO_VALUE}
          highlighted={b != null}
        />
        <FactRow
          label={t`Length`}
          value={length != null ? formatClockMs(length) : NO_VALUE}
          highlighted={length != null}
        />
        <FactRow
          label={t`Saved`}
          value={saved ? t`auto · stored with file` : t`none stored for this file`}
        />
        <FactRow
          label={t`On open`}
          value={saved ? t`apply + loop immediately` : t`press [ and ] to set`}
          highlighted={saved}
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
}: {
  label: string;
  value: string;
  title?: string;
  highlighted?: boolean;
}) {
  const hasValue = value !== NO_VALUE;
  return (
    <div {...stylex.props(styles.drow)}>
      <span {...stylex.props(styles.dk)}>{label}</span>
      <span
        {...stylex.props(
          styles.dv,
          highlighted && styles.dvPin,
          !hasValue && styles.dvDry,
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
    borderRadius: '8px',
    overflow: 'hidden',
  },
  dcol: {
    paddingTop: '8px',
    paddingBottom: '6px',
    paddingInline: '10px',
    minWidth: 0,
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
    marginBottom: '8px',
  },
  markOn: {
    color: 'var(--deep-pink)',
  },
  markOff: {
    color: '#555',
  },
  drow: {
    display: 'grid',
    gridTemplateColumns: '58px minmax(0,1fr)',
    columnGap: '8px',
    alignItems: 'center',
    height: '21px',
  },
  dk: {
    fontSize: '9.5px',
    fontWeight: 700,
    lineHeight: 1,
    letterSpacing: '.05em',
    color: '#5f5f5f',
    textTransform: 'uppercase',
  },
  dv: {
    fontFamily: 'var(--mono-font)',
    fontSize: '10.5px',
    fontWeight: 600,
    lineHeight: 1,
    color: 'var(--text-dim)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  dvPin: {
    color: '#ffb8dd',
  },
  dvDry: {
    color: 'var(--text-faint)',
  },
});
