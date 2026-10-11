// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod libs;
mod plugins;

use libs::init::init;
use libs::utils::get_theme_from_name;
use log::{LevelFilter, info};
use plugins::config::{ConfigManager, UiMode, get_storage_dir};
use std::env;
use tauri::{LogicalSize, Manager, Size, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_log::fern::colors::ColoredLevelConfig;
use tauri_plugin_log::{Target, TargetKind};
use tauri_plugin_prevent_default::Flags;
use tauri_plugin_window_state::{StateFlags, WindowExt};

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

/// Native window geometry (logical px), one floor per mode.
///
/// These mirror the frontend geometry in `src/lib/mini-window.ts`
/// (`FULL_WINDOW_SIZE`, `FULL_WINDOW_MIN_SIZE`, `MINI_WINDOW_SIZE`,
/// `MINI_WINDOW_MIN_SIZE`): that module owns runtime transitions after boot,
/// this module owns the boot size and floor. Keep them in sync by hand; the
/// unit tests below pin the values so drift fails `cargo test`.
const FULL_WINDOW_WIDTH: f64 = 960.0;
const FULL_WINDOW_HEIGHT: f64 = 600.0;
const FULL_FLOOR_WIDTH: f64 = 900.0;
const FULL_FLOOR_HEIGHT: f64 = 600.0;
const MINI_WINDOW_WIDTH: f64 = 420.0;
const MINI_WINDOW_HEIGHT: f64 = 660.0;
const MINI_FLOOR_WIDTH: f64 = 320.0;
const MINI_FLOOR_HEIGHT: f64 = 420.0;

/// Boot (initial size, floor) for a stored mode. Pure so the mapping is
/// unit-testable: Mini boots straight at its compact footprint with its own
/// small floor (never flashing the Full size first); every other mode boots
/// Full, so a stale Mini floor from an earlier session can never leak into
/// a Full boot.
fn boot_geometry_for_ui_mode(mode: &UiMode) -> ((f64, f64), (f64, f64)) {
    if *mode == UiMode::Mini {
        (
            (MINI_WINDOW_WIDTH, MINI_WINDOW_HEIGHT),
            (MINI_FLOOR_WIDTH, MINI_FLOOR_HEIGHT),
        )
    } else {
        (
            (FULL_WINDOW_WIDTH, FULL_WINDOW_HEIGHT),
            (FULL_FLOOR_WIDTH, FULL_FLOOR_HEIGHT),
        )
    }
}

/// Window placement restored across launches. All fields share one pixel
/// space; the boot-time caller passes physical pixels and scales the floor
/// by the window scale factor, so HiDPI monitors compare correctly.
#[derive(Debug, Clone, Copy, PartialEq)]
struct SavedPlacement {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}

/// Available monitor rectangle in the same pixel space as `SavedPlacement`.
#[derive(Debug, Clone, Copy, PartialEq)]
struct MonitorRect {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}

/// Windows reports (-32000,-32000) as the position of a minimized window.
/// Restoring it opens the app minimized, which reads as "no window", so any
/// placement at or beyond it is never a real on-screen position.
const MINIMIZED_SENTINEL: f64 = -32000.0;

/// Usability rule: a saved placement is USABLE iff (1) x, y, width and height
/// are all finite, (2) width and height are positive and at least the current
/// boot-mode floor, (3) neither x nor y is at or below the Windows minimized
/// sentinel (-32000), and (4) the rectangle overlaps at least one available
/// monitor by at least one pixel. A rectangle only partially on a monitor is
/// accepted unchanged with no clamping, so the visible part keeps the window
/// reachable and user intent is preserved. Anything else is unusable and the
/// caller falls back to the boot geometry.
fn is_usable_window_placement(
    saved: SavedPlacement,
    monitors: &[MonitorRect],
    min_size: (f64, f64),
) -> bool {
    let (min_w, min_h) = min_size;
    if !saved.x.is_finite() || !saved.y.is_finite() {
        return false;
    }
    if !saved.width.is_finite() || !saved.height.is_finite() {
        return false;
    }
    if saved.width <= 0.0 || saved.height <= 0.0 {
        return false;
    }
    if saved.width < min_w || saved.height < min_h {
        return false;
    }
    if saved.x <= MINIMIZED_SENTINEL || saved.y <= MINIMIZED_SENTINEL {
        return false;
    }
    monitors.iter().any(|m| {
        saved.x < m.x + m.width
            && saved.x + saved.width > m.x
            && saved.y < m.y + m.height
            && saved.y + saved.height > m.y
    })
}

/// State restored from disk. VISIBLE stays excluded: the window is born
/// hidden and shown later by `showWindow`. DECORATIONS stays excluded:
/// restoring it would re-apply the OS title bar over the custom TitleBar
/// (frameless is enforced at build). SIZE and POSITION are restored and then
/// validated by the monitor-bounds guard below.
fn window_restore_flags() -> StateFlags {
    StateFlags::all() & !StateFlags::VISIBLE & !StateFlags::DECORATIONS
}

/// Boot-time guard for the restored geometry: when the live window (just
/// restored from disk) fails the usability rule, reset to the boot size and
/// center on-screen so a bad placement can never leave an invisible or
/// unreachable window. Best effort: failures are ignored because the builder
/// size is already a safe default.
fn enforce_restored_geometry<R: tauri::Runtime>(
    window: &tauri::WebviewWindow<R>,
    boot_w: f64,
    boot_h: f64,
    floor_w: f64,
    floor_h: f64,
) {
    let scale = window.scale_factor().unwrap_or(1.0);
    let scale = if scale.is_finite() && scale > 0.0 {
        scale
    } else {
        1.0
    };
    let (size, pos) = match (window.inner_size(), window.outer_position()) {
        (Ok(size), Ok(pos)) => (size, pos),
        _ => return,
    };
    let monitors: Vec<MonitorRect> = window
        .available_monitors()
        .unwrap_or_default()
        .iter()
        .map(|m| MonitorRect {
            x: m.position().x as f64,
            y: m.position().y as f64,
            width: m.size().width as f64,
            height: m.size().height as f64,
        })
        .collect();
    let saved = SavedPlacement {
        x: pos.x as f64,
        y: pos.y as f64,
        width: size.width as f64,
        height: size.height as f64,
    };
    if !is_usable_window_placement(saved, &monitors, (floor_w * scale, floor_h * scale)) {
        let _ = window.set_size(Size::Logical(LogicalSize::new(boot_w, boot_h)));
        let _ = window.center();
        info!(
            "Discarded unusable restored placement ({}, {} {}x{}); fell back to boot geometry",
            saved.x, saved.y, saved.width, saved.height
        );
    }
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
                .with_state_flags(window_restore_flags())
                // Skip the automatic restore: `setup` restores manually and
                // then runs the monitor-bounds guard, so the guard always runs
                // after the restore (the plugin notifies over the main
                // thread, which would otherwise race a post-build check).
                // Slowburn manages its visible state by itself (the window is
                // born hidden and shown by `showWindow`), and frameless is
                // enforced at build - hence VISIBLE and DECORATIONS stay
                // excluded in `window_restore_flags`.
                .skip_initial_state("main")
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

            // One floor per mode, decided at boot from the stored `ui_mode`:
            // a restart straight into Mini opens at the Mini footprint with
            // the Mini floor, and a Full boot always re-asserts the Full
            // floor even when an earlier session lowered it via `setMinSize`
            // (Mini entry) or left a saved size behind. The declared floor
            // was observed not to hold (~470-720px windows against a 900px
            // declaration): the saved SIZE/POSITION restore below is validated
            // by the monitor-bounds guard, so a stale or off-screen saved
            // value can never shrink the window; the live suspects for a
            // dropped floor are the Mini `setMinSize` lowering
            // with no native restore, `set_size` bypassing the constraint,
            // and the delayed frameless style rewrite below dropping it -
            // hence the native re-asserts after build.
            let ((boot_w, boot_h), (floor_w, floor_h)) =
                boot_geometry_for_ui_mode(&conf.ui_mode);

            // We intentionally create the window ourselves to set the window theme to the right value
            let window_builder =
                WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
                    .title("Slowburn")
                    .visible(false)
                    .theme(get_theme_from_name(&conf.theme))
                    .inner_size(boot_w, boot_h)
                    .min_inner_size(floor_w, floor_h)
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
                // L1-5: restore the saved SIZE/POSITION now (auto-restore is
                // skipped above) and validate it: a usable placement is kept,
                // anything off-screen, degenerate, or below the boot floor
                // falls back to the boot size centered on-screen, so a bad
                // saved value can never leave an invisible window.
                let _ = window.restore_state(window_restore_flags());
                enforce_restored_geometry(&window, boot_w, boot_h, floor_w, floor_h);
                // Belt-and-braces: a stale saved state (from before DECORATIONS
                // was excluded above) could still re-enable the OS chrome on
                // first launch, so force frameless off again after build.
                // Plain `set_decorations(false)` is a no-op here (see
                // `enforce_frameless`): the toggle forces a real tao diff.
                enforce_frameless(&window);
                // Native re-assert of the boot floor: the builder value above
                // is the same number, but the delayed frameless rewrite below
                // re-applies window styles on Windows after this point, and a
                // previous Mini session may have lowered the live floor via
                // `setMinSize` - this call is the single native source of
                // truth for the floor at boot.
                let _ = window.set_min_size(Some(Size::Logical(
                    LogicalSize::new(floor_w, floor_h),
                )));
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
                    // The style rewrite above can drop the size constraint on
                    // Windows frameless windows, so re-apply the boot floor
                    // with it. Boot-only values: later Mini/Full transitions
                    // are owned by the frontend (`src/lib/mini-window.ts`)
                    // and always run after this one-shot fires.
                    let _ = frameless.set_min_size(Some(Size::Logical(
                        LogicalSize::new(floor_w, floor_h),
                    )));
                });
            }

            info!("Main window built");

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while running tauri application")
        .run(|_app_handle, _event| {});
}

