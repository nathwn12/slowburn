use indexmap::IndexMap;
use itertools::Itertools;
use rayon::iter::{IntoParallelRefIterator, ParallelIterator};
use serde::{Deserialize, Serialize};
use serde_json::json;
use sqlx::{Connection, SqliteConnection};
use std::collections::HashSet;
use std::path::PathBuf;
use ts_rs::TS;

use super::error::AnyResult;
use super::playlist::Playlist;
use super::track::{Track, TrackGroup, get_track_from_file, now_iso8601_utc};
use super::utils::scan_dirs;

/// A persisted A-B section loop, at most one per track.
///
/// `track_id` is the stable track id (UUID v3 derived from the file path), so a
/// saved region survives library rescans and app restarts. Either point may be
/// `None` (unset); at least one point is always set in the database.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, sqlx::FromRow, TS)]
#[ts(export, export_to = "../../src/generated/typings.ts")]
pub struct AbLoop {
    pub track_id: String,
    pub start_seconds: Option<f64>,
    pub end_seconds: Option<f64>,
}

// Single source of truth for supported audio formats (extension, MIME type).
// KEEP IN SYNC with Tauri's file associations in tauri.conf.json
pub const SUPPORTED_AUDIO_FORMATS: [(&str, &str); 9] = [
    ("mp3", "audio/mpeg"), /* mp3 / mp4 */
    ("aac", "audio/aac"),
    ("m4a", "audio/mp4"),
    ("3gp", "audio/3gpp"),
    ("wav", "audio/wav"),
    ("ogg", "audio/ogg"), /* Opus */
    ("opus", "audio/opus"),
    ("flac", "audio/flac"), /* Flac */
    ("weba", "audio/webm"), /* Web media */
];

// Derived at compile time from SUPPORTED_AUDIO_FORMATS
pub const SUPPORTED_TRACKS_EXTENSIONS: [&str; 9] = {
    let mut exts = [""; 9];
    let mut i = 0;
    while i < 9 {
        exts[i] = SUPPORTED_AUDIO_FORMATS[i].0;
        i += 1;
    }
    exts
};

pub const SUPPORTED_PLAYLISTS_EXTENSIONS: [&str; 1] = ["m3u"];

/// Get the MIME content type for a supported audio file extension.
pub fn content_type_for_extension(ext: &str) -> Option<&'static str> {
    SUPPORTED_AUDIO_FORMATS
        .iter()
        .find(|(e, _)| *e == ext)
        .map(|(_, ct)| *ct)
}

/** ----------------------------------------------------------------------------
 * Databases
 * exposes databases for tracks and playlists
 * * -------------------------------------------------------------------------- */

pub struct DB {
    pub connection: SqliteConnection,
}

impl DB {
    /**
     * Get only the file paths of all tracks in the database (cheaper than get_all_tracks)
     */
    pub async fn get_all_track_paths(&mut self) -> AnyResult<Vec<String>> {
        let paths = sqlx::query_scalar("SELECT path FROM tracks")
            .fetch_all(&mut self.connection)
            .await?;
        Ok(paths)
    }

    /**
     * Get all the tracks (and their content) from the database
     */
    pub async fn get_all_tracks(&mut self) -> AnyResult<Vec<Track>> {
        let tracks = sqlx::query_as::<_, Track>("SELECT * FROM tracks")
            .fetch_all(&mut self.connection)
            .await?;
        Ok(tracks)
    }

