/**
 * Module in charge of persisting and returning the config to/from the filesystem
 */
use home_config::HomeConfig;
use log::info;
use serde::{Deserialize, Serialize};
use std::fmt::Display;
use std::{path::PathBuf, sync::RwLock};
use tauri::plugin::{Builder, TauriPlugin};
use tauri::{Manager, Runtime, State};
use ts_rs::TS;

use crate::libs::error::{AnyResult, MuseeksError};

#[derive(Serialize, Deserialize, Debug, Clone, TS)]
#[ts(export, export_to = "../../src/generated/typings.ts")]
pub enum Repeat {
    All,
    One,
    None,
}

#[derive(Serialize, Deserialize, Debug, Clone, TS)]
#[ts(export, export_to = "../../src/generated/typings.ts")]
pub enum SortBy {
    Artist,
    Album,
    Title,
    Duration,
    Genre,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, TS)]
#[ts(export, export_to = "../../src/generated/typings.ts")]
pub enum SortOrder {
    Asc,
    Dsc,
}

/// A field a track list can be ordered by. Exported camelCase so the TS
/// `SortField` union is real values, not `string`.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, TS)]
#[ts(export, export_to = "../../src/generated/typings.ts")]
#[serde(rename_all = "camelCase")]
pub enum SortField {
    Artist,
    Album,
    Title,
    Duration,
    Genre,
    DiskNo,
    TrackNo,
    PlayCount,
    DateAdded,
    FileModified,
}

/// One entry in the ordered, multi-key sort model: a field plus its own
/// direction. Key order is significant (the first key is the primary sort).
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, TS)]
#[ts(export, export_to = "../../src/generated/typings.ts")]
pub struct SortKey {
    pub field: SortField,
    pub direction: SortOrder,
}

#[derive(Serialize, Deserialize, Debug, Clone, TS)]
#[ts(export, export_to = "../../src/generated/typings.ts")]
pub enum DefaultView {
    Library,
    Artists,
    Playlists,
}

#[derive(Serialize, Deserialize, Debug, Clone, TS)]
#[ts(export, export_to = "../../src/generated/typings.ts")]
#[serde(rename_all = "lowercase")]
pub enum TrackViewDensity {
    Normal,
    Compact,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, TS)]
#[ts(export, export_to = "../../src/generated/typings.ts")]
#[serde(rename_all = "lowercase")]
pub enum UiMode {
    Minimal,
    Full,
    Mini,
}

