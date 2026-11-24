// Store peer room `@lakar/sync` (spec-collab-cloud story 5): event `peers`/`presence` dari `activityHub`
// (satu stream `/viewer/events` per jendela — jangan buka EventSource baru) dikumpulkan per slug menjadi
// {joined, connected, peers, presence, self} untuk chip title bar dan kursor peer di Canvas.
import { useEffect, useSyncExternalStore } from 'react';
import { activityHub, type HubListener } from './activity';
import { api, type RoomPeer } from './api';

/** Prefiks slug room — sama dengan `ROOM_SLUG_PREFIX` di daemon (slug lokal boleh berawalan sama → `joined` penentunya). */
export const ROOM_PREFIX = 'room-';
/** Cek murah sebelum fetch `/peers`: slug bukan `room-*` pasti bukan room (404 dihemat). */
export const looksLikeRoom = (slug: string | undefined): slug is string => typeof slug === 'string' && slug.startsWith(ROOM_PREFIX);

/** Payload presence bebas yang disiarkan viewer (kursor + seleksi di koordinat dokumen). */
export type RoomPresencePayload = { cursor?: { x: number; y: number } | null; selection?: string[] };

/** Warna chip/kursor peer (siklus per urutan peer): kelas `<color>` sama dengan palet sesi agen. */
export const PEER_COLORS = ['emerald', 'pink', 'violet', 'codex', 'agent'] as const;
export type PeerColor = (typeof PEER_COLORS)[number];

/** Peer yang di-render (chip + kursor): `color` ditetapkan dari indeks dalam daftar (stabil per urutan). */
export type PeerView = RoomPeer & { color: PeerColor };

export type RoomPeerState = { joined: boolean; connected: boolean; peers: RoomPeer[]; presence: Record<string, unknown>; self?: string };

const EMPTY: RoomPeerState = { joined: false, connected: false, peers: [], presence: {} };

/** Snapshot per slug room (Map diganti saat event tiba supaya useSyncExternalStore melihat referensi baru). */
const states = new Map<string, RoomPeerState>();
const listeners = new Set<() => void>();
let unwire: (() => void) | undefined;

const notify = () => {
  for (const l of listeners) l();
};

const setState = (slug: string, next: RoomPeerState) => {
  states.set(slug, next);
  notify();
};

/** Seed state dari `GET /peers` (joined + self). Diam pada 404 (slug lokal berawalan sama). */
const seedPeers = (slug: string) =>
  api.listRoomPeers(slug).then(
    (r) => {
      // Bisa saja state diisi event `peers` selama fetch — yang lebih baru (hasil fetch) tetap menang karena `self` ikut.
      setState(slug, { joined: true, connected: r.connected, peers: r.peers, presence: {}, ...(r.self !== undefined ? { self: r.self } : {}) });
    },
    () => {
      // Room tidak lagi digabung (leave di jendela lain / daemon restart): buang state supaya chip hantu hilang.
      if (states.delete(slug)) notify();
    },
  );

/** Pelanggan hub untuk event `peers`/`presence`/`change` — hidup hanya selama ada pemakaian `useRoomPeers` (stream ikut siklus hub). */
const hubListener: HubListener = {
  onEvent: (e) => {
    if (e.type === 'change') {
      // Dokumen dihapus/room ditinggalkan (jendela ini atau lain): buang state — slug `room-*` lokal
      // tidak boleh mewarisi `joined:true` + daftar peer basi (chip hantu).
      const c = e.change;
      if (c.kind === 'delete' && c.slug !== undefined && states.delete(c.slug)) notify();
      return;
    }
    if (e.type === 'peers') {
      const { slug, connected, peers, self } = e.peers;
      const prev = states.get(slug) ?? EMPTY;
      // Presence peer yang keluar dibuang; presence terbaru di event `peers` menimpa yang tersimpan.
      const ids = new Set(peers.map((p) => p.peerId));
      const presence: Record<string, unknown> = {};
      for (const [id, p] of Object.entries(prev.presence)) if (ids.has(id)) presence[id] = p;
      for (const p of peers) if (p.presence !== undefined) presence[p.peerId] = p.presence;
      // `self` dari event selalu menang: peerId berubah tiap koneksi (welcome/reconnect) — jangan percaya yang basi.
      setState(slug, { joined: true, connected, peers, presence, ...(self !== undefined ? { self } : prev.self !== undefined ? { self: prev.self } : {}) });
    } else if (e.type === 'presence') {
      const { slug, peerId, presence } = e.presence;
      const prev = states.get(slug);
      if (!prev) return;
      setState(slug, { ...prev, presence: { ...prev.presence, [peerId]: presence } });
    }
  },
  // Event `peers` tidak masuk ring/di-replay — sesudah reconnect (daemon mungkin restart dan registry room
  // kosong) state per slug disegarkan ulang lewat `GET /peers`; room hilang → evict.
  onReconnect: () => {
    for (const slug of [...states.keys()]) void seedPeers(slug);
  },
};

/** State peer untuk slug room: seed dari `GET /peers` sekali (membawa `self`), lalu event `peers`/`presence` memutakhirkan. */
export function useRoomPeers(slug: string | undefined): RoomPeerState {
  const state = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      // Pelanggan pertama → pasang listener hub; dilepas saat pelanggan terakhir pergi (stream kembali ke siklus biasa).
      unwire ??= activityHub.listen(hubListener);
      return () => {
        listeners.delete(cb);
        if (listeners.size === 0) {
          unwire?.();
          unwire = undefined;
        }
      };
    },
    () => (slug ? (states.get(slug) ?? EMPTY) : EMPTY),
  );
  // Seed pertama kali slug `room-*` dibuka; 404 (dokumen lokal berawalan sama) dibiarkan `joined:false`.
  useEffect(() => {
    if (!looksLikeRoom(slug) || states.has(slug)) return;
    void seedPeers(slug);
  }, [slug]);
  return state;
}

/** Peer selain klien ini + warna siklus, untuk chip title bar dan kursor canvas. */
export function peerViews(state: RoomPeerState): PeerView[] {
  return state.peers
    .filter((p) => p.peerId !== state.self)
    .map((p, i) => ({ ...p, color: PEER_COLORS[i % PEER_COLORS.length]! }));
}

/** Reset store (untuk tes). */
export function resetRoomPeers(): void {
  states.clear();
}
