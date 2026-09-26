"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, ApiRequestError } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { useLanguage } from "@/lib/language-context";
import { formatMoney } from "@/lib/money";
import { Metric, Notice, Panel, darkButton } from "@/components/dashboard/surface";
import { Input, Label } from "@/components/ui";
import { IconReceipt, IconTicket, IconWallet } from "@/components/icons";

/**
 * The agent's app: sell a voucher from their stock (the code shows on screen and can be texted
 * to the buyer), take a customer's bill payment in cash, and see this month's statement of what
 * they took, their commission and what they owe the ISP. Phone-sized, with English and Swahili.
 */

type Tab = "sell" | "pay" | "statement";

const S = {
  en: {
    tabs: { sell: "Sell voucher", pay: "Take payment", statement: "Statement" },
    signOut: "Sign out",
    loading: "Loading…",
    notAgent: "This app is for the ISP's agents. Ask the ISP for an agent invite.",
    suspended: "Your agent account is suspended. You can see your statement, but not sell or take payments. Contact the ISP.",
    today: "Today",
    sales: (n: number) => `${n} sale${n === 1 ? "" : "s"}`,
    commission: "Your commission",
    owe: "You owe the ISP",
    oweHint: "Hand this over to the ISP",
    noStock: "You have no vouchers left. Ask the ISP for more.",
    left: (n: number) => `${n} left`,
    buyerPhone: "Buyer's phone (optional, to text the code)",
    sell: "Sell",
    selling: "Selling…",
    code: "Voucher code",
    sold: (pkg: string) => `Sold: ${pkg}. Give the buyer this code.`,
    texted: "The code was also sent by SMS.",
    account: "Customer account number",
    find: "Find",
    finding: "Finding…",
    owes: (name: string, amount: string) => `${name} owes ${amount}.`,
    owesNothing: (name: string) => `${name} owes nothing now. Payment will go to their account credit.`,
    amount: "Amount received",
    record: "Record payment",
    recording: "Recording…",
    recorded: (amount: string, name: string) => `${amount} recorded for ${name}. They will get an SMS.`,
    confirm: (amount: string, name: string) => `Record ${amount} cash from ${name}?`,
    month: "Month",
    vouchers: "Vouchers sold",
    collections: "Payments taken",
    opening: "Owed at start of month",
    taken: "Money taken",
    handedOver: "Handed over to the ISP",
    closing: "Owed at end of month",
    date: "Date",
    what: "What",
    amountCol: "Amount",
    yours: "Commission",
    handover: "Handed over",
    nothing: "Nothing this month.",
    error: "Something went wrong. Please try again.",
  },
  sw: {
    tabs: { sell: "Uza vocha", pay: "Pokea malipo", statement: "Taarifa" },
    signOut: "Toka",
    loading: "Inapakia…",
    notAgent: "Programu hii ni ya mawakala wa mtoa huduma. Omba mwaliko wa wakala kwa mtoa huduma.",
    suspended: "Akaunti yako ya wakala imesimamishwa. Unaweza kuona taarifa yako, lakini huwezi kuuza wala kupokea malipo. Wasiliana na mtoa huduma.",
    today: "Leo",
    sales: (n: number) => `Mauzo ${n}`,
    commission: "Kamisheni yako",
    owe: "Unadaiwa na mtoa huduma",
    oweHint: "Kabidhi pesa hizi kwa mtoa huduma",
    noStock: "Huna vocha zilizobaki. Omba zaidi kwa mtoa huduma.",
    left: (n: number) => `${n} zimebaki`,
    buyerPhone: "Simu ya mnunuzi (si lazima, kutuma msimbo)",
    sell: "Uza",
    selling: "Inauza…",
    code: "Msimbo wa vocha",
    sold: (pkg: string) => `Imeuzwa: ${pkg}. Mpe mnunuzi msimbo huu.`,
    texted: "Msimbo pia umetumwa kwa SMS.",
    account: "Nambari ya akaunti ya mteja",
    find: "Tafuta",
    finding: "Inatafuta…",
    owes: (name: string, amount: string) => `${name} anadaiwa ${amount}.`,
    owesNothing: (name: string) => `${name} hadaiwi sasa. Malipo yataenda kwenye salio la akaunti yake.`,
    amount: "Kiasi kilichopokelewa",
    record: "Rekodi malipo",
    recording: "Inarekodi…",
    recorded: (amount: string, name: string) => `${amount} imerekodiwa kwa ${name}. Atapata SMS.`,
    confirm: (amount: string, name: string) => `Rekodi ${amount} taslimu kutoka kwa ${name}?`,
    month: "Mwezi",
    vouchers: "Vocha zilizouzwa",
    collections: "Malipo yaliyopokelewa",
    opening: "Deni mwanzo wa mwezi",
    taken: "Pesa zilizopokelewa",
    handedOver: "Zilizokabidhiwa kwa mtoa huduma",
    closing: "Deni mwisho wa mwezi",
    date: "Tarehe",
    what: "Nini",
    amountCol: "Kiasi",
    yours: "Kamisheni",
    handover: "Imekabidhiwa",
    nothing: "Hakuna kitu mwezi huu.",
    error: "Kuna tatizo. Tafadhali jaribu tena.",
  },
};

