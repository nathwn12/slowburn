use tauri::plugin::{Builder, TauriPlugin};
use tauri::Runtime;

/**
 * Plugin in charge on making sure closing the app does not stop the audio
 */
pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::<R>::new("app-close").build()
}
