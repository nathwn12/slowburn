import { useLingui } from '@lingui/react/macro';
import * as stylex from '@stylexjs/stylex';
import { useEffect, useState } from 'react';

import type { Track } from '../generated/typings';
import useCover from '../hooks/useCover';
import { artInitials } from '../lib/dense-format';
import Icon, { type IconSize } from './Icon';

type Props = {
  track: Track;
  noHorizontalBorder?: boolean;
  iconSize?: IconSize;
  /** Dense now-playing tile: a fixed square with a gradient stand-in. */
  dense?: boolean;
};

export default function Cover(props: Props) {
  const coverPath = useCover(props.track);
  const { t } = useLingui();
  const [artOpen, setArtOpen] = useState(false);

  // Close the full-size view when the track changes.
  useEffect(() => {
    setArtOpen(false);
  }, [props.track.path]);

  useEffect(() => {
    if (!artOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setArtOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [artOpen]);

  if (props.dense) {
    // No real art -> the gradient stand-in with initials. With real art -> only
    // the image; the initials must never paint over the artwork.
    if (coverPath == null) {
      const initials = artInitials(props.track.album, props.track.title);
      return (
        <div
          role="img"
          aria-label={t`Album art`}
          {...stylex.props(styles.denseArt)}
        >
          {initials !== '' && (
            <span {...stylex.props(styles.denseGlyph)} aria-hidden="true">
              {initials}
            </span>
          )}
        </div>
      );
    }

    return (
      <>
        <button
          type="button"
          onClick={() => setArtOpen(true)}
          aria-label={t`View album art`}
          title={t`View album art`}
          data-museeks-action
          {...stylex.props(styles.denseArtButton)}
        >
          <img
            src={coverPath}
            alt=""
            draggable={false}
            {...stylex.props(styles.denseImage)}
          />
        </button>

        {artOpen && (
          <div
            role="presentation"
            onClick={() => setArtOpen(false)}
            {...stylex.props(styles.artBackdrop)}
          >
            <img
              src={coverPath}
              alt={t`Album art`}
              {...stylex.props(styles.artFull)}
            />
          </div>
        )}
      </>
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
    flexShrink: 0,
    borderRadius: 'var(--radius)',
    overflow: 'hidden',
    backgroundImage:
      'radial-gradient(120% 120% at 20% 15%, #ff5fb4 0%, rgba(255,20,147,0) 58%), radial-gradient(120% 110% at 85% 90%, #2563eb 0%, rgba(37,99,235,0) 60%), linear-gradient(150deg, #2b1b3a 0%, #161a2b 55%, #0f1015 100%)',
    boxShadow: '0 6px 18px rgba(0,0,0,.5), inset 0 0 0 1px rgba(255,255,255,.05)',
    width: {
      default: '118px',
      '@media (max-width: 900px)': '88px',
    },
    height: {
      default: '118px',
      '@media (max-width: 900px)': '88px',
    },
  },
  denseArtButton: {
    position: 'relative',
    flexShrink: 0,
    padding: 0,
    borderStyle: 'none',
    borderRadius: 'var(--radius)',
    overflow: 'hidden',
    cursor: 'zoom-in',
    boxShadow: '0 6px 18px rgba(0,0,0,.5), inset 0 0 0 1px rgba(255,255,255,.05)',
    // Keep the real-art tile the same size as the no-art tile at every width.
    width: {
      default: '118px',
      '@media (max-width: 900px)': '88px',
    },
    height: {
      default: '118px',
      '@media (max-width: 900px)': '88px',
    },
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
  artBackdrop: {
    position: 'fixed',
    inset: 0,
    zIndex: 2500,
    display: 'grid',
    placeItems: 'center',
    backgroundColor: 'rgba(0,0,0,.78)',
    cursor: 'zoom-out',
  },
  artFull: {
    maxWidth: '86vw',
    maxHeight: '86vh',
    objectFit: 'contain',
    borderRadius: 'var(--radius)',
    boxShadow: '0 24px 70px rgba(0,0,0,.7)',
  },
});
