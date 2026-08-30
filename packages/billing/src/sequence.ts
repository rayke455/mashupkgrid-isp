import { Prisma } from "@mashupkgrid/database";

function isUniqueConstraintError(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

/**
 * Generates a human-readable sequential-looking number (customer number, invoice number,
 * receipt number) by counting existing rows and retrying on a unique-constraint collision.
 *
 * This is not a true atomic sequence — under concurrent writes for the same tenant, two
 * requests can compute the same candidate number; the DB's unique constraint is what actually
 * prevents a duplicate, and this loop just retries with the next candidate when that happens.
 * That is an accepted tradeoff for Phase 2 (correctness — no duplicate numbers — over strict
 * gap-free sequencing); a dedicated per-tenant counter table would give gap-free sequencing at
 * the cost of a hot row, and is a reasonable future upgrade if that's ever required.
 */
export async function withRetryOnNumberCollision<T>(
  computeCandidate: (attempt: number) => Promise<string>,
  createWithCandidate: (candidate: string) => Promise<T>,
  maxAttempts = 5
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const candidate = await computeCandidate(attempt);
    try {
      return await createWithCandidate(candidate);
    } catch (err) {
      if (!isUniqueConstraintError(err)) throw err;
      lastError = err;
    }
  }
  throw lastError;
}
