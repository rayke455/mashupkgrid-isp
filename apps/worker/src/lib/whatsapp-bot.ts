import { Redis } from "ioredis";
import { prisma } from "@mashupkgrid/database";
import { env } from "@mashupkgrid/config";
import { listHotspotPackages } from "@mashupkgrid/radius";
import { initiateHotspotPurchaseStkPush } from "@mashupkgrid/payments";
import { createTicket } from "@mashupkgrid/support";
import { sendWhatsAppMessage, type WASocket } from "@mashupkgrid/whatsapp";
import { formatMoney, formatDuration } from "./format.js";

/**
 * The inbound half of the WhatsApp integration: a numbered self-service menu customers drive by
 * replying with digits, mirroring the flow the marketing site advertises
 * (apps/web's whatsapp-bot-simulator.tsx). Deliberately menu-driven rather than AI-backed — every
 * branch is a fixed, auditable action against real data, with no per-message model cost and no
 * chance of a hallucinated answer about someone's balance or a payment.
 *
 * Conversation state lives in Redis with a short TTL (not the database): a half-finished menu
 * walk is throwaway UI state, and expiring it means a customer who wanders off mid-flow simply
 * gets a fresh menu next time instead of resuming something stale.
 */

const SESSION_TTL_SECONDS = 15 * 60;

const redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: 3 });
redis.on("error", (err) => console.error("[whatsapp-bot] redis error", err));

type BotState = "main" | "buy_pick_package" | "outage_awaiting_description" | "support_awaiting_message";

interface BotSession {
  state: BotState;
  tenantId?: string;
  /** Package ids in the exact order they were listed, so the customer's "2" maps back to the
   *  package they actually saw at position 2 rather than whatever order a re-query returns. */
  packageIds?: string[];
}

function sessionKey(phone: string): string {
  return `wa-bot:${phone}`;
}

async function loadSession(phone: string): Promise<BotSession> {
  try {
    const raw = await redis.get(sessionKey(phone));
    if (raw) return JSON.parse(raw) as BotSession;
  } catch (err) {
    console.error("[whatsapp-bot] failed to load session", err);
  }
  return { state: "main" };
}

async function saveSession(phone: string, session: BotSession): Promise<void> {
  try {
    await redis.set(sessionKey(phone), JSON.stringify(session), "EX", SESSION_TTL_SECONDS);
  } catch (err) {
    console.error("[whatsapp-bot] failed to save session", err);
  }
}

/** WhatsApp JIDs carry the full international number ("254703605266@s.whatsapp.net") while
 *  Customer.phone is entered by staff in whatever local shape they like ("0703605266",
 *  "+254 703 605 266"). Matching on the last 9 digits — the part that is actually the subscriber
 *  number, after any country code or trunk "0" — is what makes those line up without forcing a
 *  data migration on every tenant's existing customer list. */
function subscriberDigits(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.slice(-9);
}

async function mainMenu(tenantName: string): Promise<string> {
  return [
    `Welcome to *${tenantName}* 👋`,
    "",
    "How can we help today?",
    "",
    "1️⃣  Check balance & renew",
    "2️⃣  Buy Wi-Fi voucher",
    "3️⃣  Report an outage",
    "4️⃣  Talk to support",
    "",
    'Reply with a number. Send "menu" anytime to start over.',
  ].join("\n");
}

