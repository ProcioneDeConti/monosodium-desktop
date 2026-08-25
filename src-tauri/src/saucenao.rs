use serde::{Deserialize, Serialize};

use crate::api::AppState;

/// Reverse image search via SauceNAO (https://saucenao.com) - drag-and-drop a local image file
/// onto the window (App.tsx listens for Tauri's native drag-drop event, which hands over file
/// system paths directly rather than requiring the HTML5 File API) and this uploads it as
/// multipart form data. Wholly separate from api.rs's e621/e6AI `request()` helper - a different
/// host entirely, with its own unrelated API key and rate limit (SauceNAO's own, not e621's).
///
/// **Confidence caveat**: SauceNAO's `output_type=2` JSON response varies its `data` object's
/// exact fields by which index matched (booru, Pixiv, Twitter, ...) - deserialized loosely via
/// `serde_json::Value` here and only the handful of broadly-common fields (`similarity`,
/// `thumbnail`, `title`, `ext_urls`) are pulled out, rather than a strict per-index-type struct
/// this app has no way to enumerate exhaustively. Not independently verified against a live
/// response.
const SAUCENAO_URL: &str = "https://saucenao.com/search.php";

#[derive(Debug, Clone, Serialize)]
pub struct SauceResult {
    pub similarity: f64,
    pub thumbnail: Option<String>,
    pub title: Option<String>,
    pub ext_urls: Vec<String>,
}

#[derive(Debug, Deserialize)]
struct RawResponse {
    #[serde(default)]
    results: Vec<RawResult>,
}

#[derive(Debug, Deserialize)]
struct RawResult {
    header: RawHeader,
    #[serde(default)]
    data: serde_json::Value,
}

#[derive(Debug, Deserialize)]
struct RawHeader {
    similarity: String,
    thumbnail: Option<String>,
}

#[tauri::command]
pub async fn reverse_image_search(
    state: tauri::State<'_, AppState>,
    api_key: Option<String>,
    file_path: String,
) -> Result<Vec<SauceResult>, String> {
    let bytes = std::fs::read(&file_path).map_err(|e| e.to_string())?;
    let file_name = std::path::Path::new(&file_path)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("image")
        .to_string();

    let part = reqwest::multipart::Part::bytes(bytes).file_name(file_name);
    let form = reqwest::multipart::Form::new().part("file", part);

    let mut query: Vec<(&str, String)> = vec![("output_type", "2".to_string()), ("numres", "8".to_string())];
    if let Some(key) = api_key.filter(|k| !k.is_empty()) {
        query.push(("api_key", key));
    }

    let response = state
        .http
        .post(SAUCENAO_URL)
        .query(&query)
        .multipart(form)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !response.status().is_success() {
        return Err(format!("SauceNAO error {}", response.status()));
    }

    let parsed: RawResponse = response.json().await.map_err(|e| e.to_string())?;
    Ok(parsed
        .results
        .into_iter()
        .map(|r| SauceResult {
            similarity: r.header.similarity.parse().unwrap_or(0.0),
            thumbnail: r.header.thumbnail,
            title: r.data.get("title").and_then(|v| v.as_str()).map(String::from),
            ext_urls: r
                .data
                .get("ext_urls")
                .and_then(|v| v.as_array())
                .map(|arr| arr.iter().filter_map(|x| x.as_str().map(String::from)).collect())
                .unwrap_or_default(),
        })
        .collect())
}
