// Lakar desktop: menjalankan `lakard` (runtime Node dibundel + hasil `pnpm deploy`) sebagai sidecar,
// menampilkan layar mulai lokal (ui/index.html) sampai daemon siap, lalu membuka viewer di
// http://127.0.0.1:<port>/app/. Ikon tray menjaga daemon tetap jalan saat jendela ditutup.
#![cfg_attr(all(not(debug_assertions), target_os = "windows"), windows_subsystem = "windows")]

use std::collections::VecDeque;
use std::fs::{self, File, OpenOptions};
use std::io::{BufRead, BufReader, Read, Write};
use std::net::{SocketAddr, TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

use serde::Serialize;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager, RunEvent, WindowEvent};

/// Port default lakard (sama dengan DEFAULT_LAKARD_PORT @lakar/schema) agar config MCP stabil.
const DEFAULT_PORT: u16 = 7466;
/// Penanda pesan daemon saat Chrome/Edge sistem tidak ada (packages/daemon/src/chromium.ts).
const NO_BROWSER_MARKER: &str = "Chrome atau Edge tidak ditemukan";
const LOG_LINES: usize = 200;
const START_TIMEOUT: Duration = Duration::from_secs(40);
const POOL_TIMEOUT: Duration = Duration::from_secs(25);
const STOP_GRACE: Duration = Duration::from_secs(6);
const DEFAULT_CONFIG: &str = "# Config lakard untuk Lakar desktop (TOML datar: kunci = nilai).\n\
# Kunci yang berguna di sini: render_pages, render_timeout_ms, unsplash_key_file, unsplash_app_name.\n\
# port, data_dir, browser_channel, viewer_dir, dan mcp_entry diatur aplikasi lewat env.\n";

#[derive(Clone, Copy, Default, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
enum Phase {
    #[default]
    Starting,
    Ready,
    NoBrowser,
    Failed,
}

#[derive(Default)]
struct Inner {
    child: Option<Child>,
    stdin: Option<ChildStdin>,
    port: u16,
    phase: Phase,
    message: String,
    log: VecDeque<String>,
    /// Naik setiap start; thread pengawas lama berhenti bila generasinya usang.
    generation: u64,
}

#[derive(Default)]
struct DaemonState {
    inner: Arc<Mutex<Inner>>,
}

#[derive(Serialize)]
struct StatusDto {
    phase: Phase,
    url: String,
    message: String,
    log: Vec<String>,
    #[serde(rename = "logFile")]
    log_file: String,
}

struct Paths {
    node: PathBuf,
    daemon_main: PathBuf,
    mcp_main: PathBuf,
    viewer_dir: PathBuf,
    data_dir: PathBuf,
    config_file: PathBuf,
    log_file: PathBuf,
}

fn daemon_url(port: u16) -> String {
    format!("http://127.0.0.1:{port}")
}

fn resolve_paths(app: &AppHandle) -> Result<Paths, String> {
    let exe = std::env::current_exe().map_err(|e| format!("lokasi aplikasi tidak diketahui: {e}"))?;
    let exe_dir = exe.parent().ok_or("lokasi aplikasi tidak diketahui")?.to_path_buf();
    // externalBin Tauri dipasang di samping executable utama, tanpa sufiks target.
    let node = exe_dir.join(if cfg!(windows) { "lakar-node.exe" } else { "lakar-node" });
    let res = app.path().resource_dir().map_err(|e| format!("direktori resource tidak diketahui: {e}"))?;
    let sidecar = dunce::simplified(&res).join("resources").join("sidecar");
    let path = app.path();
    let data_root = path.app_local_data_dir().map_err(|e| format!("direktori data tidak diketahui: {e}"))?;
    let config_dir = path.app_config_dir().map_err(|e| format!("direktori config tidak diketahui: {e}"))?;
    let log_dir = path.app_log_dir().map_err(|e| format!("direktori log tidak diketahui: {e}"))?;
    let data_dir = dunce::simplified(&data_root).join("data");
    let config_dir = dunce::simplified(&config_dir).to_path_buf();
    let log_dir = dunce::simplified(&log_dir).to_path_buf();
    let config_file = config_dir.join("config.toml");
    let log_file = log_dir.join("lakard.log");
    for dir in [&data_dir, &config_dir, &log_dir] {
        fs::create_dir_all(dir).map_err(|e| format!("gagal membuat {}: {e}", dir.display()))?;
    }
    if !config_file.exists() {
        fs::write(&config_file, DEFAULT_CONFIG).map_err(|e| format!("gagal menulis {}: {e}", config_file.display()))?;
    }
    Ok(Paths {
        node,
        daemon_main: sidecar.join("daemon").join("dist").join("main.js"),
        mcp_main: sidecar.join("mcp").join("dist").join("main.js"),
        viewer_dir: sidecar.join("viewer"),
        data_dir,
        config_file,
        log_file,
    })
}