    /**
     * Get tracks (and their content) given a set of document IDs
     */
    pub async fn get_tracks(&mut self, track_ids: &Vec<String>) -> AnyResult<Vec<Track>> {
        if track_ids.is_empty() {
            return Ok(vec![]);
        }

        // Construct `IN` clause with placeholders
        let in_placeholders = track_ids.iter().map(|_| "?").collect::<Vec<_>>().join(", ");

        // Construct `ORDER BY CASE` using bindable expressions like: CASE id WHEN ? THEN 0 ...
        let mut order_by_case = String::from("CASE id ");
        for index in 0..track_ids.len() {
            order_by_case.push_str("WHEN ? THEN ");
            order_by_case.push_str(&index.to_string());
            order_by_case.push(' ');
        }
        order_by_case.push_str("END");

        // Improve me once https://github.com/launchbadge/sqlx/issues/875 is fixed
        let sql = format!(
            "SELECT * FROM tracks WHERE id IN ({}) ORDER BY {}",
            in_placeholders, order_by_case
        );

        // Build query and bind all UUIDs twice (once for IN, once for ORDER BY CASE)
        let mut query = sqlx::query_as::<_, Track>(&sql);

        for id in track_ids {
            query = query.bind(id); // for IN (...)
        }

        for id in track_ids {
            query = query.bind(id); // for ORDER BY CASE
        }

        let tracks = query.fetch_all(&mut self.connection).await?;
        Ok(tracks)
    }

    /**
     * Get a single track by ID
     */
    pub async fn get_track(&mut self, track_id: &str) -> AnyResult<Option<Track>> {
        let track = sqlx::query_as::<_, Track>("SELECT * FROM tracks WHERE id = ?")
            .bind(track_id)
            .fetch_optional(&mut self.connection)
            .await?;

        Ok(track)
    }

    /**
     * Get tracks (and their content) given a set of document IDs
     */
    pub async fn update_track(&mut self, track: Track) -> AnyResult<Track> {
        // NOTE: `date_added`, `play_count` and `last_played` are history, not
        // file metadata: a metadata refresh must never clobber them, so they
        // are deliberately absent from this SET list. `modified` IS file
        // metadata and is refreshed, but through COALESCE so a refresh that
        // could not read the file's mtime keeps the previously-known value
        // instead of erasing it.
        sqlx::query(
            r#"
            UPDATE tracks SET
                path = ?,
                title = ?,
                album = ?,
                album_artist = ?,
                artists = ?,
                genres = ?,
                year = ?,
                duration = ?,
                track_no = ?,
                track_of = ?,
                disk_no = ?,
                disk_of = ?,
                is_compilation = ?,
                format = ?,
                is_lossless = ?,
                sample_rate = ?,
                bit_depth = ?,
                channels = ?,
                bitrate = ?,
                file_size = ?,
                modified = COALESCE(?, modified)
            WHERE id = ?
            "#,
        )
        .bind(&track.path)
        .bind(&track.title)
        .bind(&track.album)
        .bind(&track.album_artist)
        .bind(json!(&track.artists))
        .bind(json!(&track.genres))
        .bind(track.year)
        .bind(track.duration)
        .bind(track.track_no)
        .bind(track.track_of)
        .bind(track.disk_no)
        .bind(track.disk_of)
        .bind(track.is_compilation)
        .bind(&track.format)
        .bind(track.is_lossless)
        .bind(track.sample_rate)
        .bind(track.bit_depth)
        .bind(track.channels)
        .bind(track.bitrate)
        .bind(track.file_size.map(|size| size as i64))
        .bind(track.modified)
        .bind(&track.id)
        .execute(&mut self.connection)
        .await?;

        Ok(track)
    }

    /** Delete multiple tracks by ID */
    pub async fn remove_tracks(&mut self, track_ids: &Vec<String>) -> AnyResult<()> {
        if track_ids.is_empty() {
            return Ok(());
        }

        let placeholders = track_ids.iter().map(|_| "?").collect::<Vec<_>>().join(", ");
        let query = format!("DELETE FROM tracks WHERE id IN ({})", placeholders);

        let mut query_builder = sqlx::query(&query);

        for id in track_ids {
            query_builder = query_builder.bind(id);
        }

        query_builder.execute(&mut self.connection).await?;

        // Regions belong to their track: no track, no region.
        let loops_query = format!("DELETE FROM ab_loops WHERE track_id IN ({})", placeholders);
        let mut loops_builder = sqlx::query(&loops_query);

        for id in track_ids {
            loops_builder = loops_builder.bind(id);
        }

        loops_builder.execute(&mut self.connection).await?;

        Ok(())
    }

