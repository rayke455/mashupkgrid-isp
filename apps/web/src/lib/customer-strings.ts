/**
 * Everything the signed-in customer portal says, in English and Kiswahili. The EN/SW control in
 * the portal header picks one; the choice is stored on the device with the same key the captive
 * portal uses, so a customer who chose Kiswahili at the hotspot sees Kiswahili here too.
 */
import type { PortalLanguage } from "./portal-strings";

export interface CustomerStrings {
  language: string;
  loadingAccount: string;
  notLinkedTitle: string;
  notLinkedBody: string;
  hello: (firstName: string) => string;
  account: (number: string) => string;
  payNow: (amount: string) => string;
  suspendedNotice: string;
  subscriptionIs: (status: string) => string;
  internet: string;
  on: string;
  suspended: string;
  noPlan: string;
  downUp: (down: string, up: string) => string;
  askSupportPlan: string;
  nextBill: string;
  daysAgo: (n: number) => string;
  today: string;
  inDays: (n: number) => string;
  amountDue: string;
  nothingOutstanding: string;
  openInvoices: (n: number) => string;
  wallet: string;
  walletHint: string;
  payInvoiceWith: (invoice: string) => string;
  due: (amount: string, date: string) => string;
  cancel: string;
  mpesaPhone: string;
  sendingPrompt: string;
  sendPrompt: string;
  paidThankYou: (receipt: string) => string;
  receiptPending: string;
  switchingBackOn: string;
  done: string;
  promptCancelled: string;
  paymentFailed: (reason: string | null) => string;
  tryAgain: string;
  checkPhone: string;
  invoices: string;
  noInvoices: string;
  invoice: string;
  dueHeader: string;
  amount: string;
  status: string;
  left: string;
  pay: string;
  myPlan: string;
  noPlanYet: string;
  renews: (date: string) => string;
  showPppoe: string;
  walletDesc: string;
  noWalletActivity: string;
  support: string;
  supportDesc: string;
  newRequest: string;
  subject: string;
  subjectPlaceholder: string;
  whatsHappening: string;
  sending: string;
  send: string;
  noRequests: string;
  supportLabel: string;
  you: string;
  replyPlaceholder: string;
  couldNotStartPayment: string;
  failedReveal: string;
  failedTicket: string;
  failedReply: string;
}

const EN: CustomerStrings = {
  language: "Language",
  loadingAccount: "Loading your account…",
  notLinkedTitle: "Your account is not linked yet",
  notLinkedBody:
    "Your login isn’t connected to a subscriber record yet. Contact support with your account email and they’ll link it. This usually happens right after installation.",
  hello: (n) => `Hello, ${n}`,
  account: (n) => `Account ${n}`,
  payNow: (a) => `Pay ${a} now`,
  suspendedNotice: "Your internet is suspended because of an unpaid invoice. It comes back on automatically within a minute of your payment.",
  subscriptionIs: (s) => `Your subscription is ${s}.`,
  internet: "Internet",
  on: "On",
  suspended: "Suspended",
  noPlan: "No plan",
  downUp: (d, u) => `${d} down / ${u} up`,
  askSupportPlan: "Ask support to set up your plan",
  nextBill: "Next bill",
  daysAgo: (n) => `${n} day${n === 1 ? "" : "s"} ago`,
  today: "Today",
  inDays: (n) => `In ${n} day${n === 1 ? "" : "s"}`,
  amountDue: "Amount due",
  nothingOutstanding: "Nothing outstanding",
  openInvoices: (n) => `${n} open invoice${n === 1 ? "" : "s"}`,
  wallet: "Wallet",
  walletHint: "Credit applied to your next bill",
  payInvoiceWith: (i) => `Pay ${i} with M-Pesa`,
  due: (a, d) => `${a} due ${d}`,
  cancel: "Cancel",
  mpesaPhone: "M-Pesa phone number",
  sendingPrompt: "Sending prompt…",
  sendPrompt: "Send M-Pesa prompt",
  paidThankYou: (r) => `Paid, thank you. Receipt ${r}.`,
  receiptPending: "pending",
  switchingBackOn: "Your internet is being switched back on now.",
  done: "Done",
  promptCancelled: "The prompt was cancelled on your phone.",
  paymentFailed: (r) => `Payment failed${r ? `: ${r}` : "."}`,
  tryAgain: "Try again",
  checkPhone: "Check your phone and enter your M-Pesa PIN to complete the payment. This updates on its own.",
  invoices: "Invoices",
  noInvoices: "No invoices yet",
  invoice: "Invoice",
  dueHeader: "Due",
  amount: "Amount",
  status: "Status",
  left: "left",
  pay: "Pay",
  myPlan: "My plan",
  noPlanYet: "No plan on this account yet.",
  renews: (d) => `Renews ${d}`,
  showPppoe: "Show PPPoE login",
  walletDesc: "Credit and adjustments on your account",
  noWalletActivity: "No wallet activity yet.",
  support: "Support",
  supportDesc: "Tell us what’s wrong and we’ll reply here.",
  newRequest: "New request",
  subject: "Subject",
  subjectPlaceholder: "e.g. My connection keeps dropping",
  whatsHappening: "What’s happening?",
  sending: "Sending…",
  send: "Send",
  noRequests: "No support requests yet.",
  supportLabel: "Support",
  you: "You",
  replyPlaceholder: "Reply…",
  couldNotStartPayment: "Could not start the M-Pesa payment",
  failedReveal: "Failed to reveal password",
  failedTicket: "Failed to raise ticket",
  failedReply: "Failed to send reply",
};