/// 7466 bila bebas; kalau terpakai (mis. lakard lain), port bebas acak di loopback.
fn pick_port() -> u16 {
    if TcpListener::bind(("127.0.0.1", DEFAULT_PORT)).is_ok() {
        return DEFAULT_PORT;
    }
    TcpListener::bind(("127.0.0.1", 0))
        .and_then(|l| l.local_addr())
        .map(|a| a.port())
        .unwrap_or(DEFAULT_PORT)
}

/// GET JSON minimal ke lakard di loopback (tanpa dependensi HTTP tambahan).
fn http_get_json(port: u16, path: &str) -> Option<serde_json::Value> {
    let addr = SocketAddr::from(([127, 0, 0, 1], port));
    let mut stream = TcpStream::connect_timeout(&addr, Duration::from_millis(500)).ok()?;
    stream.set_read_timeout(Some(Duration::from_secs(3))).ok()?;
    write!(stream, "GET {path} HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nAccept: application/json\r\nConnection: close\r\n\r\n").ok()?;
    let mut buf = Vec::new();
    stream.read_to_end(&mut buf).ok()?;
    let text = String::from_utf8_lossy(&buf);
    let (head, body) = text.split_once("\r\n\r\n")?;
    let status_ok = head.lines().next().is_some_and(|l| l.split_whitespace().nth(1) == Some("200"));
    if !status_ok {
        return None;
    }
    let chunked = head.lines().any(|l| {
        let l = l.to_ascii_lowercase();
        l.starts_with("transfer-encoding:") && l.contains("chunked")
    });
    let body = if chunked { dechunk(body)? } else { body.to_string() };
    serde_json::from_str(&body).ok()
}

fn dechunk(mut body: &str) -> Option<String> {
    let mut out = String::new();
    loop {
        let (size_line, rest) = body.split_once("\r\n")?;
        let size = usize::from_str_radix(size_line.split(';').next()?.trim(), 16).ok()?;
        if size == 0 {
            return Some(out);
        }
        out.push_str(rest.get(..size)?);
        body = rest.get(size + 2..)?;
    }
}

fn push_log(inner: &Arc<Mutex<Inner>>, line: String) {
    let mut g = inner.lock().unwrap();
    if g.log.len() >= LOG_LINES {
        g.log.pop_front();
    }
    g.log.push_back(line);
}

fn pipe_lines<R: Read + Send + 'static>(reader: R, inner: Arc<Mutex<Inner>>, file: Option<Arc<Mutex<File>>>) {
    thread::spawn(move || {
        for line in BufReader::new(reader).lines().map_while(Result::ok) {
            if let Some(f) = &file {
                let _ = writeln!(f.lock().unwrap(), "{line}");
            }
            push_log(&inner, line);
        }
    });
}

fn set_phase(inner: &Arc<Mutex<Inner>>, generation: u64, phase: Phase, message: String) {
    let mut g = inner.lock().unwrap();
    if g.generation == generation {
        g.phase = phase;
        g.message = message;
    }
}

fn open_log(path: &Path) -> Option<Arc<Mutex<File>>> {
    // Log sederhana: dikosongkan bila sudah > 5 MB.
    if fs::metadata(path).map(|m| m.len() > 5 * 1024 * 1024).unwrap_or(false) {
        let _ = fs::remove_file(path);
    }
    OpenOptions::new().create(true).append(true).open(path).ok().map(|f| Arc::new(Mutex::new(f)))
}

