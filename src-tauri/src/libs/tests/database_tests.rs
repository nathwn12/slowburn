use sqlx::sqlite::SqliteConnectOptions;
use sqlx::{Connection, SqliteConnection, sqlite};
use std::path::{Path, PathBuf};

use super::database::DB;
use super::track::{Track, get_track_id_for_path};

/** ----------------------------------------------------------------------------
 * Test data
 * -------------------------------------------------------------------------- */

fn sample_track_1() -> Track {
    Track {
        id: "1".to_string(),
        path: "/music/artist1/album1/track1.mp3".to_string(),
        title: "Song One".to_string(),
        album: "Album One".to_string(),
        album_artist: "Artist One".to_string(),
        artists: vec!["Artist One".to_string()],
        genres: vec!["Pop".to_string(), "Rock".to_string()],
        year: Some(2023),
        duration: 210,
        track_no: Some(1),
        track_of: Some(10),
        disk_no: Some(1),
        disk_of: Some(1),
        is_compilation: false,
        format: "mp3".to_string(),
        is_lossless: false,
        sample_rate: Some(44100),
        bit_depth: None,
        channels: Some(2),
        bitrate: Some(320000),
        file_size: Some(4_096),
        date_added: "2024-01-02T03:04:05.000Z".to_string(),
        play_count: 0,
        last_played: None,
    }
}

fn sample_track_2() -> Track {
    Track {
        id: "2".to_string(),
        path: "/music/artist2/album2/track2.mp3".to_string(),
        title: "Song Two".to_string(),
        album: "Album Two".to_string(),
        album_artist: "Artist Two".to_string(),
        artists: vec!["Artist Two".to_string()],
        genres: vec!["Jazz".to_string()],
        year: None,
        duration: 180,
        track_no: None,
        track_of: None,
        disk_no: None,
        disk_of: None,
        is_compilation: false,
        format: "flac".to_string(),
        is_lossless: true,
        sample_rate: Some(96000),
        bit_depth: Some(24),
        channels: Some(2),
        bitrate: Some(2_500_000),
        file_size: Some(65_536),
        date_added: "2024-02-03T04:05:06.000Z".to_string(),
        play_count: 3,
        last_played: Some("2024-03-04T05:06:07.000Z".to_string()),
    }
}

fn sample_track_3() -> Track {
    Track {
        id: "3".to_string(),
        path: "/music/artist3/album3/track3.mp3".to_string(),
        title: "Song Three".to_string(),
        album: "Album Three".to_string(),
        album_artist: "Artist Three".to_string(),
        artists: vec!["Artist Three".to_string(), "Artist Four".to_string()],
        genres: vec!["Hip-Hop".to_string()],
        year: Some(2022),
        duration: 240,
        track_no: Some(3),
        track_of: Some(12),
        disk_no: Some(1),
        disk_of: Some(2),
        is_compilation: false,
        format: "unknown".to_string(),
        is_lossless: false,
        sample_rate: None,
        bit_depth: None,
        channels: None,
        bitrate: None,
        file_size: None,
        date_added: "2024-03-04T05:06:07.000Z".to_string(),
        play_count: 0,
        last_played: None,
    }
}

async fn get_test_db() -> DB {
    let options = SqliteConnectOptions::new()
        .in_memory(true)
        .auto_vacuum(sqlite::SqliteAutoVacuum::Incremental);

    let mut connection = SqliteConnection::connect_with(&options).await.unwrap();

    sqlx::migrate!("src/migrations")
        .run(&mut connection)
        .await
        .expect("Failed to run migrations");

    DB { connection }
}

/** ----------------------------------------------------------------------------
 * Integration Test - Tracks
 * -------------------------------------------------------------------------- */

