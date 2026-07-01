use serde::{Deserialize, Deserializer};
use serde_json::Value;
use std::collections::BTreeMap;

#[derive(Debug, serde::Deserialize, serde::Serialize, Clone)]
pub struct DefinitionEntry {
    #[serde(alias = "explanation_en", alias = "explanationSrc")]
    pub explanation_en: String,
    #[serde(alias = "explanation_cn", alias = "explanationTgt")]
    pub explanation_cn: String,
    #[serde(alias = "example_en", alias = "exampleSrc")]
    pub example_en: String,
    #[serde(alias = "example_cn", alias = "exampleTgt")]
    pub example_cn: String,
    #[serde(default)]
    pub pos: String,
}

#[derive(Debug, serde::Deserialize, serde::Serialize, Clone)]
pub struct ComparisonEntry {
    #[serde(default)]
    pub word_to_compare: String,
    #[serde(default)]
    pub analysis: String,
}

#[derive(Debug, serde::Deserialize, serde::Serialize, Clone)]
pub struct WordDefinition {
    pub word: String,
    pub pronunciation: String,
    pub concise_definition: String,
    #[serde(default, deserialize_with = "deserialize_forms")]
    pub forms: BTreeMap<String, String>,
    #[serde(default)]
    pub definitions: Vec<DefinitionEntry>,
    #[serde(default)]
    pub comparison: Vec<ComparisonEntry>,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpsertDictionaryEntryArgs {
    pub cache_path: String,
    pub entry: WordDefinition,
    #[serde(default = "default_dict_type")]
    pub dict_type: String,
}

fn default_dict_type() -> String {
    "en_zh".to_string()
}

fn deserialize_forms<'de, D>(deserializer: D) -> Result<BTreeMap<String, String>, D::Error>
where
    D: Deserializer<'de>,
{
    let raw = Option::<BTreeMap<String, Value>>::deserialize(deserializer)?.unwrap_or_default();

    Ok(raw
        .into_iter()
        .map(|(key, value)| (key, value_to_string(value)))
        .collect())
}

fn value_to_string(value: Value) -> String {
    match value {
        Value::Null => String::new(),
        Value::Bool(b) => b.to_string(),
        Value::Number(num) => num.to_string(),
        Value::String(s) => s,
        Value::Array(items) => items
            .into_iter()
            .map(value_to_string)
            .collect::<Vec<_>>()
            .join(", "),
        Value::Object(_) => "[object]".into(),
    }
}
