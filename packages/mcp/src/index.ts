export const PACKAGE = '@lakar/mcp';
export {
  createLakarMcpServer,
  EXECUTE_DESCRIPTION,
  EXECUTE_FINDING_LINES,
  EXECUTE_LANDING_REMINDER_FROM,
  EXECUTE_REMINDER_FROM,
  EXPORT_CODE_DESCRIPTION,
  EXPORT_DESCRIPTION,
  formatExportCode,
  findingLines,
  formatExecute,
  formatLayoutCheck,
  formatStatus,
  GET_SELECTION_DESCRIPTION,
  IMPORT_URL_DESCRIPTION,
  INSPECT_DESCRIPTION,
  LAYOUT_CHECK_DESCRIPTION,
  LAYOUT_CHECK_FINDING_LINES,
  LIST_BOARDS_DESCRIPTION,
  LIST_DOCUMENTS_DESCRIPTION,
  OPEN_DOC_DESCRIPTION,
  PASTE_DESCRIPTION,
  PHOTO_SEARCH_DESCRIPTION,
  PHOTO_THUMBNAILS_MAX,
  READ_SKILL_DESCRIPTION,
  SERVER_INSTRUCTIONS,
  SERVER_NAME,
  SERVER_VERSION,
  STATUS_DESCRIPTION,
  type StatusData,
} from './server.js';
export { TOOL_EFFECTS, toolAnnotations, type ToolEffect, type ToolName } from './annotations.js';
export { FIX_CHECK_DESCRIPTION, FIX_CHECK_FINDING_LINES, formatFixCheck, type FixCheckData } from './fix-check.js';
export { CLIENT_NAME, DaemonClient, DaemonUnavailableError, START_HINT, VERSION_HINT, VersionMismatchError, type AgentInfo, type LakarTransport } from './client.js';
// FileClient sengaja TIDAK diekspor di sini: file-client.ts memuat @lakar/daemon (DocStore/core/exec), dan
// impor index di mode daemon tidak boleh menariknya. Dimuat malas lewat `await import('./file-client.js')`
// hanya di cabang `--file`/`LAKAR_FILE` pada main.ts; tes mengimpor './file-client.js' langsung.
