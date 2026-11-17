// Guard: Lakar butuh Node >= 26. Gagal deterministik sebelum tsc/vitest dijalankan.
const REQUIRED_MAJOR = 26;
const major = Number(process.versions.node.split('.')[0]);
if (!(major >= REQUIRED_MAJOR)) {
  console.error(
    `Lakar membutuhkan Node >= ${REQUIRED_MAJOR}, tetapi yang berjalan Node ${process.versions.node} (${process.execPath}).\n` +
      'Jalankan lewat /opt/node-26/bin/pnpm (lihat tools/node26/README.md).',
  );
  process.exit(1);
}
