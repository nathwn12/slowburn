use lofty::config::ParseOptions;
use lofty::file::{AudioFile, FileType, TaggedFileExt};
use lofty::probe::Probe;
use lofty::tag::{Accessor, ItemKey};
use log::{debug, warn};
use rayon::iter::IntoParallelRefIterator;
use rayon::iter::ParallelIterator;
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};
use ts_rs::TS;
use uuid::Uuid;

use crate::libs::database::SUPPORTED_TRACKS_EXTENSIONS;
use crate::libs::error::{AnyResult, MuseeksError};
use crate::libs::utils::is_file_valid;

/**
 * Track
 * represent a single track, id and path should be unique
 */
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, FromRow, TS)]
#[ts(export, export_to = "../../src/generated/typings.ts")]
pub struct Track {
    pub id: String,
    pub path: String, // must be unique, ideally, a PathBuf
    pub title: String,
    pub album: String,
    pub album_artist: String,
    #[sqlx(json)]
    pub artists: Vec<String>, // JSON
    #[sqlx(json)]
    pub genres: Vec<String>, // JSON
    pub year: Option<u16>,
    pub duration: u32,
    pub track_no: Option<u32>,
    pub track_of: Option<u32>,
    pub disk_no: Option<u32>,
    pub disk_of: Option<u32>,
    pub is_compilation: bool,
    // --- Source metadata (migration 05) ---
    /// Lowercase source format ("flac", "mp3", "m4a", ...), never empty: the
    /// `'unknown'` sentinel is used when nothing can be detected.
    pub format: String,
    /// Derived from `format`. SQLite has no native boolean, so this is stored
    /// as INTEGER 0/1 at the database boundary.
    pub is_lossless: bool,
    /// Sample rate in Hz, `None` when genuinely unknown (never a fake `0`).
    pub sample_rate: Option<u32>,
    /// Bits per sample, `None` for lossy formats (never a fake `0`).
    pub bit_depth: Option<u8>,
    /// Channel count, `None` when unknown.
    pub channels: Option<u8>,
    /// Bitrate in bits per second, `None` when unknown.
    pub bitrate: Option<u32>,
    /// File size in bytes (via `std::fs::metadata`), `None` when stat failed.
    /// Pinned to `number` in the TS contract: Tauri serializes it as a JSON
    /// number, and ts-rs would otherwise emit `bigint` for `u64`.
    #[ts(type = "number | null")]
    pub file_size: Option<u64>,
    /// ISO-8601 UTC. Set at insert time; for rows predating migration 05 this
    /// holds the (approximate) time the migration ran.
    pub date_added: String,
    /// Number of completed plays. Written only by `record_play`, never by a
    /// scan or a metadata refresh.
    pub play_count: u32,
    /// ISO-8601 UTC of the last completed play, `None` when never played.
    pub last_played: Option<String>,
}

/**
 * Represents a group of tracks, grouped by "something", lib artist name, or
 * album name
 */
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/generated/typings.ts")]
pub struct TrackGroup {
    pub label: String,
    pub genres: Vec<String>,
    pub duration: u32,
    pub year: Option<u16>,
    pub tracks: Vec<Track>,
}

/**
 * Map a lofty `FileType` to the canonical lowercase format string stored in
 * `Track::format`. lofty's own `Debug`/name output ("Mpeg", "Mp4") is not the
 * user-facing format name, so map explicitly. `Custom` file types fall through
 * to `None` so the caller can use the file extension instead.
 */
fn format_from_file_type(file_type: FileType) -> Option<&'static str> {
    match file_type {
        FileType::Aac => Some("aac"),
        FileType::Aiff => Some("aiff"),
        FileType::Ape => Some("ape"),
        FileType::Flac => Some("flac"),
        FileType::Mpeg => Some("mp3"),
        FileType::Mp4 => Some("m4a"),
        FileType::Mpc => Some("mpc"),
        FileType::Opus => Some("opus"),
        FileType::Vorbis => Some("ogg"),
        FileType::Speex => Some("speex"),
        FileType::Wav => Some("wav"),
        FileType::WavPack => Some("wavpack"),
        FileType::Custom(_) => None,
        _ => None,
    }
}