async function handleBalance(tenantId: string, phone: string): Promise<string> {
  const tail = subscriberDigits(phone);
  const customer = await prisma.customer.findFirst({
    where: { tenantId, phone: { endsWith: tail }, deletedAt: null },
    include: {
      services: { where: { status: "ACTIVE" }, include: { package: true }, take: 1 },
    },
  });

  if (!customer) {
    return [
      "We couldn't find a subscriber account for this number.",
      "",
      'If you use our Wi-Fi hotspot, reply "2" to buy a voucher instead.',
      'Reply "4" if you think this is a mistake and want to talk to support.',
    ].join("\n");
  }

  const unpaid = await prisma.invoice.findMany({
    where: { tenantId, customerId: customer.id, status: { in: ["PENDING", "PARTIALLY_PAID", "OVERDUE"] } },
    orderBy: { dueDate: "asc" },
  });
  const outstandingMinor = unpaid.reduce((sum, inv) => sum + (inv.totalMinor - inv.amountPaidMinor), 0);
  const service = customer.services[0];

  const lines = [`👤 *${customer.fullName}* (${customer.customerNumber})`, `Status: ${customer.status}`];
  if (service) {
    lines.push(`📦 Plan: ${service.package.name}`);
    lines.push(`📅 Next billing: ${service.nextBillingAt.toDateString()}`);
  }
  lines.push("");
  if (outstandingMinor > 0) {
    const currency = unpaid[0]?.currency ?? "KES";
    lines.push(`💰 Outstanding: *${formatMoney(outstandingMinor, currency)}* across ${unpaid.length} invoice(s).`);
    lines.push("");
    lines.push("To pay, use our Paybill or reply \"4\" and support will send you a payment prompt.");
  } else {
    lines.push("✅ You have no outstanding balance. Thank you!");
  }
  lines.push("", 'Send "menu" to go back.');
  return lines.join("\n");
}

async function handleBuyList(tenantId: string, session: BotSession): Promise<string> {
  const packages = (await listHotspotPackages(tenantId)).filter((p) => p.isActive);
  if (packages.length === 0) {
    return 'No Wi-Fi packages are available right now. Send "menu" to go back.';
  }

  session.state = "buy_pick_package";
  session.packageIds = packages.map((p) => p.id);

  const lines = ["📶 *Choose a Wi-Fi plan:*", ""];
  packages.forEach((p, i) => {
    const bits = [formatMoney(p.priceMinor, p.currency), formatDuration(p.durationMinutes)];
    if (p.dataCapMb) bits.push(`${p.dataCapMb} MB`);
    lines.push(`${i + 1}. *${p.name}* — ${bits.join(" · ")}`);
  });
  lines.push("", 'Reply with the plan number to pay via M-Pesa, or "menu" to go back.');
  return lines.join("\n");
}

async function handleBuyPick(tenantId: string, phone: string, session: BotSession, choice: number): Promise<string> {
  const packageId = session.packageIds?.[choice - 1];
  if (!packageId) {
    return 'That plan number isn\'t on the list. Reply with a number from the list above, or send "menu" to start over.';
  }

  try {
    await initiateHotspotPurchaseStkPush(tenantId, { hotspotPackageId: packageId, phone });
  } catch (err) {
    console.error("[whatsapp-bot] STK push failed", err);
    return [
      "⚠️ We couldn't start the M-Pesa payment just now.",
      "",
      'Please try again in a moment, or reply "4" to talk to support.',
    ].join("\n");
  }

  session.state = "main";
  session.packageIds = undefined;
  return [
    "📲 An M-Pesa payment request has been sent to this number.",
    "",
    "Enter your M-Pesa PIN to complete the purchase — your voucher code will arrive here automatically the moment payment confirms.",
  ].join("\n");
}

async function handleTicket(
  tenantId: string,
  phone: string,
  text: string,
  kind: "outage" | "support"
): Promise<string> {
  const tail = subscriberDigits(phone);
  const customer = await prisma.customer.findFirst({
    where: { tenantId, phone: { endsWith: tail }, deletedAt: null },
    select: { id: true, fullName: true },
  });

  const ticket = await createTicket(tenantId, {
    customerId: customer?.id ?? null,
    contactName: customer?.fullName ?? "WhatsApp customer",
    contactPhone: phone,
    subject: kind === "outage" ? "Outage reported via WhatsApp" : "Support request via WhatsApp",
    body: text,
    source: "whatsapp",
    // An outage is a service-down report, which is what the HIGH tier exists for; a general
    // question rides the default so it doesn't jump ahead of genuinely broken connections.
    ...(kind === "outage" ? { priority: "HIGH" as const } : {}),
  });

  // Tickets have no human-facing number column — they're keyed by UUID, which is unreadable to
  // quote over the phone. The leading 8 characters are enough for a customer to reference and for
  // staff to find the row by prefix, the same way a short commit hash works.
  const reference = ticket.id.slice(0, 8).toUpperCase();

  return [
    kind === "outage" ? "🛠️ Outage reported — thank you." : "✅ Message received — thank you.",
    "",
    `Your reference is *${reference}*.`,
    "Our team will get back to you here.",
    "",
    'Send "menu" to go back.',
  ].join("\n");
}

