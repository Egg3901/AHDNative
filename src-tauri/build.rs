fn main() {
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "save_game",
            "load_game",
            "list_saves",
            "delete_save",
            "open_online_window",
        ]),
    ))
    .expect("failed to run tauri-build");
}
