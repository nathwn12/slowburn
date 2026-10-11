use std::path::PathBuf;
use tauri::Emitter;
use tauri::image::Image;
use tauri::{
    Manager, Runtime, State,
    menu::{
        AboutMetadata, AboutMetadataBuilder, MenuBuilder, MenuId, MenuItemBuilder, SubmenuBuilder,
    },
    plugin::{Builder, TauriPlugin},
};
use tauri_plugin_opener::OpenerExt;

use crate::libs::error::AnyResult;
use crate::libs::events::IPCEvent;
use crate::plugins::config::ConfigManager;

#[tauri::command]
pub async fn show<R: Runtime>(
    window: tauri::Window<R>,
    config_manager: State<'_, ConfigManager>,
) -> AnyResult<()> {
    // The menu is in-app, and thus does not need to be toggled natively.
    {
        // No native window menu is attached (it would
        // force the OS title bar back on); the in-app MenuBar reads this
        // flag instead.
        drop(window);
        config_manager.set_menu_bar_visible(true)?;
    }

    Ok(())
}

#[tauri::command]
pub async fn hide<R: Runtime>(
    window: tauri::Window<R>,
    config_manager: State<'_, ConfigManager>,
) -> AnyResult<()> {
    {
        // See show(): config-only, no native menu to sync.
        drop(window);
        config_manager.set_menu_bar_visible(false)?;
    }

    Ok(())
}

/// Force tao to actually write the borderless style.
///
/// tao's `WindowState::set_window_flags` only writes window styles via
/// `old_flags.apply_diff(window, new_flags)` (tao-0.35.3
/// `src/platform_impl/windows/window_state.rs:176-181`), i.e. only the
/// *difference* is applied. `set_decorations(false)` clears
/// MARKER_DECORATIONS, but that marker is already false from window
/// creation, so the diff is empty and the call is a silent no-op while
/// WS_CAPTION stays set. Toggling true-then-false produces two non-empty
/// diffs, so the second write clears the caption. Runs before `show()`,
/// so there is no visible flash.
fn enforce_frameless<R: Runtime>(window: &tauri::Window<R>) {
    let _ = window.set_decorations(true);
    let _ = window.set_decorations(false);
}

/// Show the window; menu visibility lives in config and is rendered by
/// the in-app MenuBar, so there is no native menu to sync.
#[tauri::command]
pub async fn show_window<R: Runtime>(window: tauri::Window<R>) -> AnyResult<()> {
    // tao (re-)applies window styles during its creation pass, so
    // an early `decorations(false)` does not survive it. The window is
    // created invisible and first becomes visible here, so re-assert
    // frameless around `show()` to strip the WS_CAPTION the creation pass
    // left behind. Plain `set_decorations(false)` is a no-op (empty tao
    // diff) - the toggle forces a real style write.
    enforce_frameless(&window);

    window.show()?;

    enforce_frameless(&window);

    Ok(())
}

/// Best-effort load of the bundled Help > About icon.
///
/// Any failure yields `Ok(None)` so the caller falls back to icon-less
/// metadata instead of panicking: an `Err` resource dir propagates through
/// `?` and a missing/unreadable icon file maps to `None` via `.ok()`.
fn try_load_menu_icon(resource_dir: tauri::Result<PathBuf>) -> tauri::Result<Option<Image<'static>>> {
    let dir = resource_dir?;
    Ok(Image::from_path(dir.join("icons").join("icon.png")).ok())
}

