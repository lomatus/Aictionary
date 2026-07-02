//! SQLite database layer for the dictionary.

use std::path::PathBuf;
use std::sync::LazyLock;

use parking_lot::Mutex;
use rusqlite::{params, Connection, Result as SqlResult};
use serde::{Deserialize, Serialize};

use super::types::{ComparisonEntry, DefinitionEntry, WordDefinition};

// ---------------------------------------------------------------------------
// Global DB connection — wrapped in Mutex for thread safety
// ---------------------------------------------------------------------------

static DB: LazyLock<Mutex<Connection>> = LazyLock::new(|| {
    Mutex::new(init_db().expect("failed to initialize dictionary database"))
});

pub fn db() -> &'static Mutex<Connection> {
    &DB
}

pub fn db_path(app_data_dir: &PathBuf) -> PathBuf {
    app_data_dir.join("dictionary.db")
}

fn init_db() -> SqlResult<Connection> {
    let app_dir = dirs::data_local_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("aictionary-re");
    std::fs::create_dir_all(&app_dir).ok();
    let db_file = app_dir.join("dictionary.db");

    let conn = Connection::open(&db_file)?;

    conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;")?;

    create_schema(&conn)?;
    seed_default_language_pairs(&conn)?;
    seed_sample_data(&conn)?;

    Ok(conn)
}

