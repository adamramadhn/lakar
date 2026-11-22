// Helper murni uji paritas piksel ekspor kode (spec kode-4): ambang R5, simulasi bundler CSS modules (scoping kelas +
// urutan CSS mengikuti urutan evaluasi impor ESM), halaman ekspor, dan mutasi dokumen/berkas untuk tes. Tanpa IO.
// Bagian yang butuh Chromium, Tailwind, dan React ada di `tests/codegen-parity.test.ts`.

/** Selisih kanal maksimum per piksel (0..255) yang masih dianggap sama (antialias dan pembulatan subpiksel). */
export const PARITY_TOLERANCE = 24;
/** Rasio piksel berbeda (> toleransi) maksimum terhadap luas yang dibandingkan: di bawah 1% (R5). */
export const PARITY_MAX_RATIO = 0.01;

/** Lulus ambang R5: rasio piksel berbeda (terhadap luas) < 1%. */
export const withinParity = (ratio: number): boolean => Number.isFinite(ratio) && ratio >= 0 && ratio < PARITY_MAX_RATIO;

export type ExportFile = { path: string; contents: string };

/** Baris aturan modul CSS keluaran codegen: `.kelas {` atau `.kelas::after {`. */
const RULE_LINE = /^\.([A-Za-z_][\w-]*)(::after)? \{$/;

/**
 * Scoping CSS modules seperti bundler: setiap selektor kelas `.nama` diganti `.<scoped(nama)>`. Hanya baris
 * selektor yang disentuh (nilai seperti `0.5` atau `url(a.png)` tidak), karena modul codegen hanya memuat aturan
 * kelas datar. Baris aturan dengan bentuk lain → Error (format modul berubah, helper harus diperbarui).
 */
export function scopeCssModule(css: string, scoped: (name: string) => string): string {
  return css
    .split('\n')
    .map((line) => {
      if (!line.endsWith('{')) return line;
      const m = RULE_LINE.exec(line);
      if (!m) throw new Error(`scopeCssModule: selektor tak dikenal ${JSON.stringify(line)}`);
      return `.${scoped(m[1]!)}${m[2] ?? ''} {`;
    })
    .join('\n');
}

/** Nama kelas di modul CSS (urut kemunculan, unik). */
export function cssModuleClasses(css: string): string[] {
  const out = new Set<string>();
  for (const line of css.split('\n')) {
    const m = RULE_LINE.exec(line);
    if (m) out.add(m[1]!);
  }
  return [...out];
}

const IMPORT_LINE = /^import (?!type )[^;]*? from '(\.{1,2}\/[^']+)';$/gm;

const joinPath = (fromFile: string, spec: string): string => {
  const parts = fromFile.split('/').slice(0, -1);
  for (const seg of spec.split('/')) {
    if (seg === '.') continue;
    if (seg === '..') parts.pop();
    else parts.push(seg);
  }
  return parts.join('/');
};

/**
 * Urutan modul CSS di bundle: urutan evaluasi impor ESM dari `entry` (depth-first, impor diproses berurutan,
 * modul yang sudah dikunjungi dilewati), sama dengan urutan CSS yang ditulis Vite/webpack. Impor tanpa ekstensi
 * dicari sebagai `.tsx`.
 */
export function cssModuleOrder(files: readonly ExportFile[], entry: string): string[] {
  const byPath = new Map(files.map((f) => [f.path, f.contents]));
  const seen = new Set<string>();
  const out: string[] = [];
  const visit = (path: string) => {
    if (seen.has(path)) return;
    seen.add(path);
    if (path.endsWith('.css')) {
      out.push(path);
      return;
    }
    const src = byPath.get(path);
    if (src === undefined) throw new Error(`cssModuleOrder: berkas ${path} tidak ada`);
    for (const m of src.matchAll(IMPORT_LINE)) {
      const target = joinPath(path, m[1]!);
      visit(target.endsWith('.css') ? target : `${target}.tsx`);
    }
  };
  visit(entry);
  return out;
}

export type PageFace = { family: string; weight: number; style: 'normal' | 'italic'; url: string; unicodeRange?: string | undefined };

/** `@font-face` setara dengan FontFace yang didaftarkan render (`fonts.ts`: woff2, weight, style, unicode-range). */
export function fontFaceCss(faces: readonly PageFace[]): string {
  return faces
    .map(
      (f) =>
        `@font-face {\n  font-family: ${JSON.stringify(f.family)};\n  src: url(${JSON.stringify(f.url)}) format("woff2");\n` +
        `  font-weight: ${f.weight};\n  font-style: ${f.style};\n  font-display: block;\n${f.unicodeRange ? `  unicode-range: ${f.unicodeRange};\n` : ''}}\n`,
    )
    .join('');
}

/**
 * Halaman ekspor: gaya dasar sama dengan halaman harness render (`html,body{margin:0;padding:0;background:transparent}`),
 * lalu font dan CSS aplikasi, lalu markup komponen di `#root`. `wrapper` (opsional) membungkus markup.
 */
