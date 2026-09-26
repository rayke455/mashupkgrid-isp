"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, ApiRequestError } from "@/lib/api-client";
import { Button, Card, ErrorText, HintText, Input, Label } from "@/components/ui";

/**
 * How and when customers are reminded to pay, in the ISP's own words, and how quickly a support
 * ticket must get its first reply. Read by the worker's reminder jobs and the tickets list.
 */

interface Templates {
  dueSoonSms: string;
  dueSoonEmailSubject: string;
  dueSoonEmailBody: string;
  overdueSms: string;
  overdueEmailSubject: string;
  overdueEmailBody: string;
  finalSms: string;
  finalEmailSubject: string;
  finalEmailBody: string;
}
interface Preferences {
  reminders: { daysBeforeDue: number; sms: boolean; email: boolean; whatsapp: boolean; templates: Templates };
  tickets: { responseHours: { URGENT: number; HIGH: number; NORMAL: number; LOW: number } };
}

const PLACEHOLDERS = "{name} {invoice} {amount} {due} {isp}";

function TemplateGroup({
  title,
  hint,
  keys,
  value,
  onChange,
}: {
  title: string;
  hint: string;
  keys: [keyof Templates, keyof Templates, keyof Templates];
  value: Templates;
  onChange: (next: Templates) => void;
}) {
  const [smsKey, subjectKey, bodyKey] = keys;
  const smsLen = value[smsKey].length;
  return (
    <div className="space-y-3 border-t border-slate-100 pt-4 first:border-t-0 first:pt-0 dark:border-obsidian-800">
      <div>
        <p className="font-medium text-slate-900 dark:text-white">{title}</p>
        <p className="text-xs text-slate-500">{hint}</p>
      </div>
      <div>
        <Label htmlFor={smsKey}>SMS</Label>
        <textarea
          id={smsKey}
          rows={2}
          maxLength={320}
          value={value[smsKey]}
          onChange={(e) => onChange({ ...value, [smsKey]: e.target.value })}
          className="w-full rounded-lg border border-slate-300/90 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-brand-500 dark:border-obsidian-700 dark:bg-obsidian-950 dark:text-slate-100"
        />
        <HintText>
          {smsLen} characters{smsLen > 160 ? ", sent as two SMS" : ""}
        </HintText>
      </div>
      <div className="grid gap-3 sm:grid-cols-[1fr_2fr]">
        <div>
          <Label htmlFor={subjectKey}>Email subject</Label>
          <Input id={subjectKey} value={value[subjectKey]} onChange={(e) => onChange({ ...value, [subjectKey]: e.target.value })} maxLength={160} />
        </div>
        <div>
          <Label htmlFor={bodyKey}>Email body</Label>
          <textarea
            id={bodyKey}
            rows={4}
            maxLength={2000}
            value={value[bodyKey]}
            onChange={(e) => onChange({ ...value, [bodyKey]: e.target.value })}
            className="w-full rounded-lg border border-slate-300/90 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-brand-500 dark:border-obsidian-700 dark:bg-obsidian-950 dark:text-slate-100"
          />
        </div>
      </div>
    </div>
  );
}

