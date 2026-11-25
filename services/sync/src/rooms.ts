// Manager room in-process (spec-collab-cloud story 3): peta token → Room{doc tersimpan, rev, peers,
// locks}. Multiplayer dasar model Figma: server ordering menang (sequencer = baris Postgres lewat
// `SELECT ... FOR UPDATE` di repo.appendOp, diserialkan per room oleh DocumentLocks), bukan CRDT.
// Presence dan lock advisory sengaja ephemeral di proses ini (Redis adapter didefer — baru dibutuhkan
// saat multi-instance): TTL lock diperiksa malas saat ada lalu lintas, bukan timer.
import { randomBytes } from 'node:crypto';
import { DocumentLocks, applyOps, transact, type ApplyOpsResult, type CommitResult } from '@lakar/core';
import { LakarError, seededRandom, type LakarDocument } from '@lakar/schema';
import { CLOSE_ROOM_GONE, type ClientMessage, type PeerInfo, type PeerKind, type ServerMessage } from './protocol.js';
import type { RoomRepo } from './repo.js';

/** Saluran kirim ke satu peer (diisi ws.ts di atas socket ws). */
export interface PeerSocket {
  send(msg: ServerMessage): void;
  close(code: number, reason: string): void;
}

type Peer = {
  id: string;
  name: string;
  kind: PeerKind;
  access: 'edit' | 'view';
  socket: PeerSocket;
  room: Room;
  /** Presence terakhir yang di-broadcast (dikirim di welcome/peer_join berikut). */
  presence?: unknown;
  /** Stempel kirim presence terakhir + payload tertahan (trailing-edge throttle per peer). */
  lastPresenceAt: number;
  pendingPresence?: unknown;
  presenceTimer?: NodeJS.Timeout;
};

type RoomLock = { peerId: string; nodeIds: Set<string>; expiresAt: number };

type Room = {
  token: string;
  title: string;
  doc: LakarDocument;
  rev: number;
  peers: Map<string, Peer>;
  /** Lock advisory per peer (kunci = peerId); kadaluarsa diperiksa malas. */
  locks: Map<string, RoomLock>;
};

export type RoomManagerOptions = {
  /** TTL lock advisory (default 2000 ms — drag Figma bersifat sementara). */
  lockTtlMs?: number;
  /** Jarak minimum broadcast presence per peer (default 50 ms). */
  presenceThrottleMs?: number;
  /** Sumber waktu (tes bisa mengendalikan TTL/throttle). Default Date.now. */
  now?: () => number;
};

/** ID peer acak 8 char base64url (cukup unik per room; bukan capability). */
const newPeerId = (): string => randomBytes(6).toString('base64url');

/**
 * Node tersimpan yang disentuh satu batch ops mentah: nilai `id`/`parentId` (segmen pertama alamat
 * komposit = akar instance tersimpan). `@ref` merujuk node baru di batch yang sama — belum ada di
 * dokumen, jadi tidak mungkin ter-lock.
 */
export function touchedNodeIds(ops: readonly unknown[]): Set<string> {
  const out = new Set<string>();
  for (const raw of ops) {
    if (typeof raw !== 'object' || raw === null) continue;
    for (const key of ['id', 'parentId'] as const) {
      const v = (raw as Record<string, unknown>)[key];
      if (typeof v === 'string' && !v.startsWith('@')) out.add(v.split('/')[0]!);
    }
  }
  return out;
}

export class RoomManager {
  private readonly rooms = new Map<string, Room>();
  private readonly peerIndex = new Map<string, Peer>();
  /**
   * Token room yang baru diarsip/ditutup di proses ini: join yang sedang memuat saat archive
   * berjalan (TOCTOU — load bisa membaca sebelum archive commit) ditolak lewat cek ini.
   */
  private readonly archived = new Set<string>();
  /** Antrian commit per room (FIFO); di dalamnya Postgres tetap sequencer lewat FOR UPDATE. */
  private readonly docLocks = new DocumentLocks();
  private readonly lockTtlMs: number;
  private readonly presenceThrottleMs: number;
  private readonly now: () => number;

  constructor(
    private readonly repo: RoomRepo,
    opts: RoomManagerOptions = {},
  ) {
    this.lockTtlMs = opts.lockTtlMs ?? 2000;
    this.presenceThrottleMs = opts.presenceThrottleMs ?? 50;
    this.now = opts.now ?? Date.now;
  }

  /** Jumlah room live di proses ini (observability/tes). */
  get size(): number {
    return this.rooms.size;
  }

