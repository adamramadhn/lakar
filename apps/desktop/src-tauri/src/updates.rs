// Updater otomatis aplikasi (tauri-plugin-updater): endpoint statis `latest.json` di GitHub Release fatmuh/lakar.
// Viewer (origin remote http://127.0.0.1) memanggil command di sini lewat `__TAURI__.core.invoke` (pola
// `set_ui_theme`), bukan JS plugin updater, supaya tidak bergantung pada injeksi JS plugin ke origin remote.
// `PendingUpdate` menyimpan `Update` hasil check terakhir beserta bytes unduhan: banner "Restart now" memasang
// tanpa mengunduh ulang; jalur manual "Download and install" mengunduh + memasang dalam satu panggilan (progress
// lewat Channel). Guard `std::sync::Mutex` tidak Send, jadi `Update` di-Clone keluar kunci sebelum await.
use std::sync::Mutex;

use serde::Serialize;
use tauri::{ipc::Channel, AppHandle};
use tauri_plugin_updater::{Update, UpdaterExt};

/// Metadata update untuk UI (serialisasi camelCase, seperti field command lain).
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateMetadata {
    pub version: String,
    pub current_version: String,
    pub notes: Option<String>,
    pub pub_date: Option<String>,
}

impl From<&Update> for UpdateMetadata {
    fn from(update: &Update) -> Self {
        Self {
            version: update.version.clone(),
            current_version: update.current_version.clone(),
            notes: update.body.clone(),
            // Tanggal rilis dari latest.json mentah (RFC3339) — `Update::date` memakai tipe `time`
            // yang bukan dependensi langsung aplikasi.
            pub_date: update.raw_json.get("pub_date").and_then(|v| v.as_str()).map(str::to_owned),
        }
    }
}

/// Event progress unduhan untuk `tauri::ipc::Channel`; bentuk sama dengan DownloadEvent JS plugin updater:
/// `{event:"started",data:{contentLength}}`, `{event:"progress",data:{chunkLength}}`, `{event:"finished"}`.
#[derive(Clone, Serialize)]
#[serde(tag = "event", content = "data", rename_all = "camelCase")]
pub enum DownloadEvent {
    #[serde(rename_all = "camelCase")]
    Started { content_length: Option<u64> },
    #[serde(rename_all = "camelCase")]
    Progress { chunk_length: usize },
    Finished,
}

/// Update hasil check terakhir + bytes unduhan (bila sudah terunduh lewat `download_update`).
#[derive(Clone)]
struct Pending {
    update: Update,
    bytes: Option<Vec<u8>>,
}

/// State aplikasi: `Mutex<Option<Pending>>` (kosong sampai `check_update` pertama kali menemukan update).
#[derive(Default)]
pub struct PendingUpdate(Mutex<Option<Pending>>);

impl PendingUpdate {
    /// Salinan `Pending` saat ini (guard dilepas sebelum await).
    fn pending(&self) -> Option<Pending> {
        self.0.lock().unwrap().clone()
    }

    /// Simpan hasil check terbaru (update baru selalu tanpa bytes).
    fn set_update(&self, update: Option<Update>) {
        *self.0.lock().unwrap() = update.map(|update| Pending { update, bytes: None });
    }

    /// Lampirkan bytes hasil unduhan, hanya bila update yang sama masih pending.
    fn set_bytes(&self, update: &Update, bytes: Vec<u8>) {
        let mut g = self.0.lock().unwrap();
        if let Some(p) = g.as_mut() {
            if p.update.version == update.version {
                p.bytes = Some(bytes);
            }
        }
    }
}

/// Forward progress unduhan plugin ke Channel: `started` sekali di chunk pertama (content_length dari header),
/// `progress` per chunk, `finished` di akhir.
fn send_started(on_progress: &Channel<DownloadEvent>, content_length: Option<u64>) {
    let _ = on_progress.send(DownloadEvent::Started { content_length });
}

fn send_progress(on_progress: &Channel<DownloadEvent>, chunk_length: usize) {
    let _ = on_progress.send(DownloadEvent::Progress { chunk_length });
}

fn send_finished(on_progress: &Channel<DownloadEvent>) {
    let _ = on_progress.send(DownloadEvent::Finished);
}

const NO_UPDATE: &str = "no update is pending; run check_update first";

/// Versi aplikasi yang sedang berjalan (dipakai Settings → Updates dan banner "Updated to Lakar x.y").
#[tauri::command]
pub fn app_version(app: AppHandle) -> String {
    app.package_info().version.to_string()
}

/// Periksa update di endpoint updater. `Some` → update disimpan sebagai pending (bytes dikosongkan).
#[tauri::command]
pub async fn check_update(app: AppHandle, pending: tauri::State<'_, PendingUpdate>) -> Result<Option<UpdateMetadata>, String> {
    let updater = app.updater().map_err(|e| e.to_string())?;
    let update = updater.check().await.map_err(|e| e.to_string())?;
    let metadata = update.as_ref().map(UpdateMetadata::from);
    pending.set_update(update);
    Ok(metadata)
}

/// Unduh update yang pending (tanpa memasang): bytes disimpan supaya "Restart now" tidak mengunduh ulang.
#[tauri::command]
pub async fn download_update(pending: tauri::State<'_, PendingUpdate>, on_progress: Channel<DownloadEvent>) -> Result<UpdateMetadata, String> {
    let p = pending.pending().ok_or(NO_UPDATE)?;
    let mut started = false;
    let bytes = p
        .update
        .download(
            |chunk_length, content_length| {
                if !started {
                    started = true;
                    send_started(&on_progress, content_length);
                }
                send_progress(&on_progress, chunk_length);
            },
            || {},
        )
        .await
        .map_err(|e| e.to_string())?;
    send_finished(&on_progress);
    pending.set_bytes(&p.update, bytes);
    Ok(UpdateMetadata::from(&p.update))
}

/// Pasang update yang pending: bytes yang sudah terunduh dipakai langsung (banner "Restart now"), selain itu
/// unduh + pasang dalam satu langkah dengan progress lewat Channel (tombol "Download and install").
#[tauri::command]
pub async fn install_update(pending: tauri::State<'_, PendingUpdate>, on_progress: Channel<DownloadEvent>) -> Result<(), String> {
    let p = pending.pending().ok_or(NO_UPDATE)?;
    if let Some(bytes) = p.bytes {
        // Windows: install keluar sendiri sesudah installer updater diluncurkan.
        p.update.install(bytes).map_err(|e| e.to_string())
    } else {
        let mut started = false;
        p.update
            .download_and_install(
                |chunk_length, content_length| {
                    if !started {
                        started = true;
                        send_started(&on_progress, content_length);
                    }
                    send_progress(&on_progress, chunk_length);
                },
                || {},
            )
            .await
            .map_err(|e| e.to_string())?;
        send_finished(&on_progress);
        Ok(())
    }
}

/// Mulai ulang aplikasi (macOS/Linux: menjalankan versi yang baru dipasang). Di Windows install keluar sendiri
/// dan installer yang memulai ulang, jadi command ini tidak sempat berjalan di sana.
#[tauri::command]
pub fn relaunch_app(app: AppHandle) {
    app.restart();
}
