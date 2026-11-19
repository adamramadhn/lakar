---
title: 'Lakar memakai Node 26 LTS berdampingan, Node sistem tetap 22'
type: chore
ticket: '1'
created: '2026-11-17'
status: built
baseline_revision: '48bce48cf8b60f9e9082aa2eb705050ead5c2d73'
route: oneshot
route_source: auto
risk: medium
review: quick
review_source: pinned
lenses_ran: [quick]
review_loop_iteration: 0
followup_review_recommended: true
context: []
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** Lakar butuh Node 26 LTS + pnpm 12.21.0 (architecture §Stack), sedangkan mesin memakai Node 22 di `/usr/bin/node` yang juga dipakai pen, n8n-mcp, hostinger-dns-mcp, t3code. Mengganti Node sistem melanggar C9.

**Approach:** Pasang tarball resmi Node v26.13.1 (LTS "Lithium", linux-arm64) di `/opt/node-26`, checksum dicek dengan SHASUMS256 dari nodejs.org. pnpm 12.21.0 dipasang dengan npm milik Node 26 dengan `--prefix /opt/node-26` eksplisit, karena npm sistem memakai prefix `/usr`. Langkahnya dibuat sebagai skrip idempoten di repo, dan ada skrip verifikasi C9.

</intent-contract>

## Tasks & Acceptance

- `tools/node26/install.sh`: unduh, cek sha256, ekstrak ke `/opt/node-26`, lalu pasang pnpm 12.21.0. Gerbang C9: skrip menolak berjalan kalau target prefix bukan `/opt/node-26`. `bin/pnpm` diganti wrapper sh yang memanggil `/opt/node-26/bin/node`, karena shebang `#!/usr/bin/env node` akan menjalankan pnpm dengan Node 22 sistem.
- `tools/node26/verify.sh`: mencetak dan mengecek versi node/pnpm di /opt, `/usr/bin/node` = v22.23.5, daftar `npm -g` sistem tidak berubah, `claude --version`, dan status service pen-*, t3code, n8n-mcp, hostinger-dns-mcp.
- `tools/node26/README.md`: cara pakai, prinsip path absolut, dan cara uninstall (`rm -rf /opt/node-26`).

Acceptance: verify ticket. `/opt/node-26/bin/node -v` = v26.x. `/opt/node-26/bin/pnpm -v` = 12.21.0. `/usr/bin/node -v` = v22.23.5. `claude --version`, pen, MCP pencil, n8n-mcp, dan t3code tetap berjalan. Snapshot sebelum/sesudah (npm -g sistem, PATH, profil shell) identik.

## Implementation Notes

Rute oneshot: sekitar 80 baris skrip shell, tanpa kode aplikasi.

- Versi: Node v26.13.1 (LTS "Lithium", rilis 2026-11-10), linux-arm64, sha256 cocok dengan SHASUMS256.txt.
- Temuan: pnpm 12.21.0 berupa binari native (SEA), bukan skrip JS. Binari ini menjalankan skrip paket dengan `node` dari PATH, yang di mesin ini adalah Node 22. Karena itu `/opt/node-26/bin/{pnpm,pn,pnpx,pnx}` dijadikan wrapper sh yang mengawali PATH dengan `/opt/node-26/bin` hanya untuk proses itu. Hasilnya, `pnpm run` memakai Node v26.13.1 (terverifikasi).
- Temuan: n8n-mcp dan hostinger-dns-mcp yang berjalan (pid 168896/168942, start 14 Nov) memakai Node milik hermes (`/root/.hermes/tools/node-26.12.1-linux-arm64`), bukan `/usr/bin/node`. Kondisi ini sudah ada sebelumnya. verify.sh mengecek bahwa keduanya hidup dan tidak memakai `/opt/node-26`.
- Tarball diekstrak dengan `--no-same-owner`; isi /opt/node-26 dimiliki root.
- Bukti C9: snapshot sebelum/sesudah identik. Isinya `/usr/bin/node -v`, PATH, `/usr/bin/npm ls -g`, md5 profil shell dan `/etc/environment`, `/usr/local/bin`, service sistem/user yang berjalan, dan `docker ps`.
- File: `tools/node26/install.sh`, `tools/node26/verify.sh`, `tools/node26/README.md`.

## Review Triage Log

### 2026-11-17 — Review pass
- verdicts: 8 findings — high 0, medium 2, low 6, false 0, maybe-false 0
- findings:
  - `[low]` `[patch]` verify.sh hanya cek pen-desktop/mcp-http/web — pen-vnc dan pen-novnc ditambahkan ke loop.
  - `[medium]` `[patch]` npm -g/PATH/profil tidak dibandingkan dengan baseline — verify.sh kini punya `--snapshot` (baseline di `~/.local/share/lakar/c9-baseline.txt`) dan diff otomatis; baseline diisi dari snapshot sebelum instal.
  - `[low]` `[patch]` grep pnpm di bawah pipefail bisa lolos palsu — output npm ditangkap dulu, pola `[ ─]pnpm@`.
  - `[medium]` `[patch]` n8n-mcp/hostinger-dns-mcp yang mati hanya SKIP — kini FAIL bila hidup di baseline.
  - `[low]` `[reject]` MCP pencil hanya dicek file — pen-mcp-http dicek sebagai service, dan `get_app_state` MCP pencil dijalankan manual dan merespons; probe MCP di skrip butuh klien MCP, kompleksitas tidak sepadan.
  - `[low]` `[patch]` reinstall pnpm kena EEXIST oleh wrapper — wrapper dihapus sebelum `npm install -g`.
  - `[low]` `[patch]` gerbang PREFIX mati dan NODE_VERSION bisa di-override — NODE_VERSION dipin, gerbang kini memastikan v26.*.
  - `[low]` `[patch]` README uninstall melupakan store pnpm — README menyebut `~/.local/share/pnpm` dan `~/.cache/pnpm`.

## Auto Run Result

- Ringkasan: Node v26.13.1 LTS (linux-arm64, sha256 dicek) + pnpm 12.21.0 terpasang di `/opt/node-26`; wrapper pnpm memastikan skrip `pnpm run` memakai Node 26 tanpa mengubah PATH sistem.
- File: `tools/node26/install.sh` (instal idempoten), `tools/node26/verify.sh` (cek story + baseline C9), `tools/node26/README.md` (cara pakai/uninstall).
- Review: 7 patch (2 medium, 5 low), 0 defer, 1 reject (alasan di atas).
- Follow-up review: true — risiko yang belum terverifikasi: diff snapshot C9 bisa gagal palsu bila service/container lain berubah secara sah (mis. container penpot dihentikan Adam), sehingga baseline perlu disegarkan dengan `--snapshot` sebelum perubahan mesin berikutnya (story 1.12).
- Verifikasi: `bash tools/node26/verify.sh` exit 0 (21 OK, termasuk snapshot identik dengan baseline); install ulang idempoten; `mcp__pencil__get_app_state` merespons.
- Risiko sisa: n8n-mcp/hostinger-dns-mcp dijalankan hermes dengan Node 26.12.1 miliknya sendiri (pra-ada); bukan dari perubahan ini.

## Verification

**Commands:**
- `bash tools/node26/verify.sh` -- expected: semua baris OK, exit 0
- `diff` snapshot sebelum/sesudah (`/usr/bin/npm ls -g --depth=0`, `md5sum` profil shell, `/etc/environment`) -- expected: tidak ada perbedaan
