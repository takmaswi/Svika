/**
 * Three-digit access codes for tickets.
 *
 * Codes are unique among non-completed tickets — enforced by the partial
 * unique index `tickets_access_code_active_idx` (see migration 0001). The
 * pool of 1000 codes is more than enough for the demo.
 *
 * The collision strategy is: pick a random code, try to insert, retry on
 * unique-violation. The caller owns the insert. We just generate the
 * candidate.
 */

const CODE_POOL_SIZE = 1000;

export function randomAccessCode(): string {
  const n = Math.floor(Math.random() * CODE_POOL_SIZE);
  return n.toString().padStart(3, "0");
}

/**
 * Postgres unique-violation error code. Used by the booking flow to know
 * when to retry with a fresh access code.
 */
export const PG_UNIQUE_VIOLATION = "23505";
