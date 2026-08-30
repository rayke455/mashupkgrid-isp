import { describe, it, expect } from "vitest";
import { createTicket } from "../ticket.service.js";

// createTicket's validation runs entirely before any Prisma call — these paths are testable
// without a real database because the function throws before ever reaching prisma.ticket.create.
describe("createTicket validation", () => {
  it("rejects an empty subject", async () => {
    await expect(
      createTicket("tenant-1", { subject: "  ", body: "My internet is down", contactName: "Jane" })
    ).rejects.toThrow("Subject is required");
  });

  it("rejects an empty body", async () => {
    await expect(
      createTicket("tenant-1", { subject: "Connection issue", body: "  ", contactName: "Jane" })
    ).rejects.toThrow("Please describe the issue");
  });

  it("rejects a ticket with no customer and no contact details", async () => {
    await expect(
      createTicket("tenant-1", { subject: "Connection issue", body: "My internet is down" })
    ).rejects.toThrow("A ticket needs either a linked customer or a way to contact whoever raised it");
  });
});
