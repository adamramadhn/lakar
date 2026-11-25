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
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

mod updates;

use serde::Serialize;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::webview::DownloadEvent;
use tauri::utils::config::{Color, LogicalPosition, WindowConfig};
use tauri::{AppHandle, Manager, RunEvent, Theme, TitleBarStyle, WebviewWindowBuilder, WindowEvent};

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
# port, data_dir, browser_channel, viewer_dir, mcp_entry, dan mcp_node diatur aplikasi lewat env.\n";

#[derive(Clone, Copy, Debug, Default, PartialEq, Serialize)]
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
    /// Restart sedang berjalan: restart kedua (tray + Retry, klik ganda) diabaikan.
    restarting: Arc<AtomicBool>,
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
    /// Runtime Node untuk config MCP di luar direktori instalasi (Windows); `None` → runtime daemon.
    mcp_node: Option<PathBuf>,
    viewer_dir: PathBuf,
    data_dir: PathBuf,
    config_file: PathBuf,
    log_file: PathBuf,
    port_file: PathBuf,
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
    let state_dir = dunce::simplified(&data_root).to_path_buf();
    let data_dir = state_dir.join("data");
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
    let mcp_dir = sidecar.join("mcp");
    let version = app.package_info().version.to_string();
    let (node, mcp_main, mcp_node) = if needs_stable_runtime(&exe) {
        let (node, mcp_main) = stable_runtime(&node, &mcp_dir, &state_dir, &version)?;
        (node, mcp_main, None)
    } else {
        // Windows mengunci executable yang sedang berjalan: config MCP yang menunjuk `lakar-node.exe` di direktori
        // instalasi membuat installer gagal menimpanya. Gagal menyalin → tetap memakai runtime instalasi.
        let mcp_node = if cfg!(windows) { mcp_node_copy(&node, &state_dir.join("mcp"), &version).ok() } else { None };
        (node, mcp_dir.join("dist").join("main.js"), mcp_node)
    };
    Ok(Paths {
        node,
        daemon_main: sidecar.join("daemon").join("dist").join("main.js"),
        mcp_main,
        mcp_node,
        viewer_dir: sidecar.join("viewer"),
        data_dir,
        config_file,
        log_file,
        port_file: state_dir.join("port"),
    })
}

/// AppImage (mount `/tmp/.mount_*` baru setiap peluncuran) dan macOS App Translocation memberi path yang berubah
/// setiap peluncuran, sehingga config MCP yang disalin harness rusak setelah aplikasi dibuka ulang.
fn needs_stable_runtime(exe: &Path) -> bool {
    std::env::var_os("APPIMAGE").is_some() || exe.to_string_lossy().contains("/AppTranslocation/")
}

fn copy_dir(src: &Path, dst: &Path) -> std::io::Result<()> {
    fs::create_dir_all(dst)?;
    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let to = dst.join(entry.file_name());
        if entry.file_type()?.is_dir() {
            copy_dir(&entry.path(), &to)?;
        } else {
            fs::copy(entry.path(), &to)?;
        }
    }
    Ok(())
}

/// Salin runtime Node + server MCP ke `<app-local-data>/runtime/<versi>` (sekali per versi) agar path di config
/// MCP stabil. Daemon juga dijalankan dengan Node salinan ini, sehingga `process.execPath` ikut stabil.
fn stable_runtime(node: &Path, mcp_dir: &Path, state_dir: &Path, version: &str) -> Result<(PathBuf, PathBuf), String> {
    let root = state_dir.join("runtime");
    let dir = root.join(version);
    let node_name = node.file_name().ok_or("nama runtime Node tidak diketahui")?;
    let stable_node = dir.join(node_name);
    let stable_mcp = dir.join("mcp");
    let complete = dir.join(".complete");
    if !complete.exists() {
        let fail = |e: std::io::Error| format!("gagal menyalin runtime ke {}: {e}", dir.display());
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).map_err(fail)?;
        fs::copy(node, &stable_node).map_err(fail)?;
        copy_dir(mcp_dir, &stable_mcp).map_err(fail)?;
        fs::write(&complete, version).map_err(fail)?;
    }
    // Salinan versi lama tidak dipakai lagi.
    if let Ok(entries) = fs::read_dir(&root) {
        for entry in entries.flatten() {
            if entry.file_name().to_string_lossy() != version {
                let _ = fs::remove_dir_all(entry.path());
            }
        }
    }
    Ok((stable_node, stable_mcp.join("dist").join("main.js")))
}