fn create_schema(conn: &Connection) -> SqlResult<()> {
    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS language_pairs (
            id          TEXT PRIMARY KEY,
            source_lang TEXT NOT NULL,
            target_lang TEXT NOT NULL,
            name        TEXT NOT NULL,
            name_en     TEXT NOT NULL,
            spellcheck  INTEGER NOT NULL DEFAULT 1,
            enabled     INTEGER NOT NULL DEFAULT 1,
            order_idx   INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS entries_en (
            id                  INTEGER PRIMARY KEY AUTOINCREMENT,
            word                TEXT NOT NULL,
            pair_id             TEXT NOT NULL,
            pronunciation       TEXT DEFAULT '',
            concise_definition  TEXT DEFAULT '',
            forms_json         TEXT DEFAULT '{}',
            definition_text     TEXT DEFAULT '',
            source_type        TEXT NOT NULL DEFAULT 'builtin',
            created_at         TEXT DEFAULT (datetime('now')),
            updated_at         TEXT DEFAULT (datetime('now')),
            UNIQUE(word, pair_id)
        );

        CREATE TABLE IF NOT EXISTS entries_zh (
            id                  INTEGER PRIMARY KEY AUTOINCREMENT,
            word                TEXT NOT NULL,
            pair_id             TEXT NOT NULL,
            pronunciation       TEXT DEFAULT '',
            concise_definition  TEXT DEFAULT '',
            forms_json         TEXT DEFAULT '{}',
            definition_text     TEXT DEFAULT '',
            source_type        TEXT NOT NULL DEFAULT 'builtin',
            created_at         TEXT DEFAULT (datetime('now')),
            updated_at         TEXT DEFAULT (datetime('now')),
            UNIQUE(word, pair_id)
        );

        CREATE TABLE IF NOT EXISTS entries_es (
            id                  INTEGER PRIMARY KEY AUTOINCREMENT,
            word                TEXT NOT NULL,
            pair_id             TEXT NOT NULL,
            pronunciation       TEXT DEFAULT '',
            concise_definition  TEXT DEFAULT '',
            forms_json         TEXT DEFAULT '{}',
            definition_text     TEXT DEFAULT '',
            source_type        TEXT NOT NULL DEFAULT 'builtin',
            created_at         TEXT DEFAULT (datetime('now')),
            updated_at         TEXT DEFAULT (datetime('now')),
            UNIQUE(word, pair_id)
        );

        CREATE TABLE IF NOT EXISTS definitions (
            id               INTEGER PRIMARY KEY AUTOINCREMENT,
            entry_id         INTEGER NOT NULL,
            pair_id          TEXT NOT NULL,
            pos              TEXT DEFAULT '',
            explanation_src  TEXT DEFAULT '',
            explanation_tgt  TEXT DEFAULT '',
            example_src      TEXT DEFAULT '',
            example_tgt      TEXT DEFAULT '',
            sort_order       INTEGER DEFAULT 0,
            UNIQUE(entry_id, pair_id, sort_order)
        );

        CREATE TABLE IF NOT EXISTS comparisons (
            id               INTEGER PRIMARY KEY AUTOINCREMENT,
            entry_id         INTEGER NOT NULL,
            pair_id          TEXT NOT NULL,
            word_to_compare  TEXT DEFAULT '',
            analysis         TEXT DEFAULT '',
            sort_order       INTEGER DEFAULT 0,
            UNIQUE(entry_id, pair_id, sort_order)
        );

        CREATE TABLE IF NOT EXISTS query_history (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            word       TEXT NOT NULL,
            pair_id    TEXT NOT NULL,
            source     TEXT NOT NULL DEFAULT 'builtin',
            queried_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS spelling_corrections (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            variant    TEXT NOT NULL,
            canonical  TEXT NOT NULL,
            pair_id    TEXT NOT NULL,
            edit_dist  INTEGER DEFAULT 1,
            UNIQUE(variant, pair_id)
        );

        CREATE INDEX IF NOT EXISTS idx_entries_en_word ON entries_en(word);
        CREATE INDEX IF NOT EXISTS idx_entries_zh_word ON entries_zh(word);
        CREATE INDEX IF NOT EXISTS idx_entries_es_word ON entries_es(word);
        CREATE INDEX IF NOT EXISTS idx_entries_pair ON entries_en(pair_id);
        CREATE INDEX IF NOT EXISTS idx_defs_entry ON definitions(entry_id, pair_id);
        CREATE INDEX IF NOT EXISTS idx_comps_entry ON comparisons(entry_id, pair_id);
        CREATE INDEX IF NOT EXISTS idx_spell_variant ON spelling_corrections(variant);
        CREATE INDEX IF NOT EXISTS idx_qhist_word ON query_history(word);
        CREATE INDEX IF NOT EXISTS idx_qhist_pair ON query_history(pair_id);
        "#,
    )?;
    Ok(())
}

fn seed_default_language_pairs(conn: &Connection) -> SqlResult<()> {
    let defaults = [
        ("en_zh", "en", "zh", "英汉", "English → Chinese", 1, 1, 0),
        ("zh_en", "zh", "en", "汉英", "Chinese → English", 0, 1, 1),
        ("en_es", "en", "es", "英西", "English → Spanish", 1, 1, 2),
        ("es_en", "es", "en", "西英", "Spanish → English", 0, 1, 3),
    ];

    for (id, src, tgt, name, name_en, spellcheck, enabled, order) in defaults {
        conn.execute(
            "INSERT OR IGNORE INTO language_pairs (id, source_lang, target_lang, name, name_en, spellcheck, enabled, order_idx)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![id, src, tgt, name, name_en, spellcheck, enabled, order],
        )?;
    }
    Ok(())
}

fn seed_sample_data(conn: &Connection) -> SqlResult<()> {
    // Only seed if the database is empty
    let count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM entries_en WHERE pair_id = 'en_zh'",
        [],
        |r| r.get(0),
    )?;
    if count > 0 {
        return Ok(());
    }

    use super::types::{ComparisonEntry, DefinitionEntry, WordDefinition};
    use std::collections::BTreeMap;

    let en_zh_words: Vec<WordDefinition> = vec![
        WordDefinition {
            word: "apple".into(),
            pronunciation: "ap·ul".into(),
            concise_definition: "n. 苹果".into(),
            forms: BTreeMap::from([("plural".into(), "apples".into())]),
            definitions: vec![DefinitionEntry {
                explanation_en: "A round fruit with red or yellow skin, known for its crisp texture and sweet or tart flavor.".into(),
                explanation_cn: "一种圆形水果，通常呈红色或黄色，口感脆爽，味道甜美或酸甜。".into(),
                example_en: "She ate a red apple as a snack.".into(),
                example_cn: "她吃了一个红苹果作为零食。".into(),
                pos: "noun".into(),
            }],
            comparison: vec![
                ComparisonEntry { word_to_compare: "fruit".into(), analysis: "\"Fruit\" is a general term for any sweet plant product. \"Apple\" is a specific fruit type.".into() },
                ComparisonEntry { word_to_compare: "pear".into(), analysis: "\"Pear\" is similar in shape but softer and sweeter. Apple is crisper and can be tart.".into() },
            ],
        },
        WordDefinition {
            word: "banana".into(),
            pronunciation: "buh·nan·uh".into(),
            concise_definition: "n. 香蕉".into(),
            forms: BTreeMap::from([("plural".into(), "bananas".into())]),
            definitions: vec![DefinitionEntry {
                explanation_en: "A long curved fruit with a yellow skin.".into(),
                explanation_cn: "一种长而弯曲的水果，皮呈黄色。".into(),
                example_en: "I ate a banana for breakfast.".into(),
                example_cn: "我早餐吃了一根香蕉。".into(),
                pos: "noun".into(),
            }],
            comparison: vec![],
        },
        WordDefinition {
            word: "hello".into(),
            pronunciation: "heh·loh".into(),
            concise_definition: "interj. 你好".into(),
            forms: BTreeMap::new(),
            definitions: vec![DefinitionEntry {
                explanation_en: "Used as a greeting.".into(),
                explanation_cn: "用于问候。".into(),
                example_en: "Hello, how are you?".into(),
                example_cn: "你好，你好吗？".into(),
                pos: "interjection".into(),
            }],
            comparison: vec![],
        },
        WordDefinition {
            word: "world".into(),
            pronunciation: "wurld".into(),
            concise_definition: "n. 世界".into(),
            forms: BTreeMap::from([("plural".into(), "worlds".into())]),
            definitions: vec![DefinitionEntry {
                explanation_en: "The earth and everything on it.".into(),
                explanation_cn: "地球及其上的所有人和事物。".into(),
                example_en: "The world is vast and full of wonders.".into(),
                example_cn: "世界广阔而充满奇迹。".into(),
                pos: "noun".into(),
            }],
            comparison: vec![],
        },
        WordDefinition {
            word: "computer".into(),
            pronunciation: "kum·pyoo·ter".into(),
            concise_definition: "n. 电脑".into(),
            forms: BTreeMap::from([("plural".into(), "computers".into())]),
            definitions: vec![DefinitionEntry {
                explanation_en: "An electronic device for storing and processing information.".into(),
                explanation_cn: "用于存储和处理信息的电子设备。".into(),
                example_en: "I use a computer for work.".into(),
                example_cn: "我用电脑工作。".into(),
                pos: "noun".into(),
            }],
            comparison: vec![],
        },
        WordDefinition {
            word: "dictionary".into(),
            pronunciation: "dik·shuh·ner·ee".into(),
            concise_definition: "n. 词典".into(),
            forms: BTreeMap::from([("plural".into(), "dictionaries".into())]),
            definitions: vec![DefinitionEntry {
                explanation_en: "A book or resource that lists words with their meanings.".into(),
                explanation_cn: "列出单词及其含义的书或资源。".into(),
                example_en: "I looked it up in the dictionary.".into(),
                example_cn: "我在词典里查到了它。".into(),
                pos: "noun".into(),
            }],
            comparison: vec![],
        },
        WordDefinition {
            word: "abandon".into(),
            pronunciation: "uh·ban·don".into(),
            concise_definition: "v. 抛弃".into(),
            forms: BTreeMap::from([("past".into(), "abandoned".into()), ("gerund".into(), "abandoning".into())]),
            definitions: vec![DefinitionEntry {
                explanation_en: "To leave or give up completely.".into(),
                explanation_cn: "完全离开或放弃。".into(),
                example_en: "They had to abandon the ship.".into(),
                example_cn: "他们不得不弃船。".into(),
                pos: "verb".into(),
            }],
            comparison: vec![],
        },
        WordDefinition {
            word: "ability".into(),
            pronunciation: "uh·bil·uh·tee".into(),
            concise_definition: "n. 能力".into(),
            forms: BTreeMap::from([("plural".into(), "abilities".into())]),
            definitions: vec![DefinitionEntry {
                explanation_en: "The capacity to do something.".into(),
                explanation_cn: "做某事的能力。".into(),
                example_en: "She has the ability to learn quickly.".into(),
                example_cn: "她有快速学习的能力。".into(),
                pos: "noun".into(),
            }],
            comparison: vec![],
        },
    ];

    for entry in en_zh_words {
        upsert_entry(conn, &entry, "en_zh", "builtin")?;
    }

    let zh_en_words: Vec<WordDefinition> = vec![
        WordDefinition {
            word: "苹果".into(),
            pronunciation: "".into(),
            concise_definition: "n. apple".into(),
            forms: BTreeMap::new(),
            definitions: vec![DefinitionEntry {
                explanation_en: "A round fruit with red or yellow skin.".into(),
                explanation_cn: "一种圆形水果，皮呈红色或黄色。".into(),
                example_en: "She ate an apple.".into(),
                example_cn: "她吃了一个苹果。".into(),
                pos: "noun".into(),
            }],
            comparison: vec![],
        },
        WordDefinition {
            word: "你好".into(),
            pronunciation: "nǐ hǎo".into(),
            concise_definition: "interj. hello".into(),
            forms: BTreeMap::new(),
            definitions: vec![DefinitionEntry {
                explanation_en: "Used as a greeting.".into(),
                explanation_cn: "用于问候。".into(),
                example_en: "Hello, how are you?".into(),
                example_cn: "你好，你好吗？".into(),
                pos: "interjection".into(),
            }],
            comparison: vec![],
        },
        WordDefinition {
            word: "世界".into(),
            pronunciation: "shì jiè".into(),
            concise_definition: "n. world".into(),
            forms: BTreeMap::new(),
            definitions: vec![DefinitionEntry {
                explanation_en: "The earth and everything on it.".into(),
                explanation_cn: "地球及其上的所有人和事物。".into(),
                example_en: "The world is beautiful.".into(),
                example_cn: "世界很美好。".into(),
                pos: "noun".into(),
            }],
            comparison: vec![],
        },
    ];

    for entry in zh_en_words {
        upsert_entry(conn, &entry, "zh_en", "builtin")?;
    }

    Ok(())
}

