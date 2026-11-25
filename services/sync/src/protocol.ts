// Protokol WS sync server (spec-collab-cloud story 3, model "link = join token" mockup BXo7d).
// Pesan JSON satu objek per frame. Klien → server divalidasi `ClientMessage` (zod); server → klien
// adalah `ServerMessage` (tipe + skema zod longgar untuk dipakai ulang klien, mis. MCP story 4).
// `doc` selalu bentuk tersimpan (unresolved — instance belum diurai, token belum diresolve);
// `ops` adalah DocOp[] mentah persis dikirim pengirim.
//
// KONTRAK DETERMINISTIK — keputusan inti protokol ini. Op yang mint ID (add/duplicate/detach/
// detach implisit) di-commit server lewat transact dengan PRNG ber-seed dan `now` tetap; keduanya
// ikut di-broadcast sebagai `seed` + `at` pada pesan `ops` dan tersimpan di room_ops. Penerima
// WAJIB menerapkan ops broadcast lewat:
//   transact(docTersimpan, ops, { random: seededRandom(seed), now: () => new Date(at) })
// (`seededRandom` dari @lakar/schema). Menerapkan dengan IdAllocator default (crypto random)
// menghasilkan ID berbeda di tiap peer → dokumen divergen dan log room_ops tidak replayable.
import { z } from 'zod';
import { OPS_MAX } from '@lakar/schema';

/** Identitas satu peer di room (chip collab: orang = human, agen = agent). */
export type PeerKind = 'human' | 'agent';
export type PeerAccess = 'edit' | 'view';
/**
 * Info peer untuk presence/lock. `peerId` diberi server (tidak bisa dipalsukan); `name`/`kind`
 * advisori — diklaim klien saat join tanpa verifikasi. Jangan dipakai untuk keputusan keamanan.
 */
export type PeerInfo = {
  peerId: string;
  name: string;
  kind: PeerKind;
  access: PeerAccess;
  presence?: unknown;
  locks?: string[];
};

// ---------------------------------------------------------------------------
// Klien → server
// ---------------------------------------------------------------------------

const NodeIds = z.array(z.string().min(1)).min(1).max(500);

export const ClientOps = z
  .object({
    type: z.literal('ops'),
    /** Rev yang diyakini klien sebagai dasar ops (harus = rev server; selisih → `rejected`). */
    baseRev: z.number().int().nonnegative(),
    ops: z.array(z.unknown()).min(1).max(OPS_MAX),
    desc: z.string().min(1).max(200).optional(),
  })
  .strict();

export const ClientPresence = z
  .object({
    type: z.literal('presence'),
    cursor: z.object({ x: z.number().finite(), y: z.number().finite() }).strict().optional(),
    selection: z.array(z.string().min(1)).max(500).optional(),
    /** Kunci presence tambahan diteruskan apa adanya (klien boleh memperluas). */
  })
  .catchall(z.unknown());

/**
 * Lock advisory menjaga ID node tersimpan: alamat komposit `a/b` dinormalkan server ke akar `a`
 * (selaras touchedNodeIds). Keterbatasan terdokumentasi: remove ancestor dan detach-all implisit
 * tetap melewati lock — klien tidak boleh mengandalkan lock sebagai jaminan eksklusivitas penuh.
 */
export const ClientLock = z.object({ type: z.literal('lock'), nodeIds: NodeIds }).strict();
export const ClientUnlock = z.object({ type: z.literal('unlock'), nodeIds: NodeIds.optional() }).strict();
export const ClientResync = z.object({ type: z.literal('resync') }).strict();

export const ClientMessage = z.discriminatedUnion('type', [ClientOps, ClientPresence, ClientLock, ClientUnlock, ClientResync]);
export type ClientMessage = z.infer<typeof ClientMessage>;

export const PROTOCOL_HINT =
  'kirim satu objek JSON per pesan: {type:"ops",baseRev,ops,desc?} | {type:"presence",cursor?,selection?} | ' +
  '{type:"lock",nodeIds} | {type:"unlock",nodeIds?} | {type:"resync"}';

