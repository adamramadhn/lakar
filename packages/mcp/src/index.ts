export const PACKAGE = '@lakar/mcp';
export {
  createLakarMcpServer,
  EXECUTE_DESCRIPTION,
  EXECUTE_FINDING_LINES,
  findingLines,
  formatExecute,
  formatLayoutCheck,
  LAYOUT_CHECK_DESCRIPTION,
  LAYOUT_CHECK_FINDING_LINES,
  SERVER_NAME,
  SERVER_VERSION,
} from './server.js';
export { DaemonClient, DaemonUnavailableError, START_HINT } from './client.js';