/**
 * Whether a canonical format string denotes a lossless codec.
 *
 * Kept in one place so it can be extended when lofty starts reporting a new
 * lossless variant. Note that lofty reports ALAC-in-MP4 as `m4a` and cannot
 * currently distinguish it from lossy AAC, so ALAC files are reported lossy.
 */
fn is_lossless_format(format: &str) -> bool {
    matches!(format, "flac" | "alac" | "wav" | "wave" | "aiff" | "aif")
}

/**
 * Current UTC time formatted as ISO-8601 with milliseconds, e.g.
 * `2026-10-05T09:19:29.741Z`.
 *
 * Implemented on top of `std::time` so no new time dependency is introduced;
 * the format matches the migration-05 `strftime('%Y-%m-%dT%H:%M:%fZ','now')`
 * used for pre-existing rows.
 */
pub fn now_iso8601_utc() -> String {
    let elapsed = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    let secs = elapsed.as_secs() as i64;
    let millis = elapsed.subsec_millis();

    let days = secs.div_euclid(86_400);
    let secs_of_day = secs.rem_euclid(86_400);
    let (year, month, day) = civil_from_days(days);
    let hour = secs_of_day / 3_600;
    let minute = (secs_of_day % 3_600) / 60;
    let second = secs_of_day % 60;

    format!(
        "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}.{:03}Z",
        year, month, day, hour, minute, second, millis
    )
}

/**
 * Convert days since the Unix epoch to a (year, month, day) civil date.
 * Howard Hinnant's `civil_from_days` algorithm (public domain).
 */
fn civil_from_days(days: i64) -> (i64, u32, u32) {
    let z = days + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = (z - era * 146_097) as u64; // [0, 146096]
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365; // [0, 399]
    let year = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100); // [0, 365]
    let mp = (5 * doy + 2) / 153; // [0, 11]
    let day = (doy - (153 * mp + 2) / 5 + 1) as u32; // [1, 31]
    let month = if mp < 10 { mp + 3 } else { mp - 9 } as u32; // [1, 12]
    (if month <= 2 { year + 1 } else { year }, month, day)
}

/**
 * Generate a Track struct from a Path, or nothing if it is not a valid audio
 * file
 */
