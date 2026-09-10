//! Crash-resistant native save storage for `serializeSave` / `deserializeSave`.
//!
//! Stores raw `ahdsolo-save` JSON strings under the app data `saves/` directory.
//! Storage validates the syntactic envelope only. Engine compatibility, migrations,
//! and mechanics live in the runtime, not here.
//!
//! Listing scans each slot JSON. That is acceptable initially; a metadata sidecar
//! is deferred until it can be proven crash-consistent with the save file.
//!
//! Atomic persist is temp-file + `sync_all` + rename. On Linux/macOS/iOS, rename
//! replaces the destination atomically. On Windows, `fs::rename` cannot replace
//! an existing file, so persist moves the prior file aside then renames; a crash
//! between those steps can leave the slot missing until the `.bak` is recovered.

use std::fs::{self, File, OpenOptions};
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use serde::{Deserialize, Serialize};
use serde_json::Value;

/// Maximum accepted save payload, inclusive. Documented bound for 100+ MiB worlds.
pub const MAX_SAVE_BYTES: u64 = 256 * 1024 * 1024;

const FORMAT_MARKER: &str = "ahdsolo-save";
const SLOT_MIN: usize = 1;
const SLOT_MAX: usize = 64;

/// Public listing row. Values come from the envelope, not a sidecar.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveMeta {
    pub slot_id: String,
    pub saved_at: String,
    pub schema_version: u64,
    pub turn: i64,
    pub country_id: String,
    pub player_name: String,
}

#[derive(Debug)]
pub enum SaveError {
    InvalidSlot { slot_id: String },
    NotFound { slot_id: String },
    InvalidEnvelope { reason: &'static str },
    TooLarge { size: u64 },
    Symlink { path: PathBuf },
    Io(io::Error),
}

impl std::fmt::Display for SaveError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            SaveError::InvalidSlot { slot_id } => {
                write!(f, "invalid slot id '{slot_id}'")
            }
            SaveError::NotFound { slot_id } => write!(f, "save not found: {slot_id}"),
            SaveError::InvalidEnvelope { reason } => {
                write!(f, "invalid save envelope: {reason}")
            }
            SaveError::TooLarge { size } => {
                write!(f, "save exceeds {MAX_SAVE_BYTES} byte limit ({size} bytes)")
            }
            SaveError::Symlink { path } => {
                write!(f, "refusing symlink path {}", path.display())
            }
            SaveError::Io(err) => write!(f, "save storage error: {err}"),
        }
    }
}

impl std::error::Error for SaveError {}

impl From<io::Error> for SaveError {
    fn from(err: io::Error) -> Self {
        SaveError::Io(err)
    }
}

#[derive(Clone)]
pub struct SaveStore {
    inner: Arc<Inner>,
}

struct Inner {
    root: PathBuf,
    lock: Mutex<()>,
}

impl SaveStore {
    /// Open (and create) a saves directory. Production uses `app_data_dir()/saves`.
    pub fn open(root: impl Into<PathBuf>) -> Result<Self, SaveError> {
        let root = root.into();
        if root.exists() {
            let meta = fs::symlink_metadata(&root)?;
            if meta.file_type().is_symlink() {
                return Err(SaveError::Symlink { path: root });
            }
            if !meta.is_dir() {
                return Err(SaveError::Io(io::Error::new(
                    io::ErrorKind::AlreadyExists,
                    "saves path exists and is not a directory",
                )));
            }
        } else {
            fs::create_dir_all(&root)?;
        }
        Ok(Self {
            inner: Arc::new(Inner {
                root,
                lock: Mutex::new(()),
            }),
        })
    }

    pub fn save(&self, slot_id: &str, contents: &str) -> Result<(), SaveError> {
        validate_slot(slot_id)?;
        let size = contents.len() as u64;
        if size > MAX_SAVE_BYTES {
            return Err(SaveError::TooLarge { size });
        }
        validate_envelope(contents)?;
        let dest = slot_path(&self.inner.root, slot_id);
        self.locked(|_| {
            reject_symlink(&dest)?;
            write_atomic(&self.inner.root, &dest, contents)
        })
    }

