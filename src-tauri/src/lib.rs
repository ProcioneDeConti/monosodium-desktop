mod api;
mod backup;
mod cache;
mod credentials;
mod crypto;
mod downloads;
mod export;
mod models;
mod paths;
mod rate_limit;
mod saucenao;
mod site;
mod update_check;
mod vault;

use tauri::menu::{Menu, MenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{Manager, WindowEvent};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

/// Summons/hides the main window from anywhere, even while another app has focus - the desktop
/// equivalent of the reference Android app's "just switch apps" (which needs no such thing).
const TOGGLE_SHORTCUT: &str = "ctrl+shift+e";

fn toggle_main_window(app: &tauri::AppHandle) {
    let Some(window) = app.get_webview_window("main") else { return };
    if window.is_visible().unwrap_or(false) {
        let _ = window.hide();
    } else {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn show_main_window(app: &tauri::AppHandle) {
    let Some(window) = app.get_webview_window("main") else { return };
    let _ = window.show();
    let _ = window.set_focus();
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // A pending Settings > Reset ("erase all data") request - wipe both candidate data folders
    // now, before anything reads or recreates them, and while the previous run's WebView2 file
    // locks are already gone (this is a post-relaunch startup).
    if paths::full_reset_pending() {
        paths::apply_full_reset();
    }

    // Must run before the webview is created - see cache.rs's module doc comment.
    cache::bootstrap();
    // Restore settings.json / saved-searches.json from a .bak if a previous run's store write was
    // truncated (tauri-plugin-store's fs::write isn't atomic) - must run before the store plugin.
    paths::guard_store_files(vault::is_password_protected());

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(
            // The shortcut is registered later, in `setup()`, rather than eagerly here - a stale
            // OS registration from a previous instance that didn't exit cleanly (or the brief
            // old/new overlap during `relaunch()`) makes an eager `.with_shortcuts()` fail, and a
            // failure there is a hard plugin-init panic that takes the whole app down over an
            // optional convenience hotkey.
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    if event.state == ShortcutState::Pressed {
                        toggle_main_window(app);
                    }
                })
                .build(),
        )
        .manage(api::AppState::new())
        .setup(|app| {
            let window = app.get_webview_window("main").expect("main window");

            // Best-effort - see the global-shortcut plugin comment above. If it's already held
            // (a lingering previous process), the app still runs fine, just without the hotkey.
            if let Err(e) = app.global_shortcut().register(TOGGLE_SHORTCUT) {
                eprintln!("global shortcut '{TOGGLE_SHORTCUT}' not registered: {e}");
            }
            // The window is intentionally opaque (no `transparent: true`, no Mica). A translucent
            // window is alpha-composited over the desktop every frame, which disables WebView2's
            // GPU compositing fast paths on Windows and makes all scrolling/animation slower.

            // Closing the window hides it to the tray instead of quitting, so the tray icon and
            // notifications mean something (a fully-quit app can't notify) - "Quit" in the tray
            // menu below is the real exit path.
            let window_for_close = window.clone();
            window.on_window_event(move |event| {
                if let WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    let _ = window_for_close.hide();
                }
            });

            let show_item = MenuItem::with_id(app, "show", "Show Monosodium Desktop", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let tray_menu = Menu::with_items(app, &[&show_item, &quit_item])?;

            TrayIconBuilder::new()
                .icon(app.default_window_icon().expect("app has a default icon").clone())
                .menu(&tray_menu)
                .show_menu_on_left_click(false)
                .tooltip("Monosodium Desktop")
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => show_main_window(app),
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let tauri::tray::TrayIconEvent::Click {
                        button: tauri::tray::MouseButton::Left,
                        button_state: tauri::tray::MouseButtonState::Up,
                        ..
                    } = event
                    {
                        toggle_main_window(tray.app_handle());
                    }
                })
                .build(app)?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            api::get_posts,
            api::autocomplete_tags,
            api::autocomplete_users,
            api::get_user_by_name,
            api::autocomplete_pools,
            api::get_current_user,
            api::get_user,
            api::update_blacklist,
            api::vote,
            api::favorite,
            api::unfavorite,
            api::report_post,
            api::get_comments,
            api::create_comment,
            api::update_comment,
            api::delete_comment,
            api::report_comment,
            api::vote_comment,
            api::get_dmails,
            api::get_dmail,
            api::create_dmail,
            api::delete_dmail,
            api::get_forum_topics,
            api::get_forum_topic,
            api::get_forum_posts,
            api::search_forum_posts,
            api::create_forum_post,
            api::get_pool,
            api::get_popular_posts,
            api::get_related_tags,
            api::get_artist,
            api::get_artist_dnp,
            api::get_tag,
            api::get_tag_relations,
            api::get_post_sets,
            api::get_post_set,
            api::create_post_set,
            api::add_posts_to_set,
            api::remove_posts_from_set,
            api::get_post_notes,
            api::get_post_versions,
            api::get_wiki_page,
            api::health_check,
            api::get_api_metrics,
            cache::get_cache_info,
            cache::set_cache_limit_mb,
            cache::request_cache_clear,
            update_check::check_for_update,
            backup::export_backup,
            backup::is_backup_encrypted,
            backup::import_backup,
            downloads::download_post_file,
            downloads::fetch_image_data_url,
            export::save_export_file,
            export::save_pdf_with_jpeg,
            credentials::save_credentials,
            credentials::load_credentials,
            credentials::delete_credentials,
            credentials::save_saucenao_key,
            credentials::load_saucenao_key,
            credentials::delete_saucenao_key,
            saucenao::reverse_image_search,
            paths::get_data_dir,
            paths::storage_location,
            paths::request_full_reset,
            vault::vault_status,
            vault::unlock_vault,
            vault::enable_password_encryption,
            vault::disable_password_encryption,
            vault::reset_vault,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
