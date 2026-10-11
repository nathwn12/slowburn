import { useLingui } from '@lingui/react/macro';
import * as stylex from '@stylexjs/stylex';
import { Link, type LinkProps, useLocation } from '@tanstack/react-router';
import { Fragment, useEffect, useState } from 'react';

import Icon, { type IconName } from './Icon';
import { ChromeMenu, ChromeMenuLink } from './MenuBar';
import { useViewStack, type StackView } from './view-stack';

type Segment = {
  key: string;
  label: string;
  icon: IconName;
  to?: LinkProps['to'];
  view: StackView;
};

/**
 * The header breadcrumb (design §1/§5). It reads as the current location -
 * `Library / All tracks` - not a flat nav bar. The small switcher beside it is
 * the control for the right column's view stack (Queue / Library / Playlists).
 *
 * Narrow layout (mini footprint and tight windows): each segment renders its
 * section icon instead of its word, so nothing collapses to "Li..." or
 * "All t...". The label stays on as the accessible name (`aria-label`) and
 * tooltip (`title`); the word span is visually hidden but kept in the
 * accessibility tree. Full layout keeps its words.
 */
export default function Navigation() {
  const { pathname } = useLocation();
  const { t } = useLingui();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!menuOpen) return;
    const close = () => setMenuOpen(false);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [menuOpen]);

  const pin = useViewStack((state) => state.pin);
  const pick = (view: StackView) => {
    pin(view);
    setMenuOpen(false);
  };

  const trail: Segment[] = [];
  if (pathname.startsWith('/settings')) {
    trail.push({
      key: 'library',
      label: t`Library`,
      icon: 'musicalNotes',
      to: '/library',
      view: 'library',
    });
    trail.push({
      key: 'settings',
      label: t`Settings`,
      icon: 'settings',
      view: 'library',
    });
  } else if (pathname.startsWith('/playlists')) {
    trail.push({
      key: 'playlists',
      label: t`Playlists`,
      icon: 'playlist',
      view: 'playlists',
    });
  } else if (pathname.startsWith('/queue')) {
    trail.push({ key: 'queue', label: t`Queue`, icon: 'list', view: 'queue' });
  } else if (pathname.startsWith('/history')) {
    trail.push({
      key: 'history',
      label: t`History`,
      icon: 'list',
      view: 'library',
    });
  } else if (pathname.startsWith('/artists')) {
    trail.push({
      key: 'library',
      label: t`Library`,
      icon: 'musicalNotes',
      to: '/library',
      view: 'library',
    });
    trail.push({
      key: 'artists',
      label: t`Artists`,
      icon: 'microphone',
      view: 'library',
    });
  } else if (pathname.startsWith('/tracks')) {
    trail.push({
      key: 'library',
      label: t`Library`,
      icon: 'musicalNotes',
      to: '/library',
      view: 'library',
    });
    trail.push({
      key: 'track',
      label: t`Track`,
      icon: 'play',
      view: 'library',
    });
  } else {
    trail.push({
      key: 'library',
      label: t`Library`,
      icon: 'musicalNotes',
      to: '/library',
      view: 'library',
    });
    trail.push({
      key: 'all-tracks',
      label: t`All tracks`,
      icon: 'list',
      view: 'library',
    });
  }

  return (
    <div {...stylex.props(styles.breadcrumb)}>
      {trail.map((segment, index) => (
        <Fragment key={segment.key}>
          {index > 0 && (
            <span {...stylex.props(styles.sep)} aria-hidden="true">
              ›
            </span>
          )}
          {/**
           * A crumb whose target is the route already shown is the current
           * location, not a control: it renders as non-interactive text (the
           * `b` treatment below), never a link to the page you are already
           * on. A crumb pointing elsewhere stays a real, working link.
           */}
          {segment.to != null && segment.to !== pathname ? (
            <Link
              to={segment.to}
              draggable={false}
              onClick={() => pin(segment.view)}
              aria-label={segment.label}
              title={segment.label}
              {...stylex.props(styles.crumbLink)}
            >
              <span {...stylex.props(styles.crumbWord)}>{segment.label}</span>
              <span {...stylex.props(styles.crumbIcon)} aria-hidden="true">
                <Icon name={segment.icon} size={12} />
              </span>
            </Link>
          ) : (
            <b
              {...stylex.props(styles.crumbCurrent)}
              aria-current="page"
              title={segment.label}
            >
              <span {...stylex.props(styles.crumbWord)}>{segment.label}</span>
              <span {...stylex.props(styles.crumbIcon)} aria-hidden="true">
                <Icon name={segment.icon} size={12} />
              </span>
            </b>
          )}
        </Fragment>
      ))}

      <div {...stylex.props(styles.switcher)}>
        <button
          type="button"
          aria-label={t`Switch view`}
          title={t`Switch view`}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={(event) => {
            event.stopPropagation();
            setMenuOpen((value) => !value);
          }}
          {...stylex.props(
            styles.switcherBtn,
            menuOpen && styles.switcherBtnOpen,
          )}
        >
          <Icon name="list" size={12} />
        </button>

        {menuOpen && (
          <ChromeMenu
            label={t`Views`}
            onClick={(event) => event.stopPropagation()}
          >
            <ChromeMenuLink
              to="/queue"
              label={t`Queue`}
              onPick={() => pick('queue')}
            />
            <ChromeMenuLink
              to="/history"
              label={t`History`}
              onPick={() => pick('library')}
            />
            <ChromeMenuLink
              to="/library"
              label={t`All tracks`}
              onPick={() => pick('library')}
            />
            <ChromeMenuLink
              to="/artists"
              label={t`Artists`}
              onPick={() => pick('library')}
            />
            <ChromeMenuLink
              to="/playlists"
              label={t`Playlists`}
              onPick={() => pick('playlists')}
            />
          </ChromeMenu>
        )}
      </div>
    </div>
  );
}

