// Updater otomatis aplikasi (tauri-plugin-updater): endpoint statis `latest.json` di GitHub Release fatmuh/lakar.
// Viewer (origin remote http://127.0.0.1) memanggil command di sini lewat `__TAURI__.core.invoke` (pola
// `set_ui_theme`), bukan JS plugin updater, supaya tidak bergantung pada injeksi JS plugin ke origin remote.
// `PendingUpdate` menyimpan `Update` hasil check terakhir beserta bytes unduhan: banner "Restart now" memasang
// tanpa mengunduh ulang; jalur manual "Download and install" mengunduh + memasang dalam satu panggilan (progress
// lewat Channel). Guard `std::sync::Mutex` tidak Send, jadi `Update` di-Clone keluar kunci sebelum await.
use std::fs;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;

use serde::Serialize;
use tauri::{ipc::Channel, AppHandle, Manager, Url};
use tauri_plugin_updater::{Error as UpdaterError, Update, UpdaterExt};

/// Channel update per instalasi (Settings → Updates). Stable memakai endpoint dari
/// `tauri.conf.json` seperti biasa; Nightly mengganti endpoint per check.
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum UpdateChannel {
    Stable,
    Nightly,
}

/// Endpoint `latest.json` rilis pra-rilis `nightly` (job latest-json di release.yml).
const NIGHTLY_ENDPOINT: &str = "https://github.com/fatmuh/lakar/releases/download/nightly/latest.json";

/// File teks polos di app_config_dir (pola `theme`) berisi `stable`/`nightly`; dibuat hanya saat
/// pengguna memilih eksplisit — tanpa file, channel diturunkan dari versi yang berjalan.
const CHANNEL_FILE: &str = "update-channel";

/// Nilai tersimpan/terkirim → channel; selain dua nilai sah → `None` (file rusak dianggap tak ada).
fn parse_channel(value: &str) -> Option<UpdateChannel> {
    match value.trim() {
        "stable" => Some(UpdateChannel::Stable),
        "nightly" => Some(UpdateChannel::Nightly),
        _ => None,
    }
}

fn channel_name(channel: UpdateChannel) -> &'static str {
    match channel {
        UpdateChannel::Stable => "stable",
        UpdateChannel::Nightly => "nightly",
    }
}

/// Channel efektif + apakah berasal dari file tersimpan. Urutan: file sah → pra-rilis versi
/// berjalan diawali `nightly` (pemasang installer nightly sudah memilih nightly) → stable.
fn effective_channel(saved: Option<&str>, version: &str) -> (UpdateChannel, bool) {
    if let Some(channel) = saved.and_then(parse_channel) {
        return (channel, true);
    }
    let prerelease = version.split('-').nth(1).unwrap_or("");
    if prerelease.starts_with("nightly") {
        (UpdateChannel::Nightly, false)
    } else {
        (UpdateChannel::Stable, false)
    }
}

fn channel_file(app: &AppHandle) -> Option<PathBuf> {
    app.path().app_config_dir().ok().map(|d| dunce::simplified(&d).join(CHANNEL_FILE))
}

/// Isi file channel mentah; file tidak ada/tak terbaca → `None` (default turunan dipakai).
fn saved_channel(app: &AppHandle) -> Option<String> {
    channel_file(app).and_then(|p| fs::read_to_string(p).ok())
}

/// Info channel untuk UI (camelCase): `saved` = pilihan eksplisit tersimpan, bukan turunan versi.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateChannelInfo {
    pub channel: String,
    pub saved: bool,
}

/// Channel efektif saat ini (tersimpan, atau turunan dari versi yang berjalan).
#[tauri::command]
pub fn update_channel(app: AppHandle) -> UpdateChannelInfo {
    let version = app.package_info().version.to_string();
    let (channel, saved) = effective_channel(saved_channel(&app).as_deref(), &version);
    UpdateChannelInfo { channel: channel_name(channel).to_string(), saved }
}

/// Simpan pilihan channel dan buang update yang pending (bytes ikut hilang — unduhan bisa diulang).
/// Generation dinaikkan supaya check yang sedang berjalan membuang hasil basinya.
#[tauri::command]
pub fn set_update_channel(app: AppHandle, pending: tauri::State<'_, PendingUpdate>, channel: String) -> Result<UpdateChannelInfo, String> {
    let channel = parse_channel(&channel).ok_or_else(|| format!("channel tidak dikenal: {channel}"))?;
    let name = channel_name(channel);
    if let Some(path) = channel_file(&app) {
        // Tulis hanya bila isi berubah (pola set_ui_theme).
        if fs::read_to_string(&path).ok().as_deref().map(str::trim) != Some(name) {
            fs::write(&path, name).map_err(|e| format!("gagal menulis {}: {e}", path.display()))?;
        }
    }
    pending.clear_and_bump();
    Ok(UpdateChannelInfo { channel: name.to_string(), saved: true })
}

/// Metadata update untuk UI (serialisasi camelCase, seperti field command lain).
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateMetadata {
    pub version: String,
    pub current_version: String,
    pub notes: Option<String>,
    pub pub_date: Option<String>,
    /// Channel yang menemukan update ini — `latest.json` channel lain bisa memuat versi berbeda.
    pub channel: String,
}