#[derive(Serialize, Deserialize, Debug, Clone, TS)]
#[ts(export, export_to = "../../src/generated/typings.ts")]
#[serde(default)]
pub struct Config {
    /// Numeric schema stamp driving ordered migrations (take L2-2): every
    /// migration step bumps this, and `migrate` applies each step newer
    /// than the stamped version in order. Legacy files carry no such key,
    /// so the serde default below stamps them `CONFIG_VERSION_LEGACY`
    /// (0) - never current - forcing the full chain to run.
    #[serde(default = "legacy_config_version")]
    pub config_version: u32,
    pub theme: String,
    pub ui_mode: UiMode,
    pub ui_accent_color: Option<String>,
    #[serde(default)]
    pub ui_art_tint: bool,
    /// Explicit user choice for the now-playing Details disclosure.
    /// Collapsed on a fresh config; a toggle writes it back via the config
    /// bridge so the choice survives restarts. Missing on old files, where
    /// `#[serde(default)]` yields false (collapsed).
    #[serde(default)]
    pub ui_details_open: bool,
    /// Explicit user choice for the now-playing A-B disclosure. Same
    /// collapsed-by-default, persisted-on-toggle contract as above.
    #[serde(default)]
    pub ui_ab_open: bool,
    pub audio_volume: f32,
    pub audio_playback_rate: Option<f32>,
    pub audio_follow_playing_track: bool,
    pub audio_muted: bool,
    pub audio_shuffle: bool,
    pub audio_repeat: Repeat,
    pub audio_stream_server: bool,
    pub audio_effects_enabled: bool,
    pub audio_reverb_enabled: bool,
    pub audio_reverb_intensity: f32,
    pub audio_slow_enabled: bool,
    pub audio_slow: f32,
    /// Independent tempo in percent, neutral 100. Additive: files written
    /// before this key fall back to neutral via `default_audio_tempo`.
    #[serde(default = "default_audio_tempo")]
    pub audio_tempo: f32,
    /// Independent pitch shift in semitones, neutral 0 (`f32` serde default
    /// is already 0.0, so a missing key is neutral).
    #[serde(default)]
    pub audio_pitch: f32,
    /// Pitch-shifter quality tier ("low" | "medium" | "high"), neutral
    /// "medium". Kept a `String` (validated on the TS side) so an unknown
    /// stored value can fall back instead of failing the whole file parse.
    #[serde(default = "default_audio_pitch_quality")]
    pub audio_pitch_quality: String,
    pub audio_ab_enabled: bool,
    pub default_view: DefaultView,
    /// Legacy one-shot flag from the pre-chain "default to All tracks"
    /// migration. Still deserialized so old files on disk (which contain
    /// this key) keep loading, and still WRITTEN so older builds see a
    /// consistent marker - but migration DECISIONS now belong solely to the
    /// version-stamped `migrate` chain, which consults this flag only
    /// inside `migrate_to_v1`. Never branch on it directly; call `migrate`.
    #[serde(default)]
    pub default_view_migrated_v1: bool,
    pub library_sort_by: SortBy,
    pub library_sort_order: SortOrder,
    /// Ordered multi-key sort (AIMP-style). Additive: `library_sort_by` and
    /// `library_sort_order` stay declared so an existing config file still
    /// deserializes; the UI reads this list instead.
    pub library_sort_keys: Vec<SortKey>,
    pub library_folders: Vec<PathBuf>,
    pub library_autorefresh: bool,
    pub sleepblocker: bool,
    pub auto_update_checker: bool,
    pub notifications: bool,
    pub track_view_density: TrackViewDensity,
    #[serde(default)]
    pub menu_bar_visible: bool,
}

/// Oldest known config schema: a file with no `config_version` key (any
/// config written before versioning existed) deserializes to this via
/// `legacy_config_version`, so the chain treats it as pre-everything.
pub const CONFIG_VERSION_LEGACY: u32 = 0;
/// Current config schema version. Bump when adding a migration step and
/// append the step to `Config::migrate` in order.
pub const CONFIG_VERSION_CURRENT: u32 = 1;

/// Serde default for `config_version`: a missing key means a legacy file
/// that predates versioning, so stamp it the oldest known version (0),
/// NOT the current one - otherwise the chain would skip every migration.
fn legacy_config_version() -> u32 {
    CONFIG_VERSION_LEGACY
}

/// Serde default for `audio_tempo`: neutral 100 percent.
fn default_audio_tempo() -> f32 {
    100.0
}

/// Serde default for `audio_pitch_quality`: neutral "medium" tier.
fn default_audio_pitch_quality() -> String {
    "medium".to_owned()
}

impl Config {
    /// v1 step: "default to All tracks". A stored config from before this
    /// change may carry any `default_view` (e.g. `Playlists`); reset it to
    /// `Library` - the route that renders the all-tracks list - exactly
    /// once, then flip the legacy flag so later explicit user choices
    /// stick, and stamp the config to version 1. Individually testable;
    /// invoked by `migrate` when the stamped version is below 1.
    pub fn migrate_to_v1(mut self) -> Self {
        if !self.default_view_migrated_v1 {
            self.default_view = DefaultView::Library;
            self.default_view_migrated_v1 = true;
        }
        self.config_version = 1;
        self
    }

    /// Ordered migration chain: applies every step newer than the stamped
    /// `config_version`, in order, and returns the migrated config plus the
    /// resulting version. A file already at (or past) current is returned
    /// untouched - in particular a version NEWER than current (a future
    /// file) is left as-is and never downgraded. The caller persists back
    /// only when the returned version differs from the stamped one.
    pub fn migrate(mut self) -> (Self, u32) {
        if self.config_version >= CONFIG_VERSION_CURRENT {
            let version = self.config_version;
            return (self, version);
        }
        if self.config_version < 1 {
            self = self.migrate_to_v1();
        }
        let version = self.config_version;
        (self, version)
    }
}

