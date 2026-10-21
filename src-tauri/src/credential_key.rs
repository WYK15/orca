use base64::{engine::general_purpose::STANDARD, Engine};
use keyring::{Entry, Error};
use sha2::{Digest, Sha256};
use std::{
    fs::{self, OpenOptions},
    io::Write,
    path::Path,
    sync::Mutex,
};

const KEY_BYTES: usize = 32;
const SERVICE: &str = "com.wyk15.orcaw.tauri";
const ACCOUNT: &str = "desktop-encryption-v1";

#[derive(Default)]
pub struct CredentialKey(Mutex<Option<[u8; KEY_BYTES]>>);

impl CredentialKey {
    pub fn load(&self, profile: &Path) -> Result<String, String> {
        let mut cached = self.0.lock().map_err(|e| e.to_string())?;
        if let Some(key) = cached.as_ref() {
            return Ok(STANDARD.encode(key));
        }
        let entry = Entry::new(SERVICE, ACCOUNT).map_err(|e| e.to_string())?;
        let marker = profile.join("credential-key-id");
        let key = load_or_create(
            || entry.get_secret(),
            |key| entry.set_secret(key),
            !marker.exists(),
        )?;
        let fingerprint = format!("{:x}", Sha256::digest(key));
        if marker.exists() {
            let stored = fs::read_to_string(&marker).map_err(|e| e.to_string())?;
            if stored != fingerprint {
                return Err(
                    "Desktop credential key changed; existing credentials were not modified".into(),
                );
            }
        } else {
            let mut options = OpenOptions::new();
            options.create_new(true).write(true);
            #[cfg(unix)]
            {
                use std::os::unix::fs::OpenOptionsExt;
                options.mode(0o600);
            }
            let mut file = options.open(marker).map_err(|e| e.to_string())?;
            file.write_all(fingerprint.as_bytes())
                .map_err(|e| e.to_string())?;
            file.sync_all().map_err(|e| e.to_string())?;
        }
        let encoded = STANDARD.encode(key);
        *cached = Some(key);
        Ok(encoded)
    }
}

fn load_or_create(
    read: impl FnOnce() -> Result<Vec<u8>, Error>,
    write: impl FnOnce(&[u8]) -> Result<(), Error>,
    allow_create: bool,
) -> Result<[u8; KEY_BYTES], String> {
    match read() {
        Ok(bytes) => bytes
            .try_into()
            .map_err(|_| "Stored desktop encryption key is invalid".into()),
        Err(Error::NoEntry) => {
            if !allow_create {
                return Err("Desktop credential key is missing; restore access to the system credential store".into());
            }
            let mut key = [0u8; KEY_BYTES];
            getrandom::fill(&mut key).map_err(|e| e.to_string())?;
            write(&key).map_err(|e| format!("Cannot save desktop encryption key: {e}"))?;
            Ok(key)
        }
        Err(error) => Err(format!("Cannot unlock desktop encryption key: {error}")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::RefCell;

    #[test]
    fn creates_a_key_once_and_reuses_the_stored_bytes() {
        let saved = RefCell::new(Vec::new());
        let first = load_or_create(
            || Err(Error::NoEntry),
            |key| {
                *saved.borrow_mut() = key.to_vec();
                Ok(())
            },
            true,
        )
        .unwrap();
        let second = load_or_create(
            || Ok(saved.borrow().clone()),
            |_| panic!("must not replace an existing key"),
            false,
        )
        .unwrap();
        assert_eq!(first, second);
        assert_ne!(first, [0; KEY_BYTES]);
    }

    #[test]
    fn never_replaces_an_invalid_or_locked_key() {
        assert!(load_or_create(
            || Ok(vec![1; 3]),
            |_| panic!("must not overwrite invalid keys"),
            false
        )
        .is_err());
        assert!(load_or_create(
            || Err(Error::Ambiguous(Vec::new())),
            |_| panic!("must not overwrite inaccessible keys"),
            false
        )
        .is_err());
        assert!(load_or_create(|| Err(Error::NoEntry), |_| Err(Error::NoEntry), true).is_err());
        assert!(load_or_create(
            || Err(Error::NoEntry),
            |_| panic!("must not replace missing keys for existing profiles"),
            false
        )
        .is_err());
    }
}