impl UpdateMetadata {
    fn new(update: &Update, channel: UpdateChannel) -> Self {
        Self {
            version: update.version.clone(),
            current_version: update.current_version.clone(),
            notes: update.body.clone(),
            // Tanggal rilis dari latest.json mentah (RFC3339) — `Update::date` memakai tipe `time`
            // yang bukan dependensi langsung aplikasi.
            pub_date: update.raw_json.get("pub_date").and_then(|v| v.as_str()).map(str::to_owned),
            channel: channel_name(channel).to_string(),
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
/// `channel` dicatat supaya metadata unduhan melaporkan channel yang sama dengan check-nya.
#[derive(Clone)]
struct Pending {
    update: Update,
    channel: UpdateChannel,
    bytes: Option<Vec<u8>>,
}

/// State aplikasi: `Mutex<Option<Pending>>` (kosong sampai `check_update` pertama kali menemukan
/// update) + `generation` yang naik tiap `set_update_channel` untuk membuang hasil check basi.
#[derive(Default)]
pub struct PendingUpdate {
    pending: Mutex<Option<Pending>>,
    generation: AtomicU64,
}

impl PendingUpdate {
    /// Salinan `Pending` saat ini (guard dilepas sebelum await).
    fn pending(&self) -> Option<Pending> {
        self.pending.lock().unwrap().clone()
    }

    fn generation(&self) -> u64 {
        self.generation.load(Ordering::SeqCst)
    }

    /// Ganti channel: buang pending (update + bytes) dan naikkan generation — check yang sedang
    /// berjalan di channel lama akan membuang hasilnya (CHANNEL_CHANGED).
    fn clear_and_bump(&self) {
        *self.pending.lock().unwrap() = None;
        self.generation.fetch_add(1, Ordering::SeqCst);
    }

    /// Simpan hasil check terbaru (update baru selalu tanpa bytes).
    fn set_update(&self, update: Option<Update>, channel: UpdateChannel) {
        *self.pending.lock().unwrap() = update.map(|update| Pending { update, channel, bytes: None });
    }

    /// Lampirkan bytes hasil unduhan, hanya bila update yang sama masih pending.
    fn set_bytes(&self, update: &Update, bytes: Vec<u8>) {
        let mut g = self.pending.lock().unwrap();
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

/// Endpoint 404/non-2xx atau JSON tak valid → `RELEASE_NOT_FOUND: <detail>` (bukan "up to date",
/// supaya viewer bisa membedakan channel yang kosong). Error lain mentah seperti biasa.
fn update_check_error(e: UpdaterError) -> String {
    match e {
        UpdaterError::ReleaseNotFound => "RELEASE_NOT_FOUND: no release found at the update endpoint".to_string(),
        other => other.to_string(),
    }
}

/// Periksa update di endpoint channel efektif: stable → `app.updater()` (config tauri.conf.json,
/// sama seperti sebelumnya), nightly → `updater_builder` dengan endpoint `nightly/latest.json`
/// (pubkey/installMode tetap dari config). `Some` → update disimpan sebagai pending.
/// Bila channel diganti di tengah check, hasil dibuang dan `CHANNEL_CHANGED` dikembalikan
/// (viewer sudah memulai check baru di channel baru, jadi error ini tidak ditampilkan).
#[tauri::command]
pub async fn check_update(app: AppHandle, pending: tauri::State<'_, PendingUpdate>) -> Result<Option<UpdateMetadata>, String> {
    let generation = pending.generation();
    let version = app.package_info().version.to_string();
    let (channel, _) = effective_channel(saved_channel(&app).as_deref(), &version);
    let updater = match channel {
        UpdateChannel::Stable => app.updater().map_err(|e| e.to_string())?,
        UpdateChannel::Nightly => app
            .updater_builder()
            .endpoints(vec![Url::parse(NIGHTLY_ENDPOINT).map_err(|e| e.to_string())?])
            .map_err(|e| e.to_string())?
            .build()
            .map_err(|e| e.to_string())?,
    };
    let update = updater.check().await.map_err(update_check_error)?;
    if pending.generation() != generation {
        return Err(format!("CHANNEL_CHANGED: update channel changed while checking (channel is now {})", channel_name(channel)));
    }
    let metadata = update.as_ref().map(|u| UpdateMetadata::new(u, channel));
    pending.set_update(update, channel);
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
    Ok(UpdateMetadata::new(&p.update, p.channel))
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn channel_parses_only_known_values() {
        assert_eq!(parse_channel("stable"), Some(UpdateChannel::Stable));
        assert_eq!(parse_channel("nightly\r\n"), Some(UpdateChannel::Nightly));
        for v in ["", "Nightly", "beta", "stable nightly"] {
            assert_eq!(parse_channel(v), None);
        }
        for c in [UpdateChannel::Stable, UpdateChannel::Nightly] {
            assert_eq!(parse_channel(channel_name(c)), Some(c));
        }
    }

    #[test]
    fn effective_channel_saved_file_wins() {
        // Pilihan eksplisit mengalahkan versi yang berjalan (E11: nightly tersimpan + installer stable).
        assert_eq!(effective_channel(Some("nightly"), "0.1.8"), (UpdateChannel::Nightly, true));
        assert_eq!(effective_channel(Some("stable\n"), "0.1.9-nightly.202611251800"), (UpdateChannel::Stable, true));
    }

    #[test]
    fn effective_channel_derives_from_running_version() {
        assert_eq!(effective_channel(None, "0.1.9-nightly.202611251800"), (UpdateChannel::Nightly, false));
        assert_eq!(effective_channel(None, "0.1.8"), (UpdateChannel::Stable, false));
        // Nightly lama (versi tertanam 0.1.0 tanpa sufiks) → turunan stable.
        assert_eq!(effective_channel(None, "0.1.0"), (UpdateChannel::Stable, false));
    }

    #[test]
    fn effective_channel_ignores_broken_saved_value() {
        assert_eq!(effective_channel(Some("beta"), "0.1.9-nightly.202611251800"), (UpdateChannel::Nightly, false));
        assert_eq!(effective_channel(Some("beta"), "0.1.8"), (UpdateChannel::Stable, false));
    }
}
