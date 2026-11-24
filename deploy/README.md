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

## Menghubungkan klien

- **Share link dari aplikasi**: di `lakard` pemilik, set `LAKAR_CLOUD_URL=https://api.<domain>`
  dan `LAKAR_CLOUD_KEY=<LAKAR_API_KEY>` → tombol Share di viewer bekerja.
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