#[cfg(test)]
mod window_floor_tests {
    use super::*;

    /// The Full floor is the smallest width at which the full layout (queue
    /// column + now-playing column) stays clean, and must match
    /// `FULL_WINDOW_MIN_SIZE` in `src/lib/mini-window.ts`.
    #[test]
    fn full_floor_matches_frontend_contract() {
        assert_eq!((FULL_FLOOR_WIDTH, FULL_FLOOR_HEIGHT), (900.0, 600.0));
        assert_eq!((FULL_WINDOW_WIDTH, FULL_WINDOW_HEIGHT), (960.0, 600.0));
    }

    /// The Mini floor is the smallest size at which the condensed mini stack
    /// stays clean, and must match `MINI_WINDOW_MIN_SIZE` /
    /// `MINI_WINDOW_SIZE` in `src/lib/mini-window.ts`.
    #[test]
    fn mini_floor_matches_frontend_contract() {
        assert_eq!((MINI_FLOOR_WIDTH, MINI_FLOOR_HEIGHT), (320.0, 420.0));
        assert_eq!((MINI_WINDOW_WIDTH, MINI_WINDOW_HEIGHT), (420.0, 660.0));
    }

    #[test]
    fn boot_geometry_selects_floor_per_mode() {
        // `minimal` is a content-density choice, not a footprint: it boots
        // Full geometry like `full` does.
        for mode in [UiMode::Minimal, UiMode::Full] {
            assert_eq!(
                boot_geometry_for_ui_mode(&mode),
                ((960.0, 600.0), (900.0, 600.0))
            );
        }
        assert_eq!(
            boot_geometry_for_ui_mode(&UiMode::Mini),
            ((420.0, 660.0), (320.0, 420.0))
        );
    }

