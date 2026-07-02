use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use std::fs::{self, File};
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Emitter};

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadProgress {
    pub downloaded: u64,
    pub total: u64,
    pub percentage: f64,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadComplete {
    pub file_path: String,
    pub total_bytes: u64,
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
    pub file_path: String,
    pub max_retries: Option<u32>,
}

async fn download_with_progress(
    app: AppHandle,
    url: &str,
    dest_path: &Path,
    max_retries: u32,
) -> Result<u64, String> {
    let mut attempt = 0;
    let mut last_error = String::new();

    while attempt <= max_retries {
        if attempt > 0 {
            app.emit(
                "download-retry",
                serde_json::json!({
                    "attempt": attempt,
                    "maxRetries": max_retries
                }),
            )
            .ok();
        }

        match try_download(&app, url, dest_path).await {
            Ok(total_bytes) => return Ok(total_bytes),
            Err(err) => {
                last_error = err;
                attempt += 1;
                if attempt <= max_retries {
                    tokio::time::sleep(tokio::time::Duration::from_secs(2_u64.pow(attempt - 1)))
                        .await;
                }
            }
        }
    }

    Err(format!(
        "Download failed after {} attempts: {}",
        max_retries + 1,
        last_error
    ))
}

async fn try_download(app: &AppHandle, url: &str, dest_path: &Path) -> Result<u64, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(300))
        .build()
        .map_err(|e| e.to_string())?;

    let response = client
        .get(url)
        .send()
        .await
        .map_err(|e| format!("Failed to send request: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("HTTP error: {}", response.status()));
    }

    let total_size = response.content_length().unwrap_or(0);

    if let Some(parent) = dest_path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create directory: {}", e))?;
    }

    let mut file = File::create(dest_path).map_err(|e| format!("Failed to create file: {}", e))?;

    let mut stream = response.bytes_stream();
    let mut downloaded: u64 = 0;
    let mut last_progress_emit = 0u64;

    while let Some(chunk_result) = stream.next().await {
        let chunk = chunk_result.map_err(|e| format!("Failed to read chunk: {}", e))?;
        file.write_all(&chunk)
            .map_err(|e| format!("Failed to write chunk: {}", e))?;

        downloaded += chunk.len() as u64;

        let percentage = if total_size > 0 {
            (downloaded as f64 / total_size as f64) * 100.0
        } else {
            0.0
        };

        // Emit progress every 100KB or when we reach/exceed the total
        if downloaded - last_progress_emit >= 1024 * 100 || downloaded >= total_size {
            app.emit(
                "download-progress",
                DownloadProgress {
                    downloaded,
                    total: total_size,
                    percentage,
                },
            )
            .ok();
            last_progress_emit = downloaded;
        }
    }

    file.flush()
        .map_err(|e| format!("Failed to flush file: {}", e))?;

    // Emit final 100% progress
    if total_size > 0 {
        app.emit(
            "download-progress",
            DownloadProgress {
                downloaded,
                total: downloaded.max(total_size), // Use actual downloaded size
                percentage: 100.0,
            },
        )
        .ok();
    }

    Ok(downloaded)
}