/// Salin runtime Node ke `dir` (stabil lintas versi, di luar direktori instalasi) untuk `command` config MCP.
/// Salinan diperbarui bila versi aplikasi atau ukuran biner berubah. Salinan lama yang masih dijalankan sesi agen
/// (terkunci di Windows) diganti nama menjadi `*.old` lalu dihapus pada peluncuran berikutnya; Windows mengizinkan
/// mengganti nama executable yang sedang berjalan, hanya menimpa/menghapusnya yang ditolak.
fn mcp_node_copy(node: &Path, dir: &Path, version: &str) -> std::io::Result<PathBuf> {
    let name = node.file_name().ok_or_else(|| std::io::Error::other("nama runtime Node tidak diketahui"))?;
    let dst = dir.join(name);
    let marker = dir.join("lakar-node.version");
    let stamp = format!("{version} {}", fs::metadata(node)?.len());
    fs::create_dir_all(dir)?;
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            if entry.file_name().to_string_lossy().ends_with(".old") {
                let _ = fs::remove_file(entry.path());
            }
        }
    }
    if dst.is_file() && fs::read_to_string(&marker).is_ok_and(|m| m == stamp) {
        return Ok(dst);
    }
    let _ = fs::remove_file(&marker);
    let tmp = dir.join(format!("{}.tmp", name.to_string_lossy()));
    fs::copy(node, &tmp)?;
    if dst.exists() && fs::remove_file(&dst).is_err() {
        let millis = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0);
        fs::rename(&dst, dir.join(format!("{}.{millis}.old", name.to_string_lossy())))?;
    }
    fs::rename(&tmp, &dst)?;
    fs::write(&marker, &stamp)?;
    Ok(dst)
}

fn port_free(port: u16) -> bool {
    TcpListener::bind(("127.0.0.1", port)).is_ok()
}

/// 7466 bila bebas. Kalau terpakai (mis. lakard lain): port cadangan yang dipakai terakhir kali (disimpan di
/// `port_file`, agar config MCP yang sudah disalin tetap berlaku), atau port bebas baru.
fn pick_port(port_file: &Path) -> u16 {
    if port_free(DEFAULT_PORT) {
        return DEFAULT_PORT;
    }
    let saved = fs::read_to_string(port_file).ok().and_then(|s| s.trim().parse::<u16>().ok());
    if let Some(port) = saved.filter(|p| *p != 0 && *p != DEFAULT_PORT && port_free(*p)) {
        return port;
    }
    let port = TcpListener::bind(("127.0.0.1", 0))
        .and_then(|l| l.local_addr())
        .map(|a| a.port())
        .unwrap_or(DEFAULT_PORT);
    let _ = fs::write(port_file, port.to_string());
    port
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
    let port = pick_port(&paths.port_file);
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
        .env_remove("LAKAR_MCP_NODE")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    if let Some(mcp_node) = &paths.mcp_node {
        cmd.env("LAKAR_MCP_NODE", mcp_node);
    }
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
    let app = app.clone();
    thread::spawn(move || watch_startup(app, inner, generation, port));
}

/// Keputusan fase dari `pool` di /status: siap, browser tidak ada, atau (habis waktu / tanpa pool) buka viewer
/// dengan pesan; `None` = masih hangat, tunggu lagi.
fn classify_pool(pool: &serde_json::Value, timed_out: bool) -> Option<(Phase, String)> {
    let ready = pool["ready"].as_u64().unwrap_or(0);
    let size = pool["size"].as_u64().unwrap_or(0);
    let last_error = pool["lastError"].as_str().unwrap_or("").to_string();
    if size > 0 && ready == size {
        return Some((Phase::Ready, String::new()));
    }
    if last_error.contains(NO_BROWSER_MARKER) {
        return Some((Phase::NoBrowser, last_error));
    }
    if pool.is_null() || timed_out {
        // Viewer tetap bisa dipakai; masalah render terlihat di halaman Connections.
        return Some((Phase::Ready, last_error));
    }
    None
}