/// Jalankan lakard. Kegagalan dicatat sebagai fase `failed` (layar mulai menampilkannya).
fn start_daemon(app: &AppHandle) {
    let state = app.state::<DaemonState>();
    let inner = state.inner.clone();
    let generation = {
        let mut g = inner.lock().unwrap();
        g.generation += 1;
        g.phase = Phase::Starting;
        g.message.clear();
        g.log.clear();
        g.generation
    };
    let paths = match resolve_paths(app) {
        Ok(p) => p,
        Err(e) => return set_phase(&inner, generation, Phase::Failed, e),
    };
    let port = pick_port();
    let mut cmd = Command::new(&paths.node);
    cmd.arg(&paths.daemon_main)
        .env("LAKAR_PORT", port.to_string())
        .env("LAKAR_DATA_DIR", &paths.data_dir)
        .env("LAKAR_CONFIG", &paths.config_file)
        .env("LAKAR_BROWSER_CHANNEL", "auto")
        .env("LAKAR_VIEWER_DIR", &paths.viewer_dir)
        .env("LAKAR_MCP_ENTRY", &paths.mcp_main)
        .env("LAKAR_EXIT_ON_STDIN_CLOSE", "1")
        .env_remove("NODE_OPTIONS")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    let mut child = match cmd.spawn() {
        Ok(c) => c,
        Err(e) => {
            return set_phase(&inner, generation, Phase::Failed, format!("gagal menjalankan {}: {e}", paths.node.display()));
        }
    };
    let log_file = open_log(&paths.log_file);
    if let Some(f) = &log_file {
        let _ = writeln!(f.lock().unwrap(), "--- lakar desktop: start lakard di {} ---", daemon_url(port));
    }
    if let Some(out) = child.stdout.take() {
        pipe_lines(out, inner.clone(), log_file.clone());
    }
    if let Some(err) = child.stderr.take() {
        pipe_lines(err, inner.clone(), log_file.clone());
    }
    {
        let mut g = inner.lock().unwrap();
        g.stdin = child.stdin.take();
        g.child = Some(child);
        g.port = port;
    }
    thread::spawn(move || watch_startup(inner, generation, port));
}

/// Tunggu /status menjawab, lalu tunggu pool render siap atau melapor browser tidak ada.
fn watch_startup(inner: Arc<Mutex<Inner>>, generation: u64, port: u16) {
    let deadline = Instant::now() + START_TIMEOUT;
    let mut status = loop {
        thread::sleep(Duration::from_millis(300));
        let exited = {
            let mut g = inner.lock().unwrap();
            if g.generation != generation {
                return;
            }
            g.child.as_mut().and_then(|c| c.try_wait().ok().flatten())
        };
        if let Some(code) = exited {
            return set_phase(&inner, generation, Phase::Failed, format!("lakard berhenti saat start ({code})"));
        }
        if let Some(json) = http_get_json(port, "/status") {
            if json["ok"] == true {
                break json;
            }
        }
        if Instant::now() > deadline {
            return set_phase(&inner, generation, Phase::Failed, format!("lakard tidak menjawab di {} dalam {} detik", daemon_url(port), START_TIMEOUT.as_secs()));
        }
    };
    let deadline = Instant::now() + POOL_TIMEOUT;
    loop {
        let pool = &status["data"]["pool"];
        let ready = pool["ready"].as_u64().unwrap_or(0);
        let size = pool["size"].as_u64().unwrap_or(0);
        let last_error = pool["lastError"].as_str().unwrap_or("").to_string();
        if size > 0 && ready == size {
            return set_phase(&inner, generation, Phase::Ready, String::new());
        }
        if last_error.contains(NO_BROWSER_MARKER) {
            return set_phase(&inner, generation, Phase::NoBrowser, last_error);
        }
        if pool.is_null() || Instant::now() > deadline {
            // Viewer tetap bisa dipakai; masalah render terlihat di halaman Connections.
            return set_phase(&inner, generation, Phase::Ready, last_error);
        }
        thread::sleep(Duration::from_millis(500));
        if inner.lock().unwrap().generation != generation {
            return;
        }
        if let Some(json) = http_get_json(port, "/status") {
            status = json;
        }
    }
}

