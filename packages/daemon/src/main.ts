#!/usr/bin/env node
// Entry `lakard`. Service: systemctl --user {start,restart,status} lakard (tools/lakard/install-service.sh).
// Manual: /opt/node-26/bin/node packages/daemon/dist/main.js
import { IconCatalog } from '@lakar/icons';
import { loadConfig } from './config.js';
import { FontRegistry } from './fonts.js';
import { startDaemon } from './start.js';

let config;
try {
  config = loadConfig();
} catch (e) {
  console.error(`lakard: ${(e as Error).message}`);
  process.exit(1);
}

try {
  const fonts = FontRegistry.load();
  if (fonts.missing.length) console.warn(`lakard: paket font tidak ditemukan: ${fonts.missing.join(', ')}`);
  // Katalog ikon dimuat saat start (bukan di permintaan pertama); paket hilang → gagal start yang jelas.
  const icons = IconCatalog.load();
  const daemon = await startDaemon(config, { fonts, icons });
  let closing = false;
  const shutdown = (signal: string) => {
    if (closing) return;
    closing = true;
    console.log(`lakard: ${signal}, berhenti...`);
    const force = setTimeout(() => process.exit(1), 5000);
    force.unref();
    daemon.close().then(
      () => process.exit(0),
      () => process.exit(1),
    );
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  // Baris kesiapan dicetak SETELAH handler sinyal terpasang: pengawas (tes, tracer-e2e) boleh
  // langsung mengirim SIGTERM begitu membaca baris ini tanpa membunuh proses lewat aksi default.
  console.log(`lakard: mendengarkan ${daemon.url} (data: ${config.dataDir})`);
  if (config.configPath) console.log(`lakard: config ${config.configPath}`);
  void daemon.warmed.then(() => {
    const st = daemon.renderer.status();
    if (st.ready === st.size) console.log(`lakard: pool render siap (${st.ready} halaman, chromium ${st.browserVersion ?? '?'})`);
    else console.warn(`lakard: pool render belum siap (${st.ready}/${st.size}): ${st.lastError ?? 'tidak diketahui'}`);
  });
} catch (e) {
  const err = e as NodeJS.ErrnoException;
  if (err.code === 'EADDRINUSE') {
    console.error(
      `lakard: port ${config.port} di ${config.host} sudah dipakai proses lain. ` +
        `Hentikan proses itu atau set LAKAR_PORT ke port lain (mis. LAKAR_PORT=7467). Daemon tidak mencoba port lain.`,
    );
  } else {
    console.error(`lakard: gagal start: ${err.message}`);
  }
  process.exit(1);
}
