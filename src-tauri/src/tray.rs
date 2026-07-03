//! Tray icon setup and menu handling for the desktop build.
//!
//! This module wires a Tauri v2 tray icon with a simple menu:
//! - Open: shows and focuses the main window.
//! - Query: shows the main window and focuses the search box (reuses the
//!   existing `new-query` event handled by the React app).
//! - About: shows the main window and navigates to the Settings → About tab
//!   via a dedicated event.
//! - Exit: cleanly exits the application.

#![cfg(desktop)]

use parking_lot::Mutex;
use std::sync::Arc;
use tauri::{
    menu::{MenuBuilder, MenuItemBuilder},
    AppHandle, Emitter, Listener, Manager,
};

// Stable identifiers so both Rust and JS can rely on them.
pub const TRAY_ID: &str = "main-tray";

pub const MENU_ID_OPEN: &str = "tray-open";
pub const MENU_ID_QUERY: &str = "tray-query";
pub const MENU_ID_ABOUT: &str = "tray-about";
pub const MENU_ID_EXIT: &str = "tray-exit";

/// Language-aware menu labels.
fn menu_labels(lang: &str) -> (&str, &str, &str, &str) {
    match lang {
        "zh" => ("打开", "新查询", "关于", "退出"),
        _ => ("Open", "New query", "About", "Exit"),
    }
}

/// Language state shared between init and the event listener.
struct TrayState {
    lang: Mutex<String>,
}

fn get_lang(app: &AppHandle) -> String {
    let state = app.state::<Arc<TrayState>>();
    let guard = state.lang.lock();
    guard.clone()
}

fn set_lang(app: &AppHandle, lang: &str) {
    let state = app.state::<Arc<TrayState>>();
    *state.lang.lock() = lang.to_string();
    if let Ok(app_dir) = app.path().app_data_dir() {
        let lang_file = app_dir.join("language.txt");
        let _ = std::fs::write(lang_file, lang);
    }
}

fn load_lang(app: &AppHandle) -> String {
    if let Ok(app_dir) = app.path().app_data_dir() {
        let lang_file = app_dir.join("language.txt");
        if let Ok(content) = std::fs::read_to_string(&lang_file) {
            let lang = content.trim();
            if lang == "en" || lang == "zh" {
                return lang.to_string();
            }
        }
    }
    "en".to_string()
}

fn rebuild_tray(app: &AppHandle) -> tauri::Result<()> {
    let lang = get_lang(app);
    let (open_lbl, query_lbl, about_lbl, exit_lbl) = menu_labels(&lang);

    let handle = app.clone();

    let menu = MenuBuilder::new(&handle)
        .items(&[
            &MenuItemBuilder::with_id(MENU_ID_OPEN, open_lbl).build(&handle)?,
            &MenuItemBuilder::with_id(MENU_ID_QUERY, query_lbl).build(&handle)?,
        ])
        .separator()
        .items(&[&MenuItemBuilder::with_id(MENU_ID_ABOUT, about_lbl).build(&handle)?])
        .separator()
        .items(&[&MenuItemBuilder::with_id(MENU_ID_EXIT, exit_lbl).build(&handle)?])
        .build()?;

    let tooltip = match lang.as_str() {
        "zh" => "Aictionary 词典",
        _ => "Aictionary",
    };

    // Update the existing tray icon in place — do NOT build a new one.
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        let _ = tray.set_menu(Some(menu));
        let _ = tray.set_tooltip(Some(tooltip));
    }

    Ok(())
}

/// Creates the tray icon and attaches its menu.
pub fn init_tray(app: &AppHandle) -> tauri::Result<()> {
    let lang = load_lang(app);

    let state = Arc::new(TrayState {
        lang: Mutex::new(lang.clone()),
    });
    app.manage(state);

    // Build the initial tray icon once.
    {
        let handle = app.clone();
        let (open_lbl, query_lbl, about_lbl, exit_lbl) = menu_labels(&lang);
        let menu = MenuBuilder::new(&handle)
            .items(&[
                &MenuItemBuilder::with_id(MENU_ID_OPEN, open_lbl).build(&handle)?,
                &MenuItemBuilder::with_id(MENU_ID_QUERY, query_lbl).build(&handle)?,
            ])
            .separator()
            .items(&[&MenuItemBuilder::with_id(MENU_ID_ABOUT, about_lbl).build(&handle)?])
            .separator()
            .items(&[&MenuItemBuilder::with_id(MENU_ID_EXIT, exit_lbl).build(&handle)?])
            .build()?;

        let tooltip = if lang == "zh" { "Aictionary 词典" } else { "Aictionary" };

        let mut builder = tauri::tray::TrayIconBuilder::with_id(TRAY_ID)
            .menu(&menu)
            .show_menu_on_left_click(true)
            .tooltip(tooltip);

        let img_data = include_bytes!("../icons/tray-128x128.png");
        if let Ok(img) = image::load_from_memory(img_data) {
            use tauri::image::Image;
            let rgba = img.to_rgba8();
            let (w, h) = rgba.dimensions();
            let icon = Image::new_owned(rgba.into_raw(), w, h);
            builder = builder.icon(icon);
        }

        builder.build(&handle)?;
    }

    // Listen for language changes from the frontend.
    let app_handle = app.clone();
    app.listen("language-changed", move |event| {
        let lang = event.payload();
        set_lang(&app_handle, lang);
        let _ = rebuild_tray(&app_handle);
    });

    Ok(())
}

/// Registers a global menu event handler that reacts to the tray menu items.
pub fn register_menu_handler(app: &AppHandle) {
    app.on_menu_event(|app_handle, event| {
        let id = event.id();

        if id == MENU_ID_OPEN {
            handle_open(app_handle);
        } else if id == MENU_ID_QUERY {
            handle_query(app_handle);
        } else if id == MENU_ID_ABOUT {
            handle_about(app_handle);
        } else if id == MENU_ID_EXIT {
            app_handle.exit(0);
        }
    });
}

fn handle_open(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

fn handle_query(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }

    // Reuse the same event that the global keyboard shortcut emits so
    // the React side doesn't need a special code path for tray clicks.
    let _ = app.emit("new-query", ());
}

fn handle_about(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }

    // Ask the frontend to navigate to Settings → About.
    let _ = app.emit("open-settings-about", ());
}
/// Called by the frontend via `invoke("set_language", { language })`.
#[tauri::command]
pub fn set_tray_language(app: tauri::AppHandle, language: String) -> Result<(), String> {
    set_lang(&app, &language);
    rebuild_tray(&app).map_err(|e| e.to_string())
}