pub const SYSTEM_THEME: &str = "__system";

impl Default for Config {
    fn default() -> Self {
        Config {
            config_version: CONFIG_VERSION_CURRENT,
            theme: SYSTEM_THEME.to_owned(),
            ui_mode: UiMode::Full,
            ui_accent_color: None,
            ui_art_tint: false,
            ui_details_open: false,
            ui_ab_open: false,
            audio_volume: 1.0,
            audio_playback_rate: Some(1.0),
            audio_follow_playing_track: false,
            audio_muted: false,
            audio_shuffle: false,
            audio_repeat: Repeat::None,
            audio_stream_server: false,
            audio_effects_enabled: true,
            audio_reverb_enabled: true,
            audio_reverb_intensity: 0.0,
            audio_slow_enabled: true,
            audio_slow: 1.0,
            audio_tempo: default_audio_tempo(),
            audio_pitch: 0.0,
            audio_pitch_quality: default_audio_pitch_quality(),
            audio_ab_enabled: true,
            default_view: DefaultView::Library,
            default_view_migrated_v1: true,
            library_sort_by: SortBy::Artist,
            library_sort_order: SortOrder::Asc,
            library_sort_keys: vec![
                SortKey {
                    field: SortField::FileModified,
                    direction: SortOrder::Dsc,
                },
                SortKey {
                    field: SortField::Artist,
                    direction: SortOrder::Asc,
                },
                SortKey {
                    field: SortField::Album,
                    direction: SortOrder::Asc,
                },
                SortKey {
                    field: SortField::DiskNo,
                    direction: SortOrder::Asc,
                },
                SortKey {
                    field: SortField::TrackNo,
                    direction: SortOrder::Asc,
                },
            ],
            library_folders: vec![],
            library_autorefresh: false,
            sleepblocker: false,
            auto_update_checker: false,
            notifications: false,
            track_view_density: TrackViewDensity::Normal,
            // Visible by default (AIMP-familiar menus): the
            // in-app MenuBar is the only menu surface there.
            menu_bar_visible: true,
        }
    }
}

#[derive(Debug)]
pub struct ConfigManager {
    manager: HomeConfig,
    pub data: RwLock<Config>,
}

impl ConfigManager {
    pub fn new(manager: HomeConfig, config: Config) -> Self {
        Self {
            manager,
            data: RwLock::new(config),
        }
    }
}

fn config_err<T: Display>(err: T) -> MuseeksError {
    MuseeksError::Config(format!("{}", err))
}

impl ConfigManager {
    pub fn get(&self) -> AnyResult<Config> {
        let lock = self.data.read().map_err(config_err)?;
        Ok(lock.clone())
    }

    pub fn update(&self, config: Config) -> AnyResult<()> {
        let mut writer = self.data.write().map_err(config_err)?;
        *writer = config;
        std::mem::drop(writer);
        self.save()
    }

    pub fn set_sleepblocker(&self, sleepblocker: bool) -> AnyResult<()> {
        let mut writer = self.data.write().map_err(config_err)?;
        writer.sleepblocker = sleepblocker;
        std::mem::drop(writer);
        self.save()
    }

    pub fn set_menu_bar_visible(&self, visible: bool) -> AnyResult<()> {
        let mut writer = self.data.write().map_err(config_err)?;
        writer.menu_bar_visible = visible;
        std::mem::drop(writer);
        self.save()
    }

    pub fn set_default_view(&self, default_view: DefaultView) -> AnyResult<()> {
        let mut writer = self.data.write().map_err(config_err)?;
        writer.default_view = default_view;
        std::mem::drop(writer);
        self.save()
    }

    fn save(&self) -> AnyResult<()> {
        let config = self.data.read().map_err(config_err)?;
        self.manager
            .save_toml(config.clone())
            .map_err(|err| MuseeksError::Config(format!("{err:?}")))?;
        info!("Config updated");
        Ok(())
    }
}

