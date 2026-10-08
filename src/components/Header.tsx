import { useLingui } from '@lingui/react/macro';
import * as stylex from '@stylexjs/stylex';
import { useSuspenseQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';

import { version } from '../../package.json';
import SettingsAPI from '../api/SettingsAPI';
import logoUrl from '../assets/logos/slowburn-48.png';
import useInvalidate from '../hooks/useInvalidate';
import { configQuery } from '../lib/queries';
import { shouldShowCustomTitleBar } from '../lib/title-bar';
import { logAndNotifyError } from '../lib/utils';
import Icon from './Icon';
import Navigation from './Navigation';
import Search from './Search';

/**
 * The Dense header (design §1/§5): 40 px, fixed. Breadcrumb that drives the
 * right-column view stack, a pill search with the Ctrl K affordance and the
 * settings control. The player bar / transport lives in the now-playing
 * column, not here. On Windows the logo + brand fold into the frameless
 * TitleBar above instead of showing twice.
 */
export default function Header() {
  const { t } = useLingui();
  const platform = window.__MUSEEKS_PLATFORM;
  const folded = shouldShowCustomTitleBar(platform);

  return (
    <header
      aria-label={t`Header`}
      {...stylex.props(
        styles.header,
        // Windows draws its own title bar above with the divider; Linux
        // keeps the native chrome, so it keeps the top hairline.
        platform === 'linux' && styles.headerBorderTop,
      )}
      data-tauri-drag-region
    >
      {!folded && (
        <>
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
        </>
      )}

      <nav aria-label={t`Main navigation`} {...stylex.props(styles.nav)}>
        <Navigation />

        <span {...stylex.props(styles.spacer)} data-tauri-drag-region />

        <Search />

        {/**
         * S8 mini-mode toggle: flips between Mini (condensed player above the
         * queue) and Full, persisting through the same `ui_mode` key as the
         * settings Mode select. The label names the mode a press switches
         * *to*; Ctrl+M does the same from the keyboard.
         */}
        <MiniToggle />

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

function MiniToggle() {
  const { t } = useLingui();
  const config = useSuspenseQuery(configQuery).data;
  const invalidate = useInvalidate();
  const isMini = config.ui_mode === 'mini';

  return (
    <button
      type="button"
      aria-label={isMini ? t`Switch to full mode` : t`Switch to mini mode`}
      title={isMini ? t`Full mode (Ctrl+M)` : t`Mini mode (Ctrl+M)`}
      aria-pressed={isMini}
      onClick={() => {
        SettingsAPI.setUIMode(isMini ? 'full' : 'mini')
          .then(invalidate)
          .catch(logAndNotifyError);
      }}
      {...stylex.props(styles.modeBtn)}
    >
      {isMini ? t`Full` : t`Mini`}
    </button>
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
    backgroundImage: 'linear-gradient(rgba(255,255,255,.04), rgba(0,0,0,.05))',
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
    borderColor: 'var(--control-border)',
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
  // S8 mini-mode toggle: a compact text affordance beside the settings gear.
  modeBtn: {
    height: '22px',
    flexShrink: 0,
    paddingInline: '8px',
    borderRadius: 'var(--radius-sm)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--border-color-softer)',
    backgroundColor: 'transparent',
    color: {
      default: 'var(--text-faint)',
      ':hover': 'var(--text-bright)',
    },
    fontFamily: 'var(--mono-font)',
    fontSize: '10px',
    fontWeight: 700,
    letterSpacing: '.06em',
    cursor: 'pointer',
  },
});