    /**
     * Remove rows whose files are confirmed missing under the given import
     * roots.
     *
     * Only directory roots that can be probed right now are reconciled: a
     * root that is not a directory, or whose `read_dir` fails (unmounted
     * partition, permission denied), keeps its rows - the walker's silence
     * under it is not evidence of absence. A row is pruned only when its
     * file's metadata fails with `ErrorKind::NotFound`; permission and other
     * IO errors keep the row. Pruning removes the track and its A-B region
     * (see `remove_tracks`).
     *
     * Returns the number of removed tracks.
     */
    pub async fn remove_missing_files(&mut self, import_paths: &[PathBuf]) -> AnyResult<usize> {
        let readable_roots: Vec<&PathBuf> = import_paths
            .iter()
            .filter(|root| root.is_dir() && std::fs::read_dir(root).is_ok())
            .collect();

        if readable_roots.is_empty() {
            return Ok(0);
        }

        let rows = sqlx::query_as::<_, (String, String)>("SELECT id, path FROM tracks")
            .fetch_all(&mut self.connection)
            .await?;

        let missing_ids: Vec<String> = rows
            .into_iter()
            .filter(|(_, path)| {
                let path = PathBuf::from(path);
                readable_roots.iter().any(|root| path.starts_with(root))
            })
            .filter(|(_, path)| {
                matches!(
                    std::fs::metadata(path),
                    Err(err) if err.kind() == std::io::ErrorKind::NotFound
                )
            })
            .map(|(id, _)| id)
            .collect();

        let removed = missing_ids.len();
        self.remove_tracks(&missing_ids).await?;

        Ok(removed)
    }

    /// Get the saved A-B loop for a track, or `None` when it has none.
    pub async fn get_ab_loop(&mut self, track_id: &str) -> AnyResult<Option<AbLoop>> {
        let loop_region = sqlx::query_as::<_, AbLoop>(
            "SELECT track_id, start_seconds, end_seconds FROM ab_loops WHERE track_id = ?",
        )
        .bind(track_id)
        .fetch_optional(&mut self.connection)
        .await?;

        Ok(loop_region)
    }

    /// Set (upsert) the A-B loop for a track. Setting both points to `None` is
    /// an explicit clear and removes the row, returning `None`.
    pub async fn set_ab_loop(
        &mut self,
        track_id: &str,
        start_seconds: Option<f64>,
        end_seconds: Option<f64>,
    ) -> AnyResult<Option<AbLoop>> {
        if start_seconds.is_none() && end_seconds.is_none() {
            self.clear_ab_loop(track_id).await?;
            return Ok(None);
        }

        sqlx::query(
            r#"
            INSERT INTO ab_loops (track_id, start_seconds, end_seconds)
            VALUES (?, ?, ?)
            ON CONFLICT(track_id) DO UPDATE SET
                start_seconds = excluded.start_seconds,
                end_seconds = excluded.end_seconds
            "#,
        )
        .bind(track_id)
        .bind(start_seconds)
        .bind(end_seconds)
        .execute(&mut self.connection)
        .await?;

        Ok(Some(AbLoop {
            track_id: track_id.to_owned(),
            start_seconds,
            end_seconds,
        }))
    }

    /// Remove the saved A-B loop for a track, if any.
    pub async fn clear_ab_loop(&mut self, track_id: &str) -> AnyResult<()> {
        sqlx::query("DELETE FROM ab_loops WHERE track_id = ?")
            .bind(track_id)
            .execute(&mut self.connection)
            .await?;

        Ok(())
    }

