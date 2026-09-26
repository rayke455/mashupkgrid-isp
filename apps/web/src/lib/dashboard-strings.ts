import type { PortalLanguage } from "./portal-strings";

/** The dashboard chrome (header, sidebar footer, palette) and the home page, in EN and SW. */
export interface DashboardStrings {
  language: string;
  theme: string;
  dark: string;
  light: string;
  loading: string;
  operator: string;
  platformAdmin: string;
  signedIn: string;
  superAdmin: string;
  staff: string;
  customer: string;
  signOut: string;
  openMenu: string;
  closeMenu: string;
  trial: string;
  trialExpired: string;
  search: string;
  searchPlaceholder: string;
  searchAria: string;
  noResults: string;
  // Home page
  greeting: (part: "morning" | "afternoon" | "evening", name: string) => string;
  homeDescription: string;
  platformOverview: string;
  platformDescription: string;
  collected30: string;
  payments: (n: number) => string;
  paymentsWord: string;
  outstandingInvoices: string;
  overdue: (n: number) => string;
  open: (n: number) => string;
  customers: string;
  customersHint: string;
  routersOnline: string;
  noRoutersYet: string;
  offline: (n: number) => string;
  allOnline: string;
  notReporting: (n: number) => string;
  vlans: string;
  failedToProvision: (n: number) => string;
  enabled: (n: number) => string;
  automation: string;
  supportTickets: string;
  ticketsOverdue: (n: number) => string;
  ticketsOnTime: string;
  stopped: string;
  workerNotRunning: string;
  needsAttention: string;
  jobsFailing: (n: number) => string;
  running: string;
  jobsHealthy: (n: number) => string;
  routers: string;
  routersDescription: string;
  revenue: string;
  revenueDescription: string;
  noPayments30: string;
  paymentsWillChart: string;
  paymentsOverDays: (payments: number, days: number) => string;
  bandwidth: string;
  bandwidthDescription: (total: string) => string;
  range: string;
  days: (n: number) => string;
  noUsage: string;
  usageAppears: string;
  download: string;
  upload: string;
  busiestDay: string;
  topUsers: string;
  topUsersDescription: string;
  sessions: string;
  recentPayments: string;
  viewAll: string;
  reference: string;
  method: string;
  amount: string;
  date: string;
  status: string;
}

const EN: DashboardStrings = {
  language: "Language",
  theme: "Theme",
  dark: "Dark",
  light: "Light",
  loading: "Loading…",
  operator: "Operator",
  platformAdmin: "Platform admin",
  signedIn: "Signed in",
  superAdmin: "Super admin",
  staff: "Staff",
  customer: "Customer",
  signOut: "Sign out",
  openMenu: "Open navigation menu",
  closeMenu: "Close navigation menu",
  trial: "Trial",
  trialExpired: "Trial expired",
  search: "Search…",
  searchPlaceholder: "Where to? Type a page or an action…",
  searchAria: "Search pages and actions",
  noResults: "Nothing matches",
  greeting: (part, name) => `Good ${part}, ${name}`,
  homeDescription: "Your customers, routers and payments at a glance.",
  platformOverview: "Platform overview",
  platformDescription: "ISPs on the platform, platform status and where to manage them.",
  collected30: "Collected, last 30 days",
  payments: (n) => `${n} payment${n === 1 ? "" : "s"}`,
  paymentsWord: "Payments",
  outstandingInvoices: "Outstanding invoices",
  overdue: (n) => `${n} overdue`,
  open: (n) => `${n} open`,
  customers: "Customers",
  customersHint: "PPPoE and hotspot",
  routersOnline: "Routers online",
  noRoutersYet: "No routers linked yet",
  offline: (n) => `${n} offline`,
  allOnline: "All online",
  notReporting: (n) => `${n} not reporting`,
  vlans: "VLANs",
  failedToProvision: (n) => `${n} failed to provision`,
  enabled: (n) => `${n} enabled`,
  automation: "Automation",
  supportTickets: "Open tickets",
  ticketsOverdue: (n) => `${n} waiting too long for a reply`,
  ticketsOnTime: "All within response targets",
  stopped: "Stopped",
  workerNotRunning: "Worker is not running",
  needsAttention: "Needs attention",
  jobsFailing: (n) => `${n} job${n === 1 ? "" : "s"} failing or late`,
  running: "Running",
  jobsHealthy: (n) => `${n} scheduled jobs healthy`,
  routers: "Routers",
  routersDescription: "Status as last reported by each router",
  revenue: "Revenue",
  revenueDescription: "Completed payments per day, last 30 days",
  noPayments30: "No payments in the last 30 days",
  paymentsWillChart: "Payments will be charted here as they come in.",
  paymentsOverDays: (p, d) => `${p} payment${p === 1 ? "" : "s"} over ${d} day${d === 1 ? "" : "s"}`,
  bandwidth: "Bandwidth",
  bandwidthDescription: (total) => `Download and upload from RADIUS accounting · ${total} in total`,
  range: "Range",
  days: (n) => `${n} days`,
  noUsage: "No usage recorded yet",
  usageAppears: "Usage appears once customers are online through a linked router.",
  download: "Download",
  upload: "Upload",
  busiestDay: "Busiest day",
  topUsers: "Top users",
  topUsersDescription: "Most data used, last 30 days",
  sessions: "Sessions",
  recentPayments: "Recent payments",
  viewAll: "View all",
  reference: "Reference",
  method: "Method",
  amount: "Amount",
  date: "Date",
  status: "Status",
};