interface Me {
  name: string;
  isp: string;
  status: "ACTIVE" | "SUSPENDED";
  stock: { package: { id: string; name: string; priceMinor: number; currency: string }; count: number }[];
  balanceMinor: number;
  today: { sales: number; takenMinor: number; commissionMinor: number };
}

interface Statement {
  openingBalanceMinor: number;
  vouchers: { count: number; amountMinor: number; commissionMinor: number };
  collections: { count: number; amountMinor: number; commissionMinor: number };
  takenMinor: number;
  commissionMinor: number;
  handedOverMinor: number;
  closingBalanceMinor: number;
  sales: { id: string; description: string; amountMinor: number; commissionMinor: number; createdAt: string }[];
  remittances: { id: string; amountMinor: number; method: string; createdAt: string }[];
}

const KES = (minor: number) => formatMoney(minor, "KES");

export function AgentApp() {
  const { user, loading, logout } = useAuth();
  const { lang, setLang } = useLanguage();
  const t = S[lang];
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("sell");

  useEffect(() => {
    if (!loading && !user) router.replace("/login?next=/agent");
  }, [loading, user, router]);

  const { data: me, error } = useQuery({ queryKey: ["agent-me"], queryFn: () => apiFetch<Me>("/api/v1/agent/me"), enabled: Boolean(user), retry: false, refetchInterval: 60_000 });

  if (loading || !user || (!me && !error)) return <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">{t.loading}</div>;
  if (!me) return <div className="mx-auto flex min-h-screen max-w-md items-center justify-center p-6 text-center text-sm text-slate-300">{t.notAgent}</div>;

  const tabs: { id: Tab; icon: typeof IconTicket }[] = [
    { id: "sell", icon: IconTicket },
    { id: "pay", icon: IconWallet },
    { id: "statement", icon: IconReceipt },
  ];

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-xl flex-col bg-obsidian-950">
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-obsidian-800 bg-obsidian-950/95 px-4 py-3 backdrop-blur">
        <div className="min-w-0">
          <p className="truncate font-semibold text-white">{me.name}</p>
          <p className="truncate text-xs text-slate-400">{me.isp}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex overflow-hidden rounded-lg border border-obsidian-700 text-xs">
            {(["en", "sw"] as const).map((l) => (
              <button key={l} type="button" onClick={() => setLang(l)} className={`px-2.5 py-1 ${lang === l ? "bg-obsidian-800 text-white" : "text-slate-400"}`}>
                {l.toUpperCase()}
              </button>
            ))}
          </div>
          <button type="button" onClick={() => logout().then(() => router.replace("/login?next=/agent"))} className="text-xs text-slate-400 underline">
            {t.signOut}
          </button>
        </div>
      </header>

      <main className="flex-1 space-y-5 px-4 py-5 pb-28">
        {me.status !== "ACTIVE" && <Notice tone="bad">{t.suspended}</Notice>}
        <div className="grid grid-cols-2 gap-3">
          <Metric label={t.today} value={KES(me.today.takenMinor)} hint={`${t.sales(me.today.sales)} · ${t.commission} ${KES(me.today.commissionMinor)}`} />
          <Metric label={t.owe} value={KES(me.balanceMinor)} hint={t.oweHint} tone={me.balanceMinor > 0 ? "warn" : "good"} />
        </div>
        {tab === "sell" && <SellVoucher me={me} t={t} />}
        {tab === "pay" && <TakePayment t={t} />}
        {tab === "statement" && <AgentStatement t={t} />}
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-20 mx-auto flex max-w-xl border-t border-obsidian-800 bg-obsidian-950/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        {tabs.map(({ id, icon: Icon }) => (
          <button key={id} type="button" onClick={() => setTab(id)} aria-current={tab === id ? "page" : undefined} className={`flex flex-1 flex-col items-center gap-1 py-2.5 text-xs ${tab === id ? "text-brand-400" : "text-slate-400"}`}>
            <Icon size={22} />
            {t.tabs[id]}
          </button>
        ))}
      </nav>
    </div>
  );
}

