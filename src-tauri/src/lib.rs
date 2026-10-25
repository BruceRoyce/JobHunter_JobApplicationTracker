use std::sync::Mutex;
use std::time::{Duration, Instant};

use tauri::Manager;
use tauri::State;
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;

struct BackendProcess(Mutex<Option<CommandChild>>);

struct ApiBase(String);

#[tauri::command]
fn api_base(state: State<'_, ApiBase>) -> String {
    state.0.clone()
}

fn parse_ready(line: &str) -> Option<String> {
    let rest = line.trim().strip_prefix("JOB_HUNTER_READY ")?;
    let url = rest.trim();
    let hostport = url.strip_prefix("http://")?;
    let (host, port) = hostport.split_once(':')?;
    if host != "127.0.0.1" && host != "localhost" {
        return None;
    }
    let port: u16 = port.parse().ok()?;
    if port == 0 {
        return None;
    }
    Some(format!("http://{host}:{port}"))
}

/// Block until the sidecar prints `JOB_HUNTER_READY http://127.0.0.1:<port>`.
/// Keeps reading after that so a full pipe cannot stall the backend.
fn wait_for_api(mut rx: tauri::async_runtime::Receiver<CommandEvent>) -> Result<String, String> {
    let start = Instant::now();
    let mut stderr = String::new();
    loop {
        if start.elapsed() > Duration::from_secs(20) {
            return Err(format!(
                "The backend did not report a port within 20 seconds. {stderr}"
            ));
        }
        match rx.try_recv() {
            Ok(CommandEvent::Stdout(bytes)) => {
                let line = String::from_utf8_lossy(&bytes);
                if let Some(url) = parse_ready(&line) {
                    std::thread::spawn(move || while rx.blocking_recv().is_some() {});
                    return Ok(url);
                }
            }
            Ok(CommandEvent::Stderr(bytes)) => {
                stderr.push_str(&String::from_utf8_lossy(&bytes));
                stderr.push('\n');
            }
            Ok(CommandEvent::Error(err)) => return Err(err),
            Ok(CommandEvent::Terminated(payload)) => {
                return Err(format!(
                    "The backend exited before it was ready (code {:?}). {stderr}",
                    payload.code
                ));
            }
            Ok(_) => {}
            Err(_) => {
                if rx.is_closed() && rx.is_empty() {
                    return Err(format!("The backend closed its output. {stderr}"));
                }
                std::thread::sleep(Duration::from_millis(20));
            }
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![api_base])
        .setup(|app| {
            let sidecar_command = app
                .shell()
                .sidecar("server")
                .map_err(|e| std::io::Error::other(e.to_string()))?;

            // Port 0 lets the OS pick a free port when 8787 is already taken.
            let (rx, child) = sidecar_command
                .env("PORT", "0")
                .spawn()
                .map_err(|e| std::io::Error::other(e.to_string()))?;

            let base = match wait_for_api(rx) {
                Ok(url) => url,
                Err(err) => {
                    let _ = child.kill();
                    return Err(std::io::Error::other(err).into());
                }
            };

            app.manage(ApiBase(base));
            app.manage(BackendProcess(Mutex::new(Some(child))));
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app_handle, event| {
        if let tauri::RunEvent::Exit = event {
            let state = app_handle.state::<BackendProcess>();
            let mut child = state.0.lock().unwrap();
            if let Some(c) = child.take() {
                let _ = c.kill();
            }
        }
    });
}