/// Status proses generasi ini: `Err` = generasi usang (berhenti mengawasi), `Ok(Some)` = proses sudah keluar.
fn child_exit(inner: &Arc<Mutex<Inner>>, generation: u64) -> Result<Option<String>, ()> {
    let mut g = inner.lock().unwrap();
    if g.generation != generation {
        return Err(());
    }
    Ok(g.child.as_mut().and_then(|c| c.try_wait().ok().flatten()).map(|code| code.to_string()))
}

/// Tunggu /status menjawab, lalu tunggu pool render siap atau melapor browser tidak ada; setelah itu awasi proses.
fn watch_startup(app: AppHandle, inner: Arc<Mutex<Inner>>, generation: u64, port: u16) {
    let deadline = Instant::now() + START_TIMEOUT;
    let mut status = loop {
        thread::sleep(Duration::from_millis(300));
        match child_exit(&inner, generation) {
            Err(()) => return,
            Ok(Some(code)) => return set_phase(&inner, generation, Phase::Failed, format!("lakard berhenti saat start ({code})")),
            Ok(None) => {}
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
        if let Some((phase, message)) = classify_pool(&status["data"]["pool"], Instant::now() > deadline) {
            set_phase(&inner, generation, phase, message);
            break;
        }
        thread::sleep(Duration::from_millis(500));
        match child_exit(&inner, generation) {
            Err(()) => return,
            Ok(Some(code)) => return set_phase(&inner, generation, Phase::Failed, format!("lakard berhenti saat start ({code})")),
            Ok(None) => {}
        }
        if let Some(json) = http_get_json(port, "/status") {
            status = json;
        }
    }
    supervise(&app, &inner, generation);
}

/// Setelah siap: bila lakard berhenti tiba-tiba, tampilkan layar mulai dengan pesan gagal (tombol Restart).
fn supervise(app: &AppHandle, inner: &Arc<Mutex<Inner>>, generation: u64) {
    loop {
        thread::sleep(Duration::from_secs(1));
        match child_exit(inner, generation) {
            Err(()) => return,
            Ok(None) => {}
            Ok(Some(code)) => {
                set_phase(inner, generation, Phase::Failed, format!("lakard berhenti tiba-tiba ({code})"));
                if let Some(win) = app.get_webview_window("main") {
                    if let Ok(url) = tauri::Url::parse(splash_url()) {
                        let _ = win.navigate(url);
                    }
                }
                return;
            }
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
    let state = app.state::<DaemonState>();
    if state.restarting.swap(true, Ordering::SeqCst) {
        return;
    }
    {
        // Layar mulai langsung melihat "starting", bukan fase gagal yang lama.
        let mut g = state.inner.lock().unwrap();
        g.phase = Phase::Starting;
        g.message.clear();
    }
    let restarting = state.restarting.clone();
    let app = app.clone();
    thread::spawn(move || {
        stop_daemon(&app);
        start_daemon(&app);
        restarting.store(false, Ordering::SeqCst);
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

/// Nama file (di direktori config aplikasi) yang menyimpan pilihan tema viewer untuk peluncuran berikutnya.
const THEME_FILE: &str = "theme";

/// Pilihan tema Settings → General viewer (`lakar.viewer.theme`: `system | light | dark`).
#[derive(Clone, Copy, Debug, PartialEq)]
enum UiTheme {
    System,
    Light,
    Dark,
}

/// Nilai tersimpan/terkirim → pilihan; selain tiga nilai sah → `None` (pemanggil memakai `System`).
fn parse_ui_theme(value: &str) -> Option<UiTheme> {
    match value.trim() {
        "system" => Some(UiTheme::System),
        "light" => Some(UiTheme::Light),
        "dark" => Some(UiTheme::Dark),
        _ => None,
    }
}

fn ui_theme_name(theme: UiTheme) -> &'static str {
    match theme {
        UiTheme::System => "system",
        UiTheme::Light => "light",
        UiTheme::Dark => "dark",
    }
}

/// Tema native jendela. Webview ikut tema ini (`prefers-color-scheme` layar mulai dan viewer); `None` = ikut OS.
fn native_theme(theme: UiTheme) -> Option<Theme> {
    match theme {
        UiTheme::System => None,
        UiTheme::Light => Some(Theme::Light),
        UiTheme::Dark => Some(Theme::Dark),
    }
}

/// Warna latar native sebelum halaman ter-paint = `--bg` layar mulai (ui/index.html); `System` = bawaan platform.
fn window_background(theme: UiTheme) -> Option<Color> {
    match theme {
        UiTheme::System => None,
        UiTheme::Light => Some(Color(0xfa, 0xfa, 0xfa, 0xff)),
        UiTheme::Dark => Some(Color(0x11, 0x11, 0x13, 0xff)),
    }
}

fn apply_ui_theme(config: &mut WindowConfig, theme: UiTheme) {
    config.theme = native_theme(theme);
    config.background_color = window_background(theme);
}

fn theme_file(app: &AppHandle) -> Option<PathBuf> {
    app.path().app_config_dir().ok().map(|d| dunce::simplified(&d).join(THEME_FILE))
}

/// Pilihan tersimpan; file tidak ada/rusak → `System` (perilaku lama: ikut OS).
fn read_ui_theme(path: Option<&Path>) -> UiTheme {
    path.and_then(|p| fs::read_to_string(p).ok()).and_then(|s| parse_ui_theme(&s)).unwrap_or(UiTheme::System)
}

/// Dipanggil viewer (theme.ts) saat mulai dan saat pilihan berubah: simpan untuk layar mulai berikutnya dan
/// terapkan ke jendela sekarang (layar mulai setelah restart lakard ikut tema baru).
#[tauri::command]
async fn set_ui_theme(app: AppHandle, theme: String) -> Result<(), String> {
    let theme = parse_ui_theme(&theme).ok_or_else(|| format!("tema tidak dikenal: {theme}"))?;
    let name = ui_theme_name(theme);
    if let Some(path) = theme_file(&app) {
        // Viewer memanggil ini setiap kali dimuat: tulis hanya bila isi berubah.
        if fs::read_to_string(&path).ok().as_deref().map(str::trim) != Some(name) {
            fs::write(&path, name).map_err(|e| format!("gagal menulis {}: {e}", path.display()))?;
        }
    }
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.set_theme(native_theme(theme));
        let _ = win.set_background_color(window_background(theme));
    }
    Ok(())
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

/// `dir/name`, atau `dir/name (2).ext`, `(3)`, … bila sudah ada (unduhan tidak menimpa file lama).
fn unique_path(dir: &Path, name: &str, exists: impl Fn(&Path) -> bool) -> PathBuf {
    let first = dir.join(name);
    if !exists(&first) {
        return first;
    }
    let file = Path::new(name);
    let stem = file.file_stem().map(|s| s.to_string_lossy().into_owned()).unwrap_or_else(|| name.to_string());
    let ext = file.extension().map(|e| format!(".{}", e.to_string_lossy())).unwrap_or_default();
    let mut n = 2u32;
    loop {
        let candidate = dir.join(format!("{stem} ({n}){ext}"));
        if !exists(&candidate) {
            return candidate;
        }
        n += 1;
    }
}

/// Nama file unduhan dari tujuan yang diusulkan webview (nama dari `<a download>`/server); kosong → `export.png`.
fn download_name(suggested: &Path) -> String {
    suggested
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .filter(|n| !n.trim().is_empty())
        .unwrap_or_else(|| "export.png".to_string())
}

/// Posisi traffic lights macOS (tepi kiri-atas tombol, tinggi ±14px): tengah vertikal title bar viewer (44px).
const TRAFFIC_LIGHTS: LogicalPosition = LogicalPosition { x: 16.0, y: 15.0 };

/// Title bar kustom viewer (tab + tombol jendela sendiri): Windows/Linux tanpa dekorasi native; macOS memakai
/// title bar Overlay tanpa judul sehingga traffic lights native tampil di atas strip tab.
fn apply_chrome(config: &mut WindowConfig, macos: bool) {
    if macos {
        config.decorations = true;
        config.title_bar_style = TitleBarStyle::Overlay;
        config.hidden_title = true;
        config.traffic_light_position = Some(TRAFFIC_LIGHTS);
    } else {
        config.decorations = false;
    }
}

/// Jendela utama dari `tauri.conf.json` (`create: false`) dengan handler unduhan: Export PNG viewer disimpan ke
/// folder Downloads OS, tanpa menimpa file yang sudah ada. Dekorasi jendela diatur `apply_chrome`.
fn build_main_window(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let mut config = app
        .config()
        .app
        .windows
        .iter()
        .find(|w| w.label == "main")
        .cloned()
        .ok_or("konfigurasi jendela main tidak ada di tauri.conf.json")?;
    apply_chrome(&mut config, cfg!(target_os = "macos"));
    // Tema pilihan Settings sebelum jendela dibuat: layar mulai langsung ter-paint dengan warna yang benar.
    apply_ui_theme(&mut config, read_ui_theme(theme_file(app).as_deref()));
    WebviewWindowBuilder::from_config(app, &config)?
        .on_download(|webview, event| {
            if let DownloadEvent::Requested { destination, .. } = event {
                if let Ok(dir) = webview.path().download_dir() {
                    let name = download_name(destination.as_path());
                    *destination = unique_path(&dir, &name, |p| p.exists());
                }
            }
            true
        })
        .build()?;
    Ok(())
}

fn main() {
    let app = tauri::Builder::default()
        // Instance kedua hanya memunculkan jendela yang ada (satu daemon per data dir).
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| show_main(app)))
        // Updater otomatis (endpoint latest.json GitHub Release; command di modul updates).
        .plugin(tauri_plugin_updater::Builder::new().build())
        // Opener: `window.open` diabaikan webview — URL eksternal (sign-in OAuth viewer) dibuka di
        // browser sistem lewat `plugin:opener|open_url` (izin `opener:default` di viewer-window.json).
        .plugin(tauri_plugin_opener::init())
        .manage(DaemonState::default())
        .manage(updates::PendingUpdate::default())
        .invoke_handler(tauri::generate_handler![
            daemon_state,
            restart_daemon,
            set_ui_theme,
            updates::app_version,
            updates::check_update,
            updates::download_update,
            updates::install_update,
            updates::relaunch_app
        ])
        .setup(|app| {
            build_main_window(app.handle())?;
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

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn unique_path_keeps_free_name() {
        let dir = Path::new("dl");
        assert_eq!(unique_path(dir, "a@2x.png", |_| false), dir.join("a@2x.png"));
    }

    #[test]
    fn unique_path_numbers_taken_names() {
        let dir = Path::new("dl");
        let taken = [dir.join("a@2x.png"), dir.join("a@2x (2).png")];
        assert_eq!(unique_path(dir, "a@2x.png", |p| taken.iter().any(|t| t == p)), dir.join("a@2x (3).png"));
        assert_eq!(unique_path(dir, "README", |p| p == dir.join("README")), dir.join("README (2)"));
    }

    #[test]
    fn chrome_windows_linux_drops_native_decorations() {
        let mut config = WindowConfig::default();
        apply_chrome(&mut config, false);
        assert!(!config.decorations);
        assert_eq!(config.title_bar_style, TitleBarStyle::Visible);
    }

    #[test]
    fn chrome_macos_overlays_traffic_lights() {
        let mut config = WindowConfig::default();
        apply_chrome(&mut config, true);
        assert!(config.decorations);
        assert_eq!(config.title_bar_style, TitleBarStyle::Overlay);
        assert!(config.hidden_title);
        assert_eq!(config.traffic_light_position, Some(TRAFFIC_LIGHTS));
    }

    /// Izin jendela yang dipakai title bar viewer (tombol + drag region) dan gate first-run
    /// (setFocus — kembali fokus sesudah sign-in OAuth di browser, spec-first-run-signin); tidak lebih.
    const WINDOW_PERMISSIONS: [&str; 7] = [
        "core:window:allow-minimize",
        "core:window:allow-toggle-maximize",
        "core:window:allow-internal-toggle-maximize",
        "core:window:allow-close",
        "core:window:allow-start-dragging",
        "core:window:allow-is-maximized",
        "core:window:allow-set-focus",
    ];

    #[test]
    fn viewer_capability_is_narrow_remote_loopback() {
        let cap: serde_json::Value = serde_json::from_str(include_str!("../capabilities/viewer-window.json")).unwrap();
        assert_eq!(cap["remote"]["urls"], json!(["http://127.0.0.1:*"]));
        assert_eq!(cap["windows"], json!(["main"]));
        // Command aplikasi untuk halaman remote: sinkron tema + updater + opener URL default
        // (sign-in OAuth; `window.open` no-op di webview); daemon_state/restart_daemon tidak.
        let mut expected: Vec<&str> = WINDOW_PERMISSIONS.to_vec();
        expected.extend([
            "allow-set-ui-theme",
            "allow-app-version",
            "allow-check-update",
            "allow-download-update",
            "allow-install-update",
            "allow-relaunch-app",
            "opener:default",
        ]);
        assert_eq!(cap["permissions"], json!(expected));
    }

    #[test]
    fn start_screen_capability_has_window_controls() {
        let cap: serde_json::Value = serde_json::from_str(include_str!("../capabilities/default.json")).unwrap();
        assert!(cap.get("remote").is_none());
        let perms = cap["permissions"].as_array().unwrap();
        // Manifest ACL aplikasi (build.rs) membuat command layar mulai wajib diizinkan eksplisit.
        for p in WINDOW_PERMISSIONS.iter().chain(&["allow-daemon-state", "allow-restart-daemon"]) {
            assert!(perms.contains(&json!(p)), "{p} tidak ada di default.json");
        }
    }

    #[test]
    fn build_manifest_lists_every_command() {
        let build = include_str!("../build.rs");
        for cmd in ["daemon_state", "restart_daemon", "set_ui_theme", "app_version", "check_update", "download_update", "install_update", "relaunch_app"] {
            assert!(build.contains(&format!("\"{cmd}\"")), "{cmd} tidak ada di manifest build.rs");
        }
    }

    #[test]
    fn ui_theme_parses_only_known_values() {
        assert_eq!(parse_ui_theme("light"), Some(UiTheme::Light));
        assert_eq!(parse_ui_theme("dark\r\n"), Some(UiTheme::Dark));
        assert_eq!(parse_ui_theme("system"), Some(UiTheme::System));
        for v in ["", "Dark", "blue"] {
            assert_eq!(parse_ui_theme(v), None);
        }
        for t in [UiTheme::System, UiTheme::Light, UiTheme::Dark] {
            assert_eq!(parse_ui_theme(ui_theme_name(t)), Some(t));
        }
    }

    #[test]
    fn ui_theme_sets_native_theme_and_background() {
        let mut config = WindowConfig::default();
        apply_ui_theme(&mut config, UiTheme::Dark);
        assert_eq!(config.theme, Some(Theme::Dark));
        assert_eq!(config.background_color, Some(Color(0x11, 0x11, 0x13, 0xff)));
        apply_ui_theme(&mut config, UiTheme::Light);
        assert_eq!(config.theme, Some(Theme::Light));
        assert_eq!(config.background_color, Some(Color(0xfa, 0xfa, 0xfa, 0xff)));
        // System: kembali ke perilaku lama (ikut OS, latar bawaan).
        apply_ui_theme(&mut config, UiTheme::System);
        assert_eq!(config.theme, None);
        assert_eq!(config.background_color, None);
    }

    #[test]
    fn read_ui_theme_falls_back_to_system() {
        let dir = std::env::temp_dir().join(format!("lakar-theme-test-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let file = dir.join(THEME_FILE);
        assert_eq!(read_ui_theme(None), UiTheme::System);
        assert_eq!(read_ui_theme(Some(&file)), UiTheme::System);
        fs::write(&file, "dark").unwrap();
        assert_eq!(read_ui_theme(Some(&file)), UiTheme::Dark);
        fs::write(&file, "garbage").unwrap();
        assert_eq!(read_ui_theme(Some(&file)), UiTheme::System);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn mcp_node_copy_reuses_and_refreshes() {
        let root = std::env::temp_dir().join(format!("lakar-mcp-node-test-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).unwrap();
        let node = root.join("lakar-node.exe");
        fs::write(&node, b"node-v1").unwrap();
        let dir = root.join("mcp");
        let dst = mcp_node_copy(&node, &dir, "0.1.4").unwrap();
        assert_eq!(dst, dir.join("lakar-node.exe"));
        assert_eq!(fs::read(&dst).unwrap(), b"node-v1");
        // Versi + ukuran sama → salinan lama dipakai ulang (tidak disalin lagi).
        fs::write(&dst, b"keep-me").unwrap();
        fs::write(&node, b"node-v2").unwrap();
        fs::write(dir.join("lakar-node.version"), format!("0.1.4 {}", b"node-v2".len())).unwrap();
        assert_eq!(fs::read(mcp_node_copy(&node, &dir, "0.1.4").unwrap()).unwrap(), b"keep-me");
        // Versi berubah → diganti; sisa `*.old` dibersihkan.
        fs::write(dir.join("lakar-node.exe.1.old"), b"stale").unwrap();
        assert_eq!(fs::read(mcp_node_copy(&node, &dir, "0.1.5").unwrap()).unwrap(), b"node-v2");
        assert!(!dir.join("lakar-node.exe.1.old").exists());
        assert!(!dir.join("lakar-node.exe.tmp").exists());
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn download_name_falls_back() {
        assert_eq!(download_name(Path::new("/home/u/Downloads/x-hero@1x.png")), "x-hero@1x.png");
        assert_eq!(download_name(Path::new("")), "export.png");
    }

    #[test]
    fn dechunk_joins_chunks() {
        assert_eq!(dechunk("5\r\nhello\r\n6\r\n world\r\n0\r\n\r\n").as_deref(), Some("hello world"));
    }

    #[test]
    fn dechunk_rejects_truncated_body() {
        assert_eq!(dechunk("a\r\nshort"), None);
    }

    #[test]
    fn pool_ready_when_all_pages_ready() {
        assert_eq!(classify_pool(&json!({"size": 2, "ready": 2}), false), Some((Phase::Ready, String::new())));
    }

    #[test]
    fn pool_no_browser_from_marker() {
        let pool = json!({"size": 2, "ready": 0, "lastError": format!("{NO_BROWSER_MARKER} (dicoba: Google Chrome, Microsoft Edge)")});
        assert_eq!(classify_pool(&pool, false).map(|(phase, _)| phase), Some(Phase::NoBrowser));
    }

    #[test]
    fn pool_warming_keeps_waiting() {
        assert_eq!(classify_pool(&json!({"size": 2, "ready": 1}), false), None);
    }

    #[test]
    fn pool_timeout_or_missing_opens_viewer() {
        let pool = json!({"size": 2, "ready": 0, "lastError": "render Chromium gagal: x"});
        assert_eq!(classify_pool(&pool, true), Some((Phase::Ready, "render Chromium gagal: x".to_string())));
        assert_eq!(classify_pool(&serde_json::Value::Null, false), Some((Phase::Ready, String::new())));
    }

    #[test]
    fn pick_port_reuses_saved_fallback_port() {
        let dir = std::env::temp_dir().join(format!("lakar-port-test-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let file = dir.join("port");
        // Tahan 7466 bila bebas agar jalur cadangan teruji (bila sudah dipakai proses lain, hasilnya sama).
        let _hold = TcpListener::bind(("127.0.0.1", DEFAULT_PORT)).ok();
        let first = pick_port(&file);
        assert_ne!(first, DEFAULT_PORT);
        assert_eq!(pick_port(&file), first);
        let _ = fs::remove_dir_all(&dir);
    }
}