    /// Single 1920x1080 monitor at the origin shared by the restore tests.
    fn single_monitor() -> Vec<MonitorRect> {
        vec![MonitorRect {
            x: 0.0,
            y: 0.0,
            width: 1920.0,
            height: 1080.0,
        }]
    }

    /// The Full boot-mode floor, so below-floor tests pin the live mapping
    /// instead of a hardcoded copy.
    fn full_floor() -> (f64, f64) {
        boot_geometry_for_ui_mode(&UiMode::Full).1
    }

    /// A saved rectangle fully on the monitor restores unchanged.
    #[test]
    fn restored_placement_on_monitor_is_kept() {
        let saved = SavedPlacement {
            x: 100.0,
            y: 100.0,
            width: 960.0,
            height: 600.0,
        };
        let monitors = single_monitor();
        assert!(is_usable_window_placement(saved, &monitors, full_floor()));
    }

    /// A rectangle entirely off every monitor falls back to boot geometry.
    #[test]
    fn restored_placement_off_all_monitors_falls_back() {
        let saved = SavedPlacement {
            x: 3000.0,
            y: 2000.0,
            width: 960.0,
            height: 600.0,
        };
        let monitors = single_monitor();
        assert!(!is_usable_window_placement(
            saved,
            &monitors,
            full_floor()
        ));
    }

