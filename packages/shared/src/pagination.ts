import { z } from "zod";
import { ValidationError } from "./errors.js";

export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export interface PaginatedResult<T> {
  items: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export function paginate<T>(items: T[], total: number, query: PaginationQuery): PaginatedResult<T> {
  return {
    items,
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.limit)),
    },
  };
}

export function toSkipTake(query: PaginationQuery): { skip: number; take: number } {
  return { skip: (query.page - 1) * query.limit, take: query.limit };
}

/**
 * Builds a safe Prisma `orderBy` clause from a client-supplied `sortBy`/`sortOrder` pair.
 * `sortBy` must be one of `allowedFields` — never pass the raw client string into a Prisma
 * query. This is the single choke point search/list endpoints use to avoid injecting an
 * arbitrary column name.
 */
export function buildSafeOrderBy<TField extends string>(
  sortBy: string | undefined,
  sortOrder: string | undefined,
  allowedFields: readonly TField[],
  defaultField: TField
): Record<string, "asc" | "desc"> {
  const field = (allowedFields as readonly string[]).includes(sortBy ?? "")
    ? (sortBy as TField)
    : defaultField;
  const order = sortOrder === "desc" ? "desc" : "asc";
  return { [field]: order };
}

/**
 * Builds a safe partial `where` object for keyword search across a whitelisted set of string
 * fields. Throws ValidationError if given an empty allowlist (a programmer error, not user
 * input) so this is never silently a no-op search.
 */
export function buildKeywordSearchWhere(
  keyword: string | undefined,
  searchableFields: readonly string[]
): Record<string, unknown> | undefined {
  if (!keyword) return undefined;
  if (searchableFields.length === 0) {
    throw new ValidationError("No searchable fields configured for this resource");
  }
  return {
    OR: searchableFields.map((field) => ({
      [field]: { contains: keyword, mode: "insensitive" as const },
    })),
  };
}
