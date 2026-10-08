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
    pub language: String,
    pub theme: String,
    pub ui_mode: UiMode,
    pub ui_accent_color: Option<String>,
    #[serde(default)]
    pub ui_art_tint: bool,
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
    pub audio_ab_enabled: bool,
    pub default_view: DefaultView,
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
    pub wayland_compat: bool,
    #[serde(default)]
    pub menu_bar_visible: bool,
}

pub const SYSTEM_THEME: &str = "__system";

impl Default for Config {
    fn default() -> Self {
        Config {
            language: "en".to_owned(),
            theme: SYSTEM_THEME.to_owned(),
            ui_mode: UiMode::Full,
            ui_accent_color: None,
            ui_art_tint: false,
            audio_volume: 1.0,
            audio_playback_rate: Some(1.0),
            audio_follow_playing_track: false,
            audio_muted: false,
            audio_shuffle: false,
            audio_repeat: Repeat::None,
            #[cfg(target_os = "linux")]
            audio_stream_server: true,
            #[cfg(not(target_os = "linux"))]
            audio_stream_server: false,
            audio_effects_enabled: true,
            audio_reverb_enabled: true,
            audio_reverb_intensity: 0.0,
            audio_slow_enabled: true,
            audio_slow: 1.0,
            audio_ab_enabled: true,
            default_view: DefaultView::Library,
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
            wayland_compat: false,
            menu_bar_visible: false,
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

    #[cfg(not(target_os = "macos"))]
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
        self.manager.save_toml(config.clone()).unwrap();
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
}
