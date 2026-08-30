import { describe, it, expect } from "vitest";
import {
  paginationQuerySchema,
  paginate,
  toSkipTake,
  buildSafeOrderBy,
  buildKeywordSearchWhere,
} from "../pagination.js";
import { ValidationError } from "../errors.js";

describe("paginationQuerySchema", () => {
  it("defaults page/limit when omitted", () => {
    const parsed = paginationQuerySchema.parse({});
    expect(parsed).toEqual({ page: 1, limit: 25 });
  });

  it("rejects a limit above the max", () => {
    expect(() => paginationQuerySchema.parse({ limit: 999 })).toThrow();
  });
});

describe("toSkipTake", () => {
  it("computes skip/take for page 3", () => {
    expect(toSkipTake({ page: 3, limit: 10 })).toEqual({ skip: 20, take: 10 });
  });
});

describe("paginate", () => {
  it("computes totalPages correctly, rounding up", () => {
    const result = paginate([1, 2], 21, { page: 1, limit: 10 });
    expect(result.pagination.totalPages).toBe(3);
  });
});

describe("buildSafeOrderBy", () => {
  const allowed = ["createdAt", "name"] as const;

  it("uses the requested field when whitelisted", () => {
    expect(buildSafeOrderBy("name", "desc", allowed, "createdAt")).toEqual({ name: "desc" });
  });

  it("falls back to the default field for a non-whitelisted field (never trusts raw client input)", () => {
    expect(buildSafeOrderBy("passwordHash", "asc", allowed, "createdAt")).toEqual({
      createdAt: "asc",
    });
  });

  it("defaults sort order to asc for anything other than 'desc'", () => {
    expect(buildSafeOrderBy("name", "banana", allowed, "createdAt")).toEqual({ name: "asc" });
  });
});

describe("buildKeywordSearchWhere", () => {
  it("returns undefined when no keyword is given", () => {
    expect(buildKeywordSearchWhere(undefined, ["email"])).toBeUndefined();
  });

  it("builds an OR clause across whitelisted fields", () => {
    expect(buildKeywordSearchWhere("jane", ["email", "name"])).toEqual({
      OR: [
        { email: { contains: "jane", mode: "insensitive" } },
        { name: { contains: "jane", mode: "insensitive" } },
      ],
    });
  });

  it("throws if no searchable fields are configured", () => {
    expect(() => buildKeywordSearchWhere("jane", [])).toThrow(ValidationError);
  });
});
