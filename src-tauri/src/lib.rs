mod api;
mod credentials;
mod models;
mod rate_limit;
mod site;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .manage(api::AppState::new())
        .setup(|app| {
            let window = app.get_webview_window("main").expect("main window");
            // Windows 11 Mica backdrop; `None` follows the system light/dark preference.
            // Best-effort: older Windows builds without Mica support just keep the plain
            // background, so a failure here shouldn't prevent the app from starting.
            let _ = window_vibrancy::apply_mica(&window, None);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            api::get_posts,
            api::autocomplete_tags,
            api::get_current_user,
            api::get_user,
            api::update_blacklist,
            api::vote,
            api::favorite,
            api::unfavorite,
            api::health_check,
            credentials::save_credentials,
            credentials::load_credentials,
            credentials::delete_credentials,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
