import { useLingui } from '@lingui/react/macro';
import * as stylex from '@stylexjs/stylex';
import {
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query';
import { open } from '@tauri-apps/plugin-dialog';
import { useCallback, useEffect, useRef } from 'react';

import LibraryAPI from '../api/LibraryAPI';
import MarqueeLine from '../elements/MarqueeLine';
import useInvalidate from '../hooks/useInvalidate';
import { usePlayerState } from '../hooks/usePlayer';
import usePlayingTrack from '../hooks/usePlayingTrack';
import ConfigBridge from '../lib/bridge-config';
import {
  audioFormatLabel,
  formatBitrate,
  formatSampleRate,
  NO_VALUE,
} from '../lib/dense-format';
import { allTracksQuery, configQuery } from '../lib/queries';
import { logAndNotifyError } from '../lib/utils';
import Cover from './Cover';
import EffectControls from './EffectControls';
import Icon from './Icon';
import LoopControls from './LoopControls';
import PlayerControls from './PlayerControls';
import PlayingBarInfo from './PlayingBarInfo';
import TrackDetails from './TrackDetails';
import TrackProgress from './TrackProgress';

/**
 * The left column of the Dense layout: the whole "now" half of the job -
 * art, facts, the A-B seek, the transport, the Burn strip and the detail
 * ledger - visible at once, no tabs.
 *
 * In mini mode this same section condenses to a compact horizontal strip
 * (small cover, title/artist/format beside it, transport and seek on one
 * line) so the queue below keeps the majority of the window height. The
 * A-B and details disclosures stay available but collapsed; the full column
 * below is unchanged.
 */
export default function NowPlaying() {
  const trackPlaying = usePlayingTrack();
  const allTracks = useQuery(allTracksQuery).data;
  const invalidate = useInvalidate();
  const { t } = useLingui();
  const repeat = 'None' as const;
  // Mini mode condenses this column (see both branches below); anything else
  // renders the full column. Same query as the header toggle, so a mode flip
  // never remounts this section.
  const config = useSuspenseQuery(configQuery).data;
  const queryClient = useQueryClient();
  const isMini = config.ui_mode === 'mini';
  // A-B repeat is a reason this fork exists, so a stored loop must not hide
  // behind a collapsed toggle: the A-B disclosure auto-opens once per track
  // when a saved loop is armed for it. The auto-open persists through the
  // same path as a manual toggle, and the per-track ref below remembers it,
  // so a later explicit close sticks instead of reopening on every render.
  // Each toggle remains an explicit user choice persisted on the Config
  // (`ui_ab_open` / `ui_details_open`, collapsed on a fresh config) via the
  // ConfigBridge multiSet path, with an optimistic query-cache write so the
  // disclosure flips at once. Every accessible name and keyboard behaviour
  // below is unchanged. The Slow/Reverb differentiator strip stays visible
  // in full mode; nothing is removed - every capability stays one click away.
  const abLoop = usePlayerState((state) => state.abLoop);
  const hasSavedLoop = abLoop.startSeconds != null || abLoop.endSeconds != null;
  const loopOpen = config.ui_ab_open ?? false;
  const detailsOpen = config.ui_details_open ?? false;
  const setLoopOpen = useCallback(
    (next: boolean) => {
      queryClient.setQueryData(configQuery.queryKey, {
        ...config,
        ui_ab_open: next,
      });
      void ConfigBridge.multiSet({ ui_ab_open: next });
    },
    [config, queryClient],
  );
  const setDetailsOpen = useCallback(
    (next: boolean) => {
      queryClient.setQueryData(configQuery.queryKey, {
        ...config,
        ui_details_open: next,
      });
      void ConfigBridge.multiSet({ ui_details_open: next });
    },
    [config, queryClient],
  );
  const autoOpenedFor = useRef<string | null>(null);
  useEffect(() => {
    if (trackPlaying == null || !hasSavedLoop || config.ui_ab_open) return;
    if (autoOpenedFor.current === trackPlaying.path) return;
    autoOpenedFor.current = trackPlaying.path;
    queryClient.setQueryData(configQuery.queryKey, {
      ...config,
      ui_ab_open: true,
    });
    void ConfigBridge.multiSet({ ui_ab_open: true });
  }, [trackPlaying, hasSavedLoop, config, queryClient]);

  // The same path as Ctrl+O, as a real affordance (there is no File menu).
  const importFolders = useCallback(async () => {
    try {
      const selection = await open({ directory: true, multiple: true });
      if (selection == null) return;
      const folders = Array.isArray(selection) ? selection : [selection];
      if (folders.length === 0) return;
      await LibraryAPI.addLibraryFolders(folders);
      await LibraryAPI.scan();
      await invalidate();
    } catch (error) {
      logAndNotifyError(error);
    }
  }, [invalidate]);

  if (trackPlaying == null) {
    const libraryEmpty = (allTracks?.length ?? 0) === 0;

    // Mini idle: the same compact strip (small tile, one title line, the
    // transport) instead of the full empty column. The import affordance
    // stays inline so no capability is lost.
    if (isMini) {
      return (
        <section
          aria-label={t`Now playing`}
          {...stylex.props(styles.now, styles.nowMini)}
        >
          <div {...stylex.props(styles.miniRow)}>
            <div {...stylex.props(styles.miniEmptyArt)} aria-hidden="true">
              <Icon name="musicalNotes" size={20} />
            </div>
            <div {...stylex.props(styles.miniMeta)}>
              <h3 {...stylex.props(styles.miniEmptyTitle)}>
                {libraryEmpty ? t`Your library is empty` : t`Nothing playing`}
              </h3>
              <p {...stylex.props(styles.miniEmptyText)}>
                {libraryEmpty
                  ? t`Slowburn plays files you already own.`
                  : t`Pick a track from the library to begin.`}{' '}
                {libraryEmpty && (
                  <button
                    type="button"
                    onClick={() => void importFolders()}
                    {...stylex.props(styles.importBtn)}
                  >
                    {t`Import folder...`}
                  </button>
                )}
              </p>
            </div>
          </div>

          {/* Kept so the idle now-playing strip still offers the one global
              transport affordance the app has always had (e2e asserts it). */}
          <PlayerControls />
        </section>
      );
    }

    return (
      <section aria-label={t`Now playing`} {...stylex.props(styles.now)}>
        <div {...stylex.props(styles.emptyNp)}>
          <div {...stylex.props(styles.emptyArt)} aria-hidden="true">
            <Icon name="musicalNotes" size={36} />
          </div>

          {libraryEmpty ? (
            <>
              <h3
                {...stylex.props(styles.emptyTitle)}
              >{t`Your library is empty`}</h3>
              <p {...stylex.props(styles.emptyText)}>
                {t`Slowburn plays files you already own. Nothing is streamed, nothing leaves this machine.`}
              </p>
              <div {...stylex.props(styles.emptyRules)}>
                <b>{t`Drag`}</b> FLAC · MP3 · M4A · OGG · WAV{' '}
                {t`onto the window`}
                <br />
                <button
                  type="button"
                  onClick={() => void importFolders()}
                  {...stylex.props(styles.importBtn)}
                >
                  {t`Import folder…`}
                </button>
                <br />
                <b>Ctrl+O</b> {t`to open files`}
              </div>
            </>
          ) : (
            <>
              <h3 {...stylex.props(styles.emptyTitle)}>{t`Nothing playing`}</h3>
              <p {...stylex.props(styles.emptyText)}>
                {t`Pick a track from the library to begin.`}
              </p>
            </>
          )}
        </div>

        {/* Kept so the idle now-playing column still offers the one global
            transport affordance the app has always had (e2e asserts it). */}
        <div {...stylex.props(styles.transportWrap)}>
          <PlayerControls />
        </div>
      </section>
    );
  }

  // Mini playing: a condensed horizontal card - small cover on the left,
  // title/artist/format stacked beside it, transport and seek sharing one
  // line - instead of the full vertical column. Same region, same controls,
  // same accessible names; the disclosures stay one click away.
  if (isMini) {
    const format = audioFormatLabel(trackPlaying.path);
    const formatLine = [
      format,
      formatSampleRate(trackPlaying.sample_rate),
      formatBitrate(trackPlaying.bitrate),
    ]
      .filter((part) => part !== NO_VALUE)
      .join(' . ');
    const artists = trackPlaying.artists.join(', ');

    return (
      <section
        aria-label={t`Now playing`}
        {...stylex.props(styles.now, styles.nowMini)}
      >
        <div {...stylex.props(styles.miniRow)}>
          <div {...stylex.props(styles.miniArtClip)}>
            <div {...stylex.props(styles.miniArtScale)}>
              <Cover track={trackPlaying} dense />
            </div>
          </div>
          <div {...stylex.props(styles.miniMeta)}>
            <MarqueeLine
              text={trackPlaying.title}
              xstyle={styles.miniTitle}
              testId="np-mini-title"
            />
            <MarqueeLine
              text={artists}
              xstyle={styles.miniArtist}
              testId="np-mini-artist"
            />
            {formatLine !== '' && (
              <div {...stylex.props(styles.miniFormat)} title={formatLine}>
                {formatLine}
              </div>
            )}
          </div>
        </div>

        <div {...stylex.props(styles.miniSeekRow)}>
          <PlayerControls />
          <div {...stylex.props(styles.miniSeekGrow)}>
            <TrackProgress trackPlaying={trackPlaying} dense />
          </div>
        </div>

        <div {...stylex.props(styles.overflowRow)}>
          <button
            type="button"
            onClick={() => setLoopOpen(!loopOpen)}
            aria-expanded={loopOpen}
            aria-controls="np-loop-panel"
            aria-label={t`A-B loop options`}
            title={t`A-B loop options`}
            {...stylex.props(styles.overflowBtn, loopOpen && styles.open)}
          >
            <Icon name="repeat" size={12} />
            {t`A-B`}
          </button>
          <button
            type="button"
            onClick={() => setDetailsOpen(!detailsOpen)}
            aria-expanded={detailsOpen}
            aria-controls="np-details-panel"
            aria-label={t`Details and effects`}
            title={t`Details and effects`}
            {...stylex.props(styles.overflowBtn, detailsOpen && styles.open)}
          >
            <Icon name={detailsOpen ? 'chevronUp' : 'chevronDown'} size={12} />
            {t`Details`}
          </button>
        </div>
        {loopOpen && (
          <section
            id="np-loop-panel"
            aria-label={t`A-B loop options`}
            {...stylex.props(styles.loopPanel)}
          >
            <LoopControls trackPlaying={trackPlaying} />
          </section>
        )}
        {detailsOpen && (
          <section
            id="np-details-panel"
            aria-label={t`Details and effects`}
            {...stylex.props(styles.detailsPanel)}
          >
            <EffectControls />
            <TrackDetails trackPlaying={trackPlaying} />
          </section>
        )}
      </section>
    );
  }

  return (
    <section aria-label={t`Now playing`} {...stylex.props(styles.now)}>
      <div {...stylex.props(styles.npTop)}>
        <Cover track={trackPlaying} dense />
        <PlayingBarInfo
          trackPlaying={trackPlaying}
          shuffle={false}
          repeat={repeat}
          variant="dense"
        />
      </div>

      <div {...stylex.props(styles.transportWrap)}>
        <TrackProgress trackPlaying={trackPlaying} dense />
        <PlayerControls />
        <div {...stylex.props(styles.overflowRow)}>
          <button
            type="button"
            onClick={() => setLoopOpen(!loopOpen)}
            aria-expanded={loopOpen}
            aria-controls="np-loop-panel"
            aria-label={t`A-B loop options`}
            title={t`A-B loop options`}
            {...stylex.props(styles.overflowBtn, loopOpen && styles.open)}
          >
            <Icon name="repeat" size={12} />
            {t`A-B`}
          </button>
          <button
            type="button"
            onClick={() => setDetailsOpen(!detailsOpen)}
            aria-expanded={detailsOpen}
            aria-controls="np-details-panel"
            aria-label={t`Details and effects`}
            title={t`Details and effects`}
            {...stylex.props(styles.overflowBtn, detailsOpen && styles.open)}
          >
            <Icon name={detailsOpen ? 'chevronUp' : 'chevronDown'} size={12} />
            {t`Details`}
          </button>
        </div>
        {loopOpen && (
          <section
            id="np-loop-panel"
            aria-label={t`A-B loop options`}
            {...stylex.props(styles.loopPanel)}
          >
            <LoopControls trackPlaying={trackPlaying} />
          </section>
        )}
      </div>

      {/* Differentiator strip: Slow/Reverb stay visible in full mode. The
          TRACK FILE / A-B LOOP grid stays behind the Details toggle and the
          A-B controls behind the A-B toggle. */}
      <EffectControls />

      {detailsOpen && (
        <section
          id="np-details-panel"
          aria-label={t`Details and effects`}
          {...stylex.props(styles.detailsPanel)}
        >
          <TrackDetails trackPlaying={trackPlaying} />
        </section>
      )}
    </section>
  );
}

const styles = stylex.create({
  now: {
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
    minWidth: 0,
    paddingTop: 'var(--space-3)',
    paddingBottom: '10px',
    paddingInline: 'var(--space-3)',
    rowGap: '10px',
    backgroundColor: 'var(--bg)',
    // Scroll rather than clip: below the design height the ledger and Burn
    // strip must stay reachable.
    overflowY: 'auto',
    overflowX: 'hidden',
  },
  npTop: {
    display: 'flex',
    flexWrap: 'wrap',
    columnGap: 'var(--space-3)',
    rowGap: 'var(--space-2)',
    // Keep the header block at its content height: with the column's
    // `overflow-y: auto` this makes the stack genuinely overflow and scroll,
    // instead of flex-shrinking the metadata to nothing so the opaque
    // transport card below paints over its overflowing contents.
    flexShrink: 0,
  },
  transportWrap: {
    backgroundColor: 'var(--surface)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--border-soft)',
    borderRadius: 'var(--radius-lg)',
    boxShadow: 'var(--shadow-elevated)',
    paddingTop: 'var(--space-3)',
    paddingBottom: '10px',
    paddingInline: '11px',
    display: 'flex',
    flexDirection: 'column',
    rowGap: '9px',
  },

  // --- mini condensed strip -------------------------------------------------
  // The same section in mini mode: a compact horizontal card (small cover,
  // title/artist/format, transport + seek on one line) instead of the full
  // vertical column, so the queue below keeps the majority of the height.
  nowMini: {
    rowGap: '8px',
    paddingTop: '8px',
    paddingBottom: '8px',
    paddingInline: '10px',
    overflowY: 'auto',
    overflowX: 'hidden',
    flexShrink: 0,
  },
  miniRow: {
    display: 'flex',
    alignItems: 'center',
    columnGap: '10px',
    minWidth: 0,
    flexShrink: 0,
  },
  // The dense cover tile is fixed-size (118px, 88px under 900px) with no
  // size prop, so the strip shows it through a 56px clip scaled to match:
  // same stand-in tile and artwork the tests assert on, at strip size.
  miniArtClip: {
    width: '56px',
    height: '56px',
    flexShrink: 0,
    overflow: 'hidden',
    borderRadius: 'var(--radius)',
  },
  miniArtScale: {
    width: {
      default: '118px',
      '@media (max-width: 900px)': '88px',
    },
    height: {
      default: '118px',
      '@media (max-width: 900px)': '88px',
    },
    transformOrigin: 'top left',
    transform: {
      default: 'scale(0.4746)',
      '@media (max-width: 900px)': 'scale(0.6364)',
    },
  },
  miniMeta: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 'auto',
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    rowGap: '1px',
  },
  miniTitle: {
    fontSize: '14px',
    fontWeight: 700,
    lineHeight: 1.25,
    color: 'var(--text-bright)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  miniArtist: {
    fontSize: '12px',
    fontWeight: 600,
    lineHeight: 1.3,
    color: 'var(--text-dim)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  miniFormat: {
    fontFamily: 'var(--mono-font)',
    fontSize: '10.5px',
    fontWeight: 600,
    lineHeight: 1.3,
    color: 'var(--text-faint)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  miniSeekRow: {
    display: 'flex',
    alignItems: 'center',
    columnGap: '10px',
    rowGap: '6px',
    flexWrap: 'wrap',
    minWidth: 0,
    flexShrink: 0,
  },
  miniSeekGrow: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: '140px',
    minWidth: 0,
  },
  // --- mini idle ----------------------------------------------------------
  miniEmptyArt: {
    width: '40px',
    height: '40px',
    flexShrink: 0,
    borderRadius: 'var(--radius)',
    borderWidth: '1.5px',
    borderStyle: 'dashed',
    borderColor: 'var(--control-border)',
    display: 'grid',
    placeItems: 'center',
    color: 'var(--text-faint)',
    backgroundColor: 'transparent',
  },
  miniEmptyTitle: {
    margin: 0,
    fontSize: '13px',
    fontWeight: 700,
    color: 'var(--text-dim)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  miniEmptyText: {
    margin: 0,
    fontSize: '12px',
    lineHeight: 1.5,
    color: 'var(--text-faint)',
  },

  // --- overflow toggles + collapsible panels ------------------------------
  // One row of pill toggles under the transport (the queue-filter treatment,
  // at disclosure size): the A-B controls and the details/effects blocks are
  // one click away instead of always on.
  overflowRow: {
    display: 'flex',
    alignItems: 'center',
    columnGap: '6px',
  },
  overflowBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    columnGap: '5px',
    height: '28px',
    minHeight: '28px',
    paddingInline: '10px',
    borderRadius: '9999px',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--border-soft)',
    backgroundColor: {
      default: 'var(--bg)',
      ':hover': 'var(--surface-hover)',
    },
    color: {
      default: 'var(--text-faint)',
      ':hover': 'var(--text-dim)',
    },
    fontSize: 'var(--text-xs)',
    fontWeight: 700,
    cursor: 'pointer',
  },
  open: {
    color: 'var(--accent)',
    backgroundColor: 'var(--accent-soft)',
    borderColor: 'var(--accent)',
  },
  loopPanel: {
    display: 'flex',
    flexDirection: 'column',
  },
  detailsPanel: {
    display: 'flex',
    flexDirection: 'column',
    rowGap: '10px',
    minHeight: 0,
  },

  // --- empty library ------------------------------------------------------
  emptyNp: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 'auto',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    rowGap: 'var(--space-3)',
    textAlign: 'center',
    padding: '20px',
  },
  emptyArt: {
    width: '96px',
    height: '96px',
    borderRadius: 'var(--radius-lg)',
    borderWidth: '1.5px',
    borderStyle: 'dashed',
    borderColor: 'var(--control-border)',
    display: 'grid',
    placeItems: 'center',
    color: 'var(--text-faint)',
    backgroundColor: 'transparent',
  },
  emptyTitle: {
    margin: 0,
    fontSize: 'var(--text-md)',
    fontWeight: 700,
    color: 'var(--text-dim)',
  },
  emptyText: {
    margin: 0,
    fontSize: 'var(--text-sm)',
    color: 'var(--text-faint)',
    maxWidth: '300px',
    lineHeight: 1.5,
  },
  emptyRules: {
    fontFamily: 'var(--mono-font)',
    fontSize: 'var(--text-xs)',
    fontWeight: 600,
    lineHeight: 1.9,
    color: 'var(--text-faint)',
    backgroundColor: 'var(--surface-2)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--border-soft)',
    borderRadius: 'var(--radius-lg)',
    paddingBlock: '10px',
    paddingInline: '14px',
    textAlign: 'left',
  },
  importBtn: {
    marginBlock: '2px',
    paddingBlock: 'var(--space-1)',
    paddingInline: '10px',
    borderRadius: 'var(--radius)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--control-border)',
    backgroundColor: 'var(--surface)',
    color: {
      default: 'var(--text-dim)',
      ':hover': 'var(--text-bright)',
    },
    fontFamily: 'var(--mono-font)',
    fontSize: 'var(--text-xs)',
    fontWeight: 700,
    cursor: 'pointer',
  },
});