// ---------------------------------------------------------------------------
// Language pair helpers
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LanguagePair {
    pub id: String,
    pub source_lang: String,
    pub target_lang: String,
    pub name: String,
    pub name_en: String,
    pub spellcheck: bool,
    pub enabled: bool,
}

impl LanguagePair {
    pub fn entries_table(&self) -> &'static str {
        match self.source_lang.as_str() {
            "en" => "entries_en",
            "zh" => "entries_zh",
            "es" => "entries_es",
            _ => "entries_en",
        }
    }
}

pub fn get_language_pair(conn: &Connection, pair_id: &str) -> SqlResult<Option<LanguagePair>> {
    let mut stmt = conn.prepare(
        "SELECT id, source_lang, target_lang, name, name_en, spellcheck, enabled
         FROM language_pairs WHERE id = ?1",
    )?;
    let mut rows = stmt.query(params![pair_id])?;
    if let Some(row) = rows.next()? {
        Ok(Some(LanguagePair {
            id: row.get(0)?,
            source_lang: row.get(1)?,
            target_lang: row.get(2)?,
            name: row.get(3)?,
            name_en: row.get(4)?,
            spellcheck: row.get::<_, i32>(5)? != 0,
            enabled: row.get::<_, i32>(6)? != 0,
        }))
    } else {
        Ok(None)
    }
}