    /**
     * Insert multiple tracks in the DB, will fail in case there is a duplicate
     * unique key (like track.path)
     */
    pub async fn insert_tracks(&mut self, tracks: Vec<Track>) -> AnyResult<()> {
        let mut tx = self.connection.begin().await?;

        for track in tracks {
            sqlx::query(
                r#"
                INSERT INTO tracks (
                    id, path, title, album, album_artist, artists, genres, year,
                    duration, track_no, track_of, disk_no, disk_of, is_compilation,
                    format, is_lossless, sample_rate, bit_depth, channels, bitrate,
                    file_size, modified, date_added, play_count, last_played
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                "#,
            )
            .bind(&track.id)
            .bind(&track.path)
            .bind(&track.title)
            .bind(&track.album)
            .bind(&track.album_artist)
            .bind(json!(&track.artists))
            .bind(json!(&track.genres))
            .bind(track.year)
            .bind(track.duration)
            .bind(track.track_no)
            .bind(track.track_of)
            .bind(track.disk_no)
            .bind(track.disk_of)
            .bind(track.is_compilation)
            .bind(&track.format)
            .bind(track.is_lossless)
            .bind(track.sample_rate)
            .bind(track.bit_depth)
            .bind(track.channels)
            .bind(track.bitrate)
            .bind(track.file_size.map(|size| size as i64))
            .bind(track.modified)
            .bind(&track.date_added)
            .bind(track.play_count)
            .bind(&track.last_played)
            .execute(&mut *tx)
            .await?;
        }

        tx.commit().await?;
        Ok(())
    }

    /**
     * Update a list of tracks in the database by just overriding everything
     */
    pub async fn update_tracks(&mut self, tracks: Vec<Track>) -> AnyResult<()> {
        let mut tx = self.connection.begin().await?;

        for track in tracks {
            // NOTE: this is a metadata/tag refresh. `date_added`, `play_count`
            // and `last_played` are history and are deliberately absent from
            // this SET list so a rescan can never reset them. `modified` is
            // file metadata and is refreshed, via COALESCE so a rescan that
            // cannot read the mtime keeps the previously-known value.
            sqlx::query(
                r#"
                UPDATE tracks SET
                    path = ?,
                    title = ?,
                    album = ?,
                    album_artist = ?,
                    artists = ?,
                    genres = ?,
                    year = ?,
                    duration = ?,
                    track_no = ?,
                    track_of = ?,
                    disk_no = ?,
                    disk_of = ?,
                    is_compilation = ?,
                    format = ?,
                    is_lossless = ?,
                    sample_rate = ?,
                    bit_depth = ?,
                    channels = ?,
                    bitrate = ?,
                    file_size = ?,
                    modified = COALESCE(?, modified)
                WHERE id = ?
                "#,
            )
            .bind(&track.path)
            .bind(&track.title)
            .bind(&track.album)
            .bind(&track.album_artist)
            .bind(json!(&track.artists))
            .bind(json!(&track.genres))
            .bind(track.year)
            .bind(track.duration)
            .bind(track.track_no)
            .bind(track.track_of)
            .bind(track.disk_no)
            .bind(track.disk_of)
            .bind(track.is_compilation)
            .bind(&track.format)
            .bind(track.is_lossless)
            .bind(track.sample_rate)
            .bind(track.bit_depth)
            .bind(track.channels)
            .bind(track.bitrate)
            .bind(track.file_size.map(|size| size as i64))
            .bind(track.modified)
            .bind(&track.id)
            .execute(&mut *tx)
            .await?;
        }

        tx.commit().await?;
        Ok(())
    }

    /**
     * Record one completed play for a track.
     *
     * The increment is a single SQL statement, so concurrent/repeated calls
     * cannot lose an update through a read-modify-write race. `play_count` and
     * `last_played` are written here and nowhere else in production.
     */
    pub async fn record_play(&mut self, track_id: &str) -> AnyResult<()> {
        sqlx::query("UPDATE tracks SET play_count = play_count + 1, last_played = ? WHERE id = ?")
            .bind(now_iso8601_utc())
            .bind(track_id)
            .execute(&mut self.connection)
            .await?;

        Ok(())
    }

    /**
     * Number of tracks still carrying the migration-05 `format = 'unknown'`
     * sentinel, i.e. rows that still need a metadata backfill.
     */
    pub async fn count_tracks_missing_metadata(&mut self) -> AnyResult<i64> {
        let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM tracks WHERE format = 'unknown'")
            .fetch_one(&mut self.connection)
            .await?;

        Ok(count)
    }

    /**
     * One-shot metadata backfill.
     *
     * Re-probes the given library roots and refreshes the file-derived columns
     * of tracks that are already in the database. It is a no-op when no row
     * still has the `'unknown'` format sentinel, so it is safe to trigger on
     * every startup. History columns are never touched (see `update_tracks`).
     * Files that no longer exist or no longer probe are simply skipped here;
     * the scan's missing-file reconciliation (`remove_missing_files`) owns
     * dropping their rows.
     *
     * Returns the number of tracks refreshed.
     */
    pub async fn backfill_tracks_metadata(
        &mut self,
        import_paths: Vec<PathBuf>,
    ) -> AnyResult<usize> {
        if self.count_tracks_missing_metadata().await? == 0 {
            return Ok(0);
        }

        let existing_paths = self
            .get_all_track_paths()
            .await?
            .into_iter()
            .map(PathBuf::from)
            .collect::<HashSet<_>>();

        // Only refresh files already in the library; adding new files is the
        // job of a normal scan.
        let mut track_paths = scan_dirs(&import_paths, &SUPPORTED_TRACKS_EXTENSIONS);
        track_paths.retain(|path| existing_paths.contains(path));

        let tracks = track_paths
            .par_iter()
            .filter_map(|path| get_track_from_file(path).ok())
            .collect::<Vec<Track>>();

        let refreshed = tracks.len();
        self.update_tracks(tracks).await?;

        Ok(refreshed)
    }

    /**
     * Get the list of artists registered in the database, excluding compilation tracks.
     */
    pub async fn get_artists(&mut self) -> AnyResult<Vec<String>> {
        let result: Vec<String> = sqlx::query_scalar(
            "SELECT DISTINCT album_artist
             FROM tracks
             WHERE is_compilation = 0
             ORDER BY
               CASE WHEN upper(substr(album_artist, 1, 1)) BETWEEN 'A' AND 'Z' THEN 0 ELSE 1 END,
               album_artist COLLATE NOCASE;",
        )
        .fetch_all(&mut self.connection)
        .await?;

        Ok(result)
    }

    /**
     * Returns true if any tracks are flagged as compilations.
     */
    pub async fn has_compilations(&mut self) -> AnyResult<bool> {
        let result: bool =
            sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM tracks WHERE is_compilation = 1)")
                .fetch_one(&mut self.connection)
                .await?;

        Ok(result)
    }