type T = (typeof S)["en"];

function SellVoucher({ me, t }: { me: Me; t: T }) {
  const qc = useQueryClient();
  const [phone, setPhone] = useState("");
  const [result, setResult] = useState<{ code: string; package: { name: string }; smsSent: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const sell = useMutation({
    mutationFn: (hotspotPackageId: string) =>
      apiFetch<{ code: string; package: { name: string }; smsSent: boolean }>("/api/v1/agent/vouchers/sell", { method: "POST", body: JSON.stringify({ hotspotPackageId, buyerPhone: phone.trim() }) }),
    onSuccess: (r) => {
      setError(null);
      setResult(r);
      setPhone("");
      void qc.invalidateQueries({ queryKey: ["agent-me"] });
    },
    onError: (err) => setError(err instanceof ApiRequestError ? err.message : t.error),
  });

  return (
    <div className="space-y-4">
      {result && (
        <Panel title={t.code}>
          <p className="text-center font-mono text-3xl font-bold tracking-widest text-white">{result.code}</p>
          <p className="mt-2 text-center text-sm text-slate-300">
            {t.sold(result.package.name)} {result.smsSent && t.texted}
          </p>
        </Panel>
      )}
      {error && <Notice tone="bad">{error}</Notice>}
      {me.stock.length === 0 ? (
        <Notice tone="warn">{t.noStock}</Notice>
      ) : (
        <>
          <div>
            <Label htmlFor="buyer-phone">{t.buyerPhone}</Label>
            <Input id="buyer-phone" inputMode="tel" placeholder="07XX XXX XXX" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div className="grid gap-3">
            {me.stock.map((s) => (
              <button
                key={s.package.id}
                type="button"
                disabled={sell.isPending || me.status !== "ACTIVE"}
                onClick={() => sell.mutate(s.package.id)}
                className="flex items-center justify-between rounded-xl border border-obsidian-700 bg-obsidian-900 px-4 py-4 text-left disabled:opacity-60"
              >
                <span>
                  <span className="block font-medium text-white">{s.package.name}</span>
                  <span className="text-xs text-slate-400">{t.left(s.count)}</span>
                </span>
                <span className="text-lg font-semibold tabular-nums text-white">{formatMoney(s.package.priceMinor, s.package.currency)}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function TakePayment({ t }: { t: T }) {
  const qc = useQueryClient();
  const [account, setAccount] = useState("");
  const [amount, setAmount] = useState("");
  const [customer, setCustomer] = useState<{ id: string; name: string; customerNumber: string; owedMinor: number } | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // One id per payment being entered, so a retry after a dropped connection can't record it twice.
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const onError = (err: unknown) => setError(err instanceof ApiRequestError ? err.message : t.error);

  const find = useMutation({
    mutationFn: () => apiFetch<{ id: string; name: string; customerNumber: string; owedMinor: number }>(`/api/v1/agent/customers/${encodeURIComponent(account.trim())}`),
    onSuccess: (c) => {
      setError(null);
      setDone(null);
      setCustomer(c);
      setAmount(c.owedMinor > 0 ? String(c.owedMinor / 100) : "");
    },
    onError,
  });
  const record = useMutation({
    mutationFn: () =>
      apiFetch<{ amountMinor: number; customer: { name: string } }>("/api/v1/agent/collections", {
        method: "POST",
        body: JSON.stringify({ customerId: customer!.id, amountMinor: Math.round(Number(amount) * 100), requestId }),
      }),
    onSuccess: (r) => {
      setDone(t.recorded(KES(r.amountMinor), r.customer.name));
      setCustomer(null);
      setAccount("");
      setAmount("");
      setRequestId(crypto.randomUUID());
      void qc.invalidateQueries({ queryKey: ["agent-me"] });
    },
    onError,
  });

  function submitFind(e: FormEvent) {
    e.preventDefault();
    find.mutate();
  }
  function submitRecord(e: FormEvent) {
    e.preventDefault();
    if (!customer) return;
    const minor = Math.round(Number(amount) * 100);
    if (confirm(t.confirm(KES(minor), customer.name))) record.mutate();
  }

  return (
    <div className="space-y-4">
      {done && <Notice tone="good">{done}</Notice>}
      {error && <Notice tone="bad">{error}</Notice>}
      <form onSubmit={submitFind} className="flex items-end gap-2">
        <div className="flex-1">
          <Label htmlFor="acct">{t.account}</Label>
          <Input id="acct" required placeholder="CUS-000001" autoCapitalize="characters" value={account} onChange={(e) => setAccount(e.target.value)} />
        </div>
        <button type="submit" className={darkButton("secondary")} disabled={find.isPending || account.trim().length < 3}>
          {find.isPending ? t.finding : t.find}
        </button>
      </form>
      {customer && (
        <form onSubmit={submitRecord} className="space-y-3 rounded-xl border border-obsidian-700 p-4">
          <p className="text-sm text-slate-200">{customer.owedMinor > 0 ? t.owes(customer.name, KES(customer.owedMinor)) : t.owesNothing(customer.name)}</p>
          <div>
            <Label htmlFor="amt">{t.amount}</Label>
            <Input id="amt" required type="number" min={1} step="any" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <button type="submit" className={`${darkButton("primary")} w-full justify-center`} disabled={record.isPending || !(Number(amount) > 0)}>
            {record.isPending ? t.recording : t.record}
          </button>
        </form>
      )}
    </div>
  );
}

function AgentStatement({ t }: { t: T }) {
  const now = new Date();
  const [ym, setYm] = useState(`${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`);
  const [year, month] = ym.split("-").map(Number) as [number, number];
  const { data: s } = useQuery({ queryKey: ["agent-statement", ym], queryFn: () => apiFetch<Statement>(`/api/v1/agent/statement?year=${year}&month=${month}`) });
  return <StatementView s={s} t={t} ym={ym} setYm={setYm} />;
}

/** The monthly statement, shared by the agent's app and the staff agent page. */
export function StatementView({ s, t, ym, setYm }: { s: Statement | undefined; t: T; ym: string; setYm: (v: string) => void }) {
  const rows = s
    ? [
        ...s.sales.map((x) => ({ id: x.id, at: x.createdAt, what: x.description, amount: x.amountMinor, commission: x.commissionMinor, handover: false })),
        ...s.remittances.map((r) => ({ id: r.id, at: r.createdAt, what: `${t.handover} (${r.method})`, amount: r.amountMinor, commission: 0, handover: true })),
      ].sort((a, b) => a.at.localeCompare(b.at))
    : [];
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Label htmlFor="stmt-month">{t.month}</Label>
        <input id="stmt-month" type="month" value={ym} onChange={(e) => e.target.value && setYm(e.target.value)} className="rounded-lg border border-obsidian-700 bg-obsidian-950 px-2 py-1 text-sm text-slate-100" />
      </div>
      {s && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Metric label={t.vouchers} value={String(s.vouchers.count)} hint={KES(s.vouchers.amountMinor)} />
            <Metric label={t.collections} value={String(s.collections.count)} hint={KES(s.collections.amountMinor)} />
          </div>
          <Panel padded>
            <dl className="grid grid-cols-[1fr_auto] gap-y-2 text-sm">
              <dt className="text-slate-400">{t.opening}</dt>
              <dd className="text-right tabular-nums text-slate-200">{KES(s.openingBalanceMinor)}</dd>
              <dt className="text-slate-400">+ {t.taken}</dt>
              <dd className="text-right tabular-nums text-slate-200">{KES(s.takenMinor)}</dd>
              <dt className="text-slate-400">− {t.commission}</dt>
              <dd className="text-right tabular-nums text-slate-200">{KES(s.commissionMinor)}</dd>
              <dt className="text-slate-400">− {t.handedOver}</dt>
              <dd className="text-right tabular-nums text-slate-200">{KES(s.handedOverMinor)}</dd>
              <dt className="border-t border-obsidian-800 pt-2 font-medium text-white">{t.closing}</dt>
              <dd className="border-t border-obsidian-800 pt-2 text-right font-semibold tabular-nums text-white">{KES(s.closingBalanceMinor)}</dd>
            </dl>
          </Panel>
          {rows.length === 0 ? (
            <p className="text-sm text-slate-400">{t.nothing}</p>
          ) : (
            <ul className="divide-y divide-obsidian-800 rounded-xl border border-obsidian-800 text-sm">
              {rows.map((r) => (
                <li key={r.id} className="flex items-start justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-slate-200">{r.what}</p>
                    <p className="text-xs text-slate-500">{new Date(r.at).toLocaleDateString([], { day: "numeric", month: "short" })}</p>
                  </div>
                  <div className="shrink-0 text-right tabular-nums">
                    <p className={r.handover ? "text-emerald-300" : "text-white"}>{r.handover ? `−${KES(r.amount)}` : KES(r.amount)}</p>
                    {r.commission > 0 && (
                      <p className="text-xs text-slate-500">
                        {t.yours} {KES(r.commission)}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

export { S as AGENT_STRINGS };
export type { Statement as AgentStatementData };