pub fn list_enabled_pairs(conn: &Connection) -> SqlResult<Vec<LanguagePair>> {
    let mut stmt = conn.prepare(
        "SELECT id, source_lang, target_lang, name, name_en, spellcheck, enabled
         FROM language_pairs WHERE enabled = 1 ORDER BY order_idx",
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(LanguagePair {
            id: row.get(0)?,
            source_lang: row.get(1)?,
            target_lang: row.get(2)?,
            name: row.get(3)?,
            name_en: row.get(4)?,
            spellcheck: row.get::<_, i32>(5)? != 0,
            enabled: row.get::<_, i32>(6)? != 0,
        })
    })?;
    rows.collect()
}

// ---------------------------------------------------------------------------
// Query result types
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type")]
pub enum Suggestion {
    Prefix { words: Vec<String> },
    Spellcheck { candidates: Vec<SpellcheckCandidate> },
    Lemma { lemma: String },
}

#[derive(Debug, Clone, Serialize)]
pub struct SpellcheckCandidate {
    pub word: String,
    pub distance: i32,
}

#[derive(Debug, Clone, Serialize)]
pub struct QueryResult {
    pub entry: Option<WordDefinition>,
    pub suggestion: Option<Suggestion>,
}

fn normalize(word: &str) -> String {
    word.trim().to_lowercase()
}

