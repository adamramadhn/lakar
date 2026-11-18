// POST JSON ke lakard untuk tes integrasi daemon (bukan bagian dist paket mana pun).
import { SESSION_HEADER } from '../../packages/schema/src/version.ts';

export type LakardBody = { ok: boolean; data?: any; error?: { code: string; message: string; hint: string; retryable: boolean; editId?: string } };

/** `POST <base><path>` dengan body JSON (`undefined` → `{}`) dan header sesi bila ada. */
export async function postJson(base: string, path: string, body: unknown, session?: string): Promise<{ status: number; body: LakardBody }> {
  const r = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(session ? { [SESSION_HEADER]: session } : {}) },
    body: JSON.stringify(body ?? {}),
  });
  return { status: r.status, body: (await r.json()) as LakardBody };
}
