import { z } from "zod";

/**
 * Operational preferences an ISP sets for itself, stored on Tenant.preferences. Everything has
 * a default so a tenant that never opened the settings page behaves exactly as before.
 */

const template = (max: number) => z.string().max(max);

export const reminderTemplatesSchema = z.object({
  /** Sent before the due date. */
  dueSoonSms: template(320),
  dueSoonEmailSubject: template(160),
  dueSoonEmailBody: template(2000),
  /** Sent once the invoice is overdue. */
  overdueSms: template(320),
  overdueEmailSubject: template(160),
  overdueEmailBody: template(2000),
  /** Sent the day before suspension. */
  finalSms: template(320),
  finalEmailSubject: template(160),
  finalEmailBody: template(2000),
});

export const tenantPreferencesSchema = z.object({
  reminders: z.object({
    /** Send the due-soon reminder this many days before the due date (0 turns it off). */
    daysBeforeDue: z.number().int().min(0).max(14),
    /** Channels the reminders go out on. */
    sms: z.boolean(),
    email: z.boolean(),
    /** Sent from the ISP's linked WhatsApp number, using the SMS wording. Skipped quietly when
     *  no WhatsApp number is linked. */
    whatsapp: z.boolean(),
    templates: reminderTemplatesSchema,
  }),
  tickets: z.object({
    /** Hours a ticket may wait for a first reply before it counts as overdue, by priority. */
    responseHours: z.object({
      URGENT: z.number().int().min(1).max(720),
      HIGH: z.number().int().min(1).max(720),
      NORMAL: z.number().int().min(1).max(720),
      LOW: z.number().int().min(1).max(720),
    }),
  }),
  /** Push alerts to staff phones and computers that turned them on. */
  alerts: z.object({
    /** Alert staff who manage routers when one stops reporting, and when it is back. */
    routerDown: z.boolean(),
    /** Alert staff who see payments when one at least this large arrives. 0 turns it off. */
    largePaymentMinor: z
      .number()
      .int()
      .min(0)
      .max(1_000_000_000)
      .refine((v) => v === 0 || v >= 10_000, "Use at least 100, or 0 to turn payment alerts off"),
  }),
  /** Suggest a bigger plan to subscribers who keep running into their data cap. */
  upgrades: z.object({
    enabled: z.boolean(),
    /** Text the customer about the suggested plan when it is found. */
    smsCustomer: z.boolean(),
    /** Share of the data cap used in the last 30 days that counts as "running into it". */
    thresholdPercent: z.number().int().min(50).max(100),
  }),
  /** Refer-a-neighbour: the referrer is rewarded once the person they referred first pays. */
  referrals: z.object({
    enabled: z.boolean(),
    rewardType: z.enum(["DAYS", "CREDIT"]),
    /** Free days added to the referrer's subscription. */
    rewardDays: z.number().int().min(1).max(90),
    /** Account credit for the referrer, and the fallback when they have no active plan to extend. */
    rewardCreditMinor: z.number().int().min(0).max(100_000_000),
  }),
  /** VAT details for the monthly tax report. */
  tax: z.object({
    vatRegistered: z.boolean(),
    /** KRA PIN, e.g. P051234567X. Empty until the ISP enters it. */
    kraPin: z.string().trim().max(20).regex(/^$|^[APap]\d{9}[A-Za-z]$/, "A KRA PIN looks like P051234567X"),
    /** Standard rate used for sales with no invoice (hotspot), whose prices include VAT. */
    vatRatePercent: z.number().int().min(0).max(30),
  }),
  /** Monthly RouterOS upgrade on every router, started by the system at a quiet hour. */
  autoUpdate: z.object({
    enabled: z.boolean(),
    /** Day of the month (1-28 so it exists in every month) and hour, in the ISP's own timezone. */
    dayOfMonth: z.number().int().min(1).max(28),
    hour: z.number().int().min(0).max(23),
    /** Also bring RouterBOARD firmware up to date 45 minutes later, after the upgrade reboot. */
    includeFirmware: z.boolean(),
  }),
});

export type TenantPreferences = z.infer<typeof tenantPreferencesSchema>;
export type ReminderTemplates = z.infer<typeof reminderTemplatesSchema>;

/** Placeholders a template may use. Anything else is left as typed. */
export const REMINDER_PLACEHOLDERS = ["{name}", "{invoice}", "{amount}", "{due}", "{isp}"] as const;