const SW: CustomerStrings = {
  language: "Lugha",
  loadingAccount: "Inapakia akaunti yako…",
  notLinkedTitle: "Akaunti yako bado haijaunganishwa",
  notLinkedBody:
    "Kuingia kwako bado hakujaunganishwa na rekodi ya mteja. Wasiliana na msaada ukitumia barua pepe ya akaunti yako na wataiunganisha. Kwa kawaida hufanyika mara tu baada ya usakinishaji.",
  hello: (n) => `Habari, ${n}`,
  account: (n) => `Akaunti ${n}`,
  payNow: (a) => `Lipa ${a} sasa`,
  suspendedNotice: "Intaneti yako imesimamishwa kwa sababu ya ankara ambayo haijalipwa. Inarudi yenyewe ndani ya dakika moja baada ya malipo yako.",
  subscriptionIs: (s) => `Usajili wako uko ${s}.`,
  internet: "Intaneti",
  on: "Inafanya kazi",
  suspended: "Imesimamishwa",
  noPlan: "Hakuna kifurushi",
  downUp: (d, u) => `${d} kupakua / ${u} kupakia`,
  askSupportPlan: "Omba msaada wakuwekee kifurushi",
  nextBill: "Ankara ijayo",
  daysAgo: (n) => `Siku ${n} zilizopita`,
  today: "Leo",
  inDays: (n) => `Baada ya siku ${n}`,
  amountDue: "Kiasi kinachodaiwa",
  nothingOutstanding: "Hakuna deni",
  openInvoices: (n) => `Ankara ${n} ${n === 1 ? "iliyo" : "zilizo"} wazi`,
  wallet: "Pochi",
  walletHint: "Salio litatumika kwenye ankara yako ijayo",
  payInvoiceWith: (i) => `Lipa ${i} kwa M-Pesa`,
  due: (a, d) => `${a} inadaiwa ${d}`,
  cancel: "Ghairi",
  mpesaPhone: "Nambari ya simu ya M-Pesa",
  sendingPrompt: "Inatuma ombi…",
  sendPrompt: "Tuma ombi la M-Pesa",
  paidThankYou: (r) => `Imelipwa, asante. Risiti ${r}.`,
  receiptPending: "inasubiri",
  switchingBackOn: "Intaneti yako inawashwa tena sasa.",
  done: "Imekamilika",
  promptCancelled: "Ombi lilighairiwa kwenye simu yako.",
  paymentFailed: (r) => `Malipo hayakufaulu${r ? `: ${r}` : "."}`,
  tryAgain: "Jaribu tena",
  checkPhone: "Angalia simu yako na uweke PIN yako ya M-Pesa kukamilisha malipo. Hali hii inajisasisha yenyewe.",
  invoices: "Ankara",
  noInvoices: "Hakuna ankara bado",
  invoice: "Ankara",
  dueHeader: "Tarehe",
  amount: "Kiasi",
  status: "Hali",
  left: "imesalia",
  pay: "Lipa",
  myPlan: "Kifurushi changu",
  noPlanYet: "Hakuna kifurushi kwenye akaunti hii bado.",
  renews: (d) => `Inasasishwa ${d}`,
  showPppoe: "Onyesha akaunti ya PPPoE",
  walletDesc: "Salio na marekebisho kwenye akaunti yako",
  noWalletActivity: "Hakuna shughuli za pochi bado.",
  support: "Msaada",
  supportDesc: "Tuambie tatizo na tutakujibu hapa.",
  newRequest: "Ombi jipya",
  subject: "Mada",
  subjectPlaceholder: "mfano: Muunganisho wangu unakatika mara kwa mara",
  whatsHappening: "Nini kinaendelea?",
  sending: "Inatuma…",
  send: "Tuma",
  noRequests: "Hakuna maombi ya msaada bado.",
  supportLabel: "Msaada",
  you: "Wewe",
  replyPlaceholder: "Jibu…",
  couldNotStartPayment: "Imeshindwa kuanzisha malipo ya M-Pesa",
  failedReveal: "Imeshindwa kuonyesha nenosiri",
  failedTicket: "Imeshindwa kutuma ombi",
  failedReply: "Imeshindwa kutuma jibu",
};

export function customerStrings(lang: PortalLanguage): CustomerStrings {
  return lang === "sw" ? SW : EN;
}
