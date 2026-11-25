export const PACKAGE = '@lakar/sync';
export { buildSync, newRoomToken, ApiFail, type Caller, type SyncOptions } from './app.js';
export { createPool, migrate, MIGRATIONS_DIR } from './db.js';
export {
  AuthTablesMissing,
  MemoryRoomRepo,
  PgRoomRepo,
  type AppendResult,
  type LoadedRoom,
  type NewRoom,
  type RoomMeta,
  type RoomOpMeta,
  type RoomOpRow,
  type RoomRepo,
  type SessionUser,
} from './repo.js';
export { RoomManager, touchedNodeIds, type PeerSocket, type RoomManagerOptions } from './rooms.js';
export { registerWsRoute, type WsRouteOptions } from './ws.js';
export {
  ClientMessage,
  ServerMessage,
  ClientOps,
  ClientPresence,
  ClientLock,
  ClientUnlock,
  ClientResync,
  PROTOCOL_HINT,
  CLOSE_BAD_TOKEN,
  CLOSE_ROOM_GONE,
  type PeerInfo,
  type PeerKind,
  type PeerAccess,
} from './protocol.js';
