export const PACKAGE = '@lakar/daemon';
export {
  loadConfig,
  parseFlatToml,
  defaultConfigPath,
  defaultPexelsKeyFile,
  HOST,
  DEFAULT_PORT,
  RENDER_PAGES_DEFAULT,
  RENDER_PAGES_MAX,
  RENDER_PAGES_MIN,
  BROWSER_CHANNELS,
  type BrowserChannel,
  type DaemonConfig,
} from './config.js';
export { buildServer, STATUS_SESSIONS_MAX, type Daemon, type BuildOptions } from './server.js';
export { RenderPool, BrowserLaunchError, type Lease, type PoolOptions } from './pool.js';
export { INSPECT_MAX_BYTES, inspectFit, locateNode } from './inspect.js';
export {
  ChromiumRenderer,
  RENDER_MODULE_PATH,
  RENDER_DIST_DIR,
  DAEMON_BROWSER_ARGS,
  BROWSER_NOT_FOUND,
  LINUX_SYSTEM_CHROMIUM,
  browserCandidates,
  launchSystemBrowser,
  type BrowserCandidate,
} from './chromium.js';
export { FontRegistry, FONT_PACKAGES, type FontFamilyEntry } from './fonts.js';
export { rasterType, readAsset, writeAsset, readAssetMeta, imageSize, type AssetMeta } from './assets.js';
export { PhotoService, type PhotoServiceOptions, type PhotoStatus, type SearchResponse } from './photos/service.js';
export { SafeNet, NetError, isBlockedIp, DEFAULT_ALLOWLIST, type HostAllowlist, type SafeNetOptions } from './photos/net.js';
export { DocStore } from './store.js';
export { VIEWER_DIST_DIR, registerViewerRoutes, type ViewerDocSummary, type ViewerHistoryEntry } from './viewer.js';
export {
  ACTIVITY_HEARTBEAT_MS,
  ACTIVITY_RING_MAX,
  ActivityBus,
  TOOL_ROUTES,
  registerActivityHooks,
  type ActivityCall,
  type ActivityEvent,
  type ActivitySession,
  type CallStatus,
  type CallSummary,
} from './events.js';
export { DEFAULT_MCP_ENTRY, registerConnectionRoutes, resolveMcpEntry, type ConnectionsInfo, type McpServerConfig } from './connections.js';
export { startDaemon, type RunningDaemon, type StartOptions } from './start.js';
export { IconCatalog } from '@lakar/icons';