/// Build the Help > About metadata, omitting the icon when it is unavailable.
fn build_about_metadata(
    version: Option<String>,
    authors: Vec<String>,
    icon: Option<Image<'static>>,
) -> AboutMetadata<'static> {
    AboutMetadataBuilder::new()
        .version(version)
        .authors(Some(authors))
        .license("MIT".into())
        .website("https://museeks.io".into())
        .website_label("museeks.io".into())
        .icon(icon)
        .build()
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("app-menu")
        .invoke_handler(tauri::generate_handler![show, hide, show_window])
        .on_window_ready(|window| {
            let app_handle = window.app_handle();

            // -----------------------------------------------------------------
            // X-menu
            // -----------------------------------------------------------------
            let package_info = app_handle.package_info();
            let version = package_info.version.to_string().into();
            let icon = try_load_menu_icon(app_handle.path().resource_dir()).unwrap_or(None);

            let about_metadata =
                build_about_metadata(version, vec![package_info.authors.to_string()], icon);

            // -----------------------------------------------------------------
            // File sub-menu (AIMP-familiar entry point; Quit lives here)
            // -----------------------------------------------------------------
            let file_menu: tauri::menu::Submenu<R> =
                SubmenuBuilder::new(app_handle, "File")
                    .quit()
                    .build()
                    .unwrap();

            // -----------------------------------------------------------------
            // Playback sub-menu: the transport, emitting the same IPC events
            // the in-app menu bar and the shortcuts drive.
            // -----------------------------------------------------------------
            let playback_menu: tauri::menu::Submenu<R> =
                SubmenuBuilder::new(app_handle, "Playback")
                    .item(
                        &MenuItemBuilder::new("Play / Pause")
                            .id(MenuId::new("playback_play_pause"))
                            .accelerator("CmdOrCtrl+Space")
                            .build(app_handle)
                            .unwrap(),
                    )
                    .item(
                        &MenuItemBuilder::new("Stop")
                            .id(MenuId::new("playback_stop"))
                            .build(app_handle)
                            .unwrap(),
                    )
                    .separator()
                    .item(
                        &MenuItemBuilder::new("Previous track")
                            .id(MenuId::new("playback_previous"))
                            .accelerator("CmdOrCtrl+Left")
                            .build(app_handle)
                            .unwrap(),
                    )
                    .item(
                        &MenuItemBuilder::new("Next track")
                            .id(MenuId::new("playback_next"))
                            .accelerator("CmdOrCtrl+Right")
                            .build(app_handle)
                            .unwrap(),
                    )
                    .build()
                    .unwrap();

            // -----------------------------------------------------------------
            // Edit sub-menu
            // -----------------------------------------------------------------
            let edit_menu = SubmenuBuilder::new(app_handle, "Edit")
                .undo()
                .redo()
                .separator()
                .cut()
                .copy()
                .paste()
                .select_all()
                .build()
                .unwrap();

            // -----------------------------------------------------------------
            // View sub-menu
            // -----------------------------------------------------------------
            let view_menu = SubmenuBuilder::new(app_handle, "View")
                .item(
                    &MenuItemBuilder::new("Jump to playing track")
                        .id(MenuId::new("jump_to_playing_track"))
                        .accelerator("CmdOrCtrl+T")
                        .build(app_handle)
                        .unwrap(),
                )
                .separator()
                .item(
                    &MenuItemBuilder::new("Go to library")
                        .id(MenuId::new("go_to_library"))
                        .accelerator("CmdOrCtrl+L")
                        .build(app_handle)
                        .unwrap(),
                )
                .item(
                    &MenuItemBuilder::new("Go to playlists")
                        .id(MenuId::new("go_to_playlists"))
                        .accelerator("CmdOrCtrl+P")
                        .build(app_handle)
                        .unwrap(),
                )
                .item(
                    &MenuItemBuilder::new("Go to settings")
                        .id(MenuId::new("go_to_settings"))
                        .accelerator("CmdOrCtrl+,")
                        .build(app_handle)
                        .unwrap(),
                )
                .separator()
                .item(
                    &MenuItemBuilder::new("Reload")
                        .id(MenuId::new("reload"))
                        .accelerator("CmdOrCtrl+R")
                        .build(app_handle)
                        .unwrap(),
                )
                .item(
                    &MenuItemBuilder::new("Toggle Developer Tools")
                        .id(MenuId::new("toggle_devtools"))
                        .accelerator("CmdOrCtrl+Alt+I")
                        .build(app_handle)
                        .unwrap(),
                )
                .build()
                .unwrap();

            // -----------------------------------------------------------------
            // Window sub-menu
            // -----------------------------------------------------------------
            let window_menu: tauri::menu::Submenu<R> = SubmenuBuilder::new(app_handle, "Window")
                .item(
                    &MenuItemBuilder::new("Minimize")
                        .id("minimize")
                        .accelerator("CmdOrCtrl+M")
                        .build(app_handle)
                        .unwrap(),
                )
                .build()
                .unwrap();

            // -----------------------------------------------------------------
            // Tools sub-menu
            // -----------------------------------------------------------------
            let tools_menu: tauri::menu::Submenu<R> =
                SubmenuBuilder::new(app_handle, "Tools")
                    .item(
                        &MenuItemBuilder::new("Settings")
                            .id(MenuId::new("open_settings"))
                            .build(app_handle)
                            .unwrap(),
                    )
                    .build()
                    .unwrap();

            // -----------------------------------------------------------------
            // Help sub-menu
            // -----------------------------------------------------------------
            let help_menu_builder = {
                let builder = SubmenuBuilder::new(app_handle, "Help");

                builder.about(Some(about_metadata))
            };

            let help_menu = help_menu_builder
                .item(
                    &MenuItemBuilder::new("Report an issue")
                        .id("report_an_issue")
                        .build(app_handle)
                        .unwrap(),
                )
                .build()
                .unwrap();

            // -----------------------------------------------------------------
            // Assembled menu + listeners
            // -----------------------------------------------------------------
            let menu_builder = {
                MenuBuilder::new(app_handle)
            };

            // No native window menu is attached: a
            // native menu occupies the window's non-client area, which
            // forces WS_CAPTION back on and defeats decorations(false)
            // (the OS title bar comes back alongside the app's own title
            // bar). The in-app MenuBar (gated on menu_bar_visible) is the
            // menu surface instead. The menu is still constructed so the
            // menu-event handlers below keep working; it is
            // simply never attached.
            {
                let _menu = menu_builder
                    .items(&[
                        &file_menu,
                        &playback_menu,
                        &edit_menu,
                        &view_menu,
                        &tools_menu,
                        &window_menu,
                        &help_menu,
                    ])
                    .build()
                    .unwrap();
            }

            window.on_menu_event(|win, event| match event.id.as_ref() {
                "playback_play_pause" => {
                    win.emit(IPCEvent::PlaybackPlayPause.as_ref(), ()).unwrap();
                }
                "playback_stop" => {
                    win.emit(IPCEvent::PlaybackStop.as_ref(), ()).unwrap();
                }
                "playback_previous" => {
                    win.emit(IPCEvent::PlaybackPrevious.as_ref(), ()).unwrap();
                }
                "playback_next" => {
                    win.emit(IPCEvent::PlaybackNext.as_ref(), ()).unwrap();
                }
                "open_settings" => {
                    win.emit(IPCEvent::GoToSettings.as_ref(), ()).unwrap();
                }
                "jump_to_playing_track" => {
                    win.emit(IPCEvent::JumpToPlayingTrack.as_ref(), ()).unwrap();
                }
                "go_to_library" => {
                    win.emit(IPCEvent::GoToLibrary.as_ref(), ()).unwrap();
                }
                "go_to_playlists" => {
                    win.emit(IPCEvent::GoToPlaylists.as_ref(), ()).unwrap();
                }
                "go_to_settings" => {
                    win.emit(IPCEvent::GoToSettings.as_ref(), ()).unwrap();
                }
                "reload" => {
                    let webview = win.get_webview_window("main").unwrap();
                    webview
                        .navigate(webview.url().expect("webview should havea a URL"))
                        .unwrap();
                }
                "toggle_devtools" => {
                    let webview = win.get_webview_window("main").unwrap();
                    match webview.is_devtools_open() {
                        true => webview.close_devtools(),
                        false => webview.open_devtools(),
                    }
                }
                "minimize" => {
                    win.minimize().unwrap();
                }
                "report_an_issue" => {
                    win.app_handle()
                        .opener()
                        .open_url("https://github.com/martpie/museeks/issues", None::<&str>)
                        .unwrap();
                }
                _ => {}
            });
        })
        .build()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resource_dir_error_falls_back_to_icon_less() {
        // An unavailable resource dir must not panic: the resolver returns
        // the `Err` and the call-site `unwrap_or(None)` falls back to `None`.
        let icon =
            try_load_menu_icon(Err(tauri::Error::AssetNotFound("missing".into()))).unwrap_or(None);
        assert!(icon.is_none());

        let metadata = build_about_metadata(Some("0.0.0".to_string()), vec!["test".to_string()], icon);
        assert!(metadata.icon.is_none());
        assert_eq!(metadata.version.as_deref(), Some("0.0.0"));
    }

    #[test]
    fn missing_icon_file_falls_back_to_icon_less() {
        // An existing resource dir without the bundled icon also yields
        // `Ok(None)` instead of panicking.
        let icon = try_load_menu_icon(Ok(PathBuf::from(
            "definitely-missing-slowburn-test-dir",
        )))
        .unwrap();
        assert!(icon.is_none());
    }
}
