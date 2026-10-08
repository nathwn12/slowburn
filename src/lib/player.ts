import { convertFileSrc } from '@tauri-apps/api/core';
import EventEmitter from 'eventemitter3';
import debounce from 'lodash-es/debounce';

import type { AbLoop, Repeat, Track } from '../generated/typings';
import type { QueueOrigin } from '../types/museeks';
import ConfigBridge from './bridge-config';
import bridgeDatabase from './bridge-database';
import { getCover } from './cover';
import { EffectsController, type EffectsConfig } from './effects';
import {
  isLoopEngaged,
  resolveEndSeekTarget,
  resolveSeekTarget,
  type LoopState,
} from './effects-core/loop';
import { logAndNotifyError } from './utils';
import { shuffleTracks } from './utils-player';

/** How often an armed A-B loop checks whether the B point was crossed (ms). */
const AB_TICK_MS = 100;

interface PlayerOptions {
  playbackRate?: number;
  volume?: number;
  muted?: boolean;
  repeat?: Repeat;
  shuffle?: boolean;
}

/**
 * Snapshot of the A-B loop state, exposed to the UI.
 */
export interface AbLoopState {
  /** Track the region belongs to, or `null` when nothing is loaded. */
  trackId: string | null;
  /** Whether A-B looping is enabled in config at all. */
  enabled: boolean;
  /** Whether a region is armed and the loop is live. */
  active: boolean;
  /** A point in seconds, or `null` when unset. */
  startSeconds: number | null;
  /** B point in seconds, or `null` when unset. */
  endSeconds: number | null;
}

/**
 * Player state that gets emitted on changes
 */
export interface PlayerState {
  queue: Track[];
  queueCursor: number | null;
  queueOrigin: QueueOrigin | null;
  repeat: Repeat;
  shuffle: boolean;
  volume: number;
  muted: boolean;
  isPaused: boolean;
  abLoop: AbLoopState;
}

/**
 * Events emitted by the Player
 */
export interface PlayerEvents {
  // Playback events
  play: () => void;
  pause: () => void;
  stop: () => void;
  ended: () => void;
  error: (error: MediaError) => void;
  timeupdate: (currentTime: number) => void;
  loadstart: () => void;

  // State change event (for React hooks)
  stateChange: (state: PlayerState) => void;

  // A-B loop state change event (for React hooks)
  abLoopChange: (state: AbLoopState) => void;

  // Track change event
  trackChange: (track: Track | null) => void;
}

/**
 * Enhanced Player class that manages both audio playback and queue state.
 * Extends EventEmitter to notify React components of state changes.
 */
class Player extends EventEmitter<PlayerEvents> {
  private readonly audio: HTMLAudioElement;
  private readonly effects: EffectsController;

  // A-B section loop. The loop is armed from the persisted region for the
  // current track, then a ~100 ms tick seeks back to A once the playhead
  // crosses B. `abTicker` only runs while a region is armed and playing.
  private abEnabled: boolean;
  private abTrackId: string | null = null;
  private abStart: number | null = null;
  private abEnd: number | null = null;
  private abTicker: ReturnType<typeof setInterval> | null = null;
  // Guards async hydration against the track changing mid-load.
  private abApplyToken = 0;

  // User-facing volume. Kept here (not read back from `audio.volume`) because
  // the effects graph's master gain owns loudness once it is built.
  private volume: number;

  // Queue state
  private queue: Track[];
  private oldQueue: Track[]; // Backup for shuffle/unshuffle
  private queueCursor: number | null;
  private queueOrigin: QueueOrigin | null;

  // Playback modes
  private repeat: Repeat;
  private shuffle: boolean;

  // Cached state for useSyncExternalStore
  private state: PlayerState | null = null;

