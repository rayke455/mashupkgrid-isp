import { describe, expect, it, vi, beforeEach } from "vitest";

const sendEmailMock = vi.fn().mockResolvedValue({ delivered: false });
vi.mock("../../lib/email.js", () => ({ sendEmail: sendEmailMock }));

const { handleSendTenantWelcomeEmail, buildTenantOnboardingEmail } = await import("../send-tenant-welcome-email.js");

const base = {
  email: "owner@acme.co.ke",
  ownerName: "Amina",
  companyName: "Acme Fibre",
  subdomain: "acme",
  dashboardUrl: "https://acme.mashuphost.tech/login",
  portalUrl: "https://app.mashuphost.tech/hotspot/acme",
};

describe("tenant onboarding email", () => {
  beforeEach(() => sendEmailMock.mockClear());

  it("tells a fresh registration to wait for approval, without a sign-in button", () => {
    const mail = buildTenantOnboardingEmail({ ...base, stage: "pending" });
    expect(mail.subject).toMatch(/received your application/i);
    expect(mail.text).toMatch(/approval/i);
    expect(mail.html).not.toContain("Sign in to your dashboard");
  });

  it("sends the real welcome with links once approved, and defaults to that stage", async () => {
    await handleSendTenantWelcomeEmail(base); // stage omitted: super-admin-created tenants
    const call = sendEmailMock.mock.calls[0]![0];
    expect(call.to).toBe(base.email);
    expect(call.subject).toMatch(/approved/i);
    expect(call.html).toContain(base.dashboardUrl);
    expect(call.html).toContain("Sign in to your dashboard");
  });

  it("includes a temporary password only when one was issued", () => {
    expect(buildTenantOnboardingEmail({ ...base, stage: "approved" }).text).not.toMatch(/temporary password/i);
    expect(buildTenantOnboardingEmail({ ...base, stage: "approved", temporaryPassword: "Tmp-1234" }).text).toContain("Tmp-1234");
  });

  it("gives a rejected applicant the reason, HTML-escaped", () => {
    const mail = buildTenantOnboardingEmail({ ...base, stage: "rejected", reason: "Licence <pending>" });
    expect(mail.subject).toMatch(/not approved/i);
    expect(mail.text).toContain("Licence <pending>");
    expect(mail.html).toContain("Licence &lt;pending&gt;");
    expect(mail.html).not.toContain("<pending>");
  });
});
