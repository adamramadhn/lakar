// Versi Lakar: satu sumber untuk daemon (`/status`, `/sessions`) dan mcp (`SERVER_VERSION`).
// Dinaikkan bersama tag rilis `v<LAKAR_VERSION>` (scripts/release.sh).
export const LAKAR_VERSION = '0.1.0';

/** Header HTTP pembawa sessionId (AD-17); nama header HTTP tidak peka huruf besar. */
export const SESSION_HEADER = 'x-lakar-session';
/** Port default lakard (AD-14: hanya 127.0.0.1). */
export const DEFAULT_LAKARD_PORT = 7466;
/** URL default lakard untuk klien (mcp, harness bench). */
export const DEFAULT_LAKARD_URL = `http://127.0.0.1:${DEFAULT_LAKARD_PORT}`;
/** Hint bila versi klien (mcp) dan lakard berbeda. */
export const VERSION_HINT =
  'bangun ulang lalu restart service: /opt/node-26/bin/pnpm -C /root/lakar build && systemctl --user restart lakard (atau bash /root/lakar/scripts/release.sh)';
