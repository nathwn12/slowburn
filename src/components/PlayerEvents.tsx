import { useNavigate } from '@tanstack/react-router';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { sendNotification } from '@tauri-apps/plugin-notification';
import { useEffect, useRef } from 'react';

import { usePlayerState } from '../hooks/usePlayer';
import ConfigBridge from '../lib/bridge-config';
import DatabaseBridge from '../lib/bridge-database';
import { getCover } from '../lib/cover';
import player from '../lib/player';
import { allTracksQuery } from '../lib/queries';
import queryClient from '../lib/query-client';
import { goToPlayingTrack } from '../lib/queue-origin';
import toastManager from '../lib/toast-manager';
import { logAndNotifyError } from '../lib/utils';

const AUDIO_ERRORS = {
  aborted: 'The video playback was aborted.',
  corrupt: 'The audio playback was aborted due to a corruption problem.',
  notFound:
    'The track file could not be found. It may be due to a file move or an unmounted partition.',
  unknown: 'An unknown error occurred.',
};

/**
 * Handle player events for notifications and error handling
 */
function PlayerEvents() {
  const queueOrigin = usePlayerState((state) => state.queueOrigin);
  const navigate = useNavigate();
  // One play credit per track load: an `ended` and a ≥75% sample, or a
  // double-ended event, must not double-count. Replaying counts again because
  // the flag resets on `trackChange`.
  const credited = useRef(false);

  useEffect(() => {
    function handleAudioError(error: MediaError) {
      player.stop();

      switch (error.code) {
        case error.MEDIA_ERR_ABORTED:
          toastManager.add({ title: AUDIO_ERRORS.aborted, type: 'warning' });
          break;
        case error.MEDIA_ERR_DECODE:
          toastManager.add({ title: AUDIO_ERRORS.corrupt, type: 'danger' });
          break;
        case error.MEDIA_ERR_SRC_NOT_SUPPORTED:
          toastManager.add({ title: AUDIO_ERRORS.notFound, type: 'danger' });
          break;
        default:
          toastManager.add({ title: AUDIO_ERRORS.unknown, type: 'danger' });
          break;
      }
    }

    async function notifyTrackChange() {
      const track = player.getTrack();
      const isEnabled = await ConfigBridge.get('notifications');
      const isMinimized = await getCurrentWindow()
        .isMinimized()
        .catch(logAndNotifyError);
      const isFocused = await getCurrentWindow()
        .isFocused()
        .catch(logAndNotifyError);

      if (track == null || !isEnabled || isFocused || !isMinimized) {
        return;
      }

      const cover = await getCover(track.path);

      sendNotification({
        title: track.title,
        body: `${track.artists.join(', ')}\n${track.album}`,
        silent: true,
        icon: cover ?? undefined,
        // TODO: onClick event https://github.com/tauri-apps/tauri/issues/3698
        // show + focus + unminimize
      });
    }

    async function onTrackEnded() {
      const isFocused = await getCurrentWindow().isFocused();

      // If follow track is enabled, switch to the right view + scroll to the track
      // Do not do it if the app is focused, as users could be interacting with the app
      if (
        (await ConfigBridge.get('audio_follow_playing_track')) &&
        !isFocused
      ) {
        goToPlayingTrack(queueOrigin, navigate);
      }
    }

    // Count a completed listen once: track ended, or >75% elapsed.
    function creditPlay() {
      if (credited.current) return;
      credited.current = true;
      const track = player.getTrack();
      if (track == null) return;
      void DatabaseBridge.recordPlay(track.id)
        .then(() => queryClient.invalidateQueries(allTracksQuery))
        .catch(logAndNotifyError);
    }

    function onTrackChange() {
      credited.current = false;
    }

    function onTimeUpdate() {
      const track = player.getTrack();
      if (track == null || !(track.duration > 0)) return;
      if (player.getCurrentTime() >= track.duration * 0.75) creditPlay();
    }

    function onEnded() {
      void onTrackEnded();
      creditPlay();
    }

    // Bind player events
    player.on('play', notifyTrackChange);
    player.on('error', handleAudioError);
    player.on('ended', onEnded);
    player.on('trackChange', onTrackChange);
    player.on('timeupdate', onTimeUpdate);

    return function cleanup() {
      player.off('play', notifyTrackChange);
      player.off('error', handleAudioError);
      player.off('ended', onEnded);
      player.off('trackChange', onTrackChange);
      player.off('timeupdate', onTimeUpdate);
    };
  }, [queueOrigin, navigate]);

  return null;
}

export default PlayerEvents;