#[tokio::test]
async fn test_tracks_db() {
    let mut db = get_test_db().await;

    // Table should be empty by default
    let mut all_tracks = db.get_all_tracks().await.unwrap();
    assert!(all_tracks.is_empty());

    // Testing insertion of tracks in the DB
    db.insert_tracks(vec![sample_track_1(), sample_track_2(), sample_track_3()])
        .await
        .unwrap();
    all_tracks = db.get_all_tracks().await.unwrap();
    assert!(all_tracks.len() == 3);

    // Inserting a track with the same ID should fail
    assert!(db.insert_tracks(vec![sample_track_1()]).await.is_err());

    // DB.get_tracks should return the track ordered by IDs, and ignored inexisting tracks
    let mut tracks = db
        .get_tracks(&vec!["3".to_string(), "2".to_string()])
        .await
        .unwrap();
    assert_eq!(tracks, vec![sample_track_3(), sample_track_2()]);

    // Test update
    let mut track_to_update = sample_track_2();
    track_to_update.title = "Song Two Point Five".to_string();
    db.update_track(track_to_update).await.unwrap();
    tracks = db.get_tracks(&vec!["2".to_string()]).await.unwrap();
    assert_eq!(
        tracks,
        vec![Track {
            id: "2".to_string(),
            path: "/music/artist2/album2/track2.mp3".to_string(),
            title: "Song Two Point Five".to_string(),
            album: "Album Two".to_string(),
            album_artist: "Artist Two".to_string(),
            artists: vec!["Artist Two".to_string()],
            genres: vec!["Jazz".to_string()],
            year: None,
            duration: 180,
            track_no: None,
            track_of: None,
            disk_no: None,
            disk_of: None,
            is_compilation: false,
            format: "flac".to_string(),
            is_lossless: true,
            sample_rate: Some(96000),
            bit_depth: Some(24),
            channels: Some(2),
            bitrate: Some(2_500_000),
            file_size: Some(65_536),
            date_added: "2024-02-03T04:05:06.000Z".to_string(),
            play_count: 3,
            last_played: Some("2024-03-04T05:06:07.000Z".to_string()),
        }]
    );

    // Test deletion
    db.remove_tracks(&vec!["2".to_string()]).await.unwrap();
    all_tracks = db.get_all_tracks().await.unwrap();
    assert_eq!(all_tracks, vec![sample_track_1(), sample_track_3()]);
}

/** ----------------------------------------------------------------------------
 * Integration Test - Playlists
 * -------------------------------------------------------------------------- */

#[tokio::test]
async fn test_playlists_db() {
    let mut db = get_test_db().await;

    // Tables should be empty by default
    let mut all_playlists = db.get_all_playlists().await.unwrap();
    assert!(all_playlists.is_empty());

    let all_tracks = db.get_all_tracks().await.unwrap();
    assert!(all_tracks.is_empty());
    db.insert_tracks(vec![sample_track_1(), sample_track_2(), sample_track_3()])
        .await
        .unwrap();

    // Test insertion + order
    let playlist_a = db
        .create_playlist(
            "Playlist A".to_string(),
            vec![
                sample_track_1().id,
                sample_track_3().id,
                sample_track_2().id,
                sample_track_1().id,
            ],
            Some(PathBuf::from("/tmp/playlist_a".to_string())),
        )
        .await
        .unwrap();
    db.create_playlist("Playlist b".to_string(), vec![], None)
        .await
        .unwrap();

    all_playlists = db.get_all_playlists().await.unwrap();
    assert_eq!(
        all_playlists
            .into_iter()
            .map(|playlist| playlist.name)
            .collect::<Vec<String>>(),
        vec!["Playlist A".to_string(), "Playlist b".to_string()]
    );

    // Test tracks update
    db.set_playlist_tracks(
        &playlist_a.id,
        vec![sample_track_3().id, sample_track_2().id],
    )
    .await
    .unwrap();
    let mut playlist = db.get_playlist(&playlist_a.id).await.unwrap();
    assert!(playlist.is_some());
    assert_eq!(
        playlist.unwrap().tracks,
        vec!["3".to_string(), "2".to_string()]
    );

    // Test rename
    db.rename_playlist(&playlist_a.id, "My Playlist".to_string())
        .await
        .unwrap();
    playlist = db.get_playlist(&playlist_a.id).await.unwrap();
    assert!(playlist.is_some());
    assert_eq!(playlist.unwrap().name, "My Playlist".to_string());

    // Test deletion
    db.delete_playlist(&playlist_a.id).await.unwrap();
    all_playlists = db.get_all_playlists().await.unwrap();
    assert_eq!(
        all_playlists
            .into_iter()
            .map(|playlist| playlist.name)
            .collect::<Vec<String>>(),
        vec!["Playlist b".to_string()]
    );
}

