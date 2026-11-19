#!/usr/bin/env bash
# Pasang lakard sebagai service systemd --user (idempoten).
#   - menulis ~/.config/systemd/user/lakard.service dari template tools/lakard/lakard.service;
#   - daemon-reload, enable --now lakard (restart bila unit berubah), lalu tunggu GET /status;
#   - menolak bila 127.0.0.1:7466 dipakai proses selain service lakard;
#   - TIDAK menyentuh unit lain dan TIDAK memanggil `loginctl enable-linger` (hanya melaporkan).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PORT=7466
UNIT=lakard.service
UNIT_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
UNIT_FILE="$UNIT_DIR/$UNIT"
TEMPLATE="$ROOT/tools/lakard/lakard.service"
NODE=/opt/node-26/bin/node

say(){ echo "install-service: $*"; }
die(){ echo "install-service: $*" >&2; exit 1; }

[[ -x "$NODE" ]] || die "$NODE tidak ada (lihat tools/node26/install.sh)"
[[ -f "$ROOT/packages/daemon/dist/main.js" ]] || die "build belum ada. Jalankan: /opt/node-26/bin/pnpm -C $ROOT build"
[[ -d "$HOME/.cache/lakar/ms-playwright" ]] || say "PERINGATAN: browser Lakar belum terpasang (bash $ROOT/scripts/install-browser.sh); status pool akan ready 0"

main_pid(){ systemctl --user show -p MainPID --value "$UNIT" 2>/dev/null || echo 0; }

# PID turunan (rekursif) dari $1, termasuk $1.
descendants(){
  local pid="$1"; echo "$pid"
  local kids; kids="$(cat /proc/"$pid"/task/*/children 2>/dev/null || true)"
  for k in $kids; do descendants "$k"; done
}

# Port dipakai proses lain? (ss -ltnp: pid=<n>)
listeners="$(ss -ltnpH "sport = :$PORT" 2>/dev/null || true)"
if [[ -n "$listeners" ]]; then
  mp="$(main_pid)"
  owned="$( [[ "$mp" != 0 ]] && descendants "$mp" || true )"
  while read -r pid; do
    [[ -z "$pid" ]] && continue
    grep -qx "$pid" <<<"$owned" || die "port $PORT dipakai proses non-lakard (pid $pid: $(tr '\0' ' ' </proc/"$pid"/cmdline 2>/dev/null)). Hentikan proses itu dulu; skrip tidak mengubah apa pun."
  done < <(grep -oE 'pid=[0-9]+' <<<"$listeners" | cut -d= -f2 | sort -u)
fi

mkdir -p "$UNIT_DIR"
tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT
sed "s|@ROOT@|$ROOT|g" "$TEMPLATE" >"$tmp"
changed=0
if [[ -f "$UNIT_FILE" ]] && cmp -s "$tmp" "$UNIT_FILE"; then
  say "unit tidak berubah: $UNIT_FILE"
else
  install -m 0644 "$tmp" "$UNIT_FILE"
  changed=1
  say "unit ditulis: $UNIT_FILE"
fi

systemctl --user daemon-reload
systemctl --user enable "$UNIT" >/dev/null 2>&1 || systemctl --user enable "$UNIT"
if systemctl --user is-active -q "$UNIT"; then
  if [[ $changed == 1 ]]; then say "unit berubah → restart"; systemctl --user restart "$UNIT"; else say "service sudah aktif"; fi
else
  systemctl --user start "$UNIT"
fi

say "menunggu GET http://127.0.0.1:$PORT/status ..."
ok=0
for _ in $(seq 1 100); do
  if out="$(curl -fsS --max-time 2 "http://127.0.0.1:$PORT/status" 2>/dev/null)" && grep -q '"ok":true' <<<"$out"; then
    if grep -qE '"ready":[1-9]' <<<"$out" || grep -q '"lastError"' <<<"$out"; then ok=1; break; fi
  fi
  sleep 0.2
done
[[ $ok == 1 ]] || { systemctl --user status "$UNIT" --no-pager >&2 || true; die "lakard tidak menjawab /status"; }
say "status: $out"
say "linger user $(id -un): $(loginctl show-user "$(id -un)" -p Linger --value 2>/dev/null || echo '?') (skrip tidak mengubahnya; tanpa linger service berhenti saat sesi login terakhir keluar)"
say "selesai: systemctl --user status lakard"
