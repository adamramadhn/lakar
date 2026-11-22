// Fixture alur seleksi (epic agen-di-canvas story 4): board landing "Kopi / Beranda" yang dipilih pengguna sebelum
// meminta varian responsif / cek konsistensi. Sengaja memuat ketidakkonsistenan kecil: kartu kedua `gap` 10 (tak
// seragam + di luar skala; satu-satunya temuan check fixture: warning LC-07 yang ikut tersalin ke varian), judul kartu ketiga berwarna literal `#0F766E` padahal judul kartu lain memakai token
// `colors.accent`, dan isi kartu ketiga `#475569` (hampir sama dengan `#475467`). Padding kartu memuat token
// (`spacing.card`) supaya pemangkasan padding contoh varian melewati elemen token.
// Dipakai packages/daemon/src/skills-examples.test.ts dan packages/mcp/src/selection-flow.test.ts.

/** Snippet execute pembuat fixture (dokumen kosong). Nilai terakhir = `{board, hero, fitur, cards}`. */
export const SELECTION_FIXTURE = `
setTokens({'colors.accent': {type:'color', value:'#0F766E'}, 'spacing.card': {type:'spacing', value:24}});
const b = add(null, {type:'board', name:'Kopi / Beranda', x:0, y:0, width:1440, height:900, screen:'landing', fills:[{type:'solid', color:'#FFFFFF'}]});
const hero = add(b, {type:'frame', name:'Seksi / Hero', layout:'column', gap:24, padding:[96,128,64,128], width:'fill'});
add(hero, {type:'text', name:'Judul', content:'Kopi sangrai minggu ini, diantar dalam 2 hari', size:64, lineHeight:72, weight:700, color:'#101828', width:880});
add(hero, {type:'text', name:'Deskripsi', content:'Biji dari 14 kebun di Gayo, Kintamani, dan Flores.', size:18, lineHeight:28, color:'#475467', width:720});
const cta = add(hero, {type:'frame', name:'Aksi', layout:'row', gap:12});
const b1 = add(cta, {type:'frame', name:'Button / Langganan', layout:'row', height:48, padding:[0,24], align:'center', radius:8, fills:[{type:'solid', color:{$token:'colors.accent'}}]});
add(b1, {type:'text', name:'Label', content:'Mulai langganan', size:14, lineHeight:20, weight:600, color:'#FFFFFF'});
const b2 = add(cta, {type:'frame', name:'Button / Menu', layout:'row', height:48, padding:[0,24], align:'center', radius:8, stroke:{color:'#D0D5DD', width:1, align:'inside'}});
add(b2, {type:'text', name:'Label', content:'Lihat menu', size:14, lineHeight:20, weight:600, color:'#101828'});
const fitur = add(b, {type:'frame', name:'Seksi / Fitur', layout:'row', gap:24, padding:[0,128,96,128], width:'fill'});
const accent = {$token:'colors.accent'};
const cards = [['Sangrai segar', 'Disangrai paling lama 3 hari sebelum dikirim.', 8, accent, '#475467'],
  ['Profil rasa', 'Pilih fruity, cokelat, atau seimbang tiap bulan.', 10, accent, '#475467'],
  ['Bebas jeda', 'Lewati pengiriman kapan saja dari aplikasi.', 8, '#0F766E', '#475569']].map(([t, d, gap, color, ink]) => {
  const k = add(fitur, {type:'frame', name:'Kartu / ' + t, layout:'column', gap, padding:[{$token:'spacing.card'}, 24], radius:12, width:'fill', stroke:{color:'#E4E7EC', width:1, align:'inside'}});
  add(k, {type:'text', name:'Judul', content:t, size:20, lineHeight:28, weight:600, color, width:'fill'});
  add(k, {type:'text', name:'Isi', content:d, size:16, lineHeight:24, color:ink, width:'fill'});
  return k;
});
({board: b, hero, fitur, cards});`;

/** Baris `const SEL = [...]` contoh skill `selection` (diganti dengan id seleksi nyata). */
export const SEL_LINE = /^const SEL = \[[^\]]*\];.*$/m;

/** Ganti baris `const SEL = [...]` di contoh skill dengan id seleksi `ids`. */
export function withSelection(code: string, ids: readonly string[]): string {
  if (!SEL_LINE.test(code)) throw new Error('contoh skill selection tanpa baris const SEL = [...]');
  return code.replace(SEL_LINE, `const SEL = ${JSON.stringify(ids)};`);
}

/** Penanda blok contoh baca-saja (tanpa op mutasi). */
export const READ_ONLY_MARK = '// baca saja';
