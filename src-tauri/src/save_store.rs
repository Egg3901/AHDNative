//! Crash-resistant native save storage for `serializeSave` / `deserializeSave`.
//!
//! Stores raw `ahdsolo-save` JSON strings under the app data `saves/` directory.
//! Storage validates the syntactic envelope only. Engine compatibility, migrations,
//! and mechanics live in the runtime, not here.
//!
//! Listing scans each slot JSON. That is acceptable initially; a metadata sidecar
//! is deferred until it can be proven crash-consistent with the save file.
//!
//! Persist writes a uniquely named sibling temporary file (one per write,
//! claimed with `create_new`), syncs it, then replaces the slot with
//! std::fs::rename. Never move the original aside: a failed replacement must leave
//! the previous slot available. Unix also syncs the parent directory.
//! See https://doc.rust-lang.org/std/fs/fn.rename.html for platform behavior.

#[cfg(any(unix, test))]
use std::fs::File;
use std::fs::{self, OpenOptions};
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::sync::{
    atomic::{AtomicU64, Ordering},
    Arc, Mutex,
};

use serde::de::{self, MapAccess, Visitor};
use serde::{Deserialize, Serialize};
use std::marker::PhantomData;

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
            write_atomic(&self.inner.root, &dest, slot_id, contents)
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
                let Ok(metadata) = entry.metadata() else {
                    continue;
                };
                if !metadata.is_file() || metadata.len() > MAX_SAVE_BYTES {
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

// Unknown world fields are consumed by serde's IgnoredAny path. Slot metadata
// never requires allocating the elections, history or economy object trees.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SaveEnvelope {
    format: String,
    schema_version: u64,
    #[serde(default)]
    saved_at: String,
    #[serde(deserialize_with = "deserialize_object")]
    world: WorldMetadata,
}

#[derive(Default, Deserialize)]
struct WorldMetadata {
    #[serde(default)]
    meta: TurnMetadata,
    #[serde(default)]
    player: PlayerMetadata,
}

#[derive(Default, Deserialize)]
struct TurnMetadata {
    #[serde(default)]
    turn: i64,
}

#[derive(Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PlayerMetadata {
    #[serde(default)]
    country_id: String,
    #[serde(default)]
    name: String,
}

// Derived structs also accept sequences. Save envelopes and worlds must be JSON
// objects, so request map deserialization explicitly at those two boundaries.
fn deserialize_object<'de, D, T>(decoder: D) -> Result<T, D::Error>
where
    D: serde::Deserializer<'de>,
    T: Deserialize<'de>,
{
    struct ObjectVisitor<T>(PhantomData<T>);
    impl<'de, T: Deserialize<'de>> Visitor<'de> for ObjectVisitor<T> {
        type Value = T;
        fn expecting(&self, formatter: &mut std::fmt::Formatter) -> std::fmt::Result {
            formatter.write_str("a JSON object")
        }
        fn visit_map<M: MapAccess<'de>>(self, map: M) -> Result<T, M::Error> {
            T::deserialize(de::value::MapAccessDeserializer::new(map))
        }
    }
    decoder.deserialize_map(ObjectVisitor(PhantomData))
}

fn decode_envelope<'de, R: serde_json::de::Read<'de>>(
    decoder: &mut serde_json::Deserializer<R>,
) -> Result<SaveEnvelope, SaveError> {
    let parsed: SaveEnvelope =
        deserialize_object(&mut *decoder).map_err(|error: serde_json::Error| {
            SaveError::InvalidEnvelope {
                reason: if error.is_syntax() || error.is_eof() {
                    "unparseable JSON"
                } else {
                    "invalid JSON save envelope or metadata"
                },
            }
        })?;
    decoder.end().map_err(|_| SaveError::InvalidEnvelope {
        reason: "unexpected data after the save envelope",
    })?;
    if parsed.format != FORMAT_MARKER {
        return Err(SaveError::InvalidEnvelope {
            reason: "format must be ahdsolo-save",
        });
    }
    if parsed.schema_version == 0 {
        return Err(SaveError::InvalidEnvelope {
            reason: "schemaVersion must be a positive integer",
        });
    }
    Ok(parsed)
}

fn validate_envelope(contents: &str) -> Result<SaveEnvelope, SaveError> {
    decode_envelope(&mut serde_json::Deserializer::from_str(contents))
}

