import type {
  AbLoop,
  Playlist,
  ScanResult,
  Track,
  TrackGroup,
} from '../../generated/typings';
import type { DatabaseBridgeInterface } from '../bridge-database';

// Thank you Pixabay for the copyright-free tracks
const MOCK_TRACKS: Array<Track> = [
  {
    id: '0',
    title: 'Whiskey Blues',
    artists: ['Captain_Sleepy'],
    album: 'Another Album',
    duration: 300,
    album_artist: 'Captain_Sleepy',
    year: 2025,
    disk_no: 1,
    disk_of: 1,
    track_no: 1,
    track_of: 1,
    genres: ['rock', 'blues'],
    path: '/whiskey-blues.mp3',
    is_compilation: false,
    format: 'mp3',
    is_lossless: false,
    sample_rate: 44100,
    bit_depth: null,
    channels: 2,
    bitrate: 320000,
    file_size: null,
    modified: null,
    date_added: '2026-01-01T00:00:00Z',
    play_count: 0,
    last_played: null,
  },
  {
    id: '1',
    title: 'Majestic Blues',
    artists: ['Desicomix07'],
    album: 'Pixabay',
    duration: 300,
    album_artist: 'Desicomix07',
    year: 2025,
    disk_no: 1,
    disk_of: 1,
    track_no: 1,
    track_of: 2,
    genres: ['blues'],
    path: '/majestic-blues.mp3',
    is_compilation: false,
    format: 'mp3',
    is_lossless: false,
    sample_rate: 44100,
    bit_depth: null,
    channels: 2,
    bitrate: 320000,
    file_size: null,
    modified: null,
    date_added: '2026-01-01T00:00:00Z',
    play_count: 0,
    last_played: null,
  },
  {
    id: '2',
    title: 'Romantic Blues',
    artists: ['Jean-Paul-V'],
    album: 'Pixabay',
    duration: 300,
    album_artist: 'Jean-Paul-V',
    year: 2025,
    disk_no: 1,
    disk_of: 1,
    track_no: 2,
    track_of: 2,
    genres: ['blues'],
    path: '/romantic-blues.mp3',
    is_compilation: false,
    format: 'mp3',
    is_lossless: false,
    sample_rate: 44100,
    bit_depth: null,
    channels: 2,
    bitrate: 320000,
    file_size: null,
    modified: null,
    date_added: '2026-01-01T00:00:00Z',
    play_count: 0,
    last_played: null,
  },
];

// Module-level mock state lives on `globalThis` (like the AB-loop store,
// recorded plays, and scan-failure hooks below) so every test hook observes
// the same library even when the mock module is instantiated more than once
// (e.g. direct import vs `vi.doMock` redirect).
type MockLibraryHolder = typeof globalThis & {
  __MUSEEKS_MOCK_TRACKS?: Array<Track>;
};

function trackStore(): Array<Track> {
  const holder = globalThis as MockLibraryHolder;
  holder.__MUSEEKS_MOCK_TRACKS ??= [];
  return holder.__MUSEEKS_MOCK_TRACKS;
}

/** Test hook: restore the mock library to its initial empty state. */
export function resetMockLibrary(): void {
  (globalThis as MockLibraryHolder).__MUSEEKS_MOCK_TRACKS = [];
}

class DatabaseBridge implements DatabaseBridgeInterface {
  async getAllTracks(): Promise<Array<Track>> {
    return trackStore();
  }

  async getTracks(trackIDs: Array<string>): Promise<Array<Track>> {
    return trackStore().filter((track) => trackIDs.includes(track.id));
  }

  async updateTrack(_track: Track): Promise<Track> {
    return {} as Track;
  }

  async recordPlay(trackID: string): Promise<void> {
    const holder = globalThis as typeof globalThis & {
      __MUSEEKS_MOCK_RECORD_PLAYS?: Set<string>;
    };
    holder.__MUSEEKS_MOCK_RECORD_PLAYS ??= new Set<string>();
    holder.__MUSEEKS_MOCK_RECORD_PLAYS.add(trackID);
  }

  async removeTracks(_trackIDs: Array<string>): Promise<void> {
    return;
  }

  async importTracks(
    _importPaths: Array<string>,
    _refresh = false,
  ): Promise<ScanResult> {
    (globalThis as MockLibraryHolder).__MUSEEKS_MOCK_TRACKS = MOCK_TRACKS;

    return {
      playlist_count: 0,
      track_count: 0,
      playlist_failures: 0,
      // Tests can force dropped files to prove the scan-failure warning.
      track_failures:
        (
          globalThis as typeof globalThis & {
            __MUSEEKS_MOCK_SCAN_FAILURES?: number;
          }
        ).__MUSEEKS_MOCK_SCAN_FAILURES ?? 0,
    };
  }

  async getAllArtists(): Promise<Array<string>> {
    return [];
  }

  async getArtistTracks(_artist: string): Promise<Array<TrackGroup>> {
    return [];
  }

  async hasCompilations(): Promise<boolean> {
    return false;
  }

  async getCompilationAlbums(): Promise<Array<TrackGroup>> {
    return [];
  }

  async getAllPlaylists(): Promise<Array<Playlist>> {
    return [];
  }

  async getPlaylist(_id: string): Promise<Playlist> {
    return {
      id: '0',
      name: 'test playlist',
      tracks: [],
      import_path: null,
    };
  }

  async createPlaylist(_name: string, _ids: Array<string>): Promise<Playlist> {
    return this.getPlaylist('0');
  }

  async renamePlaylist(_id: string, _name: string): Promise<Playlist> {
    return this.getPlaylist('0');
  }

  async setPlaylistTracks(
    _id: string,
    _tracks: Array<string>,
  ): Promise<Playlist> {
    return this.getPlaylist('0');
  }

  async exportPlaylist(_id: string): Promise<void> {
    return;
  }

  async deletePlaylist(_id: string): Promise<void> {
    return;
  }

  // The A-B loop store lives on `globalThis` so the mock can model a full
  // restart: a test can reset the module registry / reload the page and the
  // regions are still there, exactly like the SQLite-backed real bridge.
  async getAbLoop(trackID: string): Promise<AbLoop | null> {
    const store = abLoopStore();
    return store.get(trackID) ?? null;
  }

  async setAbLoop(
    trackID: string,
    startSeconds: number | null,
    endSeconds: number | null,
  ): Promise<AbLoop | null> {
    const store = abLoopStore();
    if (startSeconds === null && endSeconds === null) {
      store.delete(trackID);
      return null;
    }
    const region: AbLoop = {
      track_id: trackID,
      start_seconds: startSeconds,
      end_seconds: endSeconds,
    };
    store.set(trackID, region);
    return region;
  }

  async clearAbLoop(trackID: string): Promise<void> {
    abLoopStore().delete(trackID);
  }

  async reset(): Promise<void> {
    return;
  }
}

function abLoopStore(): Map<string, AbLoop> {
  const holder = globalThis as typeof globalThis & {
    __MUSEEKS_MOCK_AB_LOOPS?: Map<string, AbLoop>;
  };
  holder.__MUSEEKS_MOCK_AB_LOOPS ??= new Map<string, AbLoop>();
  return holder.__MUSEEKS_MOCK_AB_LOOPS;
}

export default new DatabaseBridge();