/**
 * Entry point wired to the socket's inbound-message event. Never throws: an unhandled rejection
 * here would surface as an unhandled promise rejection in the worker rather than anything the
 * customer or an operator can act on, so every failure is logged and answered with a plain
 * apology instead.
 */
export async function handleIncomingWhatsAppMessage(
  sock: WASocket | null,
  tenantId: string,
  fromJid: string,
  text: string
): Promise<void> {
  // Groups, channels/newsletters and status broadcasts all arrive on this same event — a bot
  // that answered those would spam every group the paired account belongs to.
  if (!fromJid.endsWith("@s.whatsapp.net")) return;
  if (!sock) return;

  const phone = `+${fromJid.split("@")[0]!.replace(/\D/g, "")}`;
  const input = text.trim();
  const lower = input.toLowerCase();

  try {
    // The tenant is no longer inferred — the message arrived on that ISP's own WhatsApp session,
    // so it is known for certain. This is what removed the old "which internet provider are you
    // with?" prompt, which existed only because one shared line could not tell.
    const session = await loadSession(phone);
    const isReset = ["menu", "0", "hi", "hello", "hey", "start", "help"].includes(lower);
    if (isReset) session.state = "main";
    session.tenantId = tenantId;

    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } });
    const tenantName = tenant?.name ?? "our network";

    // A free-text step (outage/support description) consumes whatever was typed, unless the
    // customer explicitly asked for the menu — otherwise a description that happens to be "2"
    // would silently become a menu choice.
    if (!isReset && session.state === "outage_awaiting_description") {
      const reply = await handleTicket(tenantId, phone, input, "outage");
      session.state = "main";
      await saveSession(phone, session);
      await sendWhatsAppMessage(sock, phone, reply);
      return;
    }
    if (!isReset && session.state === "support_awaiting_message") {
      const reply = await handleTicket(tenantId, phone, input, "support");
      session.state = "main";
      await saveSession(phone, session);
      await sendWhatsAppMessage(sock, phone, reply);
      return;
    }

    if (!isReset && session.state === "buy_pick_package" && /^\d+$/.test(input)) {
      const reply = await handleBuyPick(tenantId, phone, session, Number(input));
      await saveSession(phone, session);
      await sendWhatsAppMessage(sock, phone, reply);
      return;
    }

    if (!isReset && input === "1") {
      const reply = await handleBalance(tenantId, phone);
      await saveSession(phone, session);
      await sendWhatsAppMessage(sock, phone, reply);
      return;
    }
    if (!isReset && input === "2") {
      const reply = await handleBuyList(tenantId, session);
      await saveSession(phone, session);
      await sendWhatsAppMessage(sock, phone, reply);
      return;
    }
    if (!isReset && input === "3") {
      session.state = "outage_awaiting_description";
      await saveSession(phone, session);
      await sendWhatsAppMessage(
        sock,
        phone,
        "🛠️ Sorry about that. Please describe the problem (and your location if you can) and we'll log it right away."
      );
      return;
    }
    if (!isReset && input === "4") {
      session.state = "support_awaiting_message";
      await saveSession(phone, session);
      await sendWhatsAppMessage(sock, phone, "💬 Please type your message and our support team will get back to you.");
      return;
    }

    session.state = "main";
    await saveSession(phone, session);
    await sendWhatsAppMessage(sock, phone, await mainMenu(tenantName));
  } catch (err) {
    console.error("[whatsapp-bot] failed handling message from", phone, err);
    await sendWhatsAppMessage(
      sock,
      phone,
      'Sorry — something went wrong on our side. Please send "menu" to try again.'
    ).catch(() => {});
  }
}
