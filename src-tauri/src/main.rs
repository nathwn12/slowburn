// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod libs;
mod plugins;

use libs::init::init;
use libs::utils::get_theme_from_name;
use log::{LevelFilter, info};
use plugins::config::{ConfigManager, get_storage_dir};
use std::env;
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_log::fern::colors::ColoredLevelConfig;
use tauri_plugin_log::{Target, TargetKind};
use tauri_plugin_prevent_default::Flags;
use tauri_plugin_window_state::StateFlags;

/**
 * The beast
 */
/// Windows-only: force tao to actually write the borderless style.
///
/// tao's `WindowState::set_window_flags` only writes window styles via
/// `old_flags.apply_diff(window, new_flags)` (tao-0.35.3
/// `src/platform_impl/windows/window_state.rs:176-181`), i.e. only the
/// *difference* is applied. `set_decorations(false)` clears
/// MARKER_DECORATIONS, but that marker is already false from window
/// creation (`decorations(false)` builder), so the diff is empty and the
/// call is a silent no-op while WS_CAPTION stays set. Toggling
/// true-then-false produces two non-empty diffs, so the second write
/// recomputes the style with `style &= !WS_CAPTION` (`window_state.rs`
/// `:271-272`, `:307-308`) and the caption is really removed. Runs
/// before the window is shown, so there is no visible flash.
fn enforce_frameless<R: tauri::Runtime>(window: &tauri::WebviewWindow<R>) {
    let _ = window.set_decorations(true);
    let _ = window.set_decorations(false);
}

fn main() {
    let config = match init() {
        Ok(config) => {
            println!("[init] Initialization successful");
            config
        }
        Err(e) => {
            println!("[init] Error during initialization: {}", e);
            std::process::exit(1);
        }
    };

    let enable_stream_server = match config.get() {
        Ok(conf) => conf.audio_stream_server,
        Err(e) => {
            println!("[init] Error while loading stream-server setting: {}", e);
            std::process::exit(1);
        }
    };

    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_process::init())
        // Logging must be setup first, otherwise the logs won't be captured
        // while setting up the other plugins.
        .plugin(
            tauri_plugin_log::Builder::default()
                .targets([
                    Target::new(TargetKind::Stdout),
                    Target::new(TargetKind::Webview),
                    Target::new(TargetKind::Folder {
                        path: get_storage_dir(),
                        file_name: Some("slowburn".into()),
                    }),
                ])
                .level(LevelFilter::Info)
                // Prevent noisy logs from logging
                .level_for("lofty", LevelFilter::Error)
                .with_colors(ColoredLevelConfig::default())
                .max_file_size(50_000)
                .build(),
        )
        // Ensure a single instance of the app is running, if needed, play opened files
        .plugin(tauri_plugin_single_instance::init(|app_handle, args, _| {
            // Focus on the already running app in case the app is opened again
            let window = app_handle.get_webview_window("main").unwrap();
            window.set_focus().unwrap();

            plugins::file_associations::handle_opened_files(app_handle, args);
        }))
        // Custom integrations
        .plugin(plugins::app_close::init())
        .plugin(plugins::config::init(config))
        .plugin(plugins::app_menu::init())
        .plugin(plugins::cover::init())
        .plugin(plugins::db::init())
        .plugin(plugins::debug::init())
        .plugin(plugins::default_view::init())
        .plugin(plugins::file_associations::init())
        .plugin(plugins::sleepblocker::init())
        // Tauri integrations with the Operating System
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_os::init())
        .plugin(
            tauri_plugin_prevent_default::Builder::new()
                .with_flags(Flags::all().difference(Flags::FOCUS_MOVE))
                .build(),
        )
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_state_flags(
                    // Slowburn manages its visible state by itself, and the
                    // declared `inner_size` (960×600) must win over any saved
                    // geometry. POSITION is dropped too: a saved minimised /
                    // off-screen position (-32000,-32000) makes the app open
                    // minimised, which reads as "no window".
                    StateFlags::all()
                        & !StateFlags::VISIBLE
                        & !StateFlags::SIZE
                        & !StateFlags::POSITION
                        // Never restore decorations: the window-state plugin
                        // calls `set_decorations(state.decorated)` on launch,
                        // which would re-apply the OS title bar over our
                        // custom TitleBar. Frameless is enforced below.
                        & !StateFlags::DECORATIONS,
                )
                .build(),
        );

    // Experimental: local HTTP server for audio streaming, off unless
    // enabled in the config.
    let builder = if enable_stream_server {
        builder.plugin(plugins::stream_server::init())
    } else {
        builder
    };

    builder
        .setup(|app| {
            let config_manager = app.state::<ConfigManager>();
            let conf = config_manager.get()?;

            // We intentionally create the window ourselves to set the window theme to the right value
            let window_builder =
                WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
                    .title("Slowburn")
                    .visible(false)
                    .theme(get_theme_from_name(&conf.theme))
                    .inner_size(960.0, 600.0)
                    .min_inner_size(900.0, 600.0)
                    .fullscreen(false)
                    .resizable(true)
                    .zoom_hotkeys_enabled(true);

            // Frameless: the app draws its own title bar
            // (`src/components/TitleBar.tsx`) instead of the OS chrome.
            // Resizing still works - Tauri keeps the native resize borders
            // on borderless windows - and so do minimize/maximize/close,
            // wired to the Tauri window API from the custom bar.
            {
                let window = window_builder
                    .decorations(false)
                    .disable_drag_drop_handler()
                    .build()?;
                // Belt-and-braces: a stale saved state (from before DECORATIONS
                // was excluded above) could still re-enable the OS chrome on
                // first launch, so force frameless off again after build.
                // Plain `set_decorations(false)` is a no-op here (see
                // `enforce_frameless`): the toggle forces a real tao diff.
                enforce_frameless(&window);
                // Bounded one-shot re-assert for windows shown by any other
                // path (single-instance focus, etc.): tao applies styles
                // during its creation pass, after the early `decorations`
                // calls above, so re-assert frameless once the creation pass
                // has settled. Deliberately a single delayed call, not an
                // event hook, so it cannot loop.
                let frameless = window.clone();
                tauri::async_runtime::spawn(async move {
                    tokio::time::sleep(std::time::Duration::from_millis(500)).await;
                    enforce_frameless(&frameless);
                });
            }

            info!("Main window built");

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while running tauri application")
        .run(|_app_handle, _event| {});
}
