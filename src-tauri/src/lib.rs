mod api;
mod backup;
mod cache;
mod credentials;
mod downloads;
mod models;
mod rate_limit;
mod site;
mod update_check;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Must run before the webview is created - see cache.rs's module doc comment.
    cache::bootstrap();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
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
            api::get_comments,
            api::create_comment,
            api::update_comment,
            api::delete_comment,
            api::report_comment,
            api::vote_comment,
            api::get_dmails,
            api::get_dmail,
            api::create_dmail,
            api::health_check,
            cache::get_cache_info,
            cache::set_cache_limit_mb,
            cache::request_cache_clear,
            update_check::check_for_update,
            backup::export_backup,
            backup::is_backup_encrypted,
            backup::import_backup,
            downloads::download_post_file,
            credentials::save_credentials,
            credentials::load_credentials,
            credentials::delete_credentials,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