    /**
     * Get all tracks for a given artist, excluding compilation tracks.
     */
    pub async fn get_artist_tracks(&mut self, artist: String) -> AnyResult<Vec<TrackGroup>> {
        let tracks = sqlx::query_as::<_, Track>(
            "SELECT * FROM tracks WHERE album_artist = ? AND is_compilation = 0 ORDER BY album, disk_no, track_no",
        )
        .bind(&artist)
        .fetch_all(&mut self.connection)
        .await?;

        let mut groups: IndexMap<String, Vec<Track>> = IndexMap::new();

        for item in tracks {
            groups.entry(item.album.clone()).or_default().push(item);
        }

        let mut track_groups = groups
            .into_iter()
            .map(|(album, tracks)| TrackGroup {
                label: album,
                genres: tracks
                    .iter()
                    .flat_map(|s| &s.genres)
                    .cloned()
                    .unique()
                    .collect(),
                duration: tracks.iter().map(|t| t.duration).sum(),
                year: tracks.first().and_then(|t| t.year),
                tracks,
            })
            .collect::<Vec<TrackGroup>>();

        // Sort by group year, we only use the first track's year and different
        // tracks can have different years. If no year is provided, put the group
        // at the end, as it's probably a library management issue, and we want
        // clean lists!
        track_groups.sort_by_key(|group| group.year.unwrap_or(u16::MAX));

        Ok(track_groups)
    }

