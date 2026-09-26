"use client";

import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, ApiRequestError } from "@/lib/api-client";
import { tr } from "@/lib/tr";
import { EmptyState, Notice, Panel, Pill, darkButton } from "@/components/dashboard/surface";
import { Input, Label } from "@/components/ui";

/**
 * Extra logins on one customer account: family at home, or colleagues at a business. Used by
 * staff on the customer page and by the account holder in the app; `base` is the API path for
 * whichever of the two it is. Each new member gets a link to set up their own login.
 */

interface Member {
  id: string;
  name: string;
  phone: string | null;
  email?: string;
  canPay: boolean;
  status: "active" | "invited" | "expired";
  inviteUrl: string | null;
  smsSent?: boolean;
}

export function AccountMembers({ base }: { base: string }) {
  const qc = useQueryClient();
  const key = ["account-members", base];
  const { data: members } = useQuery({ queryKey: key, queryFn: () => apiFetch<Member[]>(base) });
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [canPay, setCanPay] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const onError = (err: unknown) => setError(err instanceof ApiRequestError ? err.message : tr("Something went wrong."));
  const done = (message: string | null) => {
    setError(null);
    setNotice(message);
    void qc.invalidateQueries({ queryKey: key });
  };
  const inviteNote = (m: Member) => (m.smsSent ? tr("Invite sent by SMS.") : tr("Share the invite link with them."));

  const create = useMutation({
    mutationFn: () => apiFetch<Member>(base, { method: "POST", body: JSON.stringify({ name, phone, canPay }) }),
    onSuccess: (m) => {
      setAdding(false);
      setName("");
      setPhone("");
      setCanPay(false);
      done(`${m.name} ${tr("added.")} ${inviteNote(m)}`);
    },
    onError,
  });
  const update = useMutation({
    mutationFn: (m: Member) => apiFetch<Member>(`${base}/${m.id}`, { method: "PATCH", body: JSON.stringify({ canPay: !m.canPay }) }),
    onSuccess: () => done(null),
    onError,
  });
  const reinvite = useMutation({
    mutationFn: (m: Member) => apiFetch<Member>(`${base}/${m.id}/invite`, { method: "POST", body: "{}" }),
    onSuccess: (m) => done(`${tr("New invite ready.")} ${inviteNote(m)}`),
    onError,
  });
  const remove = useMutation({
    mutationFn: (m: Member) => apiFetch(`${base}/${m.id}`, { method: "DELETE" }),
    onSuccess: () => done(tr("Member removed. Their login no longer works.")),
    onError,
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    create.mutate();
  }

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setNotice(tr("Invite link copied."));
    } catch {
      window.prompt(tr("Copy this invite link:"), url);
    }
  }

  return (
    <Panel
      title={tr("People on this account")}
      description={tr("Family or colleagues who can sign in to see the plans, bills and usage, and ask for help. Only people you allow can pay.")}
      actions={
        !adding && (
          <button type="button" className={darkButton("secondary", "sm")} onClick={() => setAdding(true)}>
            {tr("Add person")}
          </button>
        )
      }
    >
      <div className="space-y-4">
        {error && <Notice tone="bad">{error}</Notice>}
        {notice && <Notice tone="good">{notice}</Notice>}

        {adding && (
          <form onSubmit={submit} className="grid gap-3 rounded-lg border border-obsidian-800 p-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="member-name">{tr("Name")}</Label>
              <Input id="member-name" required maxLength={100} value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="member-phone">{tr("Phone (optional, for the invite SMS)")}</Label>
              <Input id="member-phone" inputMode="tel" placeholder="07XX XXX XXX" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-300 sm:col-span-2">
              <input type="checkbox" checked={canPay} onChange={(e) => setCanPay(e.target.checked)} />
              {tr("Allowed to pay bills")}
            </label>
            <div className="flex gap-2 sm:col-span-2">
              <button type="submit" className={darkButton("primary", "sm")} disabled={create.isPending || !name.trim()}>
                {create.isPending ? tr("Adding…") : tr("Add and invite")}
              </button>
              <button type="button" className={darkButton("ghost", "sm")} onClick={() => setAdding(false)}>
                {tr("Cancel")}
              </button>
            </div>
          </form>
        )}

        {members && members.length === 0 && !adding && <EmptyState title={tr("Only the account holder so far")} />}

        {members && members.length > 0 && (
          <ul className="divide-y divide-obsidian-800 text-sm">
            {members.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="font-medium text-white">
                    {m.name}{" "}
                    <Pill tone={m.status === "active" ? "good" : m.status === "invited" ? "warn" : "neutral"}>
                      {m.status === "active" ? tr("Signed up") : m.status === "invited" ? tr("Invited") : tr("Invite expired")}
                    </Pill>
                  </p>
                  <p className="text-xs text-slate-400">
                    {[m.email, m.phone].filter(Boolean).join(" · ")}
                    {(m.email || m.phone) && " · "}
                    {m.canPay ? tr("Can pay") : tr("View only")}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {m.inviteUrl && (
                    <button type="button" className={darkButton("ghost", "sm")} onClick={() => copy(m.inviteUrl!)}>
                      {tr("Copy invite link")}
                    </button>
                  )}
                  {m.status !== "active" && (
                    <button type="button" className={darkButton("ghost", "sm")} disabled={reinvite.isPending} onClick={() => reinvite.mutate(m)}>
                      {tr("New invite")}
                    </button>
                  )}
                  <button type="button" className={darkButton("ghost", "sm")} disabled={update.isPending} onClick={() => update.mutate(m)}>
                    {m.canPay ? tr("Make view only") : tr("Allow paying")}
                  </button>
                  <button
                    type="button"
                    className={darkButton("ghost", "sm")}
                    disabled={remove.isPending}
                    onClick={() => confirm(`${tr("Remove")} ${m.name}? ${tr("Their login stops working.")}`) && remove.mutate(m)}
                  >
                    {tr("Remove")}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Panel>
  );
}