pub fn query_word(conn: &Connection, word: &str, pair_id: &str) -> SqlResult<QueryResult> {
    let normalized = normalize(word);
    let pair = get_language_pair(conn, pair_id)?;

    let Some(pair) = pair else { eprintln!("[query_word] pair not found for pair_id={:?}", pair_id);
        return Ok(QueryResult { entry: None, suggestion: None });
    };

    let table = pair.entries_table();

    // Try exact match
    if let Some(entry) = lookup_entry(conn, table, &normalized, pair_id)? {
        let _ = conn.execute(
            "INSERT INTO query_history (word, pair_id) VALUES (?1, ?2)",
            params![normalized, pair_id],
        );
        return Ok(QueryResult { entry: Some(entry), suggestion: None });
    }

    // Build suggestion on NOT_FOUND
    let suggestion = build_suggestion(conn, &normalized, pair_id, &pair);

    Ok(QueryResult { entry: None, suggestion })
}

fn lookup_entry(
    conn: &Connection,
    table: &str,
    word: &str,
    pair_id: &str,
) -> SqlResult<Option<WordDefinition>> {
    let sql = format!(
        "SELECT id, word, pronunciation, concise_definition, forms_json, source_type
         FROM {table} WHERE word = ?1 AND pair_id = ?2"
    );
    let mut stmt = conn.prepare(&sql)?;
    let mut rows = stmt.query(params![word, pair_id])?;

    if let Some(row) = rows.next()? {
        let entry_id: i64 = row.get(0)?;
        let word_str: String = row.get(1)?;
        let definitions = load_definitions(conn, entry_id, pair_id)?;
        let comparisons = load_comparisons(conn, entry_id, pair_id)?;
        let forms_json: String = row.get::<_, String>(4).unwrap_or_default();

        let forms: serde_json::Map<String, serde_json::Value> =
            serde_json::from_str(&forms_json).unwrap_or_default();
        let forms: std::collections::BTreeMap<String, String> = forms
            .into_iter()
            .filter_map(|(k, v)| v.as_str().map(|s| (k, s.to_string())))
            .collect();

        Ok(Some(WordDefinition {
            word: word_str,
            pronunciation: row.get::<_, String>(2).unwrap_or_default(),
            concise_definition: row.get::<_, String>(3).unwrap_or_default(),
            forms,
            definitions,
            comparison: comparisons,
        }))
    } else {
        Ok(None)
    }
}

fn load_definitions(conn: &Connection, entry_id: i64, pair_id: &str) -> SqlResult<Vec<DefinitionEntry>> {
    let mut stmt = conn.prepare(
        "SELECT pos, explanation_src, explanation_tgt, example_src, example_tgt
         FROM definitions WHERE entry_id = ?1 AND pair_id = ?2 ORDER BY sort_order",
    )?;
    let rows = stmt.query_map(params![entry_id, pair_id], |row| {
        Ok(DefinitionEntry {
            pos: row.get(0)?,
            explanation_en: row.get::<_, String>(1).unwrap_or_default(),
            explanation_cn: row.get::<_, String>(2).unwrap_or_default(),
            example_en: row.get::<_, String>(3).unwrap_or_default(),
            example_cn: row.get::<_, String>(4).unwrap_or_default(),
        })
    })?;
    rows.collect()
}

fn load_comparisons(conn: &Connection, entry_id: i64, pair_id: &str) -> SqlResult<Vec<ComparisonEntry>> {
    let mut stmt = conn.prepare(
        "SELECT word_to_compare, analysis FROM comparisons
         WHERE entry_id = ?1 AND pair_id = ?2 ORDER BY sort_order",
    )?;
    let rows = stmt.query_map(params![entry_id, pair_id], |row| {
        Ok(ComparisonEntry {
            word_to_compare: row.get(0)?,
            analysis: row.get(1)?,
        })
    })?;
    rows.collect()
}

// ---------------------------------------------------------------------------
// Suggestion builders
// ---------------------------------------------------------------------------

fn build_suggestion(
    conn: &Connection,
    word: &str,
    pair_id: &str,
    pair: &LanguagePair,
) -> Option<Suggestion> {
    // 1. Prefix match
    if let Some(suggestion) = prefix_suggestion(conn, word, pair_id, pair) {
        return Some(suggestion);
    }

    // 2. Spelling correction (English only)
    if pair.spellcheck && pair.source_lang == "en" {
        if let Some(suggestion) = spellcheck_suggestion(conn, word, pair_id, pair) {
            return Some(suggestion);
        }
    }

    // 3. Lemma reduction (English only)
    if pair.source_lang == "en" {
        if let Some(lemma) = english_lemma(word) {
            let table = pair.entries_table();
            let sql = format!("SELECT 1 FROM {table} WHERE word = ?1 AND pair_id = ?2");
            let exists: bool = conn
                .query_row(&sql, params![&lemma, pair_id], |_| Ok(true))
                .unwrap_or(false);
            if exists {
                return Some(Suggestion::Lemma { lemma });
            }
        }
    }

    None
}

