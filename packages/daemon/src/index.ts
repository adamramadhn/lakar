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
export { ASSET_UPLOAD_MAX, BOARD_PRESETS, SLUG_MAX, registerFileRoutes, slugify, withSuffix, type FileRoutesOptions } from './files.js';
export { FOLDER_ID_PATTERN, FOLDER_NAME_MAX, FOLDERS_FILE, FolderStore, folderName, memberOf, newFolderId, type Folder } from './folders.js';
export { exportFileName, registerExportRoutes, type ExportRoutesOptions } from './export.js';
export { FocusStore, registerFocusRoutes, type FocusRoutesOptions } from './focus.js';
export { VIEWER_DIST_DIR, registerViewerRoutes, type ViewerDocSummary, type ViewerHistoryEntry } from './viewer.js';
export {
  ACTIVITY_HEARTBEAT_MS,
  ACTIVITY_RING_MAX,
  ActivityBus,
  ORIGIN_HEADER,
  TOOL_ROUTES,
  registerActivityHooks,
  type ActivityCall,
  type ActivityEvent,
  type BusEvent,
  type ChangeEvent,
  type ChangeKind,
  type DocChange,
  type DocOpenRequest,
  type OpenTabEvent,
  type ActivitySession,
  type CallStatus,
  type CallSummary,
} from './events.js';
export { DEFAULT_MCP_ENTRY, registerConnectionRoutes, resolveMcpEntry, resolveMcpNode, type ConnectionsInfo, type McpServerConfig } from './connections.js';
export {
  registerHarnessRoutes,
  stripJsonComments,
  type HarnessDeps,
  type HarnessInfo,
  type HarnessResult,
  type HarnessResultState,
  type HarnessRevealResult,
  type HarnessRevertResult,
  type HarnessRoutesOptions,
  type HarnessState,
} from './harnesses.js';
export { startDaemon, type RunningDaemon, type StartOptions } from './start.js';
export { FileTransport, type FileTransportOptions } from './file-transport.js';
export { DocTransport, applySeeded, type CommitBuild, type CommitPayload, type DocCommitOutcome, type DocTransportBackend, type DocTransportOptions } from './doc-transport.js';
export { IconCatalog } from '@lakar/icons';