  private info(peer: Peer): PeerInfo {
    const lock = peer.room.locks.get(peer.id);
    return {
      peerId: peer.id,
      name: peer.name,
      kind: peer.kind,
      access: peer.access,
      ...(peer.presence !== undefined ? { presence: peer.presence } : {}),
      ...(lock && lock.nodeIds.size ? { locks: [...lock.nodeIds] } : {}),
    };
  }

  private static send(peer: Peer, msg: ServerMessage): void {
    peer.socket.send(msg);
  }

  /** Kirim ke semua peer room kecuali `except`. */
  private static broadcast(room: Room, msg: ServerMessage, except?: string): void {
    for (const p of room.peers.values()) if (p.id !== except) p.socket.send(msg);
  }

  /** Buang lock kadaluarsa; peer lain diberi tahu `unlocked` supaya highlight ikut bersih. */
  private pruneExpired(room: Room): void {
    const now = this.now();
    for (const [peerId, lock] of room.locks) {
      if (lock.expiresAt > now) continue;
      room.locks.delete(peerId);
      if (lock.nodeIds.size) RoomManager.broadcast(room, { type: 'unlocked', peerId, nodeIds: [...lock.nodeIds] });
    }
  }

  /**
   * Gabung room lewat capability token (edit atau view). `undefined` = token tak dikenal/archived
   * (pemanggil menutup socket 4001). Welcome dikirim di sini dulu, baru `peer_join` ke peer lain,
   * supaya pendatang selalu melihat state sebelum event dirinya.
   */
  async join(accessToken: string, name: string, kind: PeerKind, socket: PeerSocket): Promise<string | undefined> {
    const loaded = await this.repo.load(accessToken);
    if (!loaded) return undefined;
    // TOCTOU arsip: repo.load bisa membaca sebelum archive ter-commit; archived menangkap kasus itu.
    if (this.archived.has(loaded.token)) {
      socket.close(CLOSE_ROOM_GONE, 'room diarsip');
      return undefined;
    }
    let room = this.rooms.get(loaded.token);
    if (!room) {
      room = { token: loaded.token, title: loaded.title, doc: loaded.doc, rev: loaded.rev, peers: new Map(), locks: new Map() };
      this.rooms.set(room.token, room);
    }
    const peer: Peer = { id: newPeerId(), name, kind, access: loaded.access, socket, room, lastPresenceAt: 0 };
    room.peers.set(peer.id, peer);
    this.peerIndex.set(peer.id, peer);
    RoomManager.send(peer, { type: 'welcome', peerId: peer.id, rev: room.rev, doc: room.doc, peers: [...room.peers.values()].map((p) => this.info(p)) });
    RoomManager.broadcast(room, { type: 'peer_join', peer: this.info(peer) }, peer.id);
    return peer.id;
  }

  /** Satu pesan klien tervalidasi `ClientMessage` untuk `peerId`. */
  async message(peerId: string, msg: ClientMessage): Promise<void> {
    const peer = this.peerIndex.get(peerId);
    if (!peer) return;
    const room = peer.room;
    switch (msg.type) {
      case 'ops':
        await this.handleOps(room, peer, msg);
        break;
      case 'presence':
        this.handlePresence(room, peer, msg);
        break;
      case 'lock':
      case 'unlock':
        // Lock advisori hanya untuk editor: view-token tidak boleh menahan pekerjaan editor.
        if (peer.access === 'view') {
          RoomManager.send(peer, { type: 'opError', error: { code: 'FORBIDDEN', message: 'token view tidak bisa memegang lock', hint: 'join memakai token edit (field token saat room dibuat)' } });
          break;
        }
        if (msg.type === 'lock') this.handleLock(room, peer, msg.nodeIds);
        else this.handleUnlock(room, peer, msg.nodeIds);
        break;
      case 'resync':
        RoomManager.send(peer, { type: 'welcome', peerId: peer.id, rev: room.rev, doc: room.doc, peers: [...room.peers.values()].map((p) => this.info(p)) });
        break;
    }
  }

