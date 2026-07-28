/**
 * Prisma error shapes worth branching on.
 *
 * Matching on the shape rather than the error class keeps this working
 * regardless of which client build threw — the generated client and the query
 * engine do not always hand back the same constructor.
 */

/** P2002: a unique constraint rejected the write. */
export function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as { code?: unknown }).code === 'P2002'
  )
}