  constructor(options?: PlayerOptions) {
    super();

    const mergedOptions = {
      playbackRate: 1,
      volume: 1,
      muted: false,
      repeat: 'None' as Repeat,
      shuffle: false,
      ...options,
    };

    this.audio = new Audio();
    // Best-effort gapless (S5): hint the element to buffer ahead. Set before
    // any `src` is assigned, alongside `crossOrigin` below.
    this.audio.preload = 'auto';
    // Asset-protocol media (`http://asset.localhost/...`) is cross-origin to
    // the app. Without an anonymous crossOrigin request the browser routes the
    // element into the Web Audio graph as silence (`createMediaElementSource`
    // would measure RMS 0). This MUST be set before any `src` is assigned.
    this.audio.crossOrigin = 'anonymous';
    this.queue = [];
    this.oldQueue = [];
    this.queueCursor = null;
    this.queueOrigin = null;
    this.repeat = mergedOptions.repeat;
    this.shuffle = mergedOptions.shuffle;

    this.audio.defaultPlaybackRate = mergedOptions.playbackRate;
    this.audio.playbackRate = mergedOptions.playbackRate;
    this.audio.volume = mergedOptions.volume;
    this.audio.muted = mergedOptions.muted;

    // The effects layer owns the Web Audio graph around this one element:
    // Dattorro reverb + slowed playback rate. It is inert at the defaults
    // (reverb intensity 0, slow 1x) and records the element's base rate/pitch
    // so teardown can restore them.
    this.effects = new EffectsController(this.audio, {
      enabled: ConfigBridge.getInitial('audio_effects_enabled'),
      slowEnabled: ConfigBridge.getInitial('audio_slow_enabled'),
      slow: ConfigBridge.getInitial('audio_slow') ?? 1,
      reverbEnabled: ConfigBridge.getInitial('audio_reverb_enabled'),
      reverbIntensity: ConfigBridge.getInitial('audio_reverb_intensity') ?? 0,
    });
    this.abEnabled = ConfigBridge.getInitial('audio_ab_enabled') ?? true;
    this.volume = this.audio.volume;

    this.setupAudioListeners();
    this.setupMediaSession();

    // Bind methods that are used as callbacks
    this.play = this.play.bind(this);
    this.pause = this.pause.bind(this);
    this.playPause = this.playPause.bind(this);
    this.previous = this.previous.bind(this);
    this.next = this.next.bind(this);
    this.stop = this.stop.bind(this);
    this.start = this.start.bind(this);
    this.startFromQueue = this.startFromQueue.bind(this);
    this.addToQueue = this.addToQueue.bind(this);
    this.addNextInQueue = this.addNextInQueue.bind(this);
    this.removeFromQueue = this.removeFromQueue.bind(this);
    this.clearQueue = this.clearQueue.bind(this);
    this.setQueue = this.setQueue.bind(this);
    this.toggleShuffle = this.toggleShuffle.bind(this);
    this.toggleRepeat = this.toggleRepeat.bind(this);
    this.setTrack = this.setTrack.bind(this);
    this.setCurrentTime = this.setCurrentTime.bind(this);
    this.setVolume = this.setVolume.bind(this);
    this.toggleMute = this.toggleMute.bind(this);
    this.unmute = this.unmute.bind(this);
    this.setPlaybackRate = this.setPlaybackRate.bind(this);
  }

  /**
   * The single backing media element, exposed read-only so a shell-level
   * component can host it in the document. This keeps exactly one audio node
   * in the tree (no decoys) while letting checks observe the real element's
   * `preload` attribute.
   */
  getAudioElement(): HTMLAudioElement {
    return this.audio;
  }

  /**
   * Setup internal audio element event listeners
   */
  private setupAudioListeners() {
    this.audio.addEventListener('play', () => {
      this.emit('play');
      this.emitStateChange();
    });

    this.audio.addEventListener('pause', () => {
      this.stopAbTicker();
      this.emit('pause');
      this.emitStateChange();
    });

    this.audio.addEventListener('play', () => {
      this.startAbTicker();
    });

    this.audio.addEventListener('ended', async () => {
      this.emit('ended');

      // An armed A-B loop wins over auto-advance: the region's end is the
      // song's end, so loop back to A instead of moving to the next track.
      const loopTarget = resolveEndSeekTarget(
        this.abLoopState(),
        this.audio.duration,
      );
      if (loopTarget !== null) {
        this.seekAudio(loopTarget);
        void this.play().catch(logAndNotifyError);
        return;
      }

      // Auto-advance to next track
      await this.next();
    });

    this.audio.addEventListener('error', () => {
      if (this.audio.error) {
        this.emit('error', this.audio.error);
      }
    });

    this.audio.addEventListener('timeupdate', () => {
      this.emit('timeupdate', this.audio.currentTime);
    });

    this.audio.addEventListener('loadstart', () => {
      this.emit('loadstart');
    });

    // Emit volume changes
    this.audio.addEventListener('volumechange', () => {
      this.emitStateChange();
    });
  }

