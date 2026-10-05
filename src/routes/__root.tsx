import { useLingui } from '@lingui/react/macro';
import * as stylex from '@stylexjs/stylex';
import { createRootRoute, Outlet, useLocation } from '@tanstack/react-router';
import { info } from '@tauri-apps/plugin-log';
import { useEffect } from 'react';

import SettingsAPI from '../api/SettingsAPI';
import AppEvents from '../components/AppEvents';
import DropzoneImport from '../components/DropzoneImport';
import EffectsPersistence from '../components/EffectsPersistence';
import { ErrorView, NotFoundView } from '../components/GlobalErrors';
import GlobalKeyBindings from '../components/GlobalKeyBindings';
import Header from '../components/Header';
import IPCNavigationEvents from '../components/IPCNavigationEvents';
import IPCPlayerEvents from '../components/IPCPlayerEvents';
import LibraryEvents from '../components/LibraryEvents';
import NowPlaying from '../components/NowPlaying';
import PlayerEvents from '../components/PlayerEvents';
import Queue from '../components/Queue';
import { useSavedLoopsSync } from '../components/saved-loops';
import ShortcutsPanel from '../components/ShortcutsPanel';
import StatusBar from '../components/StatusBar';
import Toasts from '../components/Toasts';
import { useViewStack } from '../components/view-stack';
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

/**
 * Whether the location maps to one of the right-column routed views. Anything
 * else (including `/queue` and unknown paths) falls back to the Queue, the
 * stack's default item.
 */
function isViewRoute(pathname: string): boolean {
  return (
    pathname.startsWith('/library') ||
    pathname.startsWith('/artists') ||
    pathname.startsWith('/playlists') ||
    pathname.startsWith('/tracks')
  );
}

function ViewRoot() {
  const invalidate = useInvalidate();
  const { t } = useLingui();
  const queue = usePlayerState((state) => state.queue);
  const queueCursor = usePlayerState((state) => state.queueCursor);

  useSavedLoopsSync();

  // The view-stack pin is per-app-mount; a fresh mount (a test render, or a
  // full reload) starts from the state-aware default again.
  useEffect(() => {
    useViewStack.getState().pin(null);
  }, []);

  useEffect(() => {
    // If the app imported tracks, we need to refresh route data, but it seems invalidate is not super stable
    SettingsAPI.init(invalidate).catch(logAndNotifyError);
  }, [invalidate]);

  // Log each navigation to the console for debug purposes
  const location = useLocation();

  useEffect(() => {
    info(`Navigated to: ${location.pathname}`);
  }, [location]);

  // The settings routes keep their own full-width treatment.
  const isSettingsRoute = location.pathname.startsWith('/settings');

  // State-aware default for the right column: the user's explicit breadcrumb
  // choice wins; before any choice, the Queue shows when something is playing
  // and the library shows when nothing is.
  const pinned = useViewStack((state) => state.pinned);
  const trackPlaying = queueCursor != null && queue.length > 0;
  const showQueue =
    !isSettingsRoute &&
    (pinned === 'queue' ||
      (pinned == null &&
        (!isViewRoute(location.pathname) ||
          (location.pathname === '/library' && trackPlaying))));

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
      <EffectsPersistence />
      <GlobalKeyBindings />

      {/** 40px header: logo, brand, breadcrumb, search, settings */}
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
            {/** Left column: now playing — never changes */}
            <NowPlaying />
            {/** Right column: the view stack (Queue / Library / Playlists) */}
            <div {...stylex.props(styles.rightColumn)}>
              {showQueue ? (
                <Queue queue={queue} queueCursor={queueCursor} />
              ) : (
                <div {...stylex.props(styles.routeSlot)}>
                  <Outlet />
                </div>
              )}
            </div>
          </>
        )}
      </main>

      {/** 26px ledger: totals, format, effects, loop, output */}
      <StatusBar />

      {/** Out-of-the-flow UI bits */}
      <Toasts />
      <ShortcutsPanel />
      <DropzoneImport />
    </div>
  );
}

const styles = stylex.create({
  root: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    minHeight: 0,
  },
  main: {
    width: '100%',
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 'auto',
    position: 'relative',
    display: 'grid',
    // The right column yields as the window narrows (clamp), so the
    // now-playing column is not starved; it also wraps/scrolls.
    gridTemplateColumns: 'minmax(0, 1fr) clamp(320px, 38vw, 388px)',
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
    overflow: 'hidden',
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
    height: '100%',
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
  },
});