/** ----------------------------------------------------------------------------
 * Integration Test - A-B section loops
 * -------------------------------------------------------------------------- */

#[tokio::test]
async fn test_ab_loops_db() {
    let mut db = get_test_db().await;
    db.insert_tracks(vec![sample_track_1(), sample_track_2()])
        .await
        .unwrap();

    // No region by default
    assert!(db.get_ab_loop("1").await.unwrap().is_none());

    // Upsert a full region
    let region = db
        .set_ab_loop("1", Some(10.5), Some(42.0))
        .await
        .unwrap()
        .unwrap();
    assert_eq!(region.track_id, "1");
    assert_eq!(region.start_seconds, Some(10.5));
    assert_eq!(region.end_seconds, Some(42.0));

    // It round-trips through the database
    let loaded = db.get_ab_loop("1").await.unwrap().unwrap();
    assert_eq!(loaded, region);

    // Upsert overwrites in place (no duplicate rows)
    let updated = db.set_ab_loop("1", Some(5.0), None).await.unwrap().unwrap();
    assert_eq!(updated.start_seconds, Some(5.0));
    assert_eq!(updated.end_seconds, None);
    assert_eq!(db.get_ab_loop("1").await.unwrap().unwrap(), updated);

    // Regions are per track
    assert!(db.get_ab_loop("2").await.unwrap().is_none());

    // Both points `None` is an explicit clear
    assert!(db.set_ab_loop("1", None, None).await.unwrap().is_none());
    assert!(db.get_ab_loop("1").await.unwrap().is_none());

    // Explicit clear command
    db.set_ab_loop("2", Some(1.0), Some(2.0)).await.unwrap();
    db.clear_ab_loop("2").await.unwrap();
    assert!(db.get_ab_loop("2").await.unwrap().is_none());

    // Removing a track removes its region
    db.set_ab_loop("1", Some(1.0), Some(2.0)).await.unwrap();
    db.remove_tracks(&vec!["1".to_string()]).await.unwrap();
    assert!(db.get_ab_loop("1").await.unwrap().is_none());
}

/** ----------------------------------------------------------------------------
 * Integration Test - Track metadata (migration 05)
 * -------------------------------------------------------------------------- */

#[tokio::test]
async fn test_track_metadata_roundtrip() {
    let mut db = get_test_db().await;
    db.insert_tracks(vec![sample_track_1(), sample_track_2(), sample_track_3()])
        .await
        .unwrap();

    // Every new column is written *and* read back, including the honest NULLs
    // and the bool <-> INTEGER 0/1 boundary.
    let tracks = db.get_all_tracks().await.unwrap();
    assert_eq!(tracks.len(), 3);

    let lossy = tracks.iter().find(|t| t.id == "1").unwrap();
    assert_eq!(lossy.format, "mp3");
    assert!(!lossy.is_lossless);
    assert_eq!(lossy.sample_rate, Some(44100));
    assert_eq!(lossy.bit_depth, None); // lossy: honestly unknown, never 0
    assert_eq!(lossy.channels, Some(2));
    assert_eq!(lossy.bitrate, Some(320000));
    assert_eq!(lossy.file_size, Some(4_096));
    assert_eq!(lossy.date_added, "2024-01-02T03:04:05.000Z");
    assert_eq!(lossy.play_count, 0);
    assert_eq!(lossy.last_played, None);

    let lossless = tracks.iter().find(|t| t.id == "2").unwrap();
    assert_eq!(lossless.format, "flac");
    assert!(lossless.is_lossless);
    assert_eq!(lossless.bit_depth, Some(24));
    assert_eq!(lossless.play_count, 3);
    assert_eq!(
        lossless.last_played.as_deref(),
        Some("2024-03-04T05:06:07.000Z")
    );

    let unknown = tracks.iter().find(|t| t.id == "3").unwrap();
    assert_eq!(unknown.format, "unknown");
    assert_eq!(unknown.sample_rate, None); // never a fake 0 Hz
    assert_eq!(unknown.bitrate, None);
}