export default function RemindersSettingsPage() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["preferences"], queryFn: () => apiFetch<Preferences>("/api/v1/settings/preferences") });
  const [form, setForm] = useState<Preferences | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (data && !form) setForm(data);
  }, [data, form]);

  const save = useMutation({
    mutationFn: () => apiFetch<Preferences>("/api/v1/settings/preferences", { method: "PUT", body: JSON.stringify(form) }),
    onSuccess: (next) => {
      setForm(next);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      queryClient.invalidateQueries({ queryKey: ["preferences"] });
    },
    onError: (err) => setError(err instanceof ApiRequestError ? err.message : "Could not save"),
  });

  if (isLoading || !form) return <p className="text-sm text-slate-500">Loading…</p>;
  const r = form.reminders;
  const hours = form.tickets.responseHours;

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">Reminders and tickets</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          When customers are reminded to pay, what the messages say, and how fast support must answer.
        </p>
      </div>

      <form
        className="space-y-6"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          save.mutate();
        }}
      >
        <Card className="space-y-4 p-6">
          <div>
            <p className="font-medium text-slate-900 dark:text-white">Schedule</p>
            <p className="text-xs text-slate-500">
              Three messages go out at most: before the due date, once overdue, and the day before suspension. Each is sent once per invoice.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-4">
            <div>
              <Label htmlFor="daysBeforeDue">Days before due date</Label>
              <Input
                id="daysBeforeDue"
                type="number"
                min={0}
                max={14}
                value={r.daysBeforeDue}
                onChange={(e) => setForm({ ...form, reminders: { ...r, daysBeforeDue: Number(e.target.value) } })}
              />
              <HintText>0 turns the early reminder off.</HintText>
            </div>
            <label className="flex items-center gap-2 pt-6 text-sm text-slate-700 dark:text-slate-300">
              <input type="checkbox" checked={r.sms} onChange={(e) => setForm({ ...form, reminders: { ...r, sms: e.target.checked } })} />
              Send by SMS
            </label>
            <label className="flex items-center gap-2 pt-6 text-sm text-slate-700 dark:text-slate-300">
              <input type="checkbox" checked={r.email} onChange={(e) => setForm({ ...form, reminders: { ...r, email: e.target.checked } })} />
              Send by email
            </label>
            <label className="flex items-center gap-2 pt-6 text-sm text-slate-700 dark:text-slate-300">
              <input type="checkbox" checked={r.whatsapp} onChange={(e) => setForm({ ...form, reminders: { ...r, whatsapp: e.target.checked } })} />
              Send by WhatsApp
            </label>
          </div>
          <HintText>WhatsApp messages use the SMS wording and go out from the number linked under Settings → WhatsApp. Without a linked number they are skipped.</HintText>
        </Card>

        <Card className="space-y-5 p-6">
          <div>
            <p className="font-medium text-slate-900 dark:text-white">Messages</p>
            <p className="text-xs text-slate-500">
              Placeholders you can use: <span className="font-mono">{PLACEHOLDERS}</span>. They are replaced with the customer&rsquo;s name, invoice number, amount, due date and your business name.
            </p>
          </div>
          <TemplateGroup
            title="Before the due date"
            hint="A courtesy reminder while there is still time to pay."
            keys={["dueSoonSms", "dueSoonEmailSubject", "dueSoonEmailBody"]}
            value={r.templates}
            onChange={(templates) => setForm({ ...form, reminders: { ...r, templates } })}
          />
          <TemplateGroup
            title="Once overdue"
            hint="Sent the day the invoice becomes overdue."
            keys={["overdueSms", "overdueEmailSubject", "overdueEmailBody"]}
            value={r.templates}
            onChange={(templates) => setForm({ ...form, reminders: { ...r, templates } })}
          />
          <TemplateGroup
            title="Final notice"
            hint="Sent the day before the connection is suspended."
            keys={["finalSms", "finalEmailSubject", "finalEmailBody"]}
            value={r.templates}
            onChange={(templates) => setForm({ ...form, reminders: { ...r, templates } })}
          />
        </Card>

        <Card className="space-y-4 p-6">
          <div>
            <p className="font-medium text-slate-900 dark:text-white">Support response targets</p>
            <p className="text-xs text-slate-500">Hours a new ticket may wait for its first reply before it shows as overdue on the Tickets page.</p>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {(["URGENT", "HIGH", "NORMAL", "LOW"] as const).map((p) => (
              <div key={p}>
                <Label htmlFor={`sla-${p}`}>{p.charAt(0) + p.slice(1).toLowerCase()}</Label>
                <Input
                  id={`sla-${p}`}
                  type="number"
                  min={1}
                  max={720}
                  value={hours[p]}
                  onChange={(e) => setForm({ ...form, tickets: { responseHours: { ...hours, [p]: Number(e.target.value) } } })}
                />
              </div>
            ))}
          </div>
        </Card>

        <div className="flex items-center gap-3">
          <Button type="submit" disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save changes"}
          </Button>
          {saved && <span className="text-sm font-medium text-emerald-600 dark:text-emerald-400">Saved</span>}
        </div>
        {error && <ErrorText>{error}</ErrorText>}
      </form>
    </div>
  );
}