    /// The Windows minimized sentinel is never a real placement.
    #[test]
    fn restored_placement_minimized_sentinel_falls_back() {
        let saved = SavedPlacement {
            x: -32000.0,
            y: -32000.0,
            width: 960.0,
            height: 600.0,
        };
        let monitors = single_monitor();
        assert!(!is_usable_window_placement(
            saved,
            &monitors,
            full_floor()
        ));
    }

    /// Non-finite sizes are rejected even at an on-screen position.
    #[test]
    fn restored_placement_non_finite_size_falls_back() {
        let monitors = single_monitor();
        for bad in [
            SavedPlacement {
                x: 100.0,
                y: 100.0,
                width: f64::NAN,
                height: 600.0,
            },
            SavedPlacement {
                x: 100.0,
                y: 100.0,
                width: 960.0,
                height: f64::INFINITY,
            },
        ] {
            assert!(!is_usable_window_placement(bad, &monitors, full_floor()));
        }
    }

    /// Degenerate (zero or negative) sizes are rejected.
    #[test]
    fn restored_placement_negative_size_falls_back() {
        let monitors = single_monitor();
        for width in [-100.0, 0.0] {
            let saved = SavedPlacement {
                x: 100.0,
                y: 100.0,
                width,
                height: 600.0,
            };
            assert!(!is_usable_window_placement(
                saved,
                &monitors,
                full_floor()
            ));
        }
    }

    /// A saved size below the current mode floor is rejected even on-monitor.
    #[test]
    fn restored_placement_below_floor_falls_back() {
        let saved = SavedPlacement {
            x: 100.0,
            y: 100.0,
            width: 400.0,
            height: 300.0,
        };
        let monitors = single_monitor();
        assert!(!is_usable_window_placement(
            saved,
            &monitors,
            full_floor()
        ));
    }

    /// A rectangle only partially on a monitor is kept unchanged: the visible
    /// part keeps the window reachable, so user intent is preserved.
    #[test]
    fn restored_placement_partial_overlap_is_kept() {
        let saved = SavedPlacement {
            x: 1800.0,
            y: 900.0,
            width: 960.0,
            height: 600.0,
        };
        let monitors = single_monitor();
        assert!(is_usable_window_placement(saved, &monitors, full_floor()));
    }

    /// `enforce_restored_geometry` scales the boot floor by the window scale
    /// factor because saved geometry and monitor rects are physical pixels.
    /// A saved size that clears the logical floor but not the scaled floor
    /// is unusable: dropping the scaling would wrongly keep a below-floor
    /// window on a HiDPI monitor.
    #[test]
    fn restored_placement_hidpi_scaled_floor_falls_back() {
        let saved = SavedPlacement {
            x: 100.0,
            y: 100.0,
            width: 960.0,
            height: 600.0,
        };
        let monitors = single_monitor();
        let (floor_w, floor_h) = full_floor();
        let scale = 2.0;
        assert!(is_usable_window_placement(
            saved,
            &monitors,
            (floor_w, floor_h)
        ));
        assert!(!is_usable_window_placement(
            saved,
            &monitors,
            (floor_w * scale, floor_h * scale)
        ));
    }

    /// No available monitors (all unplugged) never restores: the placement
    /// overlaps nothing, so the boot geometry fallback must run.
    #[test]
    fn restored_placement_no_monitors_falls_back() {
        let saved = SavedPlacement {
            x: 100.0,
            y: 100.0,
            width: 960.0,
            height: 600.0,
        };
        let monitors: Vec<MonitorRect> = vec![];
        assert!(!is_usable_window_placement(
            saved,
            &monitors,
            full_floor()
        ));
    }
}