fn meta_from(slot_id: &str, value: &SaveEnvelope) -> SaveMeta {
    SaveMeta {
        slot_id: slot_id.to_string(),
        saved_at: value.saved_at.clone(),
        schema_version: value.schema_version,
        turn: value.world.meta.turn,
        country_id: value.world.player.country_id.clone(),
        player_name: value.world.player.name.clone(),
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

/// Sequence for per-write temp names. Combined with the process id it keeps
/// temp names unique across threads and processes sharing a saves directory.
static TMP_SEQ: AtomicU64 = AtomicU64::new(0);

fn write_atomic(root: &Path, dest: &Path, slot_id: &str, contents: &str) -> Result<(), SaveError> {
    // Each write claims a unique sibling temp with `create_new`, so two
    // independently opened stores (separate mutexes, separate processes)
    // never share temp bytes. The final `rename` is still atomic: a crash
    // lands on the complete prior file or one complete new file. Only the
    // temp this call created is ever removed by this call; foreign temps are
    // left alone, and failures before rename leave the prior slot untouched.
    const ATTEMPTS: u32 = 8;
    for _ in 0..ATTEMPTS {
        let seq = TMP_SEQ.fetch_add(1, Ordering::Relaxed);
        let tmp = root.join(format!("{slot_id}.{}.{seq}.json.tmp", std::process::id()));
        reject_symlink(&tmp)?;
        let mut file = match OpenOptions::new().write(true).create_new(true).open(&tmp) {
            Ok(file) => file,
            Err(err) if err.kind() == io::ErrorKind::AlreadyExists => continue,
            Err(err) => return Err(err.into()),
        };
        let wrote = (|| {
            file.write_all(contents.as_bytes())?;
            file.sync_all()?;
            Ok::<_, io::Error>(())
        })();
        drop(file);
        if let Err(err) = wrote {
            let _ = fs::remove_file(&tmp);
            return Err(err.into());
        }
        if let Err(err) = persist_rename(&tmp, dest) {
            let _ = fs::remove_file(&tmp);
            return Err(err.into());
        }
        sync_dir(root)?;
        return Ok(());
    }
    Err(SaveError::Io(io::Error::new(
        io::ErrorKind::AlreadyExists,
        "could not claim a unique save temp name",
    )))
}

fn persist_rename(tmp: &Path, dest: &Path) -> io::Result<()> {
    fs::rename(tmp, dest)
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
    fn opaque_world_data_round_trips_and_invalid_shapes_preserve_it() {
        let (_dir, store) = open_temp();
        let raw = r#"{"format":"ahdsolo-save","schemaVersion":42,"savedAt":"2026-09-10T00:00:00Z","world":{"meta":{"turn":7},"player":{"countryId":"US","name":"Test"},"history":{"opaque":[1.000,null,{"escaped":"brace } and quote \""}]}}}"#;
        store.save("opaque", raw).unwrap();
        let rows = store.list().unwrap();
        assert_eq!(rows[0].schema_version, 42);
        assert_eq!(rows[0].turn, 7);
        assert_eq!(store.load("opaque").unwrap(), raw);
        for invalid in [
            r#"["ahdsolo-save",43,"",{}]"#,
            r#"{"format":"ahdsolo-save","schemaVersion":43,"world":[]}"#,
            r#"{"format":"ahdsolo-save","schemaVersion":0,"world":{}}"#,
            r#"{"format":"ahdsolo-save","schemaVersion":43,"world":{}} trailing"#,
        ] {
            assert!(store.save("opaque", invalid).is_err());
            assert_eq!(store.load("opaque").unwrap(), raw);
        }
    }

    #[test]
    #[ignore = "Manual bounded save-list memory profile"]
    fn profile_large_save_listing() {
        use std::io::BufWriter;
        let (dir, store) = open_temp();
        let mut file = BufWriter::new(File::create(dir.path().join("large.json")).unwrap());
        file.write_all(br#"{"format":"ahdsolo-save","schemaVersion":43,"savedAt":"2026-09-10T00:00:00Z","world":{"meta":{"turn":7},"player":{"countryId":"US","name":"Profile"},"history":["#).unwrap();
        for index in 0..250_000 {
            if index > 0 {
                file.write_all(b",").unwrap();
            }
            file.write_all(br#""abcdefghijklmnopqrstuvwxyz0123456789abcdefghijklmnopqrstuvwxyz""#)
                .unwrap();
        }
        file.write_all(b"]}}").unwrap();
        file.flush().unwrap();
        drop(file);
        let start = std::time::Instant::now();
        let rows = store.list().unwrap();
        println!("list_ms={}", start.elapsed().as_millis());
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].turn, 7);
        assert_eq!(rows[0].player_name, "Profile");
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

    fn envelope_padded(
        schema: u64,
        saved_at: &str,
        turn: i64,
        country: &str,
        player: &str,
        pad_bytes: usize,
    ) -> String {
        let pad = "p".repeat(pad_bytes);
        format!(
            r#"{{"format":"ahdsolo-save","schemaVersion":{schema},"savedAt":"{saved_at}","pad":"{pad}","world":{{"meta":{{"turn":{turn}}},"player":{{"countryId":"{country}","name":"{player}"}}}}}}"#
        )
    }

    #[test]
    fn open_leaves_foreign_tmps_alone_and_keeps_prior_slot() {
        let dir = tempfile::tempdir().expect("temp dir");
        let prior = envelope(43, "2026-01-01T00:00:00Z", 1, "US", "Alex");
        let store = SaveStore::open(dir.path()).expect("open");
        store.save("slot", &prior).expect("prior save");
        drop(store);

        // A crashed writer's unacknowledged temp is not a save: open must
        // neither promote it nor delete another writer's in-flight bytes.
        let interrupted = envelope(43, "2026-01-02T00:00:00Z", 9, "UK", "Bea");
        let interrupted_tmp = dir
            .path()
            .join(format!("slot.{}.0.json.tmp", std::process::id()));
        fs::write(&interrupted_tmp, &interrupted).expect("plant tmp");
        // A first save that crashed before any rename: temp only.
        let orphan = envelope(43, "2026-01-03T00:00:00Z", 2, "FR", "Cam");
        let orphan_tmp = dir
            .path()
            .join(format!("fresh.{}.0.json.tmp", std::process::id()));
        fs::write(&orphan_tmp, &orphan).expect("plant orphan");
        // A directory at the legacy fixed temp name must not abort startup.
        fs::create_dir(dir.path().join("slot.json.tmp")).expect("plant legacy tmp dir");

        let reopened = SaveStore::open(dir.path()).expect("reopen with foreign tmps present");
        assert!(
            interrupted_tmp.exists(),
            "another writer's temp must be left alone"
        );
        assert!(
            orphan_tmp.exists(),
            "unacknowledged temp must not be promoted or deleted"
        );
        assert!(
            dir.path().join("slot.json.tmp").is_dir(),
            "legacy tmp dir must be left alone"
        );
        assert_eq!(reopened.load("slot").expect("prior survives"), prior);
        assert!(matches!(
            reopened.load("fresh"),
            Err(SaveError::NotFound { .. })
        ));
        let rows = reopened.list().expect("list");
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].slot_id, "slot");
        assert_eq!(rows[0].turn, 1);
    }

    #[test]
    fn concurrent_saves_from_independently_opened_stores_stay_complete() {
        let dir = tempfile::tempdir().expect("temp dir");
        let first = Arc::new(envelope_padded(
            43,
            "2026-01-01T00:00:00Z",
            1,
            "US",
            "A",
            1 << 20,
        ));
        let second = Arc::new(envelope_padded(
            43,
            "2026-01-01T00:00:00Z",
            2,
            "US",
            "B",
            1 << 20,
        ));
        // Independently opened stores have separate mutexes, like two app
        // instances sharing a saves directory. Every save must land whole:
        // the final slot is always exactly one complete payload, never a mix.
        for _ in 0..20 {
            let store_a = SaveStore::open(dir.path()).expect("open A");
            let store_b = SaveStore::open(dir.path()).expect("open B");
            let barrier = Arc::new(std::sync::Barrier::new(2));
            std::thread::scope(|scope| {
                let barrier_a = Arc::clone(&barrier);
                let first = Arc::clone(&first);
                let second = Arc::clone(&second);
                scope.spawn(move || {
                    barrier_a.wait();
                    store_a.save("slot", &first).unwrap();
                });
                scope.spawn(move || {
                    barrier.wait();
                    store_b.save("slot", &second).unwrap();
                });
            });
            let loaded = SaveStore::open(dir.path())
                .expect("reopen")
                .load("slot")
                .expect("load after concurrent saves");
            assert!(
                loaded == *first || loaded == *second,
                "torn or interleaved save detected"
            );
        }
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
