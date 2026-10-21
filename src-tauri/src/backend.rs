use serde_json::{json, Value};
use std::{
    collections::HashMap,
    io::{BufRead, BufReader, Write},
    process::{Child, ChildStdin, Command, Stdio},
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc, Mutex,
    },
    time::Duration,
};
use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::oneshot;

type Reply = Result<Value, String>;
type Pending = Arc<Mutex<HashMap<u64, oneshot::Sender<Reply>>>>;

pub struct Backend {
    child: Mutex<Child>,
    stdin: Arc<Mutex<Option<ChildStdin>>>,
    pending: Pending,
    sequence: AtomicU64,
}

fn send(stdin: &Mutex<Option<ChildStdin>>, frame: &Value) -> Result<(), String> {
    let mut pipe = stdin.lock().map_err(|e| e.to_string())?;
    let writer = pipe.as_mut().ok_or("Desktop backend has exited")?;
    serde_json::to_writer(&mut *writer, frame).map_err(|e| e.to_string())?;
    writer.write_all(b"\n").map_err(|e| e.to_string())?;
    writer.flush().map_err(|e| e.to_string())
}

impl Backend {
    pub fn start(app: &AppHandle) -> Result<Self, Box<dyn std::error::Error>> {
        let resource = app.path().resource_dir()?;
        let backend = if tauri::is_dev() {
            std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../out/tauri-backend")
        } else {
            resource.join("backend")
        };
        let node = if tauri::is_dev() {
            let name = format!(
                "orcaw-node-{}{}",
                env!("ORCA_TARGET_TRIPLE"),
                std::env::consts::EXE_SUFFIX
            );
            std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                .join("binaries")
                .join(name)
        } else {
            // Tauri installs sidecars beside the application executable.
            std::env::current_exe()?
                .parent()
                .ok_or("Missing executable directory")?
                .join(format!("orcaw-node{}", std::env::consts::EXE_SUFFIX))
        };
        let data = app.path().app_data_dir()?;
        std::fs::create_dir_all(&data)?;
        let mut command = Command::new(node);
        #[cfg(target_os = "macos")]
        if let Some(parent) = data.parent() {
            command.env("ORCA_TAURI_ORCAW_DATA", parent.join("Orcaw"));
        }
        command
            .arg(backend.join("desktop-host.cjs"))
            .env("ORCA_TAURI_USER_DATA", data)
            .env("ORCA_TAURI_APP_ROOT", &backend)
            .env(
                "ORCA_TAURI_RESOURCES",
                if tauri::is_dev() {
                    backend.join("../tauri-resources")
                } else {
                    resource.join("runtime")
                },
            )
            .env_remove("NODE_OPTIONS")
            .env_remove("NODE_PATH")
            .env_remove("ELECTRON_RUN_AS_NODE")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit());
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            command.creation_flags(0x08000000);
        }
        let mut child = command.spawn()?;
        let stdin = Arc::new(Mutex::new(child.stdin.take()));
        let stdout = child.stdout.take().ok_or("Missing backend stdout")?;
        let pending: Pending = Arc::new(Mutex::new(HashMap::new()));
        let reader_pending = pending.clone();
        let reader_stdin = stdin.clone();
        let handle = app.clone();
        std::thread::spawn(move || {
            for line in BufReader::new(stdout).lines() {
                let frame: Value = match line.ok().and_then(|line| serde_json::from_str(&line).ok())
                {
                    Some(frame) => frame,
                    None => break,
                };
                match frame["kind"].as_str() {
                    Some("result") => {
                        if let Some(id) = frame["id"].as_u64() {
                            if let Some(reply) = reader_pending.lock().unwrap().remove(&id) {
                                let result = match frame["error"].as_str() {
                                    Some(error) => Err(error.to_owned()),
                                    None => Ok(frame["value"].clone()),
                                };
                                let _ = reply.send(result);
                            }
                        }
                    }
                    Some("event") => {
                        let _ = handle.emit_to("main", "desktop:event", &frame);
                    }
                    Some("native") => {
                        let app = handle.clone();
                        let stdin = reader_stdin.clone();
                        tauri::async_runtime::spawn(async move {
                            let result = crate::native::dispatch(&app, &frame).await;
                            let response = match result {
                                Ok(value) => {
                                    json!({"kind":"native-result", "id":frame["id"], "value":value})
                                }
                                Err(error) => {
                                    json!({"kind":"native-result", "id":frame["id"], "error":error})
                                }
                            };
                            let _ = send(&stdin, &response);
                        });
                    }
                    _ => break,
                }
            }
            reader_stdin.lock().unwrap().take();
            for (_, request) in reader_pending.lock().unwrap().drain() {
                let _ = request.send(Err("Desktop backend disconnected".into()));
            }
            let _ = handle.emit_to("main", "desktop:backend-exited", ());
        });
        Ok(Self {
            child: Mutex::new(child),
            stdin,
            pending,
            sequence: AtomicU64::new(0),
        })
    }

    pub async fn call(&self, kind: String, channel: String, args: Vec<Value>) -> Reply {
        if !matches!(kind.as_str(), "invoke" | "send" | "sync") {
            return Err("Invalid IPC kind".into());
        }
        let id = self.sequence.fetch_add(1, Ordering::Relaxed);
        let (sender, receiver) = oneshot::channel();
        self.pending.lock().unwrap().insert(id, sender);
        if let Err(error) = send(
            &self.stdin,
            &json!({"id":id, "kind":kind, "channel":channel, "args":args}),
        ) {
            self.pending.lock().unwrap().remove(&id);
            return Err(error);
        }
        let result = tokio::time::timeout(Duration::from_secs(180), receiver).await;
        self.pending.lock().unwrap().remove(&id);
        match result {
            Ok(Ok(reply)) => reply,
            Ok(Err(_)) => Err("Desktop backend disconnected".into()),
            Err(_) => Err("Desktop backend request timed out".into()),
        }
    }

    pub fn stop(&self) {
        self.stdin.lock().unwrap().take();
        if let Ok(mut child) = self.child.lock() {
            for _ in 0..60 {
                if matches!(child.try_wait(), Ok(Some(_))) {
                    return;
                }
                std::thread::sleep(Duration::from_millis(100));
            }
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}
