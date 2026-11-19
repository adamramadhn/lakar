#!/usr/bin/env bash
# Rilis Lakar lokal: tree bersih → tag v<LAKAR_VERSION> → build → install-browser → restart service lakard
# → tunggu /status melaporkan versi itu.
#   scripts/release.sh            jalankan
#   scripts/release.sh --dry-run  hanya cetak langkah + hasil cek, tanpa efek (tree kotor dilaporkan, bukan gagal)
# Tidak push dan tidak menyentuh unit selain lakard.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PNPM=/opt/node-26/bin/pnpm
PORT=7466
DRY=0
case "${1:-}" in
  --dry-run) DRY=1 ;;
  "") ;;
  *) echo "pemakaian: scripts/release.sh [--dry-run]" >&2; exit 2 ;;
esac

say(){ echo "release: $*"; }
die(){ echo "release: GAGAL: $*" >&2; exit 1; }
step(){ # step <n> <label> <perintah...>
  local n="$1" label="$2"; shift 2
  if [[ $DRY == 1 ]]; then say "[$n] $label (dry-run: $*)"; else say "[$n] $label"; "$@"; fi
}

cd "$ROOT"
VERSION="$(sed -nE "s/^export const LAKAR_VERSION = '([^']+)';.*/\1/p" packages/schema/src/version.ts)"
[[ -n "$VERSION" ]] || die "LAKAR_VERSION tidak ditemukan di packages/schema/src/version.ts"
TAG="v$VERSION"
HEAD="$(git rev-parse HEAD)"
say "versi $VERSION (tag $TAG), HEAD ${HEAD:0:12}$([[ $DRY == 1 ]] && echo ', DRY-RUN: tanpa efek')"

# Cek 1: tree bersih.
dirty="$(git status --porcelain)"
if [[ -n "$dirty" ]]; then
  n="$(wc -l <<<"$dirty")"
  if [[ $DRY == 1 ]]; then say "cek tree: KOTOR ($n path) — rilis nyata akan ditolak"; else die "tree kotor ($n path); commit atau stash dulu"; fi
else
  say "cek tree: bersih"
fi

# Cek 2: tag.
tag_commit="$(git rev-parse -q --verify "refs/tags/$TAG^{commit}" 2>/dev/null || true)"
make_tag=1
if [[ -n "$tag_commit" && "$tag_commit" != "$HEAD" ]]; then
  if [[ $DRY == 1 ]]; then say "cek tag: $TAG sudah ada di commit lain (${tag_commit:0:12}) — rilis nyata akan ditolak; naikkan LAKAR_VERSION"
  else die "tag $TAG sudah ada di commit lain (${tag_commit:0:12}); naikkan LAKAR_VERSION"; fi
  make_tag=0
elif [[ -n "$tag_commit" ]]; then
  say "cek tag: $TAG sudah menunjuk HEAD (tidak dibuat ulang)"; make_tag=0
else
  say "cek tag: $TAG belum ada"
fi

# Cek 3: service.
if systemctl --user cat lakard >/dev/null 2>&1; then
  say "cek service: lakard terpasang, $(systemctl --user is-active lakard 2>/dev/null || true)"
elif [[ $DRY == 1 ]]; then
  say "cek service: lakard BELUM terpasang — rilis nyata akan ditolak (bash tools/lakard/install-service.sh)"
else
  die "service lakard belum terpasang (bash tools/lakard/install-service.sh)"
fi

if [[ $make_tag == 1 ]]; then step 1 "tag $TAG" git tag -a "$TAG" -m "Lakar $VERSION"; else say "[1] tag $TAG (dilewati)"; fi
step 2 "build" "$PNPM" build
step 3 "install-browser" bash "$ROOT/scripts/install-browser.sh"
step 4 "restart service" systemctl --user restart lakard

if [[ $DRY == 1 ]]; then
  say "[5] tunggu http://127.0.0.1:$PORT/status melaporkan version $VERSION (dry-run)"
  say "dry-run selesai: tidak ada tag, build, atau restart yang dijalankan"
  exit 0
fi
say "[5] tunggu /status version $VERSION"
for _ in $(seq 1 150); do
  if out="$(curl -fsS --max-time 2 "http://127.0.0.1:$PORT/status" 2>/dev/null)" && grep -q "\"version\":\"$VERSION\"" <<<"$out"; then
    say "lakard $VERSION aktif: $out"; exit 0
  fi
  sleep 0.2
done
die "/status tidak melaporkan version $VERSION dalam 30 dtk (systemctl --user status lakard)"