    pub fn load(&self, slot_id: &str) -> Result<String, SaveError> {
        validate_slot(slot_id)?;
        let dest = slot_path(&self.inner.root, slot_id);
        self.locked(|_| {
            reject_symlink(&dest)?;
            match fs::metadata(&dest) {
                Ok(meta) => {
                    if meta.len() > MAX_SAVE_BYTES {
                        return Err(SaveError::TooLarge { size: meta.len() });
                    }
                }
                Err(err) if err.kind() == io::ErrorKind::NotFound => {
                    return Err(SaveError::NotFound {
                        slot_id: slot_id.to_string(),
                    });
                }
                Err(err) => return Err(err.into()),
            }
            match fs::read_to_string(&dest) {
                Ok(raw) => Ok(raw),
                Err(err) if err.kind() == io::ErrorKind::NotFound => Err(SaveError::NotFound {
                    slot_id: slot_id.to_string(),
                }),
                Err(err) => Err(err.into()),
            }
        })
    }

    pub fn list(&self) -> Result<Vec<SaveMeta>, SaveError> {
        self.locked(|root| {
            let mut rows = Vec::new();
            for entry in fs::read_dir(root)? {
                let entry = entry?;
                let path = entry.path();
                if is_symlink(&path)? {
                    continue;
                }
                let Some(name) = path.file_name().and_then(|name| name.to_str()) else {
                    continue;
                };
                let Some(slot_id) = name.strip_suffix(".json") else {
                    continue;
                };
                if validate_slot(slot_id).is_err() {
                    continue;
                }
                let Ok(contents) = fs::read_to_string(&path) else {
                    continue;
                };
                if contents.len() as u64 > MAX_SAVE_BYTES {
                    continue;
                }
                let Ok(value) = validate_envelope(&contents) else {
                    continue;
                };
                rows.push(meta_from(slot_id, &value));
            }
            rows.sort_by(|a, b| {
                b.saved_at
                    .cmp(&a.saved_at)
                    .then_with(|| a.slot_id.cmp(&b.slot_id))
            });
            Ok(rows)
        })
    }

    pub fn delete(&self, slot_id: &str) -> Result<(), SaveError> {
        validate_slot(slot_id)?;
        let dest = slot_path(&self.inner.root, slot_id);
        self.locked(|_| {
            reject_symlink(&dest)?;
            match fs::remove_file(&dest) {
                Ok(()) => {
                    let _ = fs::remove_file(dest.with_extension("json.tmp"));
                    let _ = fs::remove_file(dest.with_extension("json.bak"));
                    Ok(())
                }
                Err(err) if err.kind() == io::ErrorKind::NotFound => Err(SaveError::NotFound {
                    slot_id: slot_id.to_string(),
                }),
                Err(err) => Err(err.into()),
            }
        })
    }

    fn locked<T>(&self, op: impl FnOnce(&Path) -> Result<T, SaveError>) -> Result<T, SaveError> {
        let _guard = self
            .inner
            .lock
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        op(&self.inner.root)
    }
}

fn validate_slot(slot_id: &str) -> Result<(), SaveError> {
    let valid = (SLOT_MIN..=SLOT_MAX).contains(&slot_id.len())
        && slot_id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-' || byte == b'_');
    if valid {
        Ok(())
    } else {
        Err(SaveError::InvalidSlot {
            slot_id: slot_id.to_string(),
        })
    }
}

fn slot_path(root: &Path, slot_id: &str) -> PathBuf {
    root.join(format!("{slot_id}.json"))
}

