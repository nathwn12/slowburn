import { useLingui } from '@lingui/react/macro';
import * as stylex from '@stylexjs/stylex';

import type { Track } from '../generated/typings';
import useCover from '../hooks/useCover';
import { artInitials, audioFormatLabel } from '../lib/dense-format';
import Icon, { type IconSize } from './Icon';

type Props = {
  track: Track;
  noHorizontalBorder?: boolean;
  iconSize?: IconSize;
  /** Dense now-playing tile: a fixed 118px square with a gradient stand-in. */
  dense?: boolean;
};

export default function Cover(props: Props) {
  const coverPath = useCover(props.track);
  const { t } = useLingui();

  if (props.dense) {
    const format = audioFormatLabel(props.track.path);
    const initials = artInitials(props.track.album, props.track.title);

    return (
      <div
        role="img"
        aria-label={t`Album art`}
        {...stylex.props(styles.denseArt)}
      >
        <span {...stylex.props(styles.denseBadge)} aria-hidden="true">
          {format}
        </span>
        {initials !== '' && (
          <span {...stylex.props(styles.denseGlyph)} aria-hidden="true">
            {initials}
          </span>
        )}
        {coverPath != null && (
          <img
            src={coverPath}
            alt=""
            draggable={false}
            {...stylex.props(styles.denseImage)}
          />
        )}
      </div>
    );
  }

  return (
    <div {...stylex.props(styles.aspectRatio)}>
      <div
        {...stylex.props(
          styles.cover,
          coverPath != null && styles.noBorder,
          coverPath == null &&
            props.noHorizontalBorder &&
            styles.noHorizontalBorder,
        )}
      >
        <div {...stylex.props(styles.note)}>
          <Icon name="musicalNotes" size={props.iconSize} />
        </div>
        <img
          src={coverPath ?? undefined}
          alt={t`Album cover`}
          draggable={false}
          aria-hidden={coverPath === null}
          {...stylex.props(styles.image, coverPath != null && styles.visible)}
        />
      </div>
    </div>
  );
}

const styles = stylex.create({
  aspectRatio: {
    aspectRatio: '1',
  },
  cover: {
    objectFit: 'cover',
    width: '100%',
    height: '100%',
    textAlign: 'center',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxSizing: 'border-box',
    backgroundColor: 'var(--cover-bg)',
    position: 'relative',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--border-color)',
  },
  image: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    opacity: 0,
    transition: 'none',
  },
  visible: {
    opacity: 1,
    transition: '0.2s ease-in-out',
  },
  noBorder: {
    borderWidth: '0',
    borderStyle: 'none',
  },
  noHorizontalBorder: {
    borderTopWidth: 0,
    borderBottomWidth: 0,
  },
  note: {
    color: 'var(--text-muted)',
    fontSize: '1rem',
    lineHeight: 1,
  },

  // --- Dense tile ---------------------------------------------------------
  denseArt: {
    position: 'relative',
    width: '118px',
    height: '118px',
    flexShrink: 0,
    borderRadius: 'var(--radius)',
    overflow: 'hidden',
    backgroundImage:
      'radial-gradient(120% 120% at 20% 15%, #ff5fb4 0%, rgba(255,20,147,0) 58%), radial-gradient(120% 110% at 85% 90%, #2563eb 0%, rgba(37,99,235,0) 60%), linear-gradient(150deg, #2b1b3a 0%, #161a2b 55%, #0f1015 100%)',
    boxShadow: '0 6px 18px rgba(0,0,0,.5), inset 0 0 0 1px rgba(255,255,255,.05)',
  },
  denseBadge: {
    position: 'absolute',
    top: '7px',
    left: '7px',
    zIndex: 2,
    fontFamily: 'var(--mono-font)',
    fontSize: '8px',
    fontWeight: 700,
    letterSpacing: '.09em',
    paddingBlock: '3px',
    paddingInline: '5px',
    borderRadius: '3px',
    backgroundColor: 'rgba(0,0,0,.55)',
    color: '#fff',
  },
  denseGlyph: {
    position: 'absolute',
    left: '10px',
    bottom: '8px',
    zIndex: 2,
    fontSize: '34px',
    lineHeight: 1,
    fontWeight: 800,
    letterSpacing: '-.03em',
    color: 'rgba(255,255,255,.9)',
    textShadow: '0 2px 10px rgba(0,0,0,.6)',
  },
  denseImage: {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    zIndex: 1,
  },
});
