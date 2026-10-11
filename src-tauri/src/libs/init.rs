use std::fs;

use home_config::HomeConfig;

use crate::plugins::config::Config;
use crate::{
    libs::error::{AnyResult, MuseeksError},
    plugins::config::{get_storage_dir, ConfigManager},
};

pub fn init() -> AnyResult<ConfigManager> {
    // 1. Ensure the config dir is "slowburn", migrating any legacy "museeks" /
    //    "Museeks" directory (and its database file) so no data is lost.
    let config_dir = dirs::config_dir().expect("Could not find config directory");

    let new_path = config_dir.join("slowburn");

    for legacy_name in ["museeks", "Museeks"] {
        let old_path = config_dir.join(legacy_name);

        if old_path.exists() && !new_path.exists() {
            fs::rename(&old_path, &new_path)?;
            println!("Renamed config folder from {} to slowburn", legacy_name);
        }
    }

    let old_db_path = new_path.join("museeks.db");
    let new_db_path = new_path.join("slowburn.db");

    if old_db_path.exists() && !new_db_path.exists() {
        fs::rename(&old_db_path, &new_db_path)?;
        println!("Renamed database from museeks.db to slowburn.db");
    }

    // 2. Ensure Config is created and return it
    let conf_path = get_storage_dir();
    let manager = HomeConfig::with_file(conf_path.join("config.toml"));
    let existing_config = manager.toml::<Config>();

    let config = match existing_config {
        Ok(config) => {
            // One-shot "default to All tracks" migration for pre-existing
            // configs, then backfill any missing keys populated by serde
            // defaults.
            let config = config.migrate_default_view();
            manager
                .save_toml(&config)
                .map_err(|err| MuseeksError::Config(format!("{err:?}")))?;

            ConfigManager::new(manager, config)
        }
        Err(_) => {
            // The config does not exist, so let's instantiate it with defaults
            let default_config = Config::default();
            manager
                .save_toml(&default_config)
                .map_err(|err| MuseeksError::Config(format!("{err:?}")))?;

            ConfigManager::new(manager, default_config)
        }
    };

    Ok(config)
}
