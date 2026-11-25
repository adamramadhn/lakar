# Deploy Lakar Cloud

Artefak deployment untuk `spec-collab-cloud` story 6. Satu host cukup untuk v1
(api + sync + postgres di mesin yang sama; TLS lewat reverse proxy).

## Prasyarat

- Docker + docker compose di host tujuan
- DNS: `api.<domain>` → host (share page + API), `sync.<domain>` → host (WS rooms)
- Repo ini di-`git clone` ke host (Dockerfile butuh konteks root workspace)

## Langkah

```sh
cd deploy
cp env.example .env   # isi POSTGRES_PASSWORD, LAKAR_API_KEY, PUBLIC_BASE_URL
docker compose -f docker-compose.yml up -d --build
```

Lalu arahkan reverse proxy (contoh `Caddyfile` disertakan — TLS otomatis):

- `api.<domain>` → `127.0.0.1:8081` (REST + guest share page `/s/<token>`)
- `sync.<domain>` → `127.0.0.1:8082` (WS `/room/<token>`)

## Auth akun (opsional tapi direkomendasikan)

User desktop sign-in dengan akun (Google OAuth, GitHub OAuth, atau magic link
email — tanpa password). Tanpa konfigurasi apa pun, service tetap jalan dan
`LAKAR_API_KEY` tetap valid sebagai admin/fallback; provider yang tidak diisi
env-nya tidak diiklankan di `GET /api/auth/providers`.

- **Google** — buat OAuth client di Google Cloud Console; redirect URI:
  `https://api.<domain>/api/auth/oauth/google/callback` → isi `GOOGLE_CLIENT_ID/SECRET`.
- **GitHub** — buat OAuth App di GitHub Developer Settings; callback URL sama
  bentuknya (`/api/auth/oauth/github/callback`) → isi `GITHUB_CLIENT_ID/SECRET`.
- **Magic link** — `RESEND_API_KEY` + `EMAIL_FROM` (Resend). Tanpa Resend,
  link dicetak ke log container `api` (`DEV_MAGIC_LINK=1`; set `0` di produksi).
- `PUBLIC_BASE_URL` **wajib benar** — dipakai untuk redirect OAuth, magic link,
  dan tautan share; tidak pernah diturunkan dari header Host.

## Menghubungkan klien

- **Sign-in dari aplikasi**: di `lakard` pemilik, set `LAKAR_CLOUD_URL=https://api.<domain>`
  → Settings → Connections → Sign in (browser terbuka, kembali ke lakard
  otomatis). Setelah sign-in, Share/Join memakai session akun;
  `LAKAR_CLOUD_KEY=<LAKAR_API_KEY>` tetap bisa dipakai sebagai fallback admin.
- **MCP ke cloud**: `lakar --server wss://sync.<domain> --token <room-token>`
  (buat room dulu: `POST /api/rooms` dengan Bearer `LAKAR_API_KEY`, atau lewat
  `POST /viewer/rooms/join` di lakard yang tersambung).
- **Viewer multi-user**: `Join room` di dashboard lakard mana pun → semua
  yang punya token room yang sama berbagi dokumen live.

## Catatan

- `lakard` render-worker (profile `render-worker`) opsional — v1 merender di
  lakard pemilik dokumen, bukan di server.
- Redis tidak dipakai di v1 (presence/pubsub in-process; satu instance sync).
- Migrasi SQL jalan otomatis saat service start (idempoten).