fn prefix_suggestion(
    conn: &Connection,
    word: &str,
    pair_id: &str,
    pair: &LanguagePair,
) -> Option<Suggestion> {
    let table = pair.entries_table();
    let prefix = word.to_lowercase();
    let prefix_len = prefix.len();

    // Score = how many chars of the candidate word the prefix accounts for
    // divided by candidate length, plus definition richness bonus.
    // This surfaces 'apple'(5) > 'appeal'(6) > 'application'(11) for input 'app'.
    let sql = format!(
        "SELECT word, LENGTH(definition_text) as dl
         FROM {table}
         WHERE word LIKE ?1 || '%' AND pair_id = ?2"
    );
    let mut stmt = conn.prepare(&sql).ok()?;
    let mut scored: Vec<(String, i32)> = stmt
        .query_map(params![&prefix, pair_id], |r| {
            Ok((r.get::<_, String>(0)?, r.get::<_, i32>(1)?))
        })
        .ok()?
        .filter_map(|r| r.ok())
        .filter(|(w, _)| w != &prefix)
        .map(|(w, dl)| {
            let w_lower = w.to_lowercase();
            let prefix_ratio = if w_lower.starts_with(&prefix) {
                prefix_len as f64 / w_lower.len() as f64
            } else {
                0.0
            };
            let score = (prefix_ratio * 1000.0) as i32 - w_lower.len() as i32 + dl / 10;
            (w, score)
        })
        .collect();

    scored.sort_by_key(|(_, s)| -s);
    scored.truncate(5);

    let words: Vec<String> = scored.into_iter().map(|(w, _)| w).collect();

    if words.is_empty() {
        None
    } else {
        Some(Suggestion::Prefix { words })
    }
}

fn spellcheck_suggestion(
    conn: &Connection,
    word: &str,
    pair_id: &str,
    _pair: &LanguagePair,
) -> Option<Suggestion> {
    let first_char = word.chars().next()?.to_string();

    let candidates: Vec<String> = {
        let sql = "SELECT word FROM entries_en WHERE pair_id = ?1 AND word LIKE ?2 || '%' LIMIT 200";
        let mut stmt = conn.prepare(sql).ok()?;
        let rows = stmt.query_map(params![pair_id, &first_char], |row| row.get::<_, String>(0));
        match rows {
            Ok(rows) => rows.filter_map(|r| r.ok()).collect(),
            Err(_) => Vec::new(),
        }
    };

    let mut scored: Vec<(String, i32)> = candidates
        .into_iter()
        .filter(|c| c != word)
        .filter_map(|candidate| {
            let dist = strsim::levenshtein(word, &candidate) as i32;
            (dist <= 3 && dist > 0).then_some((candidate, dist))
        })
        .collect();

    scored.sort_by_key(|(_, d)| *d);
    scored.truncate(3);

    if scored.is_empty() {
        None
    } else {
        Some(Suggestion::Spellcheck {
            candidates: scored
                .into_iter()
                .map(|(word, distance)| SpellcheckCandidate { word, distance })
                .collect(),
        })
    }
}

fn english_lemma(word: &str) -> Option<String> {
    if word.len() < 4 {
        return None;
    }

    let suffixes = [
        ("ies", "y"),
        ("es", ""),
        ("s", ""),
        ("ed", ""),
        ("ing", ""),
    ];

    for (suffix, replacement) in suffixes {
        if let Some(stem) = word.strip_suffix(suffix) {
            if !stem.is_empty() {
                return Some(format!("{}{}", stem, replacement));
            }
        }
    }

    None
}

// ---------------------------------------------------------------------------
// Write / upsert
// ---------------------------------------------------------------------------