#[tauri::command]
pub async fn download_file(app: AppHandle, args: DownloadArgs) -> Result<DownloadComplete, String> {
    if args.url.trim().is_empty() {
        return Err("URL is required".into());
    }

    if args.file_path.trim().is_empty() {
        return Err("File path is required".into());
    }

    let max_retries = args.max_retries.unwrap_or(3);
    let dest_path = PathBuf::from(&args.file_path);

    app.emit("download-start", serde_json::json!({ "url": args.url }))
        .ok();

    match download_with_progress(app.clone(), &args.url, &dest_path, max_retries).await {
        Ok(total_bytes) => {
            let result = DownloadComplete {
                file_path: args.file_path.clone(),
                total_bytes,
            };
            app.emit("download-complete", result.clone()).ok();
            Ok(result)
        }
        Err(err) => {
            app.emit(
                "download-error",
                DownloadError {
                    message: err.clone(),
                },
            )
            .ok();
            Err(err)
        }
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtractZipArgs {
    pub zip_path: String,
    pub extract_to: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtractProgress {
    pub current: usize,
    pub total: usize,
    pub file_name: String,
}

#[tauri::command]
pub async fn extract_zip(app: AppHandle, args: ExtractZipArgs) -> Result<String, String> {
    let zip_path = PathBuf::from(&args.zip_path);
    let extract_to = PathBuf::from(&args.extract_to);

    if !zip_path.exists() {
        return Err("Zip file does not exist".into());
    }

    fs::create_dir_all(&extract_to)
        .map_err(|e| format!("Failed to create extraction directory: {}", e))?;

    let file = File::open(&zip_path).map_err(|e| format!("Failed to open zip file: {}", e))?;
    let mut archive =
        zip::ZipArchive::new(file).map_err(|e| format!("Failed to read zip archive: {}", e))?;

    let total_files = archive.len();

    app.emit(
        "extract-start",
        serde_json::json!({ "totalFiles": total_files }),
    )
    .ok();

    for i in 0..total_files {
        let mut file = archive
            .by_index(i)
            .map_err(|e| format!("Failed to access file in archive: {}", e))?;

        let file_name = file.name().to_string();

        app.emit(
            "extract-progress",
            ExtractProgress {
                current: i + 1,
                total: total_files,
                file_name: file_name.clone(),
            },
        )
        .ok();

        let outpath = extract_to.join(file.name());

        if file.is_dir() {
            fs::create_dir_all(&outpath)
                .map_err(|e| format!("Failed to create directory: {}", e))?;
        } else {
            if let Some(parent) = outpath.parent() {
                fs::create_dir_all(parent)
                    .map_err(|e| format!("Failed to create parent directory: {}", e))?;
            }
            let mut outfile =
                File::create(&outpath).map_err(|e| format!("Failed to create file: {}", e))?;
            io::copy(&mut file, &mut outfile)
                .map_err(|e| format!("Failed to extract file: {}", e))?;
        }

        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            if let Some(mode) = file.unix_mode() {
                fs::set_permissions(&outpath, fs::Permissions::from_mode(mode))
                    .map_err(|e| format!("Failed to set permissions: {}", e))?;
            }
        }
    }

    app.emit("extract-complete", serde_json::json!({})).ok();

    Ok(extract_to.to_string_lossy().into())
}


// === llama.cpp download and server management ===
use std::sync::{Arc, Mutex};
use std::process::Child;
use std::sync::LazyLock;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadAndExtractArgs {
    pub url: String,
    pub dest_dir: String,
}

#[tauri::command]
pub async fn download_and_extract(
    app: AppHandle,
    args: DownloadAndExtractArgs,
) -> Result<String, String> {
    use futures_util::StreamExt;

    if args.url.trim().is_empty() {
        return Err("URL is required".into());
    }
    if args.dest_dir.trim().is_empty() {
        return Err("Destination directory is required".into());
    }

    let dest_dir = PathBuf::from(&args.dest_dir);
    fs::create_dir_all(&dest_dir).map_err(|e| format!("Failed to create directory: {}", e))?;

    // Download zip to temp file
    let temp_zip = dest_dir.join("temp_download.zip");
    let response = reqwest::Client::new()
        .get(&args.url)
        .send()
        .await
        .map_err(|e| format!("Failed to send request: {}", e))?;

    let total_size = response.content_length().unwrap_or(0);
    let mut file = File::create(&temp_zip).map_err(|e| format!("Failed to create temp file: {}", e))?;

    let mut stream = response.bytes_stream();
    let mut downloaded: u64 = 0;

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("Download error: {}", e))?;
        file.write_all(&chunk).map_err(|e| format!("Write error: {}", e))?;
        downloaded += chunk.len() as u64;
        let percentage = if total_size > 0 {
            (downloaded as f64 / total_size as f64) * 100.0
        } else {
            0.0
        };
        app.emit("download-progress", serde_json::json!({
            "downloaded": downloaded,
            "total": total_size,
            "percentage": percentage
        })).ok();
    }

    drop(file);

    // Extract zip
    let file = File::open(&temp_zip).map_err(|e| format!("Failed to open zip: {}", e))?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| format!("Invalid zip: {}", e))?;

    for i in 0..archive.len() {
        let mut archive_file = archive.by_index(i).map_err(|e| format!("Zip error: {}", e))?;
        let outpath = dest_dir.join(archive_file.name());

        if archive_file.is_dir() {
            fs::create_dir_all(&outpath).map_err(|e| format!("Failed to create dir: {}", e))?;
        } else {
            if let Some(parent) = outpath.parent() {
                fs::create_dir_all(parent).map_err(|e| format!("Failed to create parent: {}", e))?;
            }
            let mut outfile = File::create(&outpath).map_err(|e| format!("Failed to create file: {}", e))?;
            io::copy(&mut archive_file, &mut outfile).map_err(|e| format!("Failed to extract: {}", e))?;
        }
    }

    // Cleanup temp zip
    let _ = fs::remove_file(&temp_zip);

    Ok(dest_dir.to_string_lossy().into())
}

static LLAMA_SERVER: LazyLock<Arc<Mutex<Option<Child>>>> = LazyLock::new(|| Arc::new(Mutex::new(None)));

#[tauri::command]
pub fn spawn_llama_server(
    binary_path: String,
    model_path: String,
    n_ctx: u32,
    n_gpu: u32,
    port: u16,
) -> Result<(), String> {
    use std::process::Command;

    // Stop existing server if running
    let mut server = LLAMA_SERVER.lock().map_err(|e| format!("Lock error: {}", e))?;
    if server.is_some() {
        drop(server);
        stop_llama_server()?;
        server = LLAMA_SERVER.lock().map_err(|e| format!("Lock error: {}", e))?;
    }

    let child = Command::new(&binary_path)
        .args([
            "-m", &model_path,
            "-c", &n_ctx.to_string(),
            "--gpu-layers", &n_gpu.to_string(),
            "-p", &port.to_string(),
            "--host", "127.0.0.1",
        ])
        .spawn()
        .map_err(|e| format!("Failed to spawn llama-server: {}", e))?;

    *server = Some(child);
    Ok(())
}

#[tauri::command]
pub fn stop_llama_server() -> Result<(), String> {
    let mut server = LLAMA_SERVER.lock().map_err(|e| format!("Lock error: {}", e))?;
    if let Some(mut child) = server.take() {
        child.kill().map_err(|e| format!("Failed to kill process: {}", e))?;
    }
    Ok(())
}
