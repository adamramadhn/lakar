import { IconCatalog } from '@lakar/icons';
import type { IconCatalogPort } from '@lakar/ports';
import type { IconGlyph } from '@lakar/schema';
import type { Page } from 'playwright-core';
import { ChromiumRenderer } from './chromium.js';
import type { DaemonConfig } from './config.js';
import { FontRegistry } from './fonts.js';
import { PhotoService } from './photos/service.js';
import { buildServer, type Daemon } from './server.js';

export type RunningDaemon = Daemon & {
  url: string;
  renderer: ChromiumRenderer;
  /** Warm-up pool render (selesai/gagal; tidak pernah menolak). Listen tidak menunggu ini. */
  warmed: Promise<void>;
  close(): Promise<void>;
};

export type StartOptions = {
  fonts?: FontRegistry;
  icons?: IconCatalogPort<string, IconGlyph>;
  skillsDir?: string;
  /** Layanan foto stok (default: key dari `config.unsplashKeyFile`; tes menginjeksi jaringan palsu). */
  photos?: PhotoService;
  /** Hook tes pool render (crash/macet deterministik). */
  onLease?: (page: Page) => Promise<void> | void;
};

/** Rakit + listen di 127.0.0.1 (AD-14), lalu panaskan pool render di latar (AD-18). Port 0 = port acak (tes). */
export async function startDaemon(config: DaemonConfig, opts: StartOptions = {}): Promise<RunningDaemon> {
  let url = '';
  const fonts = opts.fonts ?? FontRegistry.load();
  const icons = opts.icons ?? IconCatalog.load();
  const renderer = new ChromiumRenderer({
    browsersPath: config.browsersPath,
    pageUrl: () => `${url}/render/page`,
    timeoutMs: config.renderTimeoutMs,
    pages: config.renderPages,
    fonts,
    icons,
    ...(opts.onLease ? { onLease: opts.onLease } : {}),
  });
  const photos = opts.photos ?? new PhotoService({ dataDir: config.dataDir, keyFile: config.pexelsKeyFile, unsplashKeyFile: config.unsplashKeyFile, unsplashAppName: config.unsplashAppName });
  const daemon = buildServer({ config, render: renderer, fonts, icons, photos, ...(opts.skillsDir ? { skillsDir: opts.skillsDir } : {}) });
  await daemon.app.listen({ host: config.host, port: config.port });
  const addr = daemon.app.server.address();
  if (!addr || typeof addr === 'string') throw new Error('alamat listen tidak diketahui');
  url = `http://${config.host}:${addr.port}`;
  // Warm-up tidak memblokir listen; gagal → status pool lastError, permintaan → RENDER_FAILED retryable.
  const warmed = renderer.warm();
  return {
    ...daemon,
    url,
    renderer,
    warmed,
    async close() {
      await renderer.close();
      await daemon.app.close();
    },
  };
}