fn validate_envelope(contents: &str) -> Result<Value, SaveError> {
    let parsed: Value = serde_json::from_str(contents).map_err(|_| SaveError::InvalidEnvelope {
        reason: "unparseable JSON",
    })?;
    if !parsed.is_object() {
        return Err(SaveError::InvalidEnvelope {
            reason: "root must be an object",
        });
    }
    match parsed.get("format").and_then(Value::as_str) {
        Some(FORMAT_MARKER) => {}
        _ => {
            return Err(SaveError::InvalidEnvelope {
                reason: "format must be ahdsolo-save",
            });
        }
    }
    match parsed.get("schemaVersion").and_then(Value::as_u64) {
        Some(version) if version >= 1 => {}
        _ => {
            return Err(SaveError::InvalidEnvelope {
                reason: "schemaVersion must be a positive integer",
            });
        }
    }
    match parsed.get("world") {
        Some(Value::Object(_)) => Ok(parsed),
        _ => Err(SaveError::InvalidEnvelope {
            reason: "world must be an object",
        }),
    }
}

fn meta_from(slot_id: &str, value: &Value) -> SaveMeta {
    let schema_version = value
        .get("schemaVersion")
        .and_then(Value::as_u64)
        .unwrap_or(0);
    let saved_at = value
        .get("savedAt")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();
    let world = value.get("world");
    let turn = world
        .and_then(|world| world.get("meta"))
        .and_then(|meta| meta.get("turn"))
        .and_then(Value::as_i64)
        .unwrap_or(0);
    let player = world.and_then(|world| world.get("player"));
    let country_id = player
        .and_then(|player| player.get("countryId"))
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();
    let player_name = player
        .and_then(|player| player.get("name"))
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();
    SaveMeta {
        slot_id: slot_id.to_string(),
        saved_at,
        schema_version,
        turn,
        country_id,
        player_name,
    }
}

fn is_symlink(path: &Path) -> Result<bool, SaveError> {
    match fs::symlink_metadata(path) {
        Ok(meta) => Ok(meta.file_type().is_symlink()),
        Err(err) if err.kind() == io::ErrorKind::NotFound => Ok(false),
        Err(err) => Err(err.into()),
    }
}

fn reject_symlink(path: &Path) -> Result<(), SaveError> {
    if is_symlink(path)? {
        Err(SaveError::Symlink {
            path: path.to_path_buf(),
        })
    } else {
        Ok(())
    }
}

fn write_atomic(root: &Path, dest: &Path, contents: &str) -> Result<(), SaveError> {
    let tmp = dest.with_extension("json.tmp");
    let persist = (|| {
        reject_symlink(&tmp)?;
        let mut file = OpenOptions::new()
            .write(true)
            .create(true)
            .truncate(true)
            .open(&tmp)?;
        file.write_all(contents.as_bytes())?;
        file.sync_all()?;
        drop(file);
        persist_rename(&tmp, dest)?;
        sync_dir(root)?;
        Ok(())
    })();
    if persist.is_err() {
        let _ = fs::remove_file(&tmp);
    }
    persist
}

fn persist_rename(tmp: &Path, dest: &Path) -> io::Result<()> {
    #[cfg(not(windows))]
    {
        fs::rename(tmp, dest)
    }
    #[cfg(windows)]
    {
        match fs::rename(tmp, dest) {
            Ok(()) => Ok(()),
            Err(err) if dest.exists() => {
                let backup = dest.with_extension("json.bak");
                fs::rename(dest, &backup)?;
                match fs::rename(tmp, dest) {
                    Ok(()) => {
                        let _ = fs::remove_file(&backup);
                        Ok(())
                    }
                    Err(rename_err) => {
                        let _ = fs::rename(&backup, dest);
                        Err(rename_err)
                    }
                }
            }
            Err(err) => Err(err),
        }
    }
}

#[cfg(unix)]
fn sync_dir(path: &Path) -> io::Result<()> {
    File::open(path)?.sync_all()
}

