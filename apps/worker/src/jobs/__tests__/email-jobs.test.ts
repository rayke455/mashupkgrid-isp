import { describe, it, expect, vi, beforeEach } from "vitest";

const sendEmailMock = vi.fn().mockResolvedValue({ delivered: false });
vi.mock("../../lib/email.js", () => ({ sendEmail: sendEmailMock }));

const { handleSendVerificationEmail } = await import("../send-verification-email.js");
const { handleSendPasswordResetEmail } = await import("../send-password-reset-email.js");

describe("handleSendVerificationEmail", () => {
  beforeEach(() => sendEmailMock.mockClear());

  it("sends to the given email with a link containing the raw token", async () => {
    await handleSendVerificationEmail({
      userId: "11111111-1111-1111-1111-111111111111",
      email: "jane@example.com",
      verificationToken: "raw-token-abc",
    });

    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const call = sendEmailMock.mock.calls[0]![0];
    expect(call.to).toBe("jane@example.com");
    expect(call.text).toContain("raw-token-abc");
    expect(call.html).toContain("raw-token-abc");
  });

  it("rejects a malformed payload rather than silently sending garbage", async () => {
    await expect(
      handleSendVerificationEmail({ userId: "not-a-uuid", email: "nope", verificationToken: "x" })
    ).rejects.toThrow();
    expect(sendEmailMock).not.toHaveBeenCalled();
  });
});

describe("handleSendPasswordResetEmail", () => {
  beforeEach(() => sendEmailMock.mockClear());

  it("sends to the given email with a link containing the raw token", async () => {
    await handleSendPasswordResetEmail({
      userId: "22222222-2222-2222-2222-222222222222",
      email: "jane@example.com",
      resetToken: "raw-reset-token",
    });

    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const call = sendEmailMock.mock.calls[0]![0];
    expect(call.text).toContain("raw-reset-token");
  });

  it("rejects an invalid email address", async () => {
    await expect(
      handleSendPasswordResetEmail({
        userId: "22222222-2222-2222-2222-222222222222",
        email: "not-an-email",
        resetToken: "x",
      })
    ).rejects.toThrow();
  });
});
