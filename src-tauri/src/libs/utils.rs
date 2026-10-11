/**
 * Small utility to display time metrics with a log message
 */
use log::info;
use std::path::{Path, PathBuf};
use std::{ffi::OsStr, time::Instant};
use tauri::Theme;
use walkdir::WalkDir;

use crate::plugins::config::SYSTEM_THEME;

/**
 * Small helper to compute the execution time of some code
 */
pub struct TimeLogger {
    start_time: Instant,
    message: String,
}

impl TimeLogger {
    pub fn new(message: String) -> Self {
        TimeLogger {
            start_time: Instant::now(),
            message,
        }
    }

    pub fn complete(&self) {
        let duration = self.start_time.elapsed();
        info!("{} ({:.2?})", self.message, duration);
    }
}

/**
 * Check if a directory or a file is visible or not, by checking if it start
 * with a dot
 */
fn is_dir_visible(entry: &walkdir::DirEntry) -> bool {
    entry
        .file_name()
        .to_str()
        .map(|s| !s.starts_with("."))
        .unwrap_or(false)
}

/**
 * Take an entry and filter out non-allowed extensions
 */
pub fn is_file_valid(path: &Path, allowed_extensions: &[&str]) -> bool {
    let extension = path
        .extension()
        .and_then(OsStr::to_str)
        .unwrap_or("")
        .to_lowercase();
    allowed_extensions.contains(&extension.as_str())
}

/**
 * Scan multiple directories and filter files by extension
 */
pub fn scan_dirs(paths: &[PathBuf], allowed_extensions: &[&str]) -> Vec<PathBuf> {
    paths
        .iter()
        .flat_map(|path| scan_dir(path, allowed_extensions))
        .collect()
}

/**
 * Scan directory and filter files by extension
 */
pub fn scan_dir(path: &PathBuf, allowed_extensions: &[&str]) -> Vec<PathBuf> {
    WalkDir::new(path)
        .follow_links(true)
        .into_iter()
        .filter_entry(is_dir_visible)
        .filter_map(Result::ok)
        .map(|entry| entry.into_path())
        .filter(|path| is_file_valid(path, allowed_extensions))
        .collect()
}

/**
 * Give an arbitrary string (usually the theme value from the config), returns
 * a Tauri theme
 */
pub fn get_theme_from_name(theme_name: &str) -> Option<Theme> {
    match theme_name {
        "light" => Some(Theme::Light),
        "dark" => Some(Theme::Dark),
        SYSTEM_THEME => None,
        _ => None, // ? :]
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn uppercase_extensions_are_imported() {
        // Files arrive with any casing (`Song.MP3`, `Album.JPG`) while every
        // entry in `SUPPORTED_TRACKS_EXTENSIONS` is lowercase: the lookup
        // must be case-insensitive or those files are silently skipped.
        assert!(is_file_valid(&PathBuf::from("Song.MP3"), &["mp3"]));
        assert!(is_file_valid(&PathBuf::from("Album.JPG"), &["jpg"]));
        assert!(is_file_valid(&PathBuf::from("track.FlAc"), &["flac"]));
        assert!(!is_file_valid(&PathBuf::from("notes.txt"), &["mp3"]));
    }
}
