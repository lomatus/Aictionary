use std::fs;
use tauri::{AppHandle, Manager};

use super::db::{
    bulk_import, count_entries, db, has_entries, list_enabled_pairs, query_word, upsert_entry,
    LanguagePair, QueryResult,
};
use super::types::{UpsertDictionaryEntryArgs, WordDefinition};
use super::utils::resolve_cache_dir;

#[tauri::command]
pub fn dictionary_query(word: String, dict_type: Option<String>) -> Result<QueryResult, String> {
    let word = word.trim();
    if word.is_empty() {
        return Err("Word is required".into());
    }

    let pair_id = dict_type.unwrap_or_else(|| "en_zh".to_string());
    eprintln!("[dictionary_query] word={:?}, pair_id={:?}", word, pair_id);

    let conn = db().lock();
    query_word(&conn, word, &pair_id).map_err(|e| format!("Dictionary query failed: {}", e))
}

#[tauri::command]
pub fn upsert_dictionary_entry(args: UpsertDictionaryEntryArgs) -> Result<(), String> {
    let UpsertDictionaryEntryArgs {
        entry, dict_type, ..
    } = args;

    let word = entry.word.trim().to_string();
    if word.is_empty() {
        return Err("Word is required".into());
    }

    let pair_id = if dict_type.is_empty() {
        "en_zh"
    } else {
        &dict_type
    };

    let conn = db().lock();
    upsert_entry(&conn, &entry, pair_id, "llm").map_err(|e| format!("Failed to save entry: {}", e))
}

#[tauri::command]
pub fn get_default_dictionary_path(app: AppHandle) -> Result<String, String> {
    let app_dir = app.path().app_data_dir().map_err(|err| err.to_string())?;
    let dict_path = app_dir.join("dictionary");
    fs::create_dir_all(&dict_path).map_err(|err| err.to_string())?;
    Ok(dict_path.to_string_lossy().into())
}

#[tauri::command]
pub fn check_dictionary_cache_exists(_cache_path: String) -> Result<bool, String> {
    let conn = db().lock();
    let count = count_entries(&conn, None).map_err(|e| e.to_string())?;
    Ok(count > 0)
}

#[tauri::command]
pub fn count_dictionary_entries(
    _cache_path: String,
    dict_type: Option<String>,
) -> Result<u64, String> {
    let conn = db().lock();
    count_entries(&conn, dict_type.as_deref()).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_language_pairs() -> Result<Vec<LanguagePair>, String> {
    let conn = db().lock();
    list_enabled_pairs(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn import_dictionary_from_dir(source_dir: String, dict_type: String) -> Result<usize, String> {
    let source_dir = resolve_cache_dir(&source_dir)?;
    if !source_dir.exists() {
        return Err("Source directory does not exist".into());
    }

    let mut count = 0;
    let entries: Vec<WordDefinition> = {
        let mut entries = Vec::new();
        let dir = fs::read_dir(&source_dir).map_err(|e| e.to_string())?;
        for entry in dir {
            let entry = entry.map_err(|e| e.to_string())?;
            let path = entry.path();
            if path.extension().and_then(|s| s.to_str()) != Some("json") {
                continue;
            }
            let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
            match serde_json::from_str::<WordDefinition>(&content) {
                Ok(word_entry) => entries.push(word_entry),
                Err(e) => eprintln!("Skipping {:?}: {}", path, e),
            }
        }
        entries
    };

    let conn = db().lock();
    for entry in &entries {
        if upsert_entry(&conn, entry, &dict_type, "builtin").is_ok() {
            count += 1;
        }
    }
    Ok(count)
}

#[tauri::command]
pub fn is_sentence(text: String) -> bool {
    text.contains(' ') || text.len() > 30
}

#[tauri::command]
pub fn get_actual_db_path() -> Result<String, String> {
    let app_dir = dirs::data_local_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join("aictionary");
    let db_file = app_dir.join("dictionary.db");
    Ok(db_file.to_string_lossy().into_owned())
}
