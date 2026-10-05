use tauri::Runtime;
use tauri::plugin::{Builder, TauriPlugin};

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::<R>::new("debug")
        .on_webview_ready(|webview| {
            #[cfg(dev)]
            {
                // Opt-in only. Opening DevTools on every dev launch throws an
                // Edge DevTools window onto the screen, so do it only when
                // SLOWBURN_DEVTOOLS is set. The app menu's "toggle devtools"
                // item stays available as the on-demand path.
                if std::env::var_os("SLOWBURN_DEVTOOLS").is_some() {
                    webview.open_devtools();
                } else {
                    drop(webview);
                }
            }

            #[cfg(not(dev))]
            drop(webview);
        })
        .build()
}
