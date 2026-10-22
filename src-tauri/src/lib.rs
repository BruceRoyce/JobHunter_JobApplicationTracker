use std::sync::Mutex;
use tauri::Manager;
use tauri_plugin_shell::process::CommandChild;
use tauri_plugin_shell::ShellExt;



// 1. Create a wrapper struct to hold our sidecar process in a thread-safe way
struct BackendProcess(Mutex<Option<CommandChild>>);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let sidecar_command = app.shell().sidecar("server").unwrap();
            
            let (_rx, child) = sidecar_command
                .spawn()
                .expect("Failed to start Deno backend");

            // 2. Save the running child process into Tauri's managed state
            app.manage(BackendProcess(Mutex::new(Some(child))));

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    // 3. Take over the run loop to intercept the app closing event
    app.run(|app_handle, event| {
        if let tauri::RunEvent::Exit = event {
            // Retrieve the process from state and cleanly kill it
            let state = app_handle.state::<BackendProcess>();
            let mut child = state.0.lock().unwrap();
            if let Some(c) = child.take() {
                let _ = c.kill(); 
            }
        }
    });
}