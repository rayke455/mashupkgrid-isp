/**
 * Day bucketing for reports, in the tenant's own timezone rather than UTC.
 *
 * `date.toISOString().slice(0, 10)` is the obvious way to get a YYYY-MM-DD key and is wrong for
 * every tenant not sitting on UTC. This platform defaults tenants to Africa/Nairobi (UTC+3, see
 * the Tenant model), so a payment taken at 01:00 local is 22:00 UTC the previous day — under UTC
 * bucketing every transaction between midnight and 3am is reported on the wrong day, and "today"
 * is permanently missing its first three hours. An operator reconciling a daily total against
 * their own till finds a discrepancy that moves around and never reproduces on demand.
 */

/** YYYY-MM-DD for `date` as observed in `timeZone`.
 *
 *  Uses the en-CA locale deliberately: it is the one widely-available locale whose short date
 *  format is already ISO-ordered, which avoids hand-assembling parts. An unrecognised timezone
 *  would make Intl throw, so it falls back to UTC — a report bucketed slightly wrong is a better
 *  outcome than a dashboard that fails to load. */
export function dayKeyInTimeZone(date: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}
