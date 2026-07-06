//! Llama server lifecycle management.
//! The llama-server binary is managed externally by the user — this module
//! just spawns it from a user-provided path.

use parking_lot::Mutex;
use std::net::TcpListener;
use std::process::Child;
use std::sync::Arc;

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

    kill_child(&state);

    let port = find_free_port(if hint_port == 0 { 11435 } else { hint_port });

    let mut child = Command::new(&binary_path)
        .args([
            "-m", &model_path,
            "-c", &n_ctx.to_string(),
            "--gpu-layers", &n_gpu_layers.to_string(),
            "--host", "127.0.0.1",
            "-p", &port.to_string(),
        ])
        .spawn()
        .map_err(|e| format!("Failed to start llama-server: {}", e))?;

    std::thread::sleep(std::time::Duration::from_millis(1500));

    // Try to verify it didn't exit immediately
    match child.try_wait() {
        Ok(Some(exit)) => Err(format!(
            "llama-server exited immediately with code {:?}. Check the binary path and model file.",
            exit.code()
        )),
        Ok(None) => {
            *state.child.lock() = Some(child);
            *state.port.lock() = port;
            Ok(port)
        }
        Err(e) => Err(format!("Failed to query llama-server process state: {}", e)),
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