  /**
   * Commit ops: antre per room → cek hak edit/baseRev/lock → `transact`+`applyOps` di atas doc
   * tersimpan → `repo.appendOp` (sequencer FOR UPDATE) → ack ke pengirim + broadcast ops asli
   * beserta `seed`/`at` commit. Op gagal validasi/transaksi tidak mengubah state (`opError`);
   * baseRev basi → `rejected` + rev terkini supaya klien resync.
   *
   * Commit DETERMINISTIK (kontrak protocol.ts): `random` di-seed dari `lakar-sync:<token>:<rev+1>`
   * dan `now` dibekukan ke satu stempel — klien yang mereplay ops broadcast dengan parameter sama
   * menghasilkan doc byte-identik (ID mint sama), dan room_ops replayable.
   */
  private async handleOps(room: Room, peer: Peer, msg: { baseRev: number; ops: unknown[]; desc?: string }): Promise<void> {
    await this.docLocks.run(room.token, async () => {
      // Peer bisa sudah putus selama mengantre di docLocks: jangan commit ops yatim.
      if (!room.peers.has(peer.id)) return;
      if (peer.access === 'view') {
        RoomManager.send(peer, { type: 'opError', error: { code: 'FORBIDDEN', message: 'token view tidak bisa mengubah dokumen', hint: 'join memakai token edit (field token saat room dibuat)' } });
        return;
      }
      this.pruneExpired(room);
      if (msg.baseRev !== room.rev) {
        // Cache in-process bisa basi bila instance lain commit (multi-instance): muat ulang
        // sekali sebelum menjawab rejected — baseRev yang "maju" pun bisa jadi valid lagi.
        const fresh = await this.repo.load(room.token);
        if (fresh) {
          room.title = fresh.title;
          room.doc = fresh.doc;
          room.rev = fresh.rev;
        }
        if (msg.baseRev !== room.rev) {
          RoomManager.send(peer, { type: 'rejected', rev: room.rev });
          return;
        }
      }
      const touched = touchedNodeIds(msg.ops);
      const conflicts: { by: string; nodeIds: string[] }[] = [];
      for (const lock of room.locks.values()) {
        if (lock.peerId === peer.id) continue;
        const hit = [...lock.nodeIds].filter((id) => touched.has(id));
        if (hit.length) conflicts.push({ by: lock.peerId, nodeIds: hit });
      }
      if (conflicts.length) {
        RoomManager.send(peer, { type: 'locked', nodeIds: conflicts.flatMap((c) => c.nodeIds), by: conflicts[0]!.by });
        return;
      }
      // Seed + stempel commit: sama untuk semua penerima revisi ini (rev sudah pasti room.rev+1
      // karena docLocks men-serialize commit room ini).
      const seed = `lakar-sync:${room.token}:${room.rev + 1}`;
      const at = new Date();
      let committed: { value: ApplyOpsResult } & CommitResult;
      try {
        committed = await transact(
          room.doc,
          { sessionId: `sync-${peer.id}`, description: msg.desc ?? `Sync ${peer.name}`, random: seededRandom(seed), now: () => at },
          (tx) => applyOps(tx, msg.ops),
        );
      } catch (e) {
        if (e instanceof LakarError) {
          RoomManager.send(peer, { type: 'opError', error: { code: e.code, message: e.message, hint: e.hint } });
          return;
        }
        throw e;
      }
      const res = await this.repo.appendOp(room.token, msg.baseRev, committed.doc, msg.ops, { peerName: peer.name, seed, at });
      if (res.status === 'missing') {
        // Room diarsip di antara join dan commit: tutup semua peer.
        await this.closeRoom(room.token);
        return;
      }
      if (res.status === 'stale') {
        // Instance lain menang commit duluan: segarkan cache room, klien disuruh resync.
        const fresh = await this.repo.load(room.token);
        if (fresh) {
          room.doc = fresh.doc;
          room.rev = fresh.rev;
        }
        RoomManager.send(peer, { type: 'rejected', rev: room.rev });
        return;
      }
      room.doc = committed.doc;
      room.rev = res.rev;
      RoomManager.send(peer, { type: 'ack', rev: res.rev, refs: committed.value.refs, created: committed.created, seed, at: at.toISOString() });
      RoomManager.broadcast(room, { type: 'ops', rev: res.rev, ops: msg.ops, seed, at: at.toISOString(), from: { peerId: peer.id, name: peer.name, kind: peer.kind } }, peer.id);
    });
  }

  /** Presence ephemeral: throttle trailing-edge ≥presenceThrottleMs per peer, tidak disimpan di DB. */
  private handlePresence(room: Room, peer: Peer, msg: { cursor?: unknown; selection?: unknown } & Record<string, unknown>): void {
    const { type: _type, ...presence } = msg;
    peer.presence = presence;
    const elapsed = this.now() - peer.lastPresenceAt;
    if (elapsed >= this.presenceThrottleMs) {
      peer.lastPresenceAt = this.now();
      RoomManager.broadcast(room, { type: 'peer', peerId: peer.id, presence }, peer.id);
      return;
    }
    peer.pendingPresence = presence;
    if (peer.presenceTimer) return;
    peer.presenceTimer = setTimeout(() => {
      peer.presenceTimer = undefined;
      if (peer.pendingPresence === undefined || !room.peers.has(peer.id)) return;
      peer.lastPresenceAt = this.now();
      RoomManager.broadcast(room, { type: 'peer', peerId: peer.id, presence: peer.pendingPresence }, peer.id);
      peer.pendingPresence = undefined;
    }, this.presenceThrottleMs - elapsed);
    peer.presenceTimer.unref();
  }

