mod commands;
mod db;
mod models;
mod theme;
mod windows;

use std::fs;

use tauri::Manager;

fn parse_action(argv: &[String]) -> Option<String> {
    // argv[0] is the binary path; take the first positional after it.
    argv.iter().skip(1).find(|a| !a.starts_with('-')).cloned()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Single-instance must be the first plugin registered.
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            let action = parse_action(&argv);
            log::info!("single-instance: dispatching action {:?}", action);
            windows::dispatch(app, action.as_deref());
        }))
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // ~/.local/share/com.hyprhopper.app/ on Linux (XDG-compliant).
            let data_dir = app.path().app_data_dir().expect("resolve app_data_dir");
            fs::create_dir_all(&data_dir)?;
            let db_path = data_dir.join("hopper.db");
            log::info!("opening db at {}", db_path.display());
            let database = db::Db::open(&db_path).expect("open hopper.db");
            app.manage(database);

            theme::spawn_watcher(app.handle().clone());

            // Dispatch whatever was passed to the first-instance launch.
            let argv: Vec<String> = std::env::args().collect();
            let initial_action = parse_action(&argv);
            log::info!("startup: initial action {:?}", initial_action);
            windows::dispatch(&app.handle().clone(), initial_action.as_deref());

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::create_item,
            commands::get_items,
            commands::update_item_status,
            commands::update_item,
            commands::delete_item,
            commands::get_backlog_count,
            commands::get_all_tags,
            commands::get_theme_css,
            commands::get_theme_name,
            commands::show_feed_window,
            commands::show_capture_window,
            commands::show_edit_window,
            commands::close_capture_window,
            commands::notify_saved,
            commands::get_item,
            commands::open_external,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
