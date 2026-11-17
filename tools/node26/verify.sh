#!/usr/bin/env bash
# Verifikasi story 1.1 + C9: Node 26 untuk Lakar ada, aplikasi lain di VPS tidak terdampak.
#   verify.sh                    cek, lalu bandingkan dengan baseline C9 bila ada
#   verify.sh --snapshot         tulis baseline C9 baru (jalankan SEBELUM perubahan mesin)
set -uo pipefail
BASELINE="${HOME}/.local/share/lakar/c9-baseline.txt"

snapshot(){
  echo "node=$(/usr/bin/node -v)"
  echo "PATH=$PATH"
  /usr/bin/npm ls -g --depth=0 2>&1
  md5sum /etc/environment /etc/profile /etc/profile.d/* /etc/bash.bashrc ~/.bashrc ~/.profile ~/.bash_profile ~/.zshrc 2>/dev/null
  ls -la /usr/bin/node /usr/local/bin 2>&1
  systemctl list-units --type=service --state=running --no-legend | awk '{print $1,$3,$4}'
  systemctl --user list-units --type=service --state=running --no-legend | awk '{print $1,$3,$4}'
  docker ps --format '{{.Names}} {{.Status}}' 2>/dev/null | sed 's/Up .*/Up/'
  for name in n8n-mcp hostinger-dns-mcp; do pgrep -f "node .*${name}" >/dev/null && echo "proc $name hidup"; done
}

if [[ "${1:-}" == "--snapshot" ]]; then
  mkdir -p "$(dirname "$BASELINE")"; snapshot > "$BASELINE"; echo "baseline C9 ditulis: $BASELINE"; exit 0
fi

fail=0
ok(){ echo "OK   $*"; }
bad(){ echo "FAIL $*"; fail=1; }
check(){ local label="$1" got="$2" want="$3"; [[ "$got" == $want ]] && ok "$label: $got" || bad "$label: '$got' (harus $want)"; }

check "/opt/node-26/bin/node -v" "$(/opt/node-26/bin/node -v 2>&1)" "v26.*"
check "/opt/node-26/bin/pnpm -v" "$(/opt/node-26/bin/pnpm -v 2>&1)" "12.21.0"
tmp="$(mktemp -d)"; printf '{"name":"t","private":true,"scripts":{"v":"node -v"}}' > "$tmp/package.json"
check "node di skrip pnpm run" "$(cd "$tmp" && /opt/node-26/bin/pnpm -s run v 2>&1 | tail -1)" "v26.*"; rm -rf "$tmp"
check "/usr/bin/node -v" "$(/usr/bin/node -v 2>&1)" "v22.23.5"
check "node di PATH" "$(command -v node)" "/usr/bin/node"
check "npm global sistem" "$(/usr/bin/npm config get prefix 2>&1)" "/usr"
npm_g="$(/usr/bin/npm ls -g --depth=0 2>/dev/null || true)"
grep -qE '[ ─]pnpm@' <<<"$npm_g" && bad "pnpm muncul di npm global sistem" || ok "pnpm tidak ada di npm global sistem"
check "claude --version" "$(claude --version 2>&1 | head -1)" "*Claude Code*"
pen --help 2>&1 | grep -q 'pen.dev CLI' && ok "pen CLI berjalan" || bad "pen CLI tidak merespons"
for u in pen-desktop pen-mcp-http pen-web pen-vnc pen-novnc; do check "service $u" "$(systemctl is-active $u)" "active"; done
check "service --user t3code" "$(systemctl --user is-active t3code)" "active"
# Proses MCP lain harus tetap hidup dan tidak memakai Node milik Lakar.
# (Per 2026-11-17 keduanya dijalankan hermes dengan Node miliknya sendiri, bukan /usr/bin/node.)
for name in n8n-mcp hostinger-dns-mcp; do
  pid="$(pgrep -f "node .*${name}" | head -1)"
  if [[ -z "$pid" ]]; then
    grep -qx "proc $name hidup" "$BASELINE" 2>/dev/null && bad "$name mati (hidup di baseline)" || echo "SKIP $name: tidak berjalan, juga tidak di baseline"
    continue
  fi
  exe="$(readlink /proc/$pid/exe)"
  [[ "$exe" != /opt/node-26/* ]] && ok "$name (pid $pid) hidup, runtime $exe" || bad "$name memakai Node Lakar: $exe"
done
[[ -x /opt/pen/squashfs-root/resources/app.asar.unpacked/out/mcp-server-linux-arm64 ]] && ok "binari MCP pencil ada" || bad "binari MCP pencil hilang"

if [[ -f "$BASELINE" ]]; then
  if d="$(diff "$BASELINE" <(snapshot))"; then ok "snapshot C9 identik dengan baseline $BASELINE"
  else bad "snapshot C9 berbeda dari baseline:"; echo "$d"; fi
else
  echo "SKIP baseline C9 belum ada (buat dengan --snapshot sebelum perubahan)"
fi
exit $fail
