import { useLingui } from '@lingui/react/macro';
import * as stylex from '@stylexjs/stylex';
import { Link } from '@tanstack/react-router';

import { version } from '../../package.json';
import logoUrl from '../assets/logos/slowburn-48.png';
import Icon from './Icon';
import Navigation from './Navigation';
import Search from './Search';

/**
 * The Dense header (design §1/§5): 40 px, fixed. EQ logo slot, brand + version,
 * the breadcrumb that drives the right-column view stack, a pill search with
 * the Ctrl K affordance and the settings control. The player bar / transport
 * lives in the now-playing column, not here.
 */
export default function Header() {
  const { t } = useLingui();
  const platform = window.__MUSEEKS_PLATFORM;

  return (
    <header
      aria-label={t`Header`}
      {...stylex.props(
        styles.header,
        (platform === 'windows' || platform === 'linux') &&
          styles.headerBorderTop,
      )}
      data-tauri-drag-region
    >
      <div {...stylex.props(styles.logoSlot)} data-tauri-drag-region>
        <img
          src={logoUrl}
          alt={t`Slowburn logo`}
          width={22}
          height={22}
          draggable={false}
          {...stylex.props(styles.logo)}
        />
      </div>

      <div {...stylex.props(styles.brand)} data-tauri-drag-region>
        {t`Slowburn`}
        <small {...stylex.props(styles.brandVersion)}>v{version}</small>
      </div>

      <span {...stylex.props(styles.sep)} aria-hidden="true" />

      <nav aria-label={t`Main navigation`} {...stylex.props(styles.nav)}>
        <Navigation />

        <span {...stylex.props(styles.spacer)} data-tauri-drag-region />

        <Search />

        <Link
          to="/settings"
          aria-label={t`Settings`}
          title={t`Settings`}
          draggable={false}
          {...stylex.props(styles.iconBtn)}
        >
          <Icon name="settings" size={16} />
        </Link>
      </nav>
    </header>
  );
}

const styles = stylex.create({
  header: {
    boxSizing: 'border-box',
    height: '40px',
    flexGrow: 0,
    flexShrink: 0,
    flexBasis: 'auto',
    display: 'flex',
    alignItems: 'center',
    columnGap: '10px',
    paddingBlock: 0,
    paddingInline: '10px',
    backgroundColor: 'var(--header-bg)',
    backgroundImage:
      'linear-gradient(rgba(255,255,255,.04), rgba(0,0,0,.05))',
    borderBottomWidth: '1px',
    borderBottomStyle: 'solid',
    borderBottomColor: 'var(--border)',
    color: 'var(--text)',
  },
  headerBorderTop: {
    borderTopWidth: '1px',
    borderTopStyle: 'solid',
    borderTopColor: 'var(--border)',
  },
  logoSlot: {
    width: '26px',
    height: '26px',
    flexShrink: 0,
    borderWidth: '1px',
    borderStyle: 'dashed',
    borderColor: '#4a4a4a',
    borderRadius: 'var(--radius-sm)',
    display: 'grid',
    placeItems: 'center',
    backgroundColor: 'var(--accent-soft)',
  },
  logo: {
    width: '20px',
    height: '20px',
    display: 'block',
  },
  brand: {
    display: 'flex',
    alignItems: 'baseline',
    columnGap: '6px',
    flexShrink: 0,
    fontSize: '13px',
    fontWeight: 700,
    letterSpacing: '.02em',
    color: 'var(--text-bright)',
  },
  brandVersion: {
    fontSize: '9px',
    fontWeight: 600,
    letterSpacing: '.08em',
    color: 'var(--text-faint)',
  },
  sep: {
    width: '1px',
    height: '18px',
    flexShrink: 0,
    backgroundColor: 'var(--border-soft)',
  },
  nav: {
    display: 'flex',
    alignItems: 'center',
    columnGap: '8px',
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 'auto',
    minWidth: 0,
    height: '100%',
  },
  spacer: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: '0%',
    minWidth: '8px',
    alignSelf: 'stretch',
  },
  iconBtn: {
    width: '26px',
    height: '26px',
    flexShrink: 0,
    borderRadius: 'var(--radius-sm)',
    display: 'grid',
    placeItems: 'center',
    color: {
      default: 'var(--text-dim)',
      ':hover': 'var(--text-bright)',
    },
    backgroundColor: {
      ':hover': 'var(--surface-hover)',
    },
  },
});