export const DEFAULT_TENANT_PREFERENCES: TenantPreferences = {
  reminders: {
    daysBeforeDue: 3,
    sms: true,
    email: true,
    whatsapp: true,
    templates: {
      dueSoonSms: "Reminder from {isp}: invoice {invoice} for {amount} is due {due}. Pay before then to avoid interruption.",
      dueSoonEmailSubject: "Payment reminder: {invoice} due {due}",
      dueSoonEmailBody:
        "Hi {name},\n\nA friendly reminder that invoice {invoice} for {amount} is due on {due}. Pay before then to keep your service uninterrupted.\n\n{isp}",
      overdueSms: "{isp}: invoice {invoice} for {amount} was due {due} and is overdue. Pay now to avoid suspension.",
      overdueEmailSubject: "Overdue: {invoice} needs payment",
      overdueEmailBody:
        "Hi {name},\n\nInvoice {invoice} for {amount} was due on {due} and is now overdue. Please pay as soon as possible to avoid your service being suspended.\n\n{isp}",
      finalSms: "FINAL NOTICE from {isp}: invoice {invoice} for {amount} is unpaid. Your service will be suspended tomorrow unless you pay now.",
      finalEmailSubject: "Final notice: {invoice} will suspend your service tomorrow",
      finalEmailBody:
        "Hi {name},\n\nThis is a final notice: invoice {invoice} for {amount} remains unpaid, and your internet service will be suspended tomorrow if it is not settled. Please pay now to avoid interruption.\n\n{isp}",
    },
  },
  tickets: {
    responseHours: { URGENT: 2, HIGH: 8, NORMAL: 24, LOW: 72 },
  },
  alerts: { routerDown: true, largePaymentMinor: 500_000 },
  upgrades: { enabled: true, smsCustomer: true, thresholdPercent: 90 },
  referrals: { enabled: true, rewardType: "DAYS", rewardDays: 7, rewardCreditMinor: 50_000 },
  tax: { vatRegistered: false, kraPin: "", vatRatePercent: 16 },
  autoUpdate: { enabled: false, dayOfMonth: 5, hour: 3, includeFirmware: true },
};

/** Merges whatever is stored with the defaults, so a partial or old record never breaks a job. */
export function resolveTenantPreferences(stored: unknown): TenantPreferences {
  const raw = (stored && typeof stored === "object" ? stored : {}) as Record<string, unknown>;
  const reminders = (raw.reminders && typeof raw.reminders === "object" ? raw.reminders : {}) as Record<string, unknown>;
  const tickets = (raw.tickets && typeof raw.tickets === "object" ? raw.tickets : {}) as Record<string, unknown>;
  const alerts = (raw.alerts && typeof raw.alerts === "object" ? raw.alerts : {}) as Record<string, unknown>;
  const autoUpdate = (raw.autoUpdate && typeof raw.autoUpdate === "object" ? raw.autoUpdate : {}) as Record<string, unknown>;
  const tax = (raw.tax && typeof raw.tax === "object" ? raw.tax : {}) as Record<string, unknown>;
  const referrals = (raw.referrals && typeof raw.referrals === "object" ? raw.referrals : {}) as Record<string, unknown>;
  const upgrades = (raw.upgrades && typeof raw.upgrades === "object" ? raw.upgrades : {}) as Record<string, unknown>;
  const merged = {
    reminders: {
      ...DEFAULT_TENANT_PREFERENCES.reminders,
      ...reminders,
      templates: { ...DEFAULT_TENANT_PREFERENCES.reminders.templates, ...((reminders.templates as object) ?? {}) },
    },
    tickets: {
      responseHours: { ...DEFAULT_TENANT_PREFERENCES.tickets.responseHours, ...((tickets.responseHours as object) ?? {}) },
    },
    alerts: { ...DEFAULT_TENANT_PREFERENCES.alerts, ...alerts },
    upgrades: { ...DEFAULT_TENANT_PREFERENCES.upgrades, ...upgrades },
    referrals: { ...DEFAULT_TENANT_PREFERENCES.referrals, ...referrals },
    tax: { ...DEFAULT_TENANT_PREFERENCES.tax, ...tax },
    autoUpdate: { ...DEFAULT_TENANT_PREFERENCES.autoUpdate, ...autoUpdate },
  };
  const parsed = tenantPreferencesSchema.safeParse(merged);
  return parsed.success ? parsed.data : DEFAULT_TENANT_PREFERENCES;
}

export function renderReminderTemplate(
  text: string,
  values: { name: string; invoice: string; amount: string; due: string; isp: string }
): string {
  return text
    .replace(/\{name\}/g, values.name)
    .replace(/\{invoice\}/g, values.invoice)
    .replace(/\{amount\}/g, values.amount)
    .replace(/\{due\}/g, values.due)
    .replace(/\{isp\}/g, values.isp);
}