/**
 * The metadata plan §8.4 verification query, run directly on the connection.
 * Returns (total, unknown_format, null_rate, null_depth, null_size).
 */
async fn metadata_counts(db: &mut DB) -> (i64, i64, i64, i64, i64) {
    sqlx::query_as::<_, (i64, i64, i64, i64, i64)>(
        r#"SELECT
             COUNT(*) AS total,
             SUM(format = 'unknown') AS unknown_format,
             SUM(sample_rate IS NULL) AS null_rate,
             SUM(bit_depth IS NULL) AS null_depth,
             SUM(file_size IS NULL) AS null_size
           FROM tracks"#,
    )
    .fetch_one(&mut db.connection)
    .await
    .unwrap()
}

/**
 * The highest-regret bug class: a metadata refresh clobbering play history.
 * Poison a row's `date_added`/`play_count`/`last_played`, refresh its file
 * metadata through both update paths, assert the history survives.
 */
#[tokio::test]
async fn test_metadata_refresh_preserves_history() {
    let mut db = get_test_db().await;

    let poisoned = Track {
        id: "poisoned".to_string(),
        path: "/music/poisoned.mp3".to_string(),
        format: "unknown".to_string(),
        is_lossless: false,
        sample_rate: None,
        bit_depth: None,
        channels: None,
        bitrate: None,
        file_size: None,
        date_added: "2001-02-03T04:05:06.000Z".to_string(),
        play_count: 41,
        last_played: Some("2020-06-07T08:09:10.000Z".to_string()),
        ..sample_track_1()
    };
    db.insert_tracks(vec![poisoned.clone()]).await.unwrap();

    // A refresh carries fresh file-derived values *and* different history
    // values: the history ones must never reach the database.
    let refreshed = Track {
        format: "flac".to_string(),
        is_lossless: true,
        sample_rate: Some(96000),
        bit_depth: Some(24),
        channels: Some(2),
        bitrate: Some(2_500_000),
        file_size: Some(987_654),
        date_added: "2999-01-01T00:00:00.000Z".to_string(),
        play_count: 0,
        last_played: None,
        ..poisoned.clone()
    };

    // Bulk refresh path (scan with refresh = true).
    db.update_tracks(vec![refreshed.clone()]).await.unwrap();
    let after = db.get_track("poisoned").await.unwrap().unwrap();
    assert_eq!(after.format, "flac");
    assert!(after.is_lossless);
    assert_eq!(after.sample_rate, Some(96000));
    assert_eq!(after.bit_depth, Some(24));
    assert_eq!(after.channels, Some(2));
    assert_eq!(after.bitrate, Some(2_500_000));
    assert_eq!(after.file_size, Some(987_654));
    assert_eq!(after.date_added, "2001-02-03T04:05:06.000Z");
    assert_eq!(after.play_count, 41);
    assert_eq!(
        after.last_played.as_deref(),
        Some("2020-06-07T08:09:10.000Z")
    );
    eprintln!(
        "[refresh] poisoned row survived: date_added={} play_count={} last_played={:?}",
        after.date_added, after.play_count, after.last_played
    );

    // Single-track update path (UI tag edit).
    db.update_track(refreshed).await.unwrap();
    let after = db.get_track("poisoned").await.unwrap().unwrap();
    assert_eq!(after.date_added, "2001-02-03T04:05:06.000Z");
    assert_eq!(after.play_count, 41);
    assert_eq!(
        after.last_played.as_deref(),
        Some("2020-06-07T08:09:10.000Z")
    );
}

