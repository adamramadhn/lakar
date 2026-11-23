// Command aplikasi didaftarkan di manifest ACL: izin `allow-<command>` dibuat otomatis dan setiap command harus
// diizinkan eksplisit di capabilities/*.json (layar mulai: daemon_state, restart_daemon; viewer: set_ui_theme +
// command updater di updates.rs).
const COMMANDS: &[&str] = &[
    "daemon_state",
    "restart_daemon",
    "set_ui_theme",
    "app_version",
    "check_update",
    "download_update",
    "install_update",
    "relaunch_app",
];

fn main() {
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(tauri_build::AppManifest::new().commands(COMMANDS)))
        .expect("gagal menjalankan tauri-build");
}
