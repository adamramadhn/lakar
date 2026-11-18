// Guard objek JSON polos bersama core dan exec. Tanpa IO.

/** Objek non-null yang bukan array (nilai JSON `{...}`). */
export const isPlainObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
