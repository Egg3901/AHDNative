fn main() {
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "save_game",
            "load_game",
            "list_saves",
            "delete_save",
            "open_online_window",
            "open_mp_sign_in",
            "mp_view_fetch",
            "mp_session_fetch",
            "mp_session_mutate",
        ]),
    ))
    .expect("failed to run tauri-build");
}
