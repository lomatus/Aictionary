//! Llama server lifecycle management.

use parking_lot::Mutex;
use std::net::TcpListener;
use std::process::Child;
use std::sync::Arc;
use tauri::Manager;

pub struct LlamaState {
    pub child: Mutex<Option<Child>>,
    pub port: Mutex<u16>,
}

impl Default for LlamaState {
    fn default() -> Self {
        Self {
            child: Mutex::new(None),
            port: Mutex::new(0),
        }
    }
}

fn kill_child(state: &Arc<LlamaState>) {
    let mut guard = state.child.lock();
    if let Some(mut child) = guard.take() {
        let _ = child.kill();
    }
    *state.port.lock() = 0;
}

#[tauri::command]
pub fn start_llama_server(
    state: tauri::State<'_, Arc<LlamaState>>,
    binary_path: String,
    model_path: String,
    n_ctx: u32,
    n_gpu_layers: u32,
    hint_port: u16,
) -> Result<u16, String> {
    use std::process::Command;

    eprintln!("[llama_server] binary_path: {}", binary_path);
    eprintln!("[llama_server] model_path: {}", model_path);
    eprintln!("[llama_server] cwd: {:?}", std::env::current_dir());

    kill_child(&state);

    let port = find_free_port(if hint_port == 0 { 11435 } else { hint_port });
    eprintln!("[llama_server] using port: {}", port);

    let binary_dir = std::path::Path::new(&binary_path)
        .parent()
        .map(|p| p.to_path_buf());

    let mut child = match binary_dir {
        Some(dir) => {
            eprintln!(
                "[llama_server] spawning with cwd: {:?}",
                dir
            );
            Command::new(&binary_path)
                .current_dir(&dir)
                .args([
                    "-m", &model_path,
                    "-c", &n_ctx.to_string(),
                    "--gpu-layers", &n_gpu_layers.to_string(),
                    "--host", "127.0.0.1",
                    "--port", &port.to_string(),
                ])
                .spawn()
        }
        None => {
            eprintln!("[llama_server] spawning with default cwd");
            Command::new(&binary_path)
                .args([
                    "-m", &model_path,
                    "-c", &n_ctx.to_string(),
                    "--gpu-layers", &n_gpu_layers.to_string(),
                    "--host", "127.0.0.1",
                    "--port", &port.to_string(),
                ])
                .spawn()
        }
    }
    .map_err(|e| format!("Failed to spawn llama-server: {}", e))?;

    eprintln!("[llama_server] child spawned, waiting 2s...");
    std::thread::sleep(std::time::Duration::from_secs(2));

    eprintln!("[llama_server] checking try_wait...");
    match child.try_wait() {
        Ok(Some(exit)) => {
            eprintln!("[llama_server] exited immediately: {:?}", exit);
            if let Ok(status) = child.wait() {
                eprintln!("[llama_server] wait status: {:?}", status);
            }
            Err(format!(
                "llama-server exited immediately with code {:?}. binary={} model={}",
                exit.code(),
                binary_path,
                model_path,
            ))
        }
        Ok(None) => {
            eprintln!("[llama_server] still running, storing handle");
            *state.child.lock() = Some(child);
            *state.port.lock() = port;
            Ok(port)
        }
        Err(e) => {
            eprintln!("[llama_server] try_wait error: {}", e);
            Err(format!("try_wait error: {}", e))
        }
    }
}

#[tauri::command]
pub fn stop_llama_server(state: tauri::State<'_, Arc<LlamaState>>) -> Result<(), String> {
    kill_child(&state);
    Ok(())
}

#[tauri::command]
pub fn get_llama_server_status(
    state: tauri::State<'_, Arc<LlamaState>>,
) -> Result<LlamaStatus, String> {
    let port = *state.port.lock();
    let mut child_guard = state.child.lock();
    match child_guard.as_mut() {
        Some(child) => {
            match child.try_wait() {
                Ok(Some(_)) => {
                    let _ = child_guard.take();
                    Ok(LlamaStatus { running: false, port: 0 })
                }
                Ok(None) => Ok(LlamaStatus { running: true, port }),
                Err(_) => Ok(LlamaStatus { running: false, port: 0 }),
            }
        }
        None => Ok(LlamaStatus { running: false, port: 0 }),
    }
}

#[derive(Clone, serde::Serialize)]
pub struct LlamaStatus {
    pub running: bool,
    pub port: u16,
}

#[tauri::command]
pub async fn get_resource_dir(app: tauri::AppHandle) -> Result<String, String> {
    app.path()
        .resource_dir()
        .map(|p| p.to_string_lossy().to_string())
        .map_err(|e| format!("Failed to resolve resource dir: {e}"))
}

#[tauri::command]
pub async fn test_llama_health(port: u16) -> Result<serde_json::Value, String> {
    let url = format!("http://127.0.0.1:{}/health", port);
    let resp = reqwest::get(&url)
        .await
        .map_err(|e| format!("HTTP error: {}", e))?;
    let body: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("JSON parse error: {}", e))?;
    Ok(body)
}

fn find_free_port(start: u16) -> u16 {
    (start..start.saturating_add(100))
        .find(|&p| TcpListener::bind(format!("127.0.0.1:{}", p)).is_ok())
        .unwrap_or(start)
}
