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
  # Unit lakard* (service Lakar, story 12) dikecualikan dari snapshot; dicek eksplisit di bawah.
  systemctl --user list-units --type=service --state=running --no-legend | awk '{print $1,$3,$4}' | grep -v '^lakard'
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
# Service lakard (story 12): aktif, hanya 127.0.0.1:7466 milik MainPID (atau turunannya), Node Lakar, Restart=on-failure.
check "service --user lakard" "$(systemctl --user is-active lakard 2>&1)" "active"
lakard_pid="$(systemctl --user show -p MainPID --value lakard 2>/dev/null || echo 0)"
lakard_tree(){ local p="$1"; echo "$p"; for k in $(cat /proc/"$p"/task/*/children 2>/dev/null); do lakard_tree "$k"; done; }
listeners="$(ss -ltnpH 'sport = :7466' 2>/dev/null)"
if [[ -z "$listeners" ]]; then bad "tidak ada listener :7466"
else
  addrs="$(awk '{print $4}' <<<"$listeners" | sort -u | tr '\n' ' ')"
  [[ "$addrs" == "127.0.0.1:7466 " ]] && ok "listener :7466 hanya 127.0.0.1" || bad "listener :7466: $addrs (harus hanya 127.0.0.1:7466)"
  owned="$( [[ "$lakard_pid" != 0 ]] && lakard_tree "$lakard_pid")"
  foreign=""
  for pid in $(grep -oE 'pid=[0-9]+' <<<"$listeners" | cut -d= -f2 | sort -u); do grep -qx "$pid" <<<"$owned" || foreign+="$pid "; done
  [[ -z "$foreign" ]] && ok "listener :7466 milik lakard (MainPID $lakard_pid)" || bad "listener :7466 milik proses lain: $foreign"
fi
lakard_exec="$(systemctl --user show -p ExecStart --value lakard 2>/dev/null)"
[[ "$lakard_exec" == *"/opt/node-26/bin/node "*"/packages/daemon/dist/main.js"* ]] && ok "lakard ExecStart memakai /opt/node-26/bin/node" || bad "lakard ExecStart: $lakard_exec"
check "lakard Restart" "$(systemctl --user show -p Restart --value lakard 2>/dev/null)" "on-failure"
[[ -x /opt/pen/squashfs-root/resources/app.asar.unpacked/out/mcp-server-linux-arm64 ]] && ok "binari MCP pencil ada" || bad "binari MCP pencil hilang"

if [[ -f "$BASELINE" ]]; then
  if d="$(diff "$BASELINE" <(snapshot))"; then ok "snapshot C9 identik dengan baseline $BASELINE"
  else bad "snapshot C9 berbeda dari baseline:"; echo "$d"; fi
else
  echo "SKIP baseline C9 belum ada (buat dengan --snapshot sebelum perubahan)"
fi
exit $fail
