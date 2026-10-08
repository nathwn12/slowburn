use log::info;
use tauri::plugin::{Builder, TauriPlugin};
use tauri::webview::PageLoadEvent;
use tauri::{Manager, Runtime, State};

use crate::libs::error::AnyResult;
use crate::plugins::config::{ConfigManager, DefaultView};

#[tauri::command]
pub fn set(config_manager: State<ConfigManager>, default_view: DefaultView) -> AnyResult<()> {
    info!("Default view set to '{:?}'", default_view);
    config_manager.set_default_view(default_view)
}

/**
 * The boot fragment for a stored default view. `Library` is the route that
 * renders the all-tracks list (breadcrumb `Library > All tracks`).
 */
pub fn fragment_for(default_view: &DefaultView) -> &'static str {
    match default_view {
        DefaultView::Library => "/library",
        DefaultView::Artists => "/artists",
        DefaultView::Playlists => "/playlists",
    }
}

/**
 * Set the default view on application load based on user preference
 */
pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::<R>::new("default-view")
        .invoke_handler(tauri::generate_handler![set])
        .on_page_load(|webview, payload| {
            let url = payload.url().clone();

            if webview.label().eq("main")
                && payload.event() == PageLoadEvent::Finished
                && url.fragment().is_none()
            {
                let config_manager = webview.state::<ConfigManager>();
                let mut url = payload.url().clone();
                let config = config_manager.get().unwrap();

                let fragment = fragment_for(&config.default_view);

                info!("Navigating to '{}'", fragment);
                url.set_fragment(Some(fragment));

                // For some reasons, it does not seem possible to navigate directly
                // from the webview argument, as we cannot make it &mut
                webview
                    .app_handle()
                    .get_webview_window("main")
                    .unwrap()
                    .navigate(url)
                    .expect("Something went wrong when trying to open the default view");
            }
        })
        .build()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn library_landing_is_the_all_tracks_route() {
        // The default landing after the v1 migration: Library boots to
        // /library, the route that renders the all-tracks TrackList.
        assert_eq!(fragment_for(&DefaultView::Library), "/library");
        assert_eq!(fragment_for(&DefaultView::Artists), "/artists");
        assert_eq!(fragment_for(&DefaultView::Playlists), "/playlists");
    }
}