const SW: DashboardStrings = {
  language: "Lugha",
  theme: "Mandhari",
  dark: "Giza",
  light: "Mwanga",
  loading: "Inapakia…",
  operator: "Mwendeshaji",
  platformAdmin: "Msimamizi wa jukwaa",
  signedIn: "Umeingia",
  superAdmin: "Msimamizi mkuu",
  staff: "Wafanyakazi",
  customer: "Mteja",
  signOut: "Toka",
  openMenu: "Fungua menyu",
  closeMenu: "Funga menyu",
  trial: "Jaribio",
  trialExpired: "Jaribio limeisha",
  search: "Tafuta…",
  searchPlaceholder: "Unaenda wapi? Andika ukurasa au kitendo…",
  searchAria: "Tafuta kurasa na vitendo",
  noResults: "Hakuna kinacholingana",
  greeting: (part, name) => `${part === "morning" ? "Habari ya asubuhi" : part === "afternoon" ? "Habari ya mchana" : "Habari ya jioni"}, ${name}`,
  homeDescription: "Wateja wako, ruta na malipo kwa mtazamo mmoja.",
  platformOverview: "Muhtasari wa jukwaa",
  platformDescription: "ISP zilizo kwenye jukwaa, hali ya jukwaa na mahali pa kuzisimamia.",
  collected30: "Kilichokusanywa, siku 30 zilizopita",
  payments: (n) => `Malipo ${n}`,
  paymentsWord: "Malipo",
  outstandingInvoices: "Ankara zinazodaiwa",
  overdue: (n) => `${n} zimechelewa`,
  open: (n) => `${n} wazi`,
  customers: "Wateja",
  customersHint: "PPPoE na hotspot",
  routersOnline: "Ruta zilizo mtandaoni",
  noRoutersYet: "Hakuna ruta iliyounganishwa bado",
  offline: (n) => `${n} nje ya mtandao`,
  allOnline: "Zote ziko mtandaoni",
  notReporting: (n) => `${n} haziripoti`,
  vlans: "VLAN",
  failedToProvision: (n) => `${n} zimeshindwa kusanidiwa`,
  enabled: (n) => `${n} zimewashwa`,
  automation: "Otomatiki",
  supportTickets: "Tiketi zilizo wazi",
  ticketsOverdue: (n) => `${n} zimesubiri jibu kwa muda mrefu`,
  ticketsOnTime: "Zote ndani ya muda wa majibu",
  stopped: "Imesimama",
  workerNotRunning: "Mfanyakazi wa nyuma haufanyi kazi",
  needsAttention: "Inahitaji uangalizi",
  jobsFailing: (n) => `Kazi ${n} zinashindwa au zimechelewa`,
  running: "Inafanya kazi",
  jobsHealthy: (n) => `Kazi ${n} zilizopangwa ziko sawa`,
  routers: "Ruta",
  routersDescription: "Hali kama ilivyoripotiwa mwisho na kila ruta",
  revenue: "Mapato",
  revenueDescription: "Malipo yaliyokamilika kwa siku, siku 30 zilizopita",
  noPayments30: "Hakuna malipo katika siku 30 zilizopita",
  paymentsWillChart: "Malipo yataonyeshwa hapa yanapoingia.",
  paymentsOverDays: (p, d) => `Malipo ${p} katika siku ${d}`,
  bandwidth: "Matumizi ya data",
  bandwidthDescription: (total) => `Kupakua na kupakia kutoka RADIUS · jumla ${total}`,
  range: "Kipindi",
  days: (n) => `Siku ${n}`,
  noUsage: "Hakuna matumizi yaliyorekodiwa bado",
  usageAppears: "Matumizi yanaonekana wateja wanapokuwa mtandaoni kupitia ruta iliyounganishwa.",
  download: "Kupakua",
  upload: "Kupakia",
  busiestDay: "Siku yenye shughuli nyingi",
  topUsers: "Watumiaji wakuu",
  topUsersDescription: "Waliotumia data nyingi zaidi, siku 30 zilizopita",
  sessions: "Vikao",
  recentPayments: "Malipo ya hivi karibuni",
  viewAll: "Ona yote",
  reference: "Rejea",
  method: "Njia",
  amount: "Kiasi",
  date: "Tarehe",
  status: "Hali",
};

export function dashboardStrings(lang: PortalLanguage): DashboardStrings {
  return lang === "sw" ? SW : EN;
}
