use tauri_plugin_shell::ShellExt;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/


#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // the shell plugin
        .plugin(tauri_plugin_shell::init())
        // opener plugin
        .plugin(tauri_plugin_opener::init())
        // setup hook to spawn the sidecar
        .setup(|app| {
            // "server" matches the base name you put in externalBin in tauri.config.json
            let sidecar_command = app.shell().sidecar("server").unwrap();
            // Spawn the Deno backend in the background
            let (_rx, _child) = sidecar_command
                .spawn()
                .expect("Failed to start Deno backend");

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}