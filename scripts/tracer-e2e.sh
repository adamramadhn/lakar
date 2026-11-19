#!/usr/bin/env bash
# Bukti end-to-end tracer (story 3): Claude Code → lakar-mcp (stdio) → lakard (HTTP) → QuickJS → core → Chromium → PNG.
# Bila service lakard (systemd --user) aktif di 127.0.0.1:7466, service itu yang dipakai (tidak menyalakan daemon
# kedua). Selain itu lakard dinyalakan di latar (Node 26, 127.0.0.1:7466) dan dimatikan di akhir.
# Menjalankan satu `claude -p` berbayar dengan --strict-mcp-config (konfigurasi MCP global tidak disentuh),
# lalu memeriksa hasilnya dengan tracer-check.mjs.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NODE=/opt/node-26/bin/node
PORT=7466
DATA_DIR="${LAKAR_DATA_DIR:-$HOME/.local/share/lakar}"
OUT="$(mktemp -d -t lakar-tracer-XXXXXX)"
SLUG="tracer-$(date +%s)"

[[ -f "$ROOT/packages/daemon/dist/main.js" && -f "$ROOT/packages/mcp/dist/main.js" ]] || {
  echo "tracer-e2e: build belum ada. Jalankan: /opt/node-26/bin/pnpm build" >&2; exit 1; }
LAKARD_PID=""
cleanup() {
  if [[ -n "$LAKARD_PID" ]] && kill -0 "$LAKARD_PID" 2>/dev/null; then
    kill -TERM "$LAKARD_PID" 2>/dev/null || true
    wait "$LAKARD_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

if systemctl --user is-active -q lakard 2>/dev/null && status="$(curl -fsS --max-time 3 "http://127.0.0.1:${PORT}/status" 2>/dev/null)"; then
  # Service lakard: data dir diambil dari /status (bukan LAKAR_DATA_DIR) agar pemeriksa membaca file yang benar.
  DATA_DIR="$("$NODE" -e 'const s=JSON.parse(process.argv[1]); process.stdout.write(s.data.dataDir)' "$status")"
  echo "tracer-e2e: memakai service lakard di 127.0.0.1:${PORT} (data: $DATA_DIR); output di $OUT, slug $SLUG"
else
  if ss -ltn | awk '{print $4}' | grep -qE "[:.]${PORT}\$"; then
    echo "tracer-e2e: port ${PORT} sudah dipakai proses selain service lakard. Hentikan dulu." >&2; exit 1
  fi
  echo "tracer-e2e: output di $OUT, slug $SLUG"
  LAKAR_PORT=$PORT LAKAR_DATA_DIR="$DATA_DIR" "$NODE" "$ROOT/packages/daemon/dist/main.js" >"$OUT/lakard.log" 2>&1 &
  LAKARD_PID=$!
  for _ in $(seq 1 50); do
    grep -q 'mendengarkan' "$OUT/lakard.log" 2>/dev/null && break
    kill -0 "$LAKARD_PID" 2>/dev/null || { echo "tracer-e2e: lakard mati saat start:" >&2; cat "$OUT/lakard.log" >&2; exit 1; }
    sleep 0.2
  done
  grep -q 'mendengarkan' "$OUT/lakard.log" || { echo "tracer-e2e: lakard tidak siap" >&2; cat "$OUT/lakard.log" >&2; exit 1; }
  cat "$OUT/lakard.log"
fi

CODE="const b=add(null,{type:'board',name:'Tracer',x:0,y:0,width:390,height:844,screen:'mobile'}); add(b,{type:'text',name:'Judul',content:'Halo dari Lakar',size:32})"
PROMPT="Kamu sedang menguji server MCP lakar. Lakukan TEPAT langkah berikut, berurutan, tanpa tool lain:
1. Panggil tool open_doc dengan slug \"${SLUG}\".
2. Panggil tool execute SATU kali dengan description \"board tracer halo lakar\" dan code persis seperti ini:
${CODE}
3. Panggil tool screenshot tanpa argumen.
Setelah itu jawab satu kata: selesai."

echo "tracer-e2e: menjalankan claude -p ..."
claude_rc=0
(cd "$OUT" && timeout 600 claude -p "$PROMPT" \
  --strict-mcp-config --mcp-config "$ROOT/.mcp.json" \
  --allowedTools mcp__lakar__open_doc mcp__lakar__execute mcp__lakar__screenshot \
  --output-format stream-json --verbose) >"$OUT/stream.jsonl" 2>"$OUT/claude.stderr" || claude_rc=$?
if [[ $claude_rc -ne 0 ]]; then
  echo "tracer-e2e: claude -p keluar dengan kode $claude_rc. stderr:" >&2
  cat "$OUT/claude.stderr" >&2
fi

"$NODE" "$ROOT/scripts/tracer-check.mjs" "$OUT/stream.jsonl" "$SLUG" "$DATA_DIR" "$OUT"
