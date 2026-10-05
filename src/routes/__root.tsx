import { useLingui } from '@lingui/react/macro';
import * as stylex from '@stylexjs/stylex';
import { createRootRoute, Outlet, useLocation } from '@tanstack/react-router';
import { info } from '@tauri-apps/plugin-log';
import { useEffect } from 'react';

import SettingsAPI from '../api/SettingsAPI';
import AppEvents from '../components/AppEvents';
import DropzoneImport from '../components/DropzoneImport';
import { ErrorView, NotFoundView } from '../components/GlobalErrors';
import GlobalKeyBindings from '../components/GlobalKeyBindings';
import Header from '../components/Header';
import IPCNavigationEvents from '../components/IPCNavigationEvents';
import IPCPlayerEvents from '../components/IPCPlayerEvents';
import LibraryEvents from '../components/LibraryEvents';
import Navigation from '../components/Navigation';
import NowPlaying from '../components/NowPlaying';
import PlayerEvents from '../components/PlayerEvents';
import Queue from '../components/Queue';
import Toasts from '../components/Toasts';
import { usePlayerState } from '../hooks/usePlayer';
import useInvalidate from '../hooks/useInvalidate';
import { configQuery } from '../lib/queries';
import queryClient from '../lib/query-client';
import { logAndNotifyError } from '../lib/utils';

type Search = {
  jump_to_playing_track?: boolean;
};

export const Route = createRootRoute({
  component: ViewRoot,
  errorComponent: ErrorView,
  notFoundComponent: NotFoundView,
  loader: () => queryClient.ensureQueryData(configQuery),
  validateSearch: (search): Search => {
    // Why circumvolutions here? If the key is defined, it will be added to the
    // fragment of the URL (after the #), which will prevent the default_view
    // plugin to navigate to the default view.
    const jump_to_playing_track = Boolean(search?.jump_to_playing_track);

    if (jump_to_playing_track === true) {
      return {
        jump_to_playing_track,
      };
    }

    return {};
  },
});

function ViewRoot() {
  const invalidate = useInvalidate();
  const { t } = useLingui();
  const queue = usePlayerState((state) => state.queue);
  const queueCursor = usePlayerState((state) => state.queueCursor);

  useEffect(() => {
    // If the app imported tracks, we need to refresh route data, but it seems invalidate is not super stable
    SettingsAPI.init(invalidate).catch(logAndNotifyError);
  }, [invalidate]);

  // Log each navigation to the console for debug purposes
  const location = useLocation();

  useEffect(() => {
    info(`Navigated to: ${location.pathname}`);
  }, [location]);

  // The settings routes position their navigation outside the content box
  // (`right: 100%`), so they need the legacy full-width container until Wave 2
  // folds them into the Dense shell. Every other route renders inside it.
  const isSettingsRoute = location.pathname.startsWith('/settings');

  return (
    <div
      {...stylex.props(styles.root)}
      data-museeks-os={window.__MUSEEKS_PLATFORM}
    >
      {/** Bunch of global event handlers */}
      <IPCNavigationEvents />
      <IPCPlayerEvents />
      <AppEvents />
      <LibraryEvents />
      <PlayerEvents />
      <GlobalKeyBindings />

      {/** The actual app: header row + the Dense two-column main area */}
      <Header />

      <main
        aria-label={t`Application main content`}
        {...stylex.props(
          styles.main,
          isSettingsRoute && styles.mainFullWidth,
        )}
      >
        {isSettingsRoute ? (
          <div {...stylex.props(styles.settingsSlot)}>
            <Outlet />
          </div>
        ) : (
          <>
            <NowPlaying />
            <div {...stylex.props(styles.rightColumn)}>
              {/**
               * Wave 1 keeps the routed surfaces (library list, …) rendering;
               * Wave 2 folds them into this column. The Queue is the right
               * column's own child as specified.
               */}
              <div {...stylex.props(styles.routeSlot)}>
                <Outlet />
              </div>
              <aside aria-label={t`Queue`} {...stylex.props(styles.queueSlot)}>
                <Queue queue={queue} queueCursor={queueCursor} />
              </aside>
            </div>
          </>
        )}
      </main>

      {/** Footer navigation (collapses into the header breadcrumb in Wave 2) */}
      <Navigation />

      {/** Out-of-the-flow UI bits */}
      <Toasts />
      <DropzoneImport />
    </div>
  );
}

const styles = stylex.create({
  root: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
  },
  main: {
    order: 1,
    width: '100%',
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 'auto',
    position: 'relative',
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) 388px',
    minHeight: 0,
    overflow: 'hidden',
    backgroundColor: 'var(--bg)',
  },
  mainFullWidth: {
    gridTemplateColumns: 'minmax(0, 1fr)',
  },
  settingsSlot: {
    minHeight: 0,
    height: '100%',
    position: 'relative',
  },
  rightColumn: {
    position: 'relative',
    zIndex: 1,
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
    minHeight: 0,
    borderLeftWidth: '1px',
    borderLeftStyle: 'solid',
    borderLeftColor: 'var(--border)',
    backgroundColor: 'var(--surface-2)',
  },
  routeSlot: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: '0%',
    minHeight: 0,
    position: 'relative',
  },
  queueSlot: {
    flexShrink: 0,
    maxHeight: '38%',
    overflow: 'auto',
    padding: '8px',
    borderTopWidth: '1px',
    borderTopStyle: 'solid',
    borderTopColor: 'var(--border)',
  },
});