#[cfg(not(unix))]
fn sync_dir(_path: &Path) -> io::Result<()> {
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::sync::Arc;

    fn envelope(schema: u64, saved_at: &str, turn: i64, country: &str, player: &str) -> String {
        format!(
            r#"{{"format":"ahdsolo-save","schemaVersion":{schema},"savedAt":"{saved_at}","world":{{"meta":{{"turn":{turn}}},"player":{{"countryId":"{country}","name":"{player}"}}}}}}"#
        )
    }

    fn open_temp() -> (tempfile::TempDir, SaveStore) {
        let dir = tempfile::tempdir().expect("temp dir");
        let store = SaveStore::open(dir.path()).expect("open");
        (dir, store)
    }

    #[test]
    fn documented_max_save_is_256_mib() {
        assert_eq!(MAX_SAVE_BYTES, 268_435_456);
    }

    #[test]
    fn saved_contents_are_readable_from_a_fresh_store_instance() {
        let dir = tempfile::tempdir().expect("temp dir");
        let contents = envelope(43, "2026-01-01T00:00:00Z", 12, "US", "Alex");
        let store = SaveStore::open(dir.path()).expect("open");
        store
            .save("campaign-1", &contents)
            .expect("save campaign-1");
        drop(store);

        let reopened = SaveStore::open(dir.path()).expect("reopen");
        let loaded = reopened.load("campaign-1").expect("load after reopen");
        assert_eq!(loaded, contents);
    }

    #[test]
    fn save_replaces_prior_contents_for_the_same_slot() {
        let (_dir, store) = open_temp();
        let first = envelope(43, "2026-01-01T00:00:00Z", 1, "US", "Alex");
        let second = envelope(43, "2026-01-02T00:00:00Z", 4, "UK", "Bea");
        store.save("slot", &first).expect("first save");
        store.save("slot", &second).expect("replace");
        assert_eq!(store.load("slot").expect("load"), second);
    }

    #[test]
    fn rejected_corrupt_save_preserves_previous_slot() {
        let (_dir, store) = open_temp();
        let first = envelope(43, "2026-01-01T00:00:00Z", 1, "US", "Alex");
        store.save("slot", &first).expect("good save");

        let corrupt = store.save("slot", "{not json");
        assert!(matches!(
            corrupt,
            Err(SaveError::InvalidEnvelope {
                reason: "unparseable JSON"
            })
        ));
        assert_eq!(store.load("slot").expect("still good"), first);

        let wrong_format = store.save("slot", r#"{"format":"other","schemaVersion":1,"world":{}}"#);
        assert!(matches!(
            wrong_format,
            Err(SaveError::InvalidEnvelope { .. })
        ));
        assert_eq!(store.load("slot").expect("still good after format"), first);

        let zero_schema = store.save(
            "slot",
            r#"{"format":"ahdsolo-save","schemaVersion":0,"world":{}}"#,
        );
        assert!(matches!(
            zero_schema,
            Err(SaveError::InvalidEnvelope { .. })
        ));
        assert_eq!(store.load("slot").expect("still good after schema"), first);

        let missing_world = store.save("slot", r#"{"format":"ahdsolo-save","schemaVersion":1}"#);
        assert!(matches!(
            missing_world,
            Err(SaveError::InvalidEnvelope { .. })
        ));
        assert_eq!(store.load("slot").expect("still good after world"), first);
    }

    #[test]
    fn invalid_slot_ids_and_traversal_are_rejected() {
        let (_dir, store) = open_temp();
        let contents = envelope(43, "2026-01-01T00:00:00Z", 1, "US", "Alex");
        let too_long = "a".repeat(65);
        let rejected = [
            "../secret",
            "foo/bar",
            "foo\\bar",
            "",
            ".",
            "..",
            "has space",
            "slot.json",
            "näme",
            too_long.as_str(),
        ];
        for slot in rejected {
            let err = store.save(slot, &contents).unwrap_err();
            assert!(
                matches!(err, SaveError::InvalidSlot { .. }),
                "expected invalid slot for {slot:?}, got {err}"
            );
        }

        let max_ok = "a".repeat(64);
        store.save(&max_ok, &contents).expect("64-char slot");
        assert_eq!(store.load(&max_ok).expect("load max slot"), contents);
    }

    #[test]
    fn list_reads_envelope_metadata_in_deterministic_order() {
        let (_dir, store) = open_temp();
        store
            .save(
                "b-slot",
                &envelope(43, "2026-01-02T00:00:00Z", 8, "UK", "Bea"),
            )
            .unwrap();
        store
            .save(
                "a-slot",
                &envelope(42, "2026-01-03T00:00:00Z", 3, "US", "Alex"),
            )
            .unwrap();
        store
            .save(
                "c-slot",
                &envelope(41, "2026-01-02T00:00:00Z", 1, "FR", "Cam"),
            )
            .unwrap();

        let list = store.list().expect("list");
        assert_eq!(
            list,
            vec![
                SaveMeta {
                    slot_id: "a-slot".to_string(),
                    saved_at: "2026-01-03T00:00:00Z".to_string(),
                    schema_version: 42,
                    turn: 3,
                    country_id: "US".to_string(),
                    player_name: "Alex".to_string(),
                },
                SaveMeta {
                    slot_id: "b-slot".to_string(),
                    saved_at: "2026-01-02T00:00:00Z".to_string(),
                    schema_version: 43,
                    turn: 8,
                    country_id: "UK".to_string(),
                    player_name: "Bea".to_string(),
                },
                SaveMeta {
                    slot_id: "c-slot".to_string(),
                    saved_at: "2026-01-02T00:00:00Z".to_string(),
                    schema_version: 41,
                    turn: 1,
                    country_id: "FR".to_string(),
                    player_name: "Cam".to_string(),
                },
            ]
        );
    }

    #[test]
    fn delete_missing_slot_returns_not_found() {
        let (_dir, store) = open_temp();
        let err = store.delete("ghost").unwrap_err();
        assert!(matches!(
            err,
            SaveError::NotFound { slot_id } if slot_id == "ghost"
        ));
        assert!(store.list().unwrap().is_empty());
    }

    #[test]
    fn delete_removes_an_existing_slot() {
        let (_dir, store) = open_temp();
        let contents = envelope(43, "2026-01-01T00:00:00Z", 1, "US", "Alex");
        store.save("keep-me", &contents).unwrap();
        store.delete("keep-me").unwrap();
        assert!(matches!(
            store.load("keep-me"),
            Err(SaveError::NotFound { slot_id }) if slot_id == "keep-me"
        ));
        assert!(store.list().unwrap().is_empty());
    }

    #[test]
    fn concurrent_same_slot_saves_do_not_interleave() {
        let (_dir, store) = open_temp();
        let first = Arc::new(envelope(43, "2026-01-01T00:00:00Z", 1, "US", "A"));
        let second = Arc::new(envelope(43, "2026-01-01T00:00:00Z", 2, "US", "B"));
        std::thread::scope(|scope| {
            let store_a = store.clone();
            let store_b = store.clone();
            let first = Arc::clone(&first);
            let second = Arc::clone(&second);
            scope.spawn(move || store_a.save("slot", &first).unwrap());
            scope.spawn(move || store_b.save("slot", &second).unwrap());
        });
        let loaded = store.load("slot").expect("load after concurrent saves");
        assert!(
            loaded == *first || loaded == *second,
            "load returned mixed or unknown contents"
        );
    }

    #[cfg(unix)]
    #[test]
    fn save_refuses_symlink_slot_and_does_not_write_through() {
        let dir = tempfile::tempdir().expect("temp dir");
        let outside = dir.path().join("outside.json");
        fs::write(&outside, "secret").unwrap();
        let trap = dir.path().join("trap.json");
        std::os::unix::fs::symlink(&outside, &trap).unwrap();

        let store = SaveStore::open(dir.path()).expect("open");
        let contents = envelope(43, "2026-01-01T00:00:00Z", 1, "US", "Alex");
        let err = store.save("trap", &contents).unwrap_err();
        assert!(matches!(err, SaveError::Symlink { .. }));
        assert_eq!(fs::read_to_string(&outside).unwrap(), "secret");
    }
}
