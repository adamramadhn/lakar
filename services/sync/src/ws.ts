// Route WebSocket /room/:token (spec-collab-cloud story 3): join lewat capability token di path,
// identitas peer lewat query `name` (maks 40) + `kind` (human|agent, default human). Satu frame = satu
// pesan JSON `ClientMessage`; pesan yang tiba sebelum join selesai diantrekan dulu (maks 100, lalu
// close 1013). Token salah/archived close 4001; pesan non-JSON/salah bentuk dijawab `opError`
// SCHEMA_INVALID (koneksi tetap hidup). Request logging route ini dimatikan di buildSync
// (LogController): token join ada di URL dan tidak boleh bocor ke log.
import type { FastifyInstance, FastifyRequest } from 'fastify';
import WebSocket, { type RawData } from 'ws';
import { CLOSE_BAD_TOKEN, ClientMessage, PROTOCOL_HINT, type ServerMessage } from './protocol.js';
import type { RoomManager } from './rooms.js';

export type WsRouteOptions = { rooms: RoomManager };

/** Ambang buffer keluar ws sebelum socket diputus paksa (konsumen lambat). */
const MAX_BUFFERED = 4 * 1024 * 1024;
/** Maks frame yang boleh mengantre sebelum join selesai (repo.load masih jalan). */
const MAX_PENDING = 100;

export function registerWsRoute(app: FastifyInstance, { rooms }: WsRouteOptions): void {
  app.get('/room/:token', { websocket: true }, (socket: WebSocket, req: FastifyRequest) => {
    const { token } = req.params as { token: string };
    const q = req.query as Record<string, unknown>;
    const name = typeof q.name === 'string' && q.name.trim() ? q.name.trim().slice(0, 40) : 'peer';
    const kind = q.kind === 'agent' ? 'agent' : 'human';

    const adapter = {
      send: (msg: ServerMessage) => {
        if (socket.readyState !== WebSocket.OPEN) return;
        // Konsumen lambat: buffer keluar menumpuk di memori — putus paksa daripada menahannya.
        if (socket.bufferedAmount > MAX_BUFFERED) {
          socket.terminate();
          return;
        }
        socket.send(JSON.stringify(msg));
      },
      close: (code: number, reason: string) => socket.close(code, reason),
    };

    let peerId: string | undefined;
    /** Socket sudah ditutup (bisa terjadi saat join masih menunggu repo.load). */
    let closed = false;
    /** Frame yang tiba sebelum join selesai (repo.load masih jalan). */
    const pending: RawData[] = [];

    const handle = (raw: RawData) => {
      let json: unknown;
      try {
        json = JSON.parse(String(raw));
      } catch {
        adapter.send({ type: 'opError', error: { code: 'SCHEMA_INVALID', message: 'pesan bukan JSON valid', hint: PROTOCOL_HINT } });
        return;
      }
      const parsed = ClientMessage.safeParse(json);
      if (!parsed.success) {
        const detail = parsed.error.issues.map((i) => `${i.path.join('.') || 'pesan'}: ${i.message}`).join('; ');
        adapter.send({ type: 'opError', error: { code: 'SCHEMA_INVALID', message: detail, hint: PROTOCOL_HINT } });
        return;
      }
      rooms.message(peerId!, parsed.data).catch((e) => {
        req.log.error(e);
        adapter.send({ type: 'opError', error: { code: 'EXEC_ERROR', message: 'kesalahan internal sync; coba lagi' } });
      });
    };

    socket.on('message', (raw: RawData) => {
      if (!peerId) {
        // Flood frame pra-join tidak boleh menumpuk tanpa batas selama repo.load.
        if (pending.length >= MAX_PENDING) {
          socket.close(1013, 'terlalu banyak pesan sebelum join selesai');
          return;
        }
        pending.push(raw);
        return;
      }
      handle(raw);
    });
    socket.on('close', () => {
      closed = true;
      if (peerId) rooms.leave(peerId);
    });
    // Socket error tanpa listener membunuh proses; close akan tetap memancar setelahnya.
    socket.on('error', () => {});

    rooms
      .join(token, name, kind, adapter)
      .then((id) => {
        if (!id) {
          // join bisa sudah menutup socket sendiri (TOCTOU arsip → 4000); jangan timpa kodenya.
          if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
            socket.close(CLOSE_BAD_TOKEN, 'room tidak ada atau token salah');
          }
          return;
        }
        peerId = id;
        if (closed) {
          // Socket putus saat repo.load: peer sudah telanjur terdaftar — lepas lagi supaya tidak
          // jadi ghost peer, dan jangan drain antrean (ops-nya tidak boleh ikut commit).
          rooms.leave(id);
          pending.length = 0;
          return;
        }
        for (const raw of pending) handle(raw);
        pending.length = 0;
      })
      .catch((e) => {
        req.log.error(e);
        socket.close(1011, 'join gagal');
      });
  });
}