export function exportPageHtml(opts: { css: string; fonts: string; body: string; wrapperStyle?: string | undefined }): string {
  const body = opts.wrapperStyle === undefined ? opts.body : `<div id="wrap" style="${opts.wrapperStyle}">${opts.body}</div>`;
  return (
    '<!doctype html><html><head><meta charset="utf-8"><title>export parity</title>' +
    '<style>html,body{margin:0;padding:0;background:transparent}</style>' +
    `<style>${opts.fonts}</style><style>${opts.css}</style></head><body><div id="root">${body}</div></body></html>`
  );
}

type Json = unknown;

/**
 * Salinan dokumen tanpa lapisan fill `mesh` (codegen melewatinya dengan warning `mesh-fill`): acuan render untuk
 * board ber-mesh dibandingkan dengan apa yang memang diekspor. Menelusuri semua kunci `fills` (node, override).
 */
export function withoutMeshFills<T>(doc: T): T {
  const walk = (v: Json): Json => {
    if (Array.isArray(v)) return v.map(walk);
    if (v === null || typeof v !== 'object') return v;
    const out: Record<string, Json> = {};
    for (const [k, x] of Object.entries(v)) {
      out[k] = k === 'fills' && Array.isArray(x) ? x.filter((f) => !(f && typeof f === 'object' && (f as { type?: unknown }).type === 'mesh')).map(walk) : walk(x);
    }
    return out;
  };
  return walk(doc) as T;
}

/** Id instance sintetis acuan ekspor master (tidak dipakai fixture). */
export const DEFAULT_INSTANCE_ID = 'CgParDf1';

/**
 * Acuan ekspor master: komponen hasil ekspor = master dengan props default, sedangkan master di canvas tampil
 * sebagai node tersimpan (bind `visible` dan nilai default lain tidak diterapkan pada master itu sendiri). Salinan
 * dokumen ini menyisipkan instance default master sebagai anak pertama parent master (posisi awal parent tetap
 * bilangan bulat; di sebelah node hug, lebar pecahan menggeser antialias), sehingga konteks
 * tata letaknya sama. Master tidak ditemukan → Error.
 */
export function withDefaultInstance<T>(doc: T, masterId: string): T {
  const next = structuredClone(doc) as { pages: { children: unknown[] }[] };
  const visit = (list: unknown[]): boolean => {
    const i = list.findIndex((n) => (n as { id?: unknown }).id === masterId);
    if (i >= 0) {
      const m = list[i] as { name: string };
      list.splice(0, 0, { type: 'instance', id: DEFAULT_INSTANCE_ID, name: `${m.name} / default`, componentId: masterId });
      return true;
    }
    return list.some((n) => Array.isArray((n as { children?: unknown }).children) && visit((n as { children: unknown[] }).children));
  };
  if (!next.pages.some((p) => visit(p.children))) throw new Error(`withDefaultInstance: master ${masterId} tidak ada`);
  return next as T;
}

/** Salinan dokumen dengan nilai token diganti (`value` dan, bila ada, `modes`). Token tak dikenal → Error. */
export function withTokenValues<T extends { tokens?: Record<string, { value: unknown; modes?: Record<string, unknown> }> }>(
  doc: T,
  values: Record<string, { value: unknown; modes?: Record<string, unknown> }>,
): T {
  const next = structuredClone(doc);
  for (const [name, v] of Object.entries(values)) {
    const t = next.tokens?.[name];
    if (!t) throw new Error(`withTokenValues: token ${name} tidak ada`);
    t.value = v.value;
    if (v.modes) t.modes = { ...t.modes, ...v.modes };
  }
  return next;
}

/**
 * Regresi sengaja pada keluaran (untuk membuktikan tes paritas sensitif): padding shorthand dibuang, yaitu baris
 * `padding: …;` di modul CSS dan kelas `p-[…]` di TSX Tailwind (diganti `p-[0px]`). Codegen selalu menulis padding
 * sebagai shorthand (`frameDecls`); longhand tidak disentuh. Mengembalikan berkas baru dan jumlah yang dibuang
 * (pemanggil memastikan > 0, jadi perubahan format padding membuat tes gagal, bukan lulus diam-diam).
 */
export function dropPadding(files: readonly ExportFile[]): { files: ExportFile[]; removed: number } {
  let removed = 0;
  const out = files.map((f) => {
    if (f.path.endsWith('.module.css')) {
      const contents = f.contents.replace(/^ {2}padding: [^;]+;\n/gm, () => (removed++, ''));
      return { ...f, contents };
    }
    if (f.path.endsWith('.tsx')) {
      const contents = f.contents.replace(/(?<=["` ])p-\[[^\]\s"`]+\](?=[ "`$])/g, () => (removed++, 'p-[0px]'));
      return { ...f, contents };
    }
    return f;
  });
  return { files: out, removed };
}
