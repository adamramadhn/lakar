// Pembentuk error AD-11 bersama untuk route daemon. Pesan dan hint ditentukan pemanggil (teks yang dilihat agen).
import { LakarError } from '@lakar/schema';

/** NOT_FOUND tanpa retry. */
export const notFound = (message: string, hint: string): LakarError => new LakarError('NOT_FOUND', message, { hint });
