#!/usr/bin/env bash
# Pasang Node 26 LTS + pnpm untuk Lakar di /opt/node-26, berdampingan dengan Node sistem (C9).
# Idempoten. Tidak menyentuh /usr/bin/node, paket npm global sistem, PATH, atau profil shell.
set -euo pipefail

NODE_VERSION="v26.13.1"   # dipin; ganti di sini hanya ke rilis v26 lain
PNPM_VERSION="12.21.0"
PREFIX="/opt/node-26"
ARCH="linux-arm64"
DIST="https://nodejs.org/dist/${NODE_VERSION}"
TARBALL="node-${NODE_VERSION}-${ARCH}.tar.xz"

[[ "$(uname -m)" == "aarch64" ]] || { echo "Mesin bukan aarch64" >&2; exit 1; }
[[ "$NODE_VERSION" == v26.* ]] || { echo "C9: /opt/node-26 hanya untuk Node v26" >&2; exit 1; }

if [[ -x "$PREFIX/bin/node" && "$("$PREFIX/bin/node" -v)" == "$NODE_VERSION" ]]; then
  echo "Node $NODE_VERSION sudah ada di $PREFIX"
else
  work="$(mktemp -d)"; trap 'rm -rf "$work"' EXIT
  curl -fsSL -o "$work/$TARBALL" "$DIST/$TARBALL"
  curl -fsSL -o "$work/SHASUMS256.txt" "$DIST/SHASUMS256.txt"
  (cd "$work" && grep " ${TARBALL}\$" SHASUMS256.txt | sha256sum -c -)
  rm -rf "$PREFIX.new"; mkdir -p "$PREFIX.new"
  tar -xJf "$work/$TARBALL" -C "$PREFIX.new" --strip-components=1 --no-same-owner
  rm -rf "$PREFIX"; mv "$PREFIX.new" "$PREFIX"
fi

# Semua langkah npm memakai Node 26 dan prefix /opt/node-26 secara eksplisit
# (npm sistem ber-prefix /usr; jangan pernah dipakai di sini).
export PATH="$PREFIX/bin:/usr/bin:/bin"
PNPM_PKG="$PREFIX/lib/node_modules/pnpm"
if [[ "$("$PNPM_PKG/pnpm" -v 2>/dev/null || true)" != "$PNPM_VERSION" ]]; then
  rm -f "$PREFIX"/bin/{pnpm,pn,pnpx,pnx}   # wrapper lama akan membuat npm gagal (EEXIST)
  "$PREFIX/bin/node" "$PREFIX/bin/npm" install -g --prefix "$PREFIX" --no-fund --no-audit "pnpm@${PNPM_VERSION}"
fi

# pnpm 12 adalah binari native, tetapi menjalankan skrip paket dengan `node` dari PATH,
# yang di mesin ini adalah Node 22 sistem. Wrapper berikut mengawali PATH dengan
# /opt/node-26/bin hanya untuk proses pnpm itu sendiri (tidak mengubah PATH sistem).
for b in pnpm pn pnpx pnx; do
  rm -f "$PREFIX/bin/$b"
  printf '#!/bin/sh\nPATH="%s/bin:$PATH" exec %s/%s "$@"\n' "$PREFIX" "$PNPM_PKG" "$b" > "$PREFIX/bin/$b"
  chmod 755 "$PREFIX/bin/$b"
done

echo "node $("$PREFIX/bin/node" -v), pnpm $("$PREFIX/bin/pnpm" -v) di $PREFIX"
