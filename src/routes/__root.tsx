import { useLingui } from '@lingui/react/macro';
import * as stylex from '@stylexjs/stylex';
import { useSuspenseQuery } from '@tanstack/react-query';
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
import MenuBar from '../components/MenuBar';
import NowPlaying from '../components/NowPlaying';
import PlayerEvents from '../components/PlayerEvents';
import Queue from '../components/Queue';
import { useSavedLoopsSync } from '../components/saved-loops';
import ShortcutsPanel from '../components/ShortcutsPanel';
import StatusBar from '../components/StatusBar';
import TitleBar from '../components/TitleBar';
import Toasts from '../components/Toasts';
import { useViewStack } from '../components/view-stack';
import useInvalidate from '../hooks/useInvalidate';
import { usePlayerState } from '../hooks/usePlayer';
import { enterMiniWindow, exitMiniWindow } from '../lib/mini-window';
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

  // The root loader ensures the config query, and its initialData is the config
  // injected at parse time, so this read is synchronous on first paint (no
  // full-mode flash). Anything other than a known mode - including a config
  // written before `ui_mode` existed - falls back to full, the fresh default.
  // Stored choices (`minimal`, `full`, `mini`) are honored verbatim.
  const config = useSuspenseQuery(configQuery).data;
  const rawMode = (config as { ui_mode?: unknown }).ui_mode;
  const uiMode =
    rawMode === 'minimal' || rawMode === 'full' || rawMode === 'mini'
      ? rawMode
      : 'full';
  const isFullMode = uiMode === 'full';
  const isMiniMode = uiMode === 'mini';

  const queue = usePlayerState((state) => state.queue);
  const queueCursor = usePlayerState((state) => state.queueCursor);

  // Mini mode also drives the *native* window: entering shrinks it to the
  // compact AIMP-like footprint, leaving restores the exact prior size, and
  // the window stays freely resizable in both modes. Both toggle sites (the
  // header button and Ctrl+M) flip `ui_mode`, so reacting here covers both.
  // No-op outside Tauri (browser tests).
  useEffect(() => {
    if (isMiniMode) {
      void enterMiniWindow();
    } else {
      void exitMiniWindow();
    }
  }, [isMiniMode]);

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

      {/** Frameless window chrome (Windows-only, null elsewhere) */}
      <TitleBar />

      {/** In-app menu bar: the visible half of the menu toggle on frameless windows */}
      <MenuBar />

      {/** 40px header: breadcrumb, search, settings (logo/brand fold into the title bar on Windows) */}
      <Header />

      <main
        aria-label={t`Application main content`}
        {...stylex.props(
          styles.main,
          isSettingsRoute && styles.mainFullWidth,
          isMiniMode && styles.mainMini,
        )}
      >
        {isSettingsRoute ? (
          <div {...stylex.props(styles.settingsSlot)}>
            <Outlet />
          </div>
        ) : (
          <>
            {/** Left column: now playing - never changes, never remounts */}
            <NowPlaying />
            {/**
             * Right column: the view stack (Queue / Library / Playlists), the
             * full-mode Queue column, or - in mini mode - always the Queue,
             * stacked below the condensed player card. NowPlaying and this
             * column keep their tree positions in every mode, so a mode
             * toggle never remounts the player.
             */}
            <div
              {...stylex.props(
                styles.rightColumn,
                isMiniMode && styles.rightColumnMini,
              )}
            >
              {isMiniMode || (isFullMode && showQueue) ? (
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

      {/** 26px ledger: totals, format, effects, loop, output — full mode only */}
      {isFullMode && <StatusBar />}

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
  /**
   * S8 mini mode: the same two children (NowPlaying, right column) stacked
   * vertically - condensed player card above, queue below - via grid rows
   * instead of columns. Same tree positions, so no remount; the bounding
   * order (player bottom above queue top) falls out of the row order. The
   * main stays `overflow: hidden` so the queue keeps its own scroll region:
   * the list must always own the remaining row height (`minmax(0, 1fr)`)
   * instead of the whole mini page scrolling and cutting the list away.
   */
  mainMini: {
    gridTemplateColumns: 'minmax(0, 1fr)',
    gridTemplateRows: 'auto minmax(0, 1fr)',
    minHeight: 0,
    overflow: 'hidden',
  },
  rightColumnMini: {
    minHeight: 0,
    minWidth: 0,
    borderLeftWidth: 0,
    borderLeftStyle: 'none',
    borderTopWidth: '1px',
    borderTopStyle: 'solid',
    borderTopColor: 'var(--border)',
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
