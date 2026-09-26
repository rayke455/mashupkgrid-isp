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
};

/** Merges whatever is stored with the defaults, so a partial or old record never breaks a job. */
export function resolveTenantPreferences(stored: unknown): TenantPreferences {
  const raw = (stored && typeof stored === "object" ? stored : {}) as Record<string, unknown>;
  const reminders = (raw.reminders && typeof raw.reminders === "object" ? raw.reminders : {}) as Record<string, unknown>;
  const tickets = (raw.tickets && typeof raw.tickets === "object" ? raw.tickets : {}) as Record<string, unknown>;
  const merged = {
    reminders: {
      ...DEFAULT_TENANT_PREFERENCES.reminders,
      ...reminders,
      templates: { ...DEFAULT_TENANT_PREFERENCES.reminders.templates, ...((reminders.templates as object) ?? {}) },
    },
    tickets: {
      responseHours: { ...DEFAULT_TENANT_PREFERENCES.tickets.responseHours, ...((tickets.responseHours as object) ?? {}) },
    },
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