/**
 * Get the app configuration/storage directory
 */
#[tauri::command]
pub fn get_storage_dir() -> PathBuf {
    // TODO: Replace with PathResolver::app_config_dir() + app identifier, somehow
    let path = dirs::config_dir().expect("Get config dir");
    path.join("slowburn")
}

#[tauri::command]
pub fn get_config(config_manager: State<ConfigManager>) -> AnyResult<Config> {
    config_manager.get()
}

#[tauri::command]
pub fn set_config(config_manager: State<ConfigManager>, config: Config) -> AnyResult<()> {
    config_manager.update(config)
}

pub fn init<R: Runtime>(config: ConfigManager) -> TauriPlugin<R> {
    // We need to inject the initial state of the config to the window object of
    // our webview, because some of our front-end modules are instantiated at
    // parsing time and require data that would otherwise only load-able asynchronously
    let initial_config_script = format!(
        r#"
            window.__MUSEEKS_INITIAL_CONFIG = {};
            window.__MUSEEKS_PLATFORM = {:?};
        "#,
        serde_json::to_string(&config.get().unwrap()).unwrap(),
        tauri_plugin_os::type_().to_string()
    );

    Builder::<R>::new("config")
        .invoke_handler(tauri::generate_handler![
            get_storage_dir,
            get_config,
            set_config,
        ])
        .js_init_script(initial_config_script)
        .setup(|app_handle, _api| {
            app_handle.manage(config);
            Ok(())
        })
        .build()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_view_is_the_all_tracks_list() {
        // Fresh configs land on /library via the default-view plugin, and
        // /library renders the all-tracks TrackList: nothing to migrate.
        let config = Config::default();
        assert!(matches!(config.default_view, DefaultView::Library));
        assert!(config.default_view_migrated_v1);
        let (migrated, version) = config.migrate();
        assert!(matches!(migrated.default_view, DefaultView::Library));
        assert_eq!(version, CONFIG_VERSION_CURRENT);
    }

    #[test]
    fn stored_default_view_migrates_to_library_exactly_once() {
        // Simulate the owner's existing config: a stored Playlists choice
        // without the migration flag moves to Library once...
        let mut value = serde_json::to_value(Config::default()).unwrap();
        let obj = value.as_object_mut().unwrap();
        obj.insert(
            "default_view".to_owned(),
            serde_json::Value::String("Playlists".to_owned()),
        );
        obj.remove("default_view_migrated_v1");

        let loaded: Config = serde_json::from_value(value).unwrap();
        assert!(!loaded.default_view_migrated_v1);
        let migrated = loaded.migrate_to_v1();
        assert!(matches!(migrated.default_view, DefaultView::Library));
        assert!(migrated.default_view_migrated_v1);

        // ...and an already-migrated explicit choice (e.g. Artists picked
        // after this change) is never touched again.
        let mut reselected = migrated;
        reselected.default_view = DefaultView::Artists;
        let kept = reselected.migrate_to_v1();
        assert!(matches!(kept.default_view, DefaultView::Artists));
        assert!(kept.default_view_migrated_v1);
    }

    #[test]
    fn ui_mode_defaults_to_full() {
        assert!(matches!(Config::default().ui_mode, UiMode::Full));
    }

    #[test]
    fn ui_mode_serializes_lowercase() {
        assert_eq!(
            serde_json::to_string(&UiMode::Minimal).unwrap(),
            "\"minimal\""
        );
        assert_eq!(serde_json::to_string(&UiMode::Full).unwrap(), "\"full\"");
        assert_eq!(serde_json::to_string(&UiMode::Mini).unwrap(), "\"mini\"");
    }

    #[test]
    fn stored_ui_modes_still_deserialize_verbatim() {
        // Stored user choices are preserved verbatim: every shipped variant
        // must keep deserializing after the fresh-default flip to Full.
        for mode in [UiMode::Minimal, UiMode::Full, UiMode::Mini] {
            let json = serde_json::to_string(&mode).unwrap();
            assert_eq!(serde_json::from_str::<UiMode>(&json).unwrap(), mode);
        }
    }

    #[test]
    fn default_sort_keys_match_the_spec_bundle() {
        let keys = Config::default().library_sort_keys;
        assert_eq!(
            keys,
            vec![
                SortKey {
                    field: SortField::FileModified,
                    direction: SortOrder::Dsc,
                },
                SortKey {
                    field: SortField::Artist,
                    direction: SortOrder::Asc,
                },
                SortKey {
                    field: SortField::Album,
                    direction: SortOrder::Asc,
                },
                SortKey {
                    field: SortField::DiskNo,
                    direction: SortOrder::Asc,
                },
                SortKey {
                    field: SortField::TrackNo,
                    direction: SortOrder::Asc,
                },
            ]
        );
    }

    #[test]
    fn sort_keys_round_trip_through_serde() {
        let keys = Config::default().library_sort_keys;
        let json = serde_json::to_string(&keys).unwrap();

        // Order is preserved, and the field names are camelCase on the wire.
        assert_eq!(
            json,
            r#"[{"field":"fileModified","direction":"Dsc"},{"field":"artist","direction":"Asc"},{"field":"album","direction":"Asc"},{"field":"diskNo","direction":"Asc"},{"field":"trackNo","direction":"Asc"}]"#
        );

        let back: Vec<SortKey> = serde_json::from_str(&json).unwrap();
        assert_eq!(back, keys);
    }

    #[test]
    fn a_config_file_without_sort_keys_still_deserializes() {
        // Simulate an existing config file: serialize the default, drop the new
        // key, and confirm the whole Config still loads (additive-only change).
        let mut value = serde_json::to_value(Config::default()).unwrap();
        value.as_object_mut().unwrap().remove("library_sort_keys");

        let loaded: Config = serde_json::from_value(value).unwrap();
        assert_eq!(
            loaded.library_sort_keys,
            Config::default().library_sort_keys
        );
    }

    #[test]
    fn art_tint_defaults_to_off_and_old_configs_still_deserialize() {
        assert!(!Config::default().ui_art_tint);

        // Simulate an existing config file without the new key.
        let mut value = serde_json::to_value(Config::default()).unwrap();
        value.as_object_mut().unwrap().remove("ui_art_tint");

        let loaded: Config = serde_json::from_value(value).unwrap();
        assert!(!loaded.ui_art_tint);
    }

    #[test]
    fn removed_keys_still_deserialize_for_existing_configs() {
        // The owner's persisted file may still carry `language` and
        // `wayland_compat`. `Config` is `#[serde(default)]` with no
        // `deny_unknown_fields`, so those keys must be ignored instead of
        // failing the parse and resetting the owner's settings.
        let mut value = serde_json::to_value(Config::default()).unwrap();
        let obj = value.as_object_mut().unwrap();
        obj.insert(
            "language".to_owned(),
            serde_json::Value::String("en".to_owned()),
        );
        obj.insert("wayland_compat".to_owned(), serde_json::Value::Bool(true));

        let loaded: Config = serde_json::from_value(value).unwrap();
        let fresh = Config::default();
        assert_eq!(loaded.theme, fresh.theme);
        assert_eq!(loaded.audio_volume, fresh.audio_volume);
        assert!(matches!(loaded.default_view, DefaultView::Library));
    }

    #[test]
    fn disclosure_states_default_to_collapsed_and_old_configs_still_deserialize() {
        // A fresh config opens CLEAN: both disclosures collapsed.
        let fresh = Config::default();
        assert!(!fresh.ui_details_open);
        assert!(!fresh.ui_ab_open);

        // Simulate an existing config file written before these keys.
        let mut value = serde_json::to_value(Config::default()).unwrap();
        let obj = value.as_object_mut().unwrap();
        obj.remove("ui_details_open");
        obj.remove("ui_ab_open");

        let loaded: Config = serde_json::from_value(value).unwrap();
        assert!(!loaded.ui_details_open);
        assert!(!loaded.ui_ab_open);

        // A stored explicit choice round-trips verbatim.
        let mut chosen = loaded;
        chosen.ui_details_open = true;
        chosen.ui_ab_open = true;
        let back: Config = serde_json::from_str(&serde_json::to_string(&chosen).unwrap()).unwrap();
        assert!(back.ui_details_open);
        assert!(back.ui_ab_open);
    }

    #[test]
    fn legacy_file_without_version_key_migrates_through_chain_to_library() {
        // Simulate a pre-versioning config file: no `config_version` key,
        // no migration flag, and a stored non-Library view.
        let mut value = serde_json::to_value(Config::default()).unwrap();
        let obj = value.as_object_mut().unwrap();
        obj.insert(
            "default_view".to_owned(),
            serde_json::Value::String("Playlists".to_owned()),
        );
        obj.remove("config_version");
        obj.remove("default_view_migrated_v1");

        let loaded: Config = serde_json::from_value(value).unwrap();
        // A missing version key stamps the oldest known version, NOT
        // current - otherwise the chain below would skip every migration.
        assert_eq!(loaded.config_version, CONFIG_VERSION_LEGACY);
        assert!(!loaded.default_view_migrated_v1);

        let (migrated, version) = loaded.migrate();
        assert_eq!(version, CONFIG_VERSION_CURRENT);
        assert_eq!(migrated.config_version, CONFIG_VERSION_CURRENT);
        assert!(matches!(migrated.default_view, DefaultView::Library));
        assert!(migrated.default_view_migrated_v1);
    }

    #[test]
    fn config_at_current_version_is_returned_unchanged() {
        // An explicit user choice on a current file must survive the chain
        // verbatim, and the returned version must equal the stamped one -
        // that equality is the signal the `init` call site uses to SKIP the
        // rewrite, so a boot with no pending migration never touches disk.
        let config = Config {
            default_view: DefaultView::Artists,
            ..Config::default()
        };
        let before = serde_json::to_value(&config).unwrap();

        let (kept, version) = config.migrate();
        assert_eq!(version, CONFIG_VERSION_CURRENT);
        assert_eq!(kept.config_version, CONFIG_VERSION_CURRENT);
        assert_eq!(serde_json::to_value(&kept).unwrap(), before);
        assert!(matches!(kept.default_view, DefaultView::Artists));
    }

    #[test]
    fn migration_chain_is_idempotent() {
        // Running the chain twice equals running it once: after the first
        // pass the stamp is current, so the second pass is a no-op.
        let mut value = serde_json::to_value(Config::default()).unwrap();
        let obj = value.as_object_mut().unwrap();
        obj.insert(
            "default_view".to_owned(),
            serde_json::Value::String("Playlists".to_owned()),
        );
        obj.remove("config_version");
        obj.remove("default_view_migrated_v1");
        let loaded: Config = serde_json::from_value(value).unwrap();

        let (once, once_version) = loaded.migrate();
        let (twice, twice_version) = once.clone().migrate();
        assert_eq!(once_version, twice_version);
        assert_eq!(
            serde_json::to_value(&twice).unwrap(),
            serde_json::to_value(&once).unwrap()
        );
        assert!(matches!(twice.default_view, DefaultView::Library));
    }

    #[test]
    fn future_config_version_is_left_untouched_never_downgraded() {
        // A file stamped NEWER than current (written by a future build)
        // must be left exactly as-is: no step runs, the stamp is kept, and
        // the returned version equals the stamped one so the caller does
        // not rewrite (and therefore never downgrades) the file.
        let config = Config {
            config_version: CONFIG_VERSION_CURRENT + 1,
            default_view: DefaultView::Playlists,
            default_view_migrated_v1: false,
            ..Config::default()
        };
        let before = serde_json::to_value(&config).unwrap();

        let (kept, version) = config.migrate();
        assert_eq!(version, CONFIG_VERSION_CURRENT + 1);
        assert_eq!(kept.config_version, CONFIG_VERSION_CURRENT + 1);
        assert_eq!(serde_json::to_value(&kept).unwrap(), before);
        assert!(matches!(kept.default_view, DefaultView::Playlists));
        assert!(!kept.default_view_migrated_v1);
    }

    #[test]
    fn migrated_config_survives_a_toml_save_and_reload() {
        // Full round-trip through the real TOML persistence used at boot:
        // migrate a legacy config, save, reload, and confirm the version
        // and the migrated values survive.
        let mut value = serde_json::to_value(Config::default()).unwrap();
        let obj = value.as_object_mut().unwrap();
        obj.insert(
            "default_view".to_owned(),
            serde_json::Value::String("Playlists".to_owned()),
        );
        obj.remove("config_version");
        obj.remove("default_view_migrated_v1");
        let loaded: Config = serde_json::from_value(value).unwrap();
        let (migrated, _) = loaded.migrate();

        let dir = std::env::temp_dir().join("slowburn_config_migration_roundtrip_test");
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("config.toml");
        let _ = std::fs::remove_file(&path);
        let manager = HomeConfig::with_file(&path);
        manager.save_toml(&migrated).unwrap();
        let reloaded: Config = manager.toml().unwrap();

        assert_eq!(reloaded.config_version, CONFIG_VERSION_CURRENT);
        assert!(matches!(reloaded.default_view, DefaultView::Library));
        assert!(reloaded.default_view_migrated_v1);
        // A reload of the saved file is already current, so the chain is a
        // no-op and a second boot would not rewrite it.
        let (_, second_version) = reloaded.clone().migrate();
        assert_eq!(second_version, reloaded.config_version);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn save_to_a_failing_target_returns_err_instead_of_panicking() {
        // A full disk (or any unwritable target) must surface as `Err` from
        // `set_config`/`update`, never as a backend panic. Point the manager
        // at an existing directory so `save_toml` deterministically fails.
        let dir = std::env::temp_dir().join("slowburn_config_save_failure_test");
        std::fs::create_dir_all(&dir).unwrap();
        let manager = HomeConfig::with_file(&dir);
        assert_eq!(manager.path(), &dir);
        let config_manager = ConfigManager::new(manager, Config::default());
        let res = config_manager.update(Config::default());
        assert!(
            res.is_err(),
            "a failing config target must return Err, not panic"
        );
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn tempo_and_pitch_default_to_neutral() {
        // Fresh configs carry neutral tempo (100%), neutral pitch (+0 st),
        // and the default "medium" quality tier.
        let config = Config::default();
        assert_eq!(config.audio_tempo, 100.0);
        assert_eq!(config.audio_pitch, 0.0);
        assert_eq!(config.audio_pitch_quality, "medium");
    }

    #[test]
    fn config_file_without_tempo_pitch_keys_still_deserializes_to_neutral() {
        // Simulate an existing config file written before these keys:
        // serialize the default, drop the new keys, and confirm the whole
        // Config still loads with neutral values (additive-only change).
        let mut value = serde_json::to_value(Config::default()).unwrap();
        let obj = value.as_object_mut().unwrap();
        obj.remove("audio_tempo");
        obj.remove("audio_pitch");
        obj.remove("audio_pitch_quality");

        let loaded: Config = serde_json::from_value(value).unwrap();
        assert_eq!(loaded.audio_tempo, 100.0);
        assert_eq!(loaded.audio_pitch, 0.0);
        assert_eq!(loaded.audio_pitch_quality, "medium");
    }

    #[test]
    fn tempo_pitch_keys_survive_a_toml_save_and_reload() {
        // Full round-trip through the real TOML persistence used at boot:
        // non-neutral values save and reload verbatim.
        let mut config = Config::default();
        config.audio_tempo = 150.0;
        config.audio_pitch = 3.0;
        config.audio_pitch_quality = "high".to_owned();

        let dir = std::env::temp_dir().join("slowburn_config_tempo_pitch_roundtrip_test");
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("config.toml");
        let _ = std::fs::remove_file(&path);
        let manager = HomeConfig::with_file(&path);
        manager.save_toml(&config).unwrap();
        let reloaded: Config = manager.toml().unwrap();

        assert_eq!(reloaded.audio_tempo, 150.0);
        assert_eq!(reloaded.audio_pitch, 3.0);
        assert_eq!(reloaded.audio_pitch_quality, "high");
        let _ = std::fs::remove_dir_all(&dir);
    }
}