// ---------------------------------------------------------------------------
// Server → klien
// ---------------------------------------------------------------------------

const PeerInfoSchema = z
  .object({
    peerId: z.string(),
    name: z.string(),
    kind: z.enum(['human', 'agent']),
    access: z.enum(['edit', 'view']),
    presence: z.unknown().optional(),
    locks: z.array(z.string()).optional(),
  })
  .strict();

const ErrorBody = z.object({ code: z.string(), message: z.string(), hint: z.string().optional() }).strict();

export const ServerWelcome = z.object({ type: z.literal('welcome'), peerId: z.string(), rev: z.number().int(), doc: z.unknown(), peers: z.array(PeerInfoSchema) }).strict();
export const ServerPeerJoin = z.object({ type: z.literal('peer_join'), peer: PeerInfoSchema }).strict();
export const ServerPeerLeave = z.object({ type: z.literal('peer_leave'), peerId: z.string() }).strict();
export const ServerAck = z
  .object({
    type: z.literal('ack'),
    rev: z.number().int(),
    refs: z.record(z.string(), z.string()),
    created: z.array(z.unknown()),
    /**
     * Seed + stempel commit ops sendiri (sama dengan yang di-broadcast ke peer lain): pengirim tidak
     * menerima broadcast ops-nya, jadi keduanya ikut di `ack` supaya replay lokal memakai kontrak
     * deterministik yang sama (`transact(doc, ops, {random: seededRandom(seed), now: () => new Date(at)})`).
     */
    seed: z.string(),
    at: z.string(),
  })
  .strict();
export const ServerOps = z
  .object({
    type: z.literal('ops'),
    rev: z.number().int(),
    ops: z.array(z.unknown()),
    /** Seed PRNG commit (kontrak deterministik di atas): WAJIB dipakai saat replay ops ini. */
    seed: z.string(),
    /** Stempel commit ISO — dipakai sebagai `now` saat replay. */
    at: z.string(),
    /**
     * Pengirim ops. `peerId` adalah satu-satunya field yang tidak bisa dipalsukan klien (diberi
     * server saat join); `name`/`kind` advisori — klien mengklaimnya sendiri dan tidak diverifikasi
     * (kolom `room_ops.peer_name` juga advisori). Jangan dipakai untuk keputusan keamanan.
     */
    from: z.object({ peerId: z.string(), name: z.string(), kind: z.enum(['human', 'agent']) }).strict(),
  })
  .strict();
export const ServerRejected = z.object({ type: z.literal('rejected'), rev: z.number().int() }).strict();
export const ServerOpError = z.object({ type: z.literal('opError'), error: ErrorBody }).strict();
export const ServerPeer = z.object({ type: z.literal('peer'), peerId: z.string(), presence: z.unknown() }).strict();
/**
 * `locked` dua makna (sesuai matriks plan): `peerId`+`nodeIds` = peer itu memegang lock baru;
 * `nodeIds`+`by` = ops klien ini ditolak karena menyentuh node yang di-lock peer `by`.
 */
export const ServerLocked = z
  .object({ type: z.literal('locked'), peerId: z.string().optional(), by: z.string().optional(), nodeIds: z.array(z.string()) })
  .strict();
export const ServerUnlocked = z.object({ type: z.literal('unlocked'), peerId: z.string(), nodeIds: z.array(z.string()) }).strict();

export const ServerMessage = z.union([
  ServerWelcome,
  ServerPeerJoin,
  ServerPeerLeave,
  ServerAck,
  ServerOps,
  ServerRejected,
  ServerOpError,
  ServerPeer,
  ServerLocked,
  ServerUnlocked,
]);
export type ServerMessage = z.infer<typeof ServerMessage>;

/** Kode close WS: token tak dikenal/salah (bukan room archived). */
export const CLOSE_BAD_TOKEN = 4001;
/** Kode close WS: room diarsip (DELETE /api/rooms/:token) atau server berhenti. */
export const CLOSE_ROOM_GONE = 4000;