  /**
   * Grant/replace lock advisory peer. Lock menjaga ID node tersimpan: alamat komposit `a/b`
   * dinormalkan ke akar `a` supaya cocok dengan touchedNodeIds. Re-lock mengganti seluruh set:
   * id yang terlepas ikut di-broadcast `unlocked` (penerima = semua peer, pengirim dapat echo
   * `locked` seperti pada `unlocked` — konsisten).
   */
  private handleLock(room: Room, peer: Peer, nodeIds: string[]): void {
    this.pruneExpired(room);
    const wanted = new Set(nodeIds.map((id) => id.split('/')[0]!));
    const dropped = [...(room.locks.get(peer.id)?.nodeIds ?? [])].filter((id) => !wanted.has(id));
    room.locks.set(peer.id, { peerId: peer.id, nodeIds: wanted, expiresAt: this.now() + this.lockTtlMs });
    RoomManager.broadcast(room, { type: 'locked', peerId: peer.id, nodeIds: [...wanted] });
    if (dropped.length) RoomManager.broadcast(room, { type: 'unlocked', peerId: peer.id, nodeIds: dropped });
  }

  private handleUnlock(room: Room, peer: Peer, nodeIds: string[] | undefined): void {
    const lock = room.locks.get(peer.id);
    if (!lock) return;
    // Samakan normalisasi dengan grant: klien boleh mengirim alamat komposit.
    const norm = nodeIds?.map((id) => id.split('/')[0]!);
    const released = norm ? [...lock.nodeIds].filter((id) => norm.includes(id)) : [...lock.nodeIds];
    for (const id of released) lock.nodeIds.delete(id);
    if (lock.nodeIds.size === 0) room.locks.delete(peer.id);
    else lock.expiresAt = this.now() + this.lockTtlMs;
    if (released.length) RoomManager.broadcast(room, { type: 'unlocked', peerId: peer.id, nodeIds: released });
  }

  /** Peer putus: lepas lock + presence-nya, broadcast peer_leave; room kosong dibuang dari cache. */
  leave(peerId: string): void {
    const peer = this.peerIndex.get(peerId);
    if (!peer) return;
    this.peerIndex.delete(peerId);
    const room = peer.room;
    if (!room.peers.delete(peerId)) return;
    if (peer.presenceTimer) clearTimeout(peer.presenceTimer);
    const lock = room.locks.get(peer.id);
    if (lock) {
      room.locks.delete(peer.id);
      if (lock.nodeIds.size) RoomManager.broadcast(room, { type: 'unlocked', peerId: peer.id, nodeIds: [...lock.nodeIds] });
    }
    RoomManager.broadcast(room, { type: 'peer_leave', peerId: peer.id });
    // Doc aman di repo; join berikutnya memuat ulang (rev selalu segar dari DB).
    if (room.peers.size === 0) this.rooms.delete(room.token);
  }

  /**
   * Token baru dibuat (POST /api/rooms): bersihkan tanda arsip basi. Token acak 24 byte membuat
   * reuse praktis mustahil — ini hanya pertahanan ekstra bila repo diisi token deterministik.
   */
  created(token: string): void {
    this.archived.delete(token);
  }

  /** Tutup semua koneksi satu room (arsip/DELETE): socket close 4000 + lock/presence dibuang. */
  async closeRoom(token: string): Promise<void> {
    // Tandai dulu sebelum menyentuh peta: join yang sedang menunggu repo.load harus menolak.
    this.archived.add(token);
    const room = this.rooms.get(token);
    if (!room) return;
    this.rooms.delete(token);
    for (const peer of [...room.peers.values()]) {
      this.peerIndex.delete(peer.id);
      room.peers.delete(peer.id);
      if (peer.presenceTimer) clearTimeout(peer.presenceTimer);
      peer.socket.close(CLOSE_ROOM_GONE, 'room diarsip');
    }
    room.locks.clear();
  }

  /** Tutup semua room (server berhenti). */
  async close(): Promise<void> {
    for (const token of [...this.rooms.keys()]) await this.closeRoom(token);
  }
}