#[tokio::test]
async fn test_record_play_increments_atomically() {
    let mut db = get_test_db().await;
    db.insert_tracks(vec![sample_track_1()]).await.unwrap();

    assert_eq!(db.get_track("1").await.unwrap().unwrap().play_count, 0);
    assert_eq!(db.get_track("1").await.unwrap().unwrap().last_played, None);

    db.record_play("1").await.unwrap();
    db.record_play("1").await.unwrap();

    let after = db.get_track("1").await.unwrap().unwrap();
    assert_eq!(after.play_count, 2);
    assert!(after.last_played.is_some());
}

/** Build a minimal but valid ID3v2.3 tag carrying a single TIT2 (title) frame. */
fn id3v2_tag_bytes(title: &str) -> Vec<u8> {
    let text = title.as_bytes();

    // TIT2 frame: id(4) + size u32be + flags u16 + encoding byte + text.
    let frame_data_len = 1 + text.len();
    let mut frame = Vec::new();
    frame.extend_from_slice(b"TIT2");
    frame.extend_from_slice(&(frame_data_len as u32).to_be_bytes());
    frame.extend_from_slice(&[0, 0]); // frame flags
    frame.push(0x00); // ISO-8859-1 encoding
    frame.extend_from_slice(text);

    let body_len = frame.len();
    // Synchsafe 28-bit size.
    let size = [
        ((body_len >> 21) & 0x7F) as u8,
        ((body_len >> 14) & 0x7F) as u8,
        ((body_len >> 7) & 0x7F) as u8,
        (body_len & 0x7F) as u8,
    ];

    let mut tag = Vec::new();
    tag.extend_from_slice(b"ID3");
    tag.extend_from_slice(&[3, 0]); // version 2.3.0
    tag.push(0x00); // flags
    tag.extend_from_slice(&size);
    tag.extend_from_slice(&frame);
    tag
}

/**
 * Write a tiny valid 16/24-bit PCM WAV carrying an ID3v2 title, so it probes
 * through the real `get_track_from_file` path without any audio decode.
 */
fn write_tagged_wav(path: &Path, sample_rate: u32, bit_depth: u16, channels: u16, title: &str) {
    let num_samples = sample_rate / 4; // ~0.25s of silence
    let bytes_per_sample = u32::from(bit_depth / 8);
    let data_len = num_samples * u32::from(channels) * bytes_per_sample;

    let mut chunks = Vec::new();
    // fmt chunk
    chunks.extend_from_slice(b"fmt ");
    chunks.extend_from_slice(&16u32.to_le_bytes());
    chunks.extend_from_slice(&1u16.to_le_bytes()); // PCM
    chunks.extend_from_slice(&channels.to_le_bytes());
    chunks.extend_from_slice(&sample_rate.to_le_bytes());
    let byte_rate = sample_rate * u32::from(channels) * bytes_per_sample;
    chunks.extend_from_slice(&byte_rate.to_le_bytes());
    chunks.extend_from_slice(&(channels * bit_depth / 8).to_le_bytes()); // block align
    chunks.extend_from_slice(&bit_depth.to_le_bytes());
    // data chunk
    chunks.extend_from_slice(b"data");
    chunks.extend_from_slice(&data_len.to_le_bytes());
    chunks.resize(chunks.len() + data_len as usize, 0);
    // id3 chunk (content padded to an even length, as RIFF requires)
    let mut id3 = id3v2_tag_bytes(title);
    if id3.len() % 2 == 1 {
        id3.push(0);
    }
    chunks.extend_from_slice(b"id3 ");
    chunks.extend_from_slice(&(id3.len() as u32).to_le_bytes());
    chunks.extend_from_slice(&id3);

    let mut file = Vec::new();
    file.extend_from_slice(b"RIFF");
    file.extend_from_slice(&((4 + chunks.len()) as u32).to_le_bytes());
    file.extend_from_slice(b"WAVE");
    file.extend_from_slice(&chunks);
    std::fs::write(path, file).unwrap();
}

/**
 * End-to-end metadata backfill over a small throwaway library: rows start at
 * the migration defaults (with poisoned history), a backfill re-probes the
 * real files and refreshes file-derived columns only.
 */
