#!/usr/bin/env bash
# Pasang chromium-headless-shell untuk Lakar ke cache KHUSUS Lakar (C9 a).
# Tidak memakai --with-deps dan tidak memanggil apt. Idempoten.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PNPM=/opt/node-26/bin/pnpm
export PLAYWRIGHT_BROWSERS_PATH="${LAKAR_BROWSERS_PATH:-$HOME/.cache/lakar/ms-playwright}"
if [[ "$(realpath -m -- "$PLAYWRIGHT_BROWSERS_PATH")" == "$(realpath -m -- "$HOME/.cache/ms-playwright")" ]]; then
  echo "install-browser: menolak memakai ~/.cache/ms-playwright (milik aplikasi lain)." >&2; exit 2
fi
mkdir -p "$PLAYWRIGHT_BROWSERS_PATH"
echo "install-browser: PLAYWRIGHT_BROWSERS_PATH=$PLAYWRIGHT_BROWSERS_PATH"
cd "$ROOT"
"$PNPM" --filter @lakar/daemon exec playwright-core install chromium-headless-shell

echo "install-browser: mencoba launch..."
if "$PNPM" --filter @lakar/daemon exec node --input-type=module -e "
import { chromium } from 'playwright-core';
const b = await chromium.launch();
const p = await b.newPage();
await p.setContent('<p>ok</p>');
console.log('launch OK:', b.version());
await b.close();
"; then
  exit 0
fi

echo "install-browser: launch GAGAL. Pustaka sistem yang hilang (ldd):" >&2
for bin in "$PLAYWRIGHT_BROWSERS_PATH"/chromium_headless_shell-*/chrome-headless-shell-*/chrome-headless-shell; do
  [[ -x "$bin" ]] || continue
  ldd "$bin" 2>&1 | grep 'not found' >&2 || echo "  (ldd $bin tidak menemukan pustaka hilang)" >&2
done
echo "Paket apt TIDAK dipasang otomatis. Minta Adam memasang paket yang sesuai, lalu ulangi." >&2
exit 1
