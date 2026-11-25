// PRNG deterministik berbasis seed string (kontrak replay protokol @lakar/sync). FNV-1a 32-bit
// atas code unit UTF-16 seed menjadi state awal mulberry32. Murni — tanpa crypto maupun IO —
// karena schema dipakai viewer, yang tidak boleh bergantung pada @lakar/core.
//
// Kontrak: seed yang sama menghasilkan urutan number [0,1) yang sama di semua mesin. Server sync
// men-transact ops satu kali dengan PRNG ini; penerima broadcast WAJIB mereplay ops memakai seed
// yang ikut dikirim (ServerOps.seed) supaya ID yang di-mint IdAllocator identik di semua peer.
// Bukan untuk kriptografi — kualitas mulberry32 cukup untuk pemilihan ID node.
export function seededRandom(seed: string): () => number {
  // FNV-1a 32-bit: offset basis, lalu xor+multiply per code unit.
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  let state = h | 0;
  return () => {
    // mulberry32
    state = (state + 0x6d2b79f5) | 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 0x1_0000_0000;
  };
}
