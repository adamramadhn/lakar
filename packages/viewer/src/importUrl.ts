// Helper dialog Import from URL (epic adopsi open-pencil story 8, desain section 11): preset lebar board,
// validasi URL sisi klien (pemeriksaan anti-SSRF penuh tetap di daemon), dan judul toast hasil impor.
import type { ImportUrlResult } from './api.js';

/** Preset "Board width" dialog (tanpa Custom — sama dengan tiga preset New file). */
export const IMPORT_PRESETS = [
  { id: 'desktop', label: 'Desktop', width: 1440, screen: 'landing' },
  { id: 'tablet', label: 'Tablet', width: 768, screen: 'app' },
  { id: 'mobile', label: 'Mobile', width: 375, screen: 'mobile' },
] as const;
export type ImportPresetId = (typeof IMPORT_PRESETS)[number]['id'];

/** Langkah progres yang ditampilkan saat impor berjalan (desain: Fetched page → Rendered → Converting to layers). */
export const IMPORT_STEPS = ['Fetched page', 'Rendered', 'Converting to layers'] as const;

/** URL layak kirim: http(s) dengan host. Alamat lokal/privat ditolak lagi oleh daemon (pesan errornya ditampilkan). */
export function validPageUrl(raw: string): boolean {
  try {
    const u = new URL(raw.trim());
    return (u.protocol === 'http:' || u.protocol === 'https:') && !!u.hostname;
  } catch {
    return false;
  }
}

/** Judul toast sukses: "Imported N layers from <host>" (N dari report HTML; fallback host URL tujuan). */
export function importToastTitle(r: ImportUrlResult): string {
  const layers = r.report.kind === 'html' ? r.report.layers : r.created.length;
  let host = r.page.finalUrl;
  try {
    host = new URL(r.page.finalUrl).hostname;
  } catch {
    /* pakai URL apa adanya */
  }
  return `Imported ${layers} ${layers === 1 ? 'layer' : 'layers'} from ${host}`;
}