const styles = stylex.create({
  breadcrumb: {
    display: 'flex',
    alignItems: 'center',
    columnGap: '6px',
    minWidth: 0,
    flexShrink: 1,
    color: 'var(--text-dim)',
    fontSize: '11px',
  },
  sep: {
    color: 'var(--text-faint)',
    userSelect: 'none',
  },
  crumbLink: {
    fontSize: '11px',
    fontWeight: 600,
    color: {
      default: 'var(--text-dim)',
      ':hover': 'var(--text-bright)',
    },
    textDecoration: 'none',
    whiteSpace: 'nowrap',
    flexShrink: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    paddingBlock: '3px',
    paddingInline: '4px',
    borderRadius: 'var(--radius-sm)',
    backgroundColor: {
      ':hover': 'var(--surface-hover)',
    },
    /**
     * Narrow layout: the same 28px control box as the view switcher beside
     * it (the header's one-control-height system), so the icon crumbs line
     * up with the switcher instead of rendering as shorter chips. Full
     * layout keeps the fluid word chip (the ellipsis contract pins
     * `minWidth: 0` there).
     */
    display: {
      default: 'inline',
      '@media (max-width: 640px)': 'inline-flex',
    },
    alignItems: {
      default: 'normal',
      '@media (max-width: 640px)': 'center',
    },
    justifyContent: {
      default: 'normal',
      '@media (max-width: 640px)': 'center',
    },
    height: {
      default: 'auto',
      '@media (max-width: 640px)': '28px',
    },
    minWidth: {
      default: 0,
      '@media (max-width: 640px)': '28px',
    },
  },
  crumbCurrent: {
    fontSize: '11px',
    fontWeight: 700,
    color: 'var(--text)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    minWidth: 0,
    paddingBlock: '3px',
    paddingInline: '4px',
    /**
     * A label, not a control: the current location never navigates, so it
     * stays non-interactive markup with the default cursor and no hover
     * affordance - never a button look. Narrow layout still gives it the
     * same 28px centred box as its link sibling and the switcher, so the
     * row shares one height and one vertical centre.
     */
    cursor: 'default',
    display: {
      default: 'inline',
      '@media (max-width: 640px)': 'inline-flex',
    },
    alignItems: {
      default: 'normal',
      '@media (max-width: 640px)': 'center',
    },
    justifyContent: {
      default: 'normal',
      '@media (max-width: 640px)': 'center',
    },
    height: {
      default: 'auto',
      '@media (max-width: 640px)': '28px',
    },
  },
  /**
   * Narrow layout (at or below the mini footprint width): words collapse to
   * a visually-hidden run so nothing reads as "Li..." or "All t...", while
   * the icon below takes over visually. The text stays in the accessibility
   * tree, and links additionally carry the label as `aria-label` + `title`.
   */
  crumbWord: {
    position: {
      default: 'static',
      '@media (max-width: 640px)': 'absolute',
    },
    width: {
      default: 'auto',
      '@media (max-width: 640px)': '1px',
    },
    height: {
      default: 'auto',
      '@media (max-width: 640px)': '1px',
    },
    margin: {
      default: 0,
      '@media (max-width: 640px)': '-1px',
    },
    overflow: {
      default: 'visible',
      '@media (max-width: 640px)': 'hidden',
    },
    clipPath: {
      default: 'none',
      '@media (max-width: 640px)': 'inset(50%)',
    },
    whiteSpace: {
      default: 'inherit',
      '@media (max-width: 640px)': 'nowrap',
    },
  },
  crumbIcon: {
    display: {
      default: 'none',
      '@media (max-width: 640px)': 'inline-flex',
    },
    alignItems: {
      default: 'normal',
      '@media (max-width: 640px)': 'center',
    },
    justifyContent: {
      default: 'normal',
      '@media (max-width: 640px)': 'center',
    },
    lineHeight: {
      default: 'normal',
      '@media (max-width: 640px)': 0,
    },
  },
  switcher: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
  },
  switcherBtn: {
    width: '28px',
    height: '28px',
    flexShrink: 0,
    borderRadius: 'var(--radius-sm)',
    display: 'grid',
    placeItems: 'center',
    color: {
      default: 'var(--text-faint)',
      ':hover': 'var(--text-bright)',
    },
    backgroundColor: {
      default: 'transparent',
      ':hover': 'var(--surface-hover)',
    },
    borderStyle: 'none',
    padding: 0,
  },
  switcherBtnOpen: {
    color: 'var(--text-bright)',
    backgroundColor: 'var(--surface-hover)',
  },
});