pub fn get_track_from_file(path: &PathBuf) -> AnyResult<Track> {
    match Probe::open(path)
        .map_err(lofty::error::LoftyError::from)
        .and_then(|p| p.options(ParseOptions::new().read_cover_art(false)).read())
    {
        Ok(tagged_file) => {
            let tag = tagged_file.primary_tag().ok_or_else(|| {
                warn!("No tags found for file {:?}", path);
                MuseeksError::ID3NoTags(path.clone())
            })?;

            // Lots of tags are missing eaither TrackArtist or AlbumArtist, so instead
            // of being correct, we'll swap them if needed.
            // IMPROVE ME: Is there a more idiomatic way of doing the following?
            let mut artists: Vec<String> = tag
                .get_strings(ItemKey::TrackArtist)
                .map(ToString::to_string)
                .filter(|s| !s.is_empty())
                .collect();

            if artists.is_empty() {
                artists = tag
                    .get_strings(ItemKey::AlbumArtist)
                    .map(ToString::to_string)
                    .filter(|s| !s.is_empty())
                    .collect();
            }

            if artists.is_empty() {
                artists = vec!["Unknown Artist".into()];
            }

            // Try AlbumArtist, fallback to first artist, then to "Unknown Artist"
            let album_artist = tag
                .get_string(ItemKey::AlbumArtist)
                .map(ToString::to_string)
                .or_else(|| artists.first().cloned())
                .filter(|s| !s.is_empty())
                .unwrap_or_else(|| "Unknown Artist".to_string());

            let id = get_track_id_for_path(path)?;

            let is_compilation = tag
                .get_string(ItemKey::FlagCompilation)
                .map_or(false, |v| v == "1" || v.eq_ignore_ascii_case("true"));

            // --- Source metadata -------------------------------------------------
            let properties = tagged_file.properties();

            let format = format_from_file_type(tagged_file.file_type())
                .map(str::to_owned)
                .or_else(|| {
                    path.extension()
                        .and_then(|ext| ext.to_str())
                        .map(str::to_ascii_lowercase)
                        .filter(|ext| !ext.is_empty())
                })
                .unwrap_or_else(|| "unknown".to_string());

            let is_lossless = is_lossless_format(&format);

            // lofty reports bitrate in kbps; the column contract is bits per
            // second, so convert here (0 stays None-distinguishable by the Option).
            let bitrate = properties
                .overall_bitrate()
                .or_else(|| properties.audio_bitrate())
                .map(|kbps| kbps.saturating_mul(1000));

            // File size is not an audio property: stat it. A failure only means
            // an unknown size, never a failed scan.
            let file_size = match std::fs::metadata(path) {
                Ok(metadata) => Some(metadata.len()),
                Err(err) => {
                    debug!("Could not stat file size for {:?}: {}", path, err);
                    None
                }
            };

            // ReplayGain is logged only for now; promoting it to columns/UI is a
            // separate change (see metadata plan §9).
            if let Some(gain) = tag.get_string(ItemKey::ReplayGainTrackGain) {
                debug!("ReplayGain track gain for {:?}: {}", path, gain);
            }
            if let Some(gain) = tag.get_string(ItemKey::ReplayGainAlbumGain) {
                debug!("ReplayGain album gain for {:?}: {}", path, gain);
            }

            Ok(Track {
                id,
                path: path.to_string_lossy().into_owned(),
                title: tag
                    .get_string(ItemKey::TrackTitle)
                    .filter(|s| !s.is_empty())
                    .map(ToString::to_string)
                    .unwrap_or_else(|| {
                        path.file_name()
                            .and_then(|f| f.to_str())
                            .unwrap_or("Unknown")
                            .to_string()
                    }),
                album: tag
                    .get_string(ItemKey::AlbumTitle)
                    .filter(|s| !s.is_empty())
                    .map(ToString::to_string)
                    .unwrap_or_else(|| "Unknown".to_string()),
                album_artist,
                artists,
                genres: tag
                    .get_strings(ItemKey::Genre)
                    .map(ToString::to_string)
                    .filter(|s| !s.is_empty())
                    .collect(),
                year: tag.date().map(|d| d.year),
                duration: u32::try_from(properties.duration().as_secs()).unwrap_or(0),
                track_no: tag.track(),
                track_of: tag.track_total(),
                disk_no: tag.disk(),
                disk_of: tag.disk_total(),
                is_compilation,
                format,
                is_lossless,
                sample_rate: properties.sample_rate(),
                bit_depth: properties.bit_depth(),
                channels: properties.channels(),
                bitrate,
                file_size,
                date_added: now_iso8601_utc(),
                play_count: 0,
                last_played: None,
            })
        }
        Err(err) => {
            warn!("Failed to get ID3 tags: \"{}\". File {:?}", err, path);
            Err(MuseeksError::Lofty(err))
        }
    }
}

/**
 * Generate an ID for a track based on its location.
 *
 * We leverage UUID v3 on tracks paths to easily retrieve tracks by path.
 * This is not great and ideally we should use a DB view instead. One day.
 */
pub fn get_track_id_for_path(path: &PathBuf) -> AnyResult<String> {
    match std::fs::canonicalize(path) {
        Ok(canonicalized_path) => Ok(Uuid::new_v3(
            &Uuid::NAMESPACE_OID,
            canonicalized_path.to_string_lossy().as_bytes(),
        )
        .to_string()),
        Err(err) => {
            warn!(r#"ID could not be generated for path {:?}: {}"#, path, err);
            Err(MuseeksError::IDGeneration(path.clone()))
        }
    }
}

/**
 * Given a list of files, return a potential list of tracks
 */
pub fn get_tracks_from_paths(mut files: Vec<PathBuf>) -> Vec<AnyResult<Track>> {
    files.retain(|path| is_file_valid(path, &SUPPORTED_TRACKS_EXTENSIONS));

    // Build a list of tracks, without importing them to the library
    files
        .par_iter()
        .map(get_track_from_file)
        .collect::<Vec<_>>()
}
