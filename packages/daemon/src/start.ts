import { ChromiumRenderer } from './chromium.js';
import type { DaemonConfig } from './config.js';
import { buildServer, type Daemon } from './server.js';

export type RunningDaemon = Daemon & { url: string; renderer: ChromiumRenderer; close(): Promise<void> };

/** Rakit + listen di 127.0.0.1 (AD-14). Port 0 = port acak (tes). */
export async function startDaemon(config: DaemonConfig): Promise<RunningDaemon> {
  let url = '';
  const renderer = new ChromiumRenderer({ browsersPath: config.browsersPath, pageUrl: () => `${url}/render/page`, timeoutMs: config.renderTimeoutMs });
  const daemon = buildServer({ config, render: renderer });
  await daemon.app.listen({ host: config.host, port: config.port });
  const addr = daemon.app.server.address();
  if (!addr || typeof addr === 'string') throw new Error('alamat listen tidak diketahui');
  url = `http://${config.host}:${addr.port}`;
  return {
    ...daemon,
    url,
    renderer,
    async close() {
      await renderer.close();
      await daemon.app.close();
    },
  };
}