pub fn upsert_entry(
    conn: &Connection,
    entry: &WordDefinition,
    pair_id: &str,
    source_type: &str,
) -> SqlResult<()> {
    let Some(pair) = get_language_pair(conn, pair_id)? else {
        return Ok(());
    };
    let table = pair.entries_table();
    let normalized = normalize(&entry.word);

    let forms_json = serde_json::to_string(&entry.forms).unwrap_or_else(|_| "{}".to_string());
    let definition_text = entry
        .definitions
        .iter()
        .map(|d| format!("{} {}", d.explanation_en, d.explanation_cn))
        .collect::<Vec<_>>()
        .join(" ");

    let sql = format!(
        "INSERT INTO {table} (word, pair_id, pronunciation, concise_definition, forms_json, definition_text, source_type, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, datetime('now'))
         ON CONFLICT(word, pair_id) DO UPDATE SET
            pronunciation = excluded.pronunciation,
            concise_definition = excluded.concise_definition,
            forms_json = excluded.forms_json,
            definition_text = excluded.definition_text,
            source_type = excluded.source_type,
            updated_at = datetime('now')"
    );
    conn.execute(
        &sql,
        params![
            normalized,
            pair_id,
            &entry.pronunciation,
            &entry.concise_definition,
            &forms_json,
            &definition_text,
            source_type,
        ],
    )?;

    let entry_id: i64 = conn.query_row(
        &format!("SELECT id FROM {table} WHERE word = ?1 AND pair_id = ?2"),
        params![normalized, pair_id],
        |row| row.get(0),
    )?;

    conn.execute(
        "DELETE FROM definitions WHERE entry_id = ?1 AND pair_id = ?2",
        params![entry_id, pair_id],
    )?;
    conn.execute(
        "DELETE FROM comparisons WHERE entry_id = ?1 AND pair_id = ?2",
        params![entry_id, pair_id],
    )?;

    for (i, def) in entry.definitions.iter().enumerate() {
        conn.execute(
            "INSERT INTO definitions (entry_id, pair_id, pos, explanation_src, explanation_tgt, example_src, example_tgt, sort_order)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                entry_id,
                pair_id,
                &def.pos,
                &def.explanation_en,
                &def.explanation_cn,
                &def.example_en,
                &def.example_cn,
                i as i32,
            ],
        )?;
    }

    for (i, comp) in entry.comparison.iter().enumerate() {
        conn.execute(
            "INSERT INTO comparisons (entry_id, pair_id, word_to_compare, analysis, sort_order)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![
                entry_id,
                pair_id,
                &comp.word_to_compare,
                &comp.analysis,
                i as i32,
            ],
        )?;
    }

    Ok(())
}

pub fn bulk_import(conn: &Connection, pair_id: &str, entries: &[WordDefinition]) -> SqlResult<usize> {
    if get_language_pair(conn, pair_id)?.is_none() {
        return Ok(0);
    }
    let mut count = 0;
    for entry in entries {
        if upsert_entry(conn, entry, pair_id, "builtin").is_ok() {
            count += 1;
        }
    }
    Ok(count)
}

// ---------------------------------------------------------------------------
// Count / exists helpers
// ---------------------------------------------------------------------------

pub fn count_entries(conn: &Connection, pair_id: Option<&str>) -> SqlResult<u64> {
    match pair_id {
        Some(pid) => {
            let Some(pair) = get_language_pair(conn, pid)? else {
                return Ok(0);
            };
            let table = pair.entries_table();
            let sql = format!("SELECT COUNT(*) FROM {table} WHERE pair_id = ?1");
            conn.query_row(&sql, params![pid], |row| row.get(0))
        }
        None => {
            let total: u64 = ["entries_en", "entries_zh", "entries_es"]
                .iter()
                .map(|t| {
                    conn.query_row(&format!("SELECT COUNT(*) FROM {t}"), [], |row| row.get(0))
                        .unwrap_or(0)
                })
                .sum();
            Ok(total)
        }
    }
}

pub fn has_entries(conn: &Connection, pair_id: &str) -> SqlResult<bool> {
    let Some(pair) = get_language_pair(conn, pair_id)? else {
        return Ok(false);
    };
    let table = pair.entries_table();
    let sql = format!("SELECT 1 FROM {table} WHERE pair_id = ?1 LIMIT 1");
    let exists = conn
        .query_row(&sql, params![pair_id], |_| Ok(true))
        .unwrap_or(false);
    Ok(exists)
}

pub fn resolve_pair_from_lang(conn: &Connection, lang: &str) -> SqlResult<Option<String>> {
    let mut stmt = conn.prepare(
        "SELECT id FROM language_pairs WHERE source_lang = ?1 AND enabled = 1 ORDER BY order_idx LIMIT 1",
    )?;
    let result: Option<String> = stmt
        .query_row(params![lang], |row| row.get(0))
        .ok();
    Ok(result)
}
