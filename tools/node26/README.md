# Node 26 untuk Lakar (berdampingan, C9)

Lakar memakai Node 26 LTS + pnpm 12.21.0 yang terpasang di `/opt/node-26`.
Node sistem (`/usr/bin/node`, v22) tetap utuh karena dipakai aplikasi lain di VPS.

- Pasang/ulang: `bash tools/node26/install.sh` (idempoten; tarball resmi nodejs.org, sha256 dicek terhadap `SHASUMS256.txt`).
- Cek: `bash tools/node26/verify.sh` (exit 0 = Node 26 siap dan aplikasi lain tidak terdampak).
  Sebelum perubahan mesin berikutnya, simpan baseline C9 dengan `verify.sh --snapshot`
  (`~/.local/share/lakar/c9-baseline.txt`). Setelah itu, verify membandingkan kondisi mesin terhadap baseline itu.
- Selalu panggil lewat path absolut: `/opt/node-26/bin/node`, `/opt/node-26/bin/pnpm`.
  Wrapper `pnpm` mengawali PATH dengan `/opt/node-26/bin` **hanya untuk prosesnya sendiri**,
  sehingga `pnpm run`/`pnpm exec` memakai Node 26. PATH sistem, profil shell, dan npm global sistem (`/usr`) tidak diubah.
- Jangan pernah memakai `/usr/bin/npm` atau `npm i -g` sistem untuk Lakar.
- Uninstall: `rm -rf /opt/node-26`. Yang tersisa di luar direktori itu hanya cache: `~/.npm/_cacache` dan, setelah Lakar memakai pnpm, store/cache pnpm (`~/.local/share/pnpm`, `~/.cache/pnpm`). Hapus bila perlu.