#[tokio::test]
async fn test_metadata_backfill_over_temp_library() {
    let mut db = get_test_db().await;

    let dir = std::env::temp_dir().join(format!("slowburn_meta_test_{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&dir).unwrap();

    let specs: [(&str, u32, u8, u8, &str); 3] = [
        ("one.wav", 44100, 16, 2, "Track One"),
        ("two.wav", 48000, 24, 1, "Track Two"),
        ("three.wav", 22050, 16, 1, "Track Three"),
    ];

    let mut rows = Vec::new();
    for (name, rate, depth, channels, title) in specs {
        let path = dir.join(name);
        write_tagged_wav(&path, rate, depth.into(), channels.into(), title);

        let id = get_track_id_for_path(&path).unwrap();
        rows.push(Track {
            id,
            path: path.to_string_lossy().into_owned(),
            title: "stale title".to_string(),
            album: "Album".to_string(),
            album_artist: "Artist".to_string(),
            artists: vec!["Artist".to_string()],
            genres: vec![],
            year: None,
            duration: 0,
            track_no: None,
            track_of: None,
            disk_no: None,
            disk_of: None,
            is_compilation: false,
            // Simulated pre-migration row: defaults, plus real history.
            format: "unknown".to_string(),
            is_lossless: false,
            sample_rate: None,
            bit_depth: None,
            channels: None,
            bitrate: None,
            file_size: None,
            date_added: "2001-02-03T04:05:06.000Z".to_string(),
            play_count: 7,
            last_played: Some("2020-06-07T08:09:10.000Z".to_string()),
        });
    }
    db.insert_tracks(rows).await.unwrap();

    // §8.4 counts query, before backfill: every row unknown, every
    // file-derived column still NULL (history is present but not counted here).
    let before = metadata_counts(&mut db).await;
    eprintln!(
        "[backfill] before: total={} unknown_format={} null_rate={} null_depth={} null_size={}",
        before.0, before.1, before.2, before.3, before.4
    );
    assert_eq!(before, (3, 3, 3, 3, 3));
    assert_eq!(db.count_tracks_missing_metadata().await.unwrap(), 3);

    let refreshed = db
        .backfill_tracks_metadata(vec![dir.clone()])
        .await
        .unwrap();
    assert_eq!(refreshed, 3);

    // §8.4 counts query, after backfill: formats resolved, sizes known.
    let after = metadata_counts(&mut db).await;
    eprintln!(
        "[backfill] after:  total={} unknown_format={} null_rate={} null_depth={} null_size={}",
        after.0, after.1, after.2, after.3, after.4
    );
    assert_eq!(after, (3, 0, 0, 0, 0));
    assert_eq!(db.count_tracks_missing_metadata().await.unwrap(), 0);

    // The probe produced real metadata, and the history survived.
    for (name, rate, depth, channels, title) in specs {
        let path = dir.join(name);
        let id = get_track_id_for_path(&path).unwrap();
        let track = db.get_track(&id).await.unwrap().unwrap();

        assert_eq!(track.format, "wav");
        assert!(track.is_lossless);
        assert_eq!(track.sample_rate, Some(rate));
        assert_eq!(track.bit_depth, Some(depth));
        assert_eq!(track.channels, Some(channels));
        assert!(track.bitrate.is_some());
        assert!(track.file_size.unwrap() > 0);
        assert_eq!(track.title, title); // tag refreshed from the file
        assert_eq!(track.duration, 0); // ~0.25s truncates to 0 whole seconds

        assert_eq!(track.date_added, "2001-02-03T04:05:06.000Z");
        assert_eq!(track.play_count, 7);
        assert_eq!(
            track.last_played.as_deref(),
            Some("2020-06-07T08:09:10.000Z")
        );
    }

    // Second trigger is a no-op (one-shot).
    assert_eq!(
        db.backfill_tracks_metadata(vec![dir.clone()])
            .await
            .unwrap(),
        0
    );

    let _ = std::fs::remove_dir_all(&dir);
}