  /**
   * Setup MediaSession integration (for OS media controls, MPRIS, etc.)
   */
  private setupMediaSession() {
    if (!('mediaSession' in navigator)) {
      return;
    }

    // Update playback state when audio plays
    this.audio.addEventListener('play', () => {
      navigator.mediaSession.playbackState = 'playing';
    });

    // Update playback state when audio pauses
    this.audio.addEventListener('pause', () => {
      navigator.mediaSession.playbackState = 'paused';
    });

    // Sync metadata when track loads
    this.audio.addEventListener('loadstart', async () => {
      await this.syncMediaSession();
    });

    // Setup action handlers
    navigator.mediaSession.setActionHandler('play', () => {
      this.play().catch(logAndNotifyError);
    });
    navigator.mediaSession.setActionHandler('pause', () => {
      this.pause();
    });
    navigator.mediaSession.setActionHandler('previoustrack', () => {
      this.previous().catch(logAndNotifyError);
    });
    navigator.mediaSession.setActionHandler('nexttrack', () => {
      this.next().catch(logAndNotifyError);
    });
  }

  /**
   * Sync current track metadata with MediaSession API
   */
  private async syncMediaSession() {
    if (!('mediaSession' in navigator) || !('MediaMetadata' in globalThis)) {
      return;
    }

    const track = this.getTrack();
    if (!track) {
      return;
    }

    const cover = await getCover(track.path);

    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title,
      artist: track.artists.join(', '),
      album: track.album,
      artwork: cover ? [{ src: cover }] : undefined,
    });
  }

  /**
   * Emit state change event for React hooks
   */
  private emitStateChange() {
    // Invalidate cache when state changes
    this.state = null;
    this.emit('stateChange', this.getState());
  }

  /**
   * Get current player state snapshot with caching for useSyncExternalStore.
   * Returns the same reference when called multiple times without state changes.
   */
  getState(): PlayerState {
    // Return cached state if available
    if (this.state !== null) {
      return this.state;
    }

    // Create new state object
    this.state = {
      queue: [...this.queue],
      queueCursor: this.queueCursor,
      queueOrigin: this.queueOrigin,
      repeat: this.repeat,
      shuffle: this.shuffle,
      volume: this.volume,
      muted: this.audio.muted,
      isPaused: this.audio.paused,
      abLoop: this.getAbLoop(),
    };

    return this.state;
  }

  // ============================================================================
  // Playback controls
  // ============================================================================

  async play() {
    if (!this.audio.src) {
      throw new Error('Trying to play a track but no audio.src is defined');
    }

    // Build the graph lazily on the first play (and resume the context from
    // this user gesture). Safe to call on every play.
    this.effects.ensureGraph();
    await this.effects.resume();
    try {
      await this.audio.play();
    } catch (error) {
      // An AbortError here is expected: play() is rejected when it is
      // interrupted by a pause/seek/track change. It must not surface as a
      // user-facing toast; every other failure still propagates.
      if ((error as DOMException | undefined)?.name === 'AbortError') return;
      throw error;
    }
  }

  pause() {
    this.audio.pause();
  }

  stop() {
    this.audio.pause();
    this.stopAbTicker();

    this.queue = [];
    this.queueCursor = null;
    this.queueOrigin = null;
    this.emit('stop');
    this.emitStateChange();
  }

  async playPause() {
    try {
      if (this.audio.paused && this.queue.length > 0) {
        await this.play();
      } else {
        this.pause();
      }
    } catch (error) {
      logAndNotifyError(error);
    }
  }

  /**
   * Jump to next track in queue
   */
  async next() {
    if (this.queueCursor === null) {
      return;
    }

    let newQueueCursor: number;

    if (this.repeat === 'One') {
      newQueueCursor = this.queueCursor;
    } else if (
      this.repeat === 'All' &&
      this.queueCursor === this.queue.length - 1
    ) {
      // Last track with repeat all -> go to first
      newQueueCursor = 0;
    } else {
      newQueueCursor = this.queueCursor + 1;
    }

    const track = this.queue[newQueueCursor];

    if (track !== undefined) {
      this.queueCursor = newQueueCursor;
      await this.setTrack(track);
      await this.play();
    } else {
      this.stop();
    }
  }

  /**
   * Jump to previous track, or restart current track if > 5 seconds
   */
  async previous() {
    if (this.queueCursor === null) {
      return;
    }

    let newQueueCursor = this.queueCursor;

    // If track started less than 5 seconds ago, play the previous track
    if (this.audio.currentTime < 5) {
      newQueueCursor = this.queueCursor - 1;
    }

    const track = this.queue[newQueueCursor];

    if (track !== undefined) {
      this.queueCursor = newQueueCursor;
      await this.setTrack(track);
      await this.play();
    } else {
      this.stop();
    }
  }

  // ============================================================================
  // Queue management
  // ============================================================================

  /**
   * Start playing a new queue
   */
  async start(
    tracks: Track[],
    trackID: string | null,
    queueOrigin: QueueOrigin,
  ) {
    if (tracks.length === 0) {
      return;
    }

    const targetTrackID = trackID ?? tracks[0].id;
    const queuePosition = tracks.findIndex((t) => t.id === targetTrackID);

    if (queuePosition === -1) {
      return;
    }

    let queue = [...tracks];
    let queueCursor = queuePosition;
    const oldQueue = [...tracks];

    // Apply shuffle if enabled
    if (this.shuffle) {
      queue = shuffleTracks(queue, queueCursor);
      queueCursor = 0;
    }

    this.queue = queue;
    this.oldQueue = oldQueue;
    this.queueCursor = queueCursor;
    this.queueOrigin = queueOrigin;

    const track = queue[queueCursor];
    await this.setTrack(track);
    await this.play().catch(logAndNotifyError);
  }

  /**
   * Start playing from a specific position in the current queue
   */
  async startFromQueue(index: number) {
    const track = this.queue[index];
    if (!track) {
      return;
    }

    this.queueCursor = index;
    await this.setTrack(track);
    await this.play();
  }

  /**
   * Add tracks to the end of the queue
   */
  addToQueue(tracks: Track[]) {
    this.queue = [...this.queue, ...tracks];

    // If queue was empty, set cursor to 0
    if (this.queueCursor === null && tracks.length > 0) {
      this.queueCursor = 0;
    }

    this.emitStateChange();
  }

  /**
   * Add tracks after the currently playing track
   */
  addNextInQueue(tracks: Track[]) {
    if (this.queueCursor === null) {
      this.queue = tracks;
      this.queueCursor = 0;
    } else {
      this.queue.splice(this.queueCursor + 1, 0, ...tracks);
    }

    this.emitStateChange();
  }

  /**
   * Remove a track from the queue
   */
  removeFromQueue(index: number) {
    if (this.queueCursor === null) {
      return;
    }

    // Convert relative index to absolute
    const absoluteIndex = this.queueCursor + index + 1;
    this.queue.splice(absoluteIndex, 1);
    this.emitStateChange();
  }

  /**
   * Clear all tracks after the current one
   */
  clearQueue() {
    if (this.queueCursor === null) {
      return;
    }

    this.queue = this.queue.slice(0, this.queueCursor + 1);
    this.emitStateChange();
  }

  /**
   * Set the entire queue (used for reordering)
   */
  setQueue(tracks: Track[]) {
    this.queue = tracks;
    this.emitStateChange();
  }

  /**
   * Get the current queue
   */
  getQueue(): Track[] {
    return [...this.queue];
  }

  /**
   * Get queue cursor
   */
  getQueueCursor(): number | null {
    return this.queueCursor;
  }

  /**
   * Get queue origin
   */
  getQueueOrigin(): QueueOrigin | null {
    return this.queueOrigin;
  }

  // ============================================================================
  // Shuffle & Repeat
  // ============================================================================

  /**
   * Toggle shuffle mode
   */
  async toggleShuffle() {
    const nextShuffleState = !this.shuffle;

    if (this.queueCursor === null) {
      this.shuffle = nextShuffleState;
      this.emitStateChange();
      await ConfigBridge.set('audio_shuffle', nextShuffleState);
      return;
    }

    const trackPlayingID = this.queue[this.queueCursor].id;

    if (nextShuffleState) {
      // Enable shuffle
      const newQueue = shuffleTracks([...this.queue], this.queueCursor);
      this.oldQueue = this.queue;
      this.queue = newQueue;
      this.queueCursor = 0;
    } else {
      // Disable shuffle - restore original order
      const currentTrackIndex = this.oldQueue.findIndex(
        (track) => track.id === trackPlayingID,
      );
      this.queue = [...this.oldQueue];
      this.queueCursor = currentTrackIndex;
    }

    this.shuffle = nextShuffleState;
    this.emitStateChange();
    await ConfigBridge.set('audio_shuffle', nextShuffleState);
  }

  /**
   * Toggle repeat mode (cycles through None -> All -> One -> None)
   */
  async toggleRepeat() {
    let nextRepeatState: Repeat = 'None';

    // Cycle through modes
    switch (this.repeat) {
      case 'None':
        nextRepeatState = 'All';
        break;
      case 'All':
        nextRepeatState = 'One';
        break;
      case 'One':
        nextRepeatState = 'None';
        break;
    }

    this.repeat = nextRepeatState;
    this.emitStateChange();
    await ConfigBridge.set('audio_repeat', nextRepeatState);
  }

  /**
   * Get shuffle state
   */
  getShuffle(): boolean {
    return this.shuffle;
  }

  /**
   * Get repeat state
   */
  getRepeat(): Repeat {
    return this.repeat;
  }

  // ============================================================================
  // Track management
  // ============================================================================

  async setTrack(track: Track) {
    // On Linux, use a local HTTP server for audio streaming because
    // WebKitGTK's asset protocol doesn't support media streaming properly.
    // See: https://github.com/tauri-apps/tauri/issues/3725
    if (window.__MUSEEKS_STREAM_SERVER_URL != null) {
      this.audio.src = `${window.__MUSEEKS_STREAM_SERVER_URL}/stream?track_id=${encodeURIComponent(track.id)}`;
    } else {
      this.audio.src = convertFileSrc(track.path);
    }

    this.emit('trackChange', track);
    this.emitStateChange();
    void this.hydrateAbLoop(track);
  }

  /**
   * Get the currently playing track (from queue at cursor position)
   */
  getTrack(): Track | null {
    if (this.queue.length > 0 && this.queueCursor !== null) {
      return this.queue[this.queueCursor];
    }
    return null;
  }

  // ============================================================================
  // Audio controls
  // ============================================================================

  setCurrentTime(time: number) {
    this.audio.currentTime = time;
  }

  getCurrentTime(): number {
    return this.audio.currentTime;
  }

  setVolume(volume: number) {
    this.volume = volume;
    this.effects.setVolume(volume);
    this.emitStateChange();
    this.saveVolumeDebounced(volume);
  }

  /**
   * Debounced volume save to avoid too many writes to config
   */
  private readonly saveVolumeDebounced = debounce((volume: number) => {
    void ConfigBridge.set('audio_volume', volume);
  }, 500);

  getVolume(): number {
    return this.volume;
  }

  async toggleMute() {
    this.audio.muted = !this.audio.muted;
    this.emitStateChange();
    await ConfigBridge.set('audio_muted', this.audio.muted);
  }

  async unmute() {
    this.audio.muted = false;
    this.emitStateChange();
    await ConfigBridge.set('audio_muted', this.audio.muted);
  }

  isMuted(): boolean {
    return this.audio.muted;
  }

  isPaused(): boolean {
    return this.audio.paused;
  }

  async setPlaybackRate(rate: number) {
    // Validate range
    if (!Number.isNaN(rate) && rate >= 0.5 && rate <= 5) {
      this.audio.playbackRate = rate;
      this.audio.defaultPlaybackRate = rate;
      this.effects.setBaseRate(rate);
      this.emitStateChange();
      await ConfigBridge.set('audio_playback_rate', rate);
    } else {
      this.audio.playbackRate = 1.0;
      this.audio.defaultPlaybackRate = 1.0;
      this.effects.setBaseRate(1);
      this.emitStateChange();
      await ConfigBridge.set('audio_playback_rate', null);
    }
  }

  getPlaybackRate(): number {
    return this.audio.playbackRate;
  }

  // ============================================================================
  // Effects (reverb + slowed playback)
  // ============================================================================

  /** The effects controller owning the Web Audio graph around `audio`. */
  getEffects(): EffectsController {
    return this.effects;
  }

  /** Applies a partial effects settings patch (used by the future UI). */
  setEffectsConfig(patch: Partial<EffectsConfig>): void {
    this.effects.setConfig(patch);
    this.emitStateChange();
  }

  /** Current normalized effects settings. */
  getEffectsConfig(): EffectsConfig {
    return this.effects.getConfig();
  }

  // ============================================================================
  // A-B section loop
  // ============================================================================

  /**
   * Current A-B loop snapshot for the loaded track. Stable to use with
   * `useSyncExternalStore` together with {@link subscribeAbLoop}.
   */
  getAbLoop(): AbLoopState {
    return {
      trackId: this.abTrackId,
      enabled: this.abEnabled,
      active: this.abEnabled && (this.abStart !== null || this.abEnd !== null),
      startSeconds: this.abStart,
      endSeconds: this.abEnd,
    };
  }

  /**
   * Subscribes to A-B loop state changes; returns an unsubscribe function.
   * Follows the same contract as a `useSyncExternalStore` subscription.
   */
  subscribeAbLoop(listener: (state: AbLoopState) => void): () => void {
    this.on('abLoopChange', listener);
    return () => {
      this.off('abLoopChange', listener);
    };
  }

  /**
   * Sets the A (start) or B (end) point, in seconds, and persists the region
   * for the current track. Setting a point arms the loop and starts ticking
   * when playing.
   */
  async setAbPoint(point: 'A' | 'B', seconds: number): Promise<void> {
    if (!Number.isFinite(seconds) || seconds < 0) return;
    const track = this.getTrack();
    if (track === null) return;

    if (point === 'A') {
      this.abStart = seconds;
    } else {
      this.abEnd = seconds;
    }
    if (this.abTrackId !== track.id) {
      // A region is being authored for a track whose saved region has not
      // finished hydrating; claim it and invalidate the in-flight load.
      this.abApplyToken += 1;
      this.abTrackId = track.id;
    }

    if (isLoopEngaged(this.abLoopState()) && !this.audio.paused) {
      this.startAbTicker();
    } else if (!isLoopEngaged(this.abLoopState())) {
      this.stopAbTicker();
    }
    this.emitAbLoopChange();

    try {
      await bridgeDatabase.setAbLoop(track.id, this.abStart, this.abEnd);
    } catch (error) {
      logAndNotifyError(error);
    }
  }

  /**
   * Clears the A-B loop for the current track: stops looping, resets the
   * points, and removes the persisted region.
   */
  async clearAbLoop(): Promise<void> {
    const track = this.getTrack();
    this.abStart = null;
    this.abEnd = null;
    this.stopAbTicker();
    this.emitAbLoopChange();

    if (track === null) return;
    try {
      await bridgeDatabase.clearAbLoop(track.id);
    } catch (error) {
      logAndNotifyError(error);
    }
  }

  /**
   * Enables or disables A-B looping (persisted as `audio_ab_enabled`). The
   * region itself is kept; disabling only stops it from driving playback.
   */
  async setAbEnabled(enabled: boolean): Promise<void> {
    this.abEnabled = enabled;
    if (!enabled) {
      this.stopAbTicker();
    } else if (!this.audio.paused) {
      this.startAbTicker();
    }
    this.emitAbLoopChange();
    await ConfigBridge.set('audio_ab_enabled', enabled);
  }

  /** The loop state in the engine's own terms (no track/config metadata). */
  private abLoopState(): LoopState {
    return {
      active: this.abEnabled && (this.abStart !== null || this.abEnd !== null),
      startSeconds: this.abStart,
      endSeconds: this.abEnd,
    };
  }

  /**
   * Loads the persisted region for `track` and auto-applies it: arms the loop,
   * seeks to A, and starts ticking immediately (no user action required).
   */
  private async hydrateAbLoop(track: Track): Promise<void> {
    const token = ++this.abApplyToken;
    this.abTrackId = track.id;
    this.abStart = null;
    this.abEnd = null;
    this.stopAbTicker();
    this.emitAbLoopChange();

    let saved: AbLoop | null = null;
    try {
      saved = await bridgeDatabase.getAbLoop(track.id);
    } catch (error) {
      logAndNotifyError(error);
      return;
    }

    if (token !== this.abApplyToken) return; // track changed while loading
    if (saved === null) return;

    this.abStart = saved.start_seconds;
    this.abEnd = saved.end_seconds;
    this.emitAbLoopChange();
    this.applyArmedAbLoop();
  }

  /** Seeks to A and starts the ticker if playback is already running. */
  private applyArmedAbLoop(): void {
    const loop = this.abLoopState();
    if (!isLoopEngaged(loop)) {
      this.stopAbTicker();
      return;
    }
    const start = resolveEndSeekTarget(loop, this.audio.duration);
    if (start !== null) this.seekAudio(start);
    if (!this.audio.paused) this.startAbTicker();
  }

  private startAbTicker(): void {
    if (this.abTicker !== null) return;
    if (!isLoopEngaged(this.abLoopState())) return;
    this.abTicker = setInterval(() => {
      this.tickAbLoop();
    }, AB_TICK_MS);
  }

  private stopAbTicker(): void {
    if (this.abTicker === null) return;
    clearInterval(this.abTicker);
    this.abTicker = null;
  }

  /** Seeks back to A once the playhead has crossed the loop's end threshold. */
  private tickAbLoop(): void {
    if (this.audio.paused || !this.abEnabled) return;
    const target = resolveSeekTarget(this.abLoopState(), {
      currentTime: this.audio.currentTime,
      duration: this.audio.duration,
      paused: this.audio.paused,
      seeking: this.audio.seeking,
    });
    if (target !== null) this.seekAudio(target);
  }

  /**
   * Writes `currentTime` now when the element has metadata, otherwise once
   * `loadedmetadata` fires (the fast path is the normal one).
   */
  private seekAudio(target: number): void {
    if (!Number.isFinite(target) || target < 0) return;
    if (this.audio.readyState >= 1) {
      try {
        this.audio.currentTime = target;
      } catch {
        // Not seekable yet; fall through to the metadata retry.
      }
      return;
    }
    this.audio.addEventListener(
      'loadedmetadata',
      () => {
        try {
          this.audio.currentTime = target;
        } catch {
          // Give up silently; the ticker retries while armed.
        }
      },
      { once: true },
    );
  }

  private emitAbLoopChange(): void {
    this.emit('abLoopChange', this.getAbLoop());
    this.emitStateChange();
  }
}

export type PlayerInstance = InstanceType<typeof Player>;

/**
 * Create and export singleton player instance
 */
const playerInstance = new Player({
  volume: ConfigBridge.getInitial('audio_volume'),
  playbackRate: ConfigBridge.getInitial('audio_playback_rate') ?? 1,
  muted: ConfigBridge.getInitial('audio_muted'),
  repeat: ConfigBridge.getInitial('audio_repeat'),
  shuffle: ConfigBridge.getInitial('audio_shuffle'),
});

export default playerInstance;

// Expose for debugging
window.__MUSEEKS_PLAYER = playerInstance;

// Dev-only handle for silent, numeric verification of the effects layer
// (mirrors `__MUSEEKS_PLAYER`). Not present in production builds.
if (import.meta.env.DEV) {
  window.__MUSEEKS_EFFECTS = {
    controller: playerInstance.getEffects(),
    EffectsController,
    convertFileSrc,
  };
}
