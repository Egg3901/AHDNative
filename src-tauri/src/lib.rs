mod save_store;

use save_store::{SaveMeta, SaveStore};
use tauri::{Manager, State};

#[tauri::command(rename_all = "camelCase")]
async fn save_game(
    slot_id: String,
    contents: String,
    store: State<'_, SaveStore>,
) -> Result<(), String> {
    let store = store.inner().clone();
    tauri::async_runtime::spawn_blocking(move || store.save(&slot_id, &contents))
        .await
        .map_err(|err| err.to_string())?
        .map_err(|err| err.to_string())
}

#[tauri::command(rename_all = "camelCase")]
async fn load_game(slot_id: String, store: State<'_, SaveStore>) -> Result<String, String> {
    let store = store.inner().clone();
    tauri::async_runtime::spawn_blocking(move || store.load(&slot_id))
        .await
        .map_err(|err| err.to_string())?
        .map_err(|err| err.to_string())
}

#[tauri::command]
async fn list_saves(store: State<'_, SaveStore>) -> Result<Vec<SaveMeta>, String> {
    let store = store.inner().clone();
    tauri::async_runtime::spawn_blocking(move || store.list())
        .await
        .map_err(|err| err.to_string())?
        .map_err(|err| err.to_string())
}

#[tauri::command(rename_all = "camelCase")]
async fn delete_save(slot_id: String, store: State<'_, SaveStore>) -> Result<(), String> {
    let store = store.inner().clone();
    tauri::async_runtime::spawn_blocking(move || store.delete(&slot_id))
        .await
        .map_err(|err| err.to_string())?
        .map_err(|err| err.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let saves_dir = app.path().app_data_dir()?.join("saves");
            app.manage(SaveStore::open(saves_dir)?);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            save_game,
            load_game,
            list_saves,
            delete_save
        ])
        .run(tauri::generate_context!())
        .expect("failed to run AHDNative");
}
