// Teks juri buta, dibangun saat runtime dari DESIGN.md (Lampiran B, §Anti-pattern) dan golden-set.md (Kriteria target).
// Hanya modul juri yang memakai ini; modul agen (claude-runner, lakar/*, pendev/*) tidak mengimpor judge/* (C7).
import { join } from 'node:path';
import { REPO_ROOT, forbiddenPhrases, words } from '../protocol.js';

export const DESIGN_MD_PATH = join(REPO_ROOT, '_bmad-output/initiative-lakar/ux-lakar/DESIGN.md');

/** Kriteria yang dinilai juri (R3/R7 dicek mekanis, bukan oleh juri). */
export const JUDGE_CRITERIA = ['R1', 'R2', 'R4', 'R5', 'R6', 'R8'] as const;
export type JudgeCriterion = (typeof JUDGE_CRITERIA)[number];

/** Nama alat / produk yang tidak boleh sampai ke juri. */
const TOOL_WORDS: readonly RegExp[] = [/pen\.dev/gi, /\blakar\b/gi, /\bpencil\b/gi, /\bpen\b/gi];

/** Penjaga kebocoran: nama alat, path, nama file, atau URI di teks yang dikirim ke juri. */
export const JUDGE_LEAK_PATTERNS: readonly RegExp[] = [
  /lakar/i,
  /pen\.dev/i,
  /pencil/i,
  /\bpen\b/i,
  /file:\/\//i,
  /(^|[\s`'"(])\/(root|opt|tmp|home|usr|var)\//m,
  /\bbench\//i,
  /\.(png|pen|json|jsonl|md)\b/i,
  /\bbytes?\b/i,
];

export function judgeLeaks(text: string): string[] {
  return JUDGE_LEAK_PATTERNS.flatMap((re) => {
    const m = text.match(re);
    return m ? [`"${m[0].trim()}" (${re.source})`] : [];
  });
}

/** Buang nama alat (kata utuh) lalu rapikan spasi ganda. */
export function scrubToolNames(text: string): string {
  let out = text;
  for (const re of TOOL_WORDS) out = out.replace(re, '\u0000');
  // Rapikan hanya di sekitar kata yang dibuang (indentasi blok JSON tetap utuh).
  return out.replace(/ ?\u0000 ?/g, (m) => (m.length === 3 ? ' ' : '')).replace(/\u0000/g, '');
}

function linesOf(text: string): string[] {
  return text.split('\n');
}

/** Baris setelah heading `startsWith` sampai heading berlevel sama/lebih tinggi berikutnya. */
function section(text: string, startsWith: string): string[] {
  const lines = linesOf(text);
  const i = lines.findIndex((l) => l.startsWith(startsWith));
  if (i < 0) throw new Error(`teks juri: bagian "${startsWith}" tidak ditemukan`);
  const level = startsWith.match(/^#+/)![0].length;
  const out: string[] = [];
  for (let j = i + 1; j < lines.length; j++) {
    const h = lines[j]!.match(/^(#+) /);
    if (h && h[1]!.length <= level) break;
    out.push(lines[j]!);
  }
  return out;
}

export type RubricParts = {
  /** Paragraf aturan skor Rn = 2/1/0. */
  scoreRule: string;
  /** Header tabel + baris R1, R2, R4, R5, R6, R8. */
  table: string[];
  /** "Setiap pelanggaran hanya dihitung di satu R." */
  oneR: string;
  /** Checklist slop 1–12. */
  slop: string[];
  /** Butir frasa terlarang (per bahasa). */
  phrases: string[];
  /** Butir Prosedur juri tentang bukti. */
  evidence: string;
};

export function extractRubric(designMd: string): RubricParts {
  const crit = section(designMd, '### Kriteria perbandingan');
  const scoreRule = crit.find((l) => l.startsWith('Setiap kriteria golden set dipetakan'));
  if (!scoreRule) throw new Error('teks juri: paragraf aturan skor Rn tidak ditemukan');
  const tableStart = crit.findIndex((l) => l.startsWith('| # |'));
  if (tableStart < 0) throw new Error('teks juri: tabel kriteria tidak ditemukan');
  const rows = crit.filter((l) => /^\| R\d \|/.test(l));
  const table = [crit[tableStart]!, crit[tableStart + 1]!, ...JUDGE_CRITERIA.map((r) => {
    const row = rows.find((l) => l.startsWith(`| ${r} |`));
    if (!row) throw new Error(`teks juri: baris ${r} tidak ditemukan`);
    return row;
  })];
  const oneR = crit.find((l) => /^Setiap pelanggaran hanya dihitung di/.test(l));
  if (!oneR) throw new Error('teks juri: kalimat "Setiap pelanggaran hanya dihitung di satu R" tidak ditemukan');

  const anti = section(designMd, '### Anti-pattern desain generik');
  const slop = anti.filter((l) => /^\d+\. /.test(l));
  if (slop.length !== 12) throw new Error(`teks juri: checklist slop harus 12 butir, dapat ${slop.length}`);
  const fi = anti.findIndex((l) => l.startsWith('**Frasa terlarang**'));
  if (fi < 0) throw new Error('teks juri: frasa terlarang tidak ditemukan');
  const phrases = [anti[fi]!];
  for (let j = fi + 1; j < anti.length && anti[j]!.startsWith('- '); j++) phrases.push(anti[j]!);
  if (phrases.length < 2) throw new Error('teks juri: daftar frasa terlarang kosong');

  const proc = section(designMd, '### Prosedur juri');
  const evidence = proc.find((l) => /^- Setiap skor wajib disertai bukti/.test(l));
  if (!evidence) throw new Error('teks juri: butir Prosedur juri tentang bukti tidak ditemukan');
  return { scoreRule, table, oneR, slop, phrases, evidence: evidence.replace(/^- /, '') };
}

const DROP_TAGS = new Set(['G', 'T']);

/**
 * Butir "Kriteria target" prompt `id` tanpa butir/klausa `[G]`/`[T]`: butir yang diawali tag G/T dibuang utuh;
 * klausa bertag G/T di dalam butir dibuang dari tag sampai tag berikutnya atau akhir butir. Butir dinomori ulang.
 */
export function extractCriteria(goldenMd: string, id: string): string[] {
  const lines = section(goldenMd, `## ${id} `);
  const k = lines.findIndex((l) => l.trim() === '**Kriteria target:**');
  if (k < 0) throw new Error(`teks juri: Kriteria target ${id} tidak ditemukan`);
  const items: string[] = [];
  for (let j = k + 1; j < lines.length && !lines[j]!.startsWith('---'); j++) {
    const m = lines[j]!.match(/^\d+\.\s+(.*)$/);
    if (m) items.push(m[1]!);
  }
  if (!items.length) throw new Error(`teks juri: Kriteria target ${id} kosong`);
  const out: string[] = [];
  const tagOf = (s: string) => s.match(/^\[([A-Z])\d?\]/)?.[1];
  for (const item of items) {
    const lead = tagOf(item.trimStart());
    if (lead && DROP_TAGS.has(lead)) continue; // butir [G]/[T] dibuang utuh
    const kept = item.split(/(?=\[[A-Z]\d?\])/).filter((p) => {
      const tag = tagOf(p);
      return !(tag && DROP_TAGS.has(tag));
    });
    const text = kept.join('').trim();
    if (text) out.push(text);
  }
  return out.map((t, i) => `${i + 1}. ${t}`);
}

export type JudgeTextParts = {
  /** Teks lengkap untuk juri. */
  text: string;
  /** Bagian rubrik + kriteria saja (sumber penjaga C7; prompt dan checklist slop bersama produk tidak termasuk). */
  secret: string;
};

export const JUDGE_JSON_SHAPE = `{
  "X": {
    "R1": {"skor": 0|1|2, "bukti": "elemen + lokasi"},
    "R2": {"skor": 0|1|2, "bukti": "..."},
    "R4": {"skor": 0|1|2, "bukti": "..."},
    "R5": {"skor": 0|1|2, "bukti": "..."},
    "R6": {"skor": 0|1|2, "bukti": "..."},
    "R8": {"skor": 0|1|2, "bukti": "..."},
    "slop": {"jumlah": <bilangan bulat ≥ 0>, "butir": ["<nomor checklist>: <bukti elemen + lokasi>", ...]},
    "emoji": <jumlah emoji yang terlihat, bilangan bulat ≥ 0>,
    "fokus": "<titik fokus yang Anda tunjuk: elemen + lokasi>"
  },
  "Y": { ...bentuk yang sama... }
}`;

/** Teks juri untuk satu prompt. `promptText` = teks prompt tanpa pembungkus. */
export function buildJudgeText(designMd: string, goldenMd: string, promptId: string, promptText: string): JudgeTextParts {
  const r = extractRubric(designMd);
  const criteria = extractCriteria(goldenMd, promptId);
  const secretParts = [
    '## Aturan skor',
    '',
    r.scoreRule,
    '',
    ...r.table,
    '',
    r.oneR,
    '',
    '## Kriteria golden untuk prompt ini',
    '',
    ...criteria,
    '',
    '## Bukti',
    '',
    r.evidence,
  ];
  const text = [
    'Anda adalah juri desain antarmuka. Anda menilai dua desain, "Desain X" dan "Desain Y", yang dibuat dari prompt yang sama. Nilai hanya dari gambar yang dilampirkan; tidak ada informasi lain tentang cara desain dibuat.',
    '',
    '## Prompt',
    '',
    promptText,
    '',
    ...secretParts,
    '',
    '## Checklist slop (dipakai untuk R8)',
    '',
    ...r.slop,
    '',
    ...r.phrases,
    '',
    '## Gambar',
    '',
    'Setiap desain dikirim sebagai potongan vertikal berurutan berlabel "Desain X, bagian i dari n" (lebar penuh, skala asli), ditambah satu gambar "overview" seluruh desain yang diperkecil. Bila desain terdiri dari beberapa board, board-board itu ditumpuk vertikal menjadi satu strip. Area abu-abu polos (#808080) di luar board dan jarak antar-board adalah latar netral penilaian, bukan bagian desain.',
    '',
    '## Format jawaban',
    '',
    'Nilai kedua desain secara terpisah dengan rubrik di atas (skor 0, 1, atau 2 per kriteria; setiap skor wajib disertai bukti yang menunjuk elemen dan lokasinya di gambar). `slop.jumlah` = banyaknya pelanggaran checklist slop yang terlihat dan `slop.butir` berisi tepat satu entri per pelanggaran. `emoji` = jumlah emoji yang terlihat di desain. `fokus` = titik fokus yang Anda tunjuk untuk R2.',
    '',
    'Kembalikan HANYA satu objek JSON valid (tanpa teks lain, tanpa blok kode) dengan bentuk persis berikut, tanpa kunci tambahan:',
    '',
    JUDGE_JSON_SHAPE,
  ].join('\n');
  return { text: scrubToolNames(text), secret: scrubToolNames(secretParts.join('\n')) };
}

// ---------- penjaga C7 juri ----------

/**
 * Masalah C7 (murni): frasa (n-gram 6 + kalimat pendek) dari bagian rahasia teks juri (rubrik + kriteria)
 * yang muncul di salah satu `targets`.
 */
export function judgeC7Problems(secret: string, targets: readonly { name: string; text: string }[]): string[] {
  const phrases = forbiddenPhrases(secret.split('\n').filter((l) => l.trim()));
  if (!phrases.size) return ['(juri) bagian rahasia teks juri kosong'];
  const out: string[] = [];
  for (const t of targets) {
    const joined = ` ${words(t.text).join(' ')} `;
    for (const p of phrases) if (joined.includes(` ${p} `)) out.push(`${t.name}: frasa juri "${p}"`);
  }
  return out;
}