/// Hentikan lakard: tutup stdin (daemon shutdown rapi, LAKAR_EXIT_ON_STDIN_CLOSE), lalu kill bila macet.
fn stop_daemon(app: &AppHandle) {
    let state = app.state::<DaemonState>();
    let (child, stdin) = {
        let mut g = state.inner.lock().unwrap();
        g.generation += 1;
        (g.child.take(), g.stdin.take())
    };
    drop(stdin);
    let Some(mut child) = child else { return };
    let deadline = Instant::now() + STOP_GRACE;
    while Instant::now() < deadline {
        if let Ok(Some(_)) = child.try_wait() {
            return;
        }
        thread::sleep(Duration::from_millis(100));
    }
    let _ = child.kill();
    let _ = child.wait();
}

/// URL layar mulai bawaan (frontendDist).
fn splash_url() -> &'static str {
    if cfg!(windows) {
        "http://tauri.localhost/index.html"
    } else {
        "tauri://localhost/index.html"
    }
}

fn restart_daemon_bg(app: &AppHandle) {
    {
        // Layar mulai langsung melihat "starting", bukan fase gagal yang lama.
        let state = app.state::<DaemonState>();
        let mut g = state.inner.lock().unwrap();
        g.phase = Phase::Starting;
        g.message.clear();
    }
    let app = app.clone();
    thread::spawn(move || {
        stop_daemon(&app);
        start_daemon(&app);
        // Layar mulai menunggu daemon siap lalu membuka viewer lagi (port bisa berubah).
        if let Some(win) = app.get_webview_window("main") {
            if let Ok(url) = tauri::Url::parse(splash_url()) {
                let _ = win.navigate(url);
            }
        }
    });
}

fn show_main(app: &AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.unminimize();
        let _ = win.show();
        let _ = win.set_focus();
    }
}

#[tauri::command]
fn daemon_state(app: AppHandle, state: tauri::State<'_, DaemonState>) -> StatusDto {
    let g = state.inner.lock().unwrap();
    let log_file = resolve_log_file(&app);
    StatusDto {
        phase: g.phase,
        url: format!("{}/app/", daemon_url(g.port)),
        message: g.message.clone(),
        log: g.log.iter().rev().take(40).rev().cloned().collect(),
        log_file,
    }
}

fn resolve_log_file(app: &AppHandle) -> String {
    app.path()
        .app_log_dir()
        .map(|d| dunce::simplified(&d).join("lakard.log").display().to_string())
        .unwrap_or_default()
}

#[tauri::command]
fn restart_daemon(app: AppHandle) {
    restart_daemon_bg(&app);
}

fn build_tray(app: &AppHandle) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "open", "Open Lakar", true, None::<&str>)?;
    let restart = MenuItem::with_id(app, "restart", "Restart lakard", true, None::<&str>)?;
    let separator = PredefinedMenuItem::separator(app)?;
    let quit = MenuItem::with_id(app, "quit", "Quit Lakar", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &restart, &separator, &quit])?;
    let mut tray = TrayIconBuilder::with_id("main")
        .tooltip("Lakar")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "open" => show_main(app),
            "restart" => restart_daemon_bg(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                show_main(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    tray.build(app)?;
    Ok(())
}

fn main() {
    let app = tauri::Builder::default()
        // Instance kedua hanya memunculkan jendela yang ada (satu daemon per data dir).
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| show_main(app)))
        .manage(DaemonState::default())
        .invoke_handler(tauri::generate_handler![daemon_state, restart_daemon])
        .setup(|app| {
            build_tray(app.handle())?;
            start_daemon(app.handle());
            Ok(())
        })
        .on_window_event(|window, event| {
            // Menutup jendela hanya menyembunyikannya; daemon tetap jalan (keluar lewat tray).
            if let WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("gagal memulai aplikasi Lakar");

    app.run(|app, event| match event {
        RunEvent::Exit => stop_daemon(app),
        #[cfg(target_os = "macos")]
        RunEvent::Reopen { .. } => show_main(app),
        _ => {}
    });
}
