use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use std::fs::File;
use std::io::{BufReader, Write};
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Emitter};
use zip::ZipArchive;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadProgress {
    pub bytes_downloaded: u64,
    pub total_bytes: Option<u64>,
    pub speed: f64,
    pub progress: f32,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadComplete {
    pub file_path: String,
    pub file_size: u64,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadError {
    pub message: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadArgs {
    pub url: String,
    pub dest_path: String,
    pub max_retries: Option<u32>,
}

async fn download_with_progress(
    app: AppHandle,
    url: &str,
    dest_path: &Path,
    _max_retries: u32,
) -> Result<u64, String> {
    let client = reqwest::Client::new();

    let response = client
        .get(url)
        .send()
        .await
        .map_err(|e| format!("Failed to send request: {e}"))?;

    if !response.status().is_success() {
        return Err(format!("HTTP error: {}", response.status()));
    }

    let total_size = response.content_length();
    let total_size_clone = total_size;

    let mut file = File::create(dest_path)
        .map_err(|e| format!("Failed to create file: {e}"))?;

    let mut downloaded: u64 = 0;
    let mut stream = response.bytes_stream();
    let mut last_update = std::time::Instant::now();
    let mut bytes_since_last_update: u64 = 0;

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("Download error: {e}"))?;
        file.write_all(&chunk)
            .map_err(|e| format!("Write error: {e}"))?;
        downloaded += chunk.len() as u64;
        bytes_since_last_update += chunk.len() as u64;

        let now = std::time::Instant::now();
        let elapsed = now.duration_since(last_update).as_secs_f64();

        if elapsed >= 0.5 {
            let speed = bytes_since_last_update as f64 / elapsed;
            let progress = total_size_clone
                .map(|total| (downloaded as f64 / total as f64 * 100.0) as f32)
                .unwrap_or(0.0);

            let _ = app.emit(
                "download-progress",
                DownloadProgress {
                    bytes_downloaded: downloaded,
                    total_bytes: total_size_clone,
                    speed,
                    progress,
                },
            );

            last_update = now;
            bytes_since_last_update = 0;
        }
    }

    let _ = app.emit(
        "download-complete",
        DownloadComplete {
            file_path: dest_path.to_string_lossy().to_string(),
            file_size: downloaded,
        },
    );

    Ok(downloaded)
}

async fn try_download(app: &AppHandle, url: &str, dest_path: &Path) -> Result<u64, String> {
    let app_clone = app.clone();
    download_with_progress(app_clone, url, dest_path, 3).await
}

#[tauri::command]
pub async fn download_file(app: AppHandle, args: DownloadArgs) -> Result<DownloadComplete, String> {
    let dest_path = PathBuf::from(&args.dest_path);
    let max_retries = args.max_retries.unwrap_or(3);

    let _ = app.emit("download-started", &args.url);

    let mut last_error = String::new();
    for attempt in 1..=max_retries {
        if attempt > 1 {
            tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;
        }

        match try_download(&app, &args.url, &dest_path).await {
            Ok(size) => {
                return Ok(DownloadComplete {
                    file_path: args.dest_path,
                    file_size: size,
                });
            }
            Err(e) => {
                last_error = e.clone();
                let _ = app.emit(
                    "download-error",
                    DownloadError {
                        message: format!("Attempt {attempt} failed: {e}"),
                    },
                );
            }
        }
    }

    Err(format!(
        "Failed after {} attempts: {}",
        max_retries, last_error
    ))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtractZipArgs {
    pub zip_path: String,
    pub dest_dir: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtractProgress {
    pub file_index: usize,
    pub total_files: usize,
    pub current_file: String,
}

#[tauri::command]
pub async fn extract_zip(app: AppHandle, args: ExtractZipArgs) -> Result<String, String> {
    let zip_path = PathBuf::from(&args.zip_path);
    let dest_dir = PathBuf::from(&args.dest_dir);

    if !zip_path.exists() {
        return Err(format!("ZIP file not found: {:?}", zip_path));
    }

    let file = File::open(&zip_path).map_err(|e| format!("Failed to open ZIP: {e}"))?;
    let reader = BufReader::new(file);
    let mut archive = ZipArchive::new(reader).map_err(|e| format!("Invalid ZIP: {e}"))?;

    let total_files = archive.len();
    let dest_str = dest_dir.to_string_lossy().to_string();

    for i in 0..total_files {
        let mut file = archive
            .by_index(i)
            .map_err(|e| format!("Failed to read ZIP entry {i}: {e}"))?;

        let outpath = match file.enclosed_name() {
            Some(path) => dest_dir.join(path),
            None => continue,
        };

        if file.name().ends_with('/') {
            std::fs::create_dir_all(&outpath).map_err(|e| format!("Failed to create dir: {e}"))?;
        } else {
            if let Some(parent) = outpath.parent() {
                if !parent.exists() {
                    std::fs::create_dir_all(parent)
                        .map_err(|e| format!("Failed to create parent dir: {e}"))?;
                }
            }
            let mut outfile = File::create(&outpath)
                .map_err(|e| format!("Failed to create file {:?}: {e}", outpath))?;
            std::io::copy(&mut file, &mut outfile)
                .map_err(|e| format!("Failed to write file {:?}: {e}", outpath))?;
        }

        let _ = app.emit(
            "extract-progress",
            ExtractProgress {
                file_index: i + 1,
                total_files,
                current_file: file.name().to_string(),
            },
        );
    }

    Ok(dest_str)
}
