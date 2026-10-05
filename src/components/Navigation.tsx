import { useLingui } from '@lingui/react/macro';
import * as stylex from '@stylexjs/stylex';
import { Link, type LinkProps, useLocation } from '@tanstack/react-router';
import { Fragment, useEffect, useState } from 'react';

import Icon from './Icon';
import { useViewStack, type StackView } from './view-stack';

type Segment = {
  key: string;
  label: string;
  to?: LinkProps['to'];
  view: StackView;
};

/**
 * The header breadcrumb (design §1/§5). It reads as the current location —
 * `Library › All tracks` — not a flat nav bar. The small switcher beside it is
 * the control for the right column's view stack (Queue / Library / Playlists).
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

  const trail: Segment[] = [];
  if (pathname.startsWith('/settings')) {
    trail.push({ key: 'library', label: t`Library`, to: '/library', view: 'library' });
    trail.push({ key: 'settings', label: t`Settings`, view: 'library' });
  } else if (pathname.startsWith('/playlists')) {
    trail.push({ key: 'playlists', label: t`Playlists`, view: 'playlists' });
  } else if (pathname.startsWith('/queue')) {
    trail.push({ key: 'queue', label: t`Queue`, view: 'queue' });
  } else if (pathname.startsWith('/artists')) {
    trail.push({ key: 'library', label: t`Library`, to: '/library', view: 'library' });
    trail.push({ key: 'artists', label: t`Artists`, view: 'library' });
  } else if (pathname.startsWith('/tracks')) {
    trail.push({ key: 'library', label: t`Library`, to: '/library', view: 'library' });
    trail.push({ key: 'track', label: t`Track`, view: 'library' });
  } else {
    trail.push({ key: 'library', label: t`Library`, to: '/library', view: 'library' });
    trail.push({ key: 'all-tracks', label: t`All tracks`, view: 'library' });
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
          {segment.to != null ? (
            <Link
              to={segment.to}
              draggable={false}
              onClick={() => pin(segment.view)}
              {...stylex.props(styles.crumbLink)}
            >
              {segment.label}
            </Link>
          ) : (
            <b {...stylex.props(styles.crumbCurrent)} aria-current="page">
              {segment.label}
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
          <div
            role="menu"
            aria-label={t`Views`}
            onClick={(event) => event.stopPropagation()}
            {...stylex.props(styles.menu)}
          >
            <MenuLink
              to="/queue"
              label={t`Queue`}
              view="queue"
              onPick={() => setMenuOpen(false)}
            />
            <MenuLink
              to="/library"
              label={t`All tracks`}
              view="library"
              onPick={() => setMenuOpen(false)}
            />
            <MenuLink
              to="/artists"
              label={t`Artists`}
              view="library"
              onPick={() => setMenuOpen(false)}
            />
            <MenuLink
              to="/playlists"
              label={t`Playlists`}
              view="playlists"
              onPick={() => setMenuOpen(false)}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function MenuLink(props: {
  to: LinkProps['to'];
  label: string;
  view: StackView;
  onPick: () => void;
}) {
  const pin = useViewStack((state) => state.pin);
  return (
    <Link
      to={props.to}
      role="menuitem"
      draggable={false}
      onClick={() => {
        pin(props.view);
        props.onPick();
      }}
      {...stylex.props(styles.menuItem)}
    >
      {props.label}
    </Link>
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
    paddingBlock: '3px',
    paddingInline: '4px',
    borderRadius: 'var(--radius-sm)',
    backgroundColor: {
      ':hover': 'var(--surface-hover)',
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
  },
  switcher: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
  },
  switcherBtn: {
    width: '22px',
    height: '22px',
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
  menu: {
    position: 'absolute',
    top: 'calc(100% + 6px)',
    left: 0,
    zIndex: 1000,
    minWidth: '150px',
    display: 'flex',
    flexDirection: 'column',
    rowGap: '1px',
    padding: '4px',
    backgroundColor: 'var(--surface)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--border-soft)',
    borderRadius: 'var(--radius)',
    boxShadow: '0 8px 24px rgba(0,0,0,.45)',
  },
  menuItem: {
    paddingBlock: '7px',
    paddingInline: '10px',
    borderRadius: 'var(--radius-sm)',
    fontSize: '12px',
    fontWeight: 600,
    color: {
      default: 'var(--text-dim)',
      ':hover': 'var(--text-bright)',
    },
    textDecoration: 'none',
    backgroundColor: {
      ':hover': 'var(--surface-hover)',
    },
    whiteSpace: 'nowrap',
  },
});

