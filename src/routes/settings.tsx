import { Trans } from '@lingui/react/macro';
import * as stylex from '@stylexjs/stylex';
import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';
import { getTauriVersion, getVersion } from '@tauri-apps/api/app';
import { invoke } from '@tauri-apps/api/core';

import { SettingsNav, SettingsNavLink } from '../elements/SettingsNav';
import View from '../elements/View';
export const Route = createFileRoute('/settings')({
  component: ViewSettings,
  beforeLoad: async ({ location }) => {
    if (location.pathname === '/settings') {
      throw redirect({ to: '/settings/library' });
    }
  },
  async loader() {
    const [version, tauriVersion, appStorageDir] = await Promise.all([
      getVersion(),
      getTauriVersion(),
      invoke<string>('plugin:config|get_storage_dir'),
    ]);

    return { version, tauriVersion, appStorageDir };
  },
});

function ViewSettings() {
  return (
    <View hasPadding layout="centered" xstyle={styles.viewWide}>
      <div {...stylex.props(styles.shell)}>
        <nav aria-label="Settings sections" {...stylex.props(styles.nav)}>
          <SettingsNav>
            <SettingsNavLink to="/settings/library">
              <Trans>Library</Trans>
            </SettingsNavLink>
            <SettingsNavLink to="/settings/audio">
              <Trans>Audio</Trans>
            </SettingsNavLink>
            <SettingsNavLink to="/settings/ui">
              <Trans>Interface</Trans>
            </SettingsNavLink>
            <SettingsNavLink to="/settings/about">
              <Trans>About</Trans>
            </SettingsNavLink>
            <SettingsNavLink to="/settings/advanced">
              <Trans>Advanced</Trans>
            </SettingsNavLink>
          </SettingsNav>
        </nav>

        <div {...stylex.props(styles.content)}>
          <Outlet />
        </div>
      </div>
    </View>
  );
}

const styles = stylex.create({
  viewWide: {
    gridTemplateColumns: 'minmax(0, 620px)',
  },
  shell: {
    display: 'flex',
    flexDirection: {
      default: 'row',
      '@media (max-width: 560px)': 'column',
    },
    columnGap: 'var(--space-6)',
    rowGap: 'var(--space-4)',
    width: '100%',
    maxWidth: '100%',
    minWidth: 0,
    overflowX: 'clip',
  },
  nav: {
    flexShrink: 0,
    minWidth: 0,
  },
  content: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 'auto',
    minWidth: 0,
    maxWidth: '100%',
    display: 'flex',
    flexDirection: 'column',
  },
});