    /**
     * Get all compilation albums, grouped by album name, sorted by year.
     */
    pub async fn get_compilation_albums(&mut self) -> AnyResult<Vec<TrackGroup>> {
        let tracks = sqlx::query_as::<_, Track>(
            "SELECT * FROM tracks WHERE is_compilation = 1 ORDER BY album, disk_no, track_no",
        )
        .fetch_all(&mut self.connection)
        .await?;

        let mut groups: IndexMap<String, Vec<Track>> = IndexMap::new();

        for item in tracks {
            groups.entry(item.album.clone()).or_default().push(item);
        }

        let mut track_groups = groups
            .into_iter()
            .map(|(album, tracks)| TrackGroup {
                label: album,
                genres: tracks
                    .iter()
                    .flat_map(|s| &s.genres)
                    .cloned()
                    .unique()
                    .collect(),
                duration: tracks.iter().map(|t| t.duration).sum(),
                year: tracks.first().and_then(|t| t.year),
                tracks,
            })
            .collect::<Vec<TrackGroup>>();

        track_groups.sort_by_key(|group| group.year.unwrap_or(u16::MAX));

        Ok(track_groups)
    }

    /** Get all the playlists (and their content) from the database */
    pub async fn get_all_playlists(&mut self) -> AnyResult<Vec<Playlist>> {
        let mut playlists = sqlx::query_as::<_, Playlist>("SELECT * FROM playlists ORDER BY name")
            .fetch_all(&mut self.connection)
            .await?;

        // Ensure the playlists are sorted alphabetically (case-insensitive) for better UX
        playlists.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));

        Ok(playlists)
    }

    /** Get a single playlist by ID */
    pub async fn get_playlist(&mut self, playlist_id: &String) -> AnyResult<Option<Playlist>> {
        let playlist = sqlx::query_as::<_, Playlist>("SELECT * FROM playlists WHERE id = ?")
            .bind(playlist_id)
            .fetch_optional(&mut self.connection)
            .await?;

        Ok(playlist)
    }

    /** Create a playlist given a name and a set of track IDs */
    pub async fn create_playlist(
        &mut self,
        name: String,
        tracks_ids: Vec<String>,
        import_path: Option<PathBuf>,
    ) -> AnyResult<Playlist> {
        let playlist_path: Option<String> =
            import_path.map(|path| path.to_string_lossy().into_owned());

        let playlist = Playlist {
            id: uuid::Uuid::new_v4().to_string(),
            name,
            tracks: tracks_ids,
            import_path: playlist_path,
        };

        sqlx::query(
            r#"
            INSERT INTO playlists (id, name, tracks, import_path)
            VALUES (?, ?, ?, ?)
            "#,
        )
        .bind(&playlist.id)
        .bind(&playlist.name)
        .bind(json!(&playlist.tracks))
        .bind(&playlist.import_path)
        .execute(&mut self.connection)
        .await?;

        Ok(playlist)
    }

    /** Set the tracks of a playlist given its ID and tracks IDs */
    pub async fn set_playlist_tracks(
        &mut self,
        id: &String,
        tracks: Vec<String>,
    ) -> AnyResult<Playlist> {
        sqlx::query("UPDATE playlists SET tracks = ? WHERE id = ?")
            .bind(json!(&tracks))
            .bind(id)
            .execute(&mut self.connection)
            .await?;

        let playlist = sqlx::query_as::<_, Playlist>("SELECT * FROM playlists WHERE id = ?")
            .bind(id)
            .fetch_one(&mut self.connection)
            .await?;

        Ok(playlist)
    }

    /** Update a playlist name by ID */
    pub async fn rename_playlist(&mut self, id: &String, name: String) -> AnyResult<Playlist> {
        sqlx::query("UPDATE playlists SET name = ? WHERE id = ?")
            .bind(&name)
            .bind(id)
            .execute(&mut self.connection)
            .await?;

        let playlist = sqlx::query_as::<_, Playlist>("SELECT * FROM playlists WHERE id = ?")
            .bind(id)
            .fetch_one(&mut self.connection)
            .await?;

        Ok(playlist)
    }

    /** Delete a playlist by ID */
    pub async fn delete_playlist(&mut self, id: &String) -> AnyResult<()> {
        sqlx::query("DELETE FROM playlists WHERE id = ?")
            .bind(id)
            .execute(&mut self.connection)
            .await?;

        Ok(())
    }
}
