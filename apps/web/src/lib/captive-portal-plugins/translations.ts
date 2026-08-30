export interface TranslationDictionary {
  welcomeTitle: string;
  welcomeSubtitle: string;
  selectPackage: string;
  redeemVoucher: string;
  enterVoucherCode: string;
  connectButton: string;
  connectingText: string;
  buyWithMpesa: string;
  buyWithPaystack: string;
  phoneNumber: string;
  emailAddress: string;
  payNowButton: string;
  memberLogin: string;
  memberPhone: string;
  memberPassword: string;
  supportHelp: string;
  whatsappHelp: string;
  callHelp: string;
  faqTitle: string;
  timeRemaining: string;
  dataRemaining: string;
  statusOnline: string;
  disconnectButton: string;
  scanQrTitle: string;
  scanQrSubtitle: string;
  popularBadge: string;
  bestValueBadge: string;
  duration: string;
  speed: string;
  paymentSuccess: string;
  paymentFailed: string;
  voucherNotFound: string;
}

export const EN_DICTIONARY: TranslationDictionary = {
  welcomeTitle: "High-Speed Wi-Fi Portal",
  welcomeSubtitle: "Select a package or redeem your voucher to connect instantly.",
  selectPackage: "Choose Your Wi-Fi Package",
  redeemVoucher: "Redeem Voucher",
  enterVoucherCode: "Enter 8-digit voucher code",
  connectButton: "Connect to Wi-Fi",
  connectingText: "Authenticating session…",
  buyWithMpesa: "Lipa na M-Pesa",
  buyWithPaystack: "Card / Bank Checkout",
  phoneNumber: "Safaricom Phone Number (07...)",
  emailAddress: "Email Address",
  payNowButton: "Send M-Pesa STK Prompt",
  memberLogin: "Subscriber Account",
  memberPhone: "Registered Phone Number",
  memberPassword: "Account Password",
  supportHelp: "Need Help?",
  whatsappHelp: "Chat on WhatsApp",
  callHelp: "Call Support Helpline",
  faqTitle: "Frequently Asked Questions",
  timeRemaining: "Time Remaining",
  dataRemaining: "Data Remaining",
  statusOnline: "Connected & Active",
  disconnectButton: "Disconnect",
  scanQrTitle: "Scan Wi-Fi QR Code",
  scanQrSubtitle: "Scan with your phone camera to connect without typing credentials",
  popularBadge: "MOST POPULAR",
  bestValueBadge: "BEST VALUE",
  duration: "Duration",
  speed: "Speed",
  paymentSuccess: "Payment confirmed! Enjoy high-speed browsing.",
  paymentFailed: "Payment was not completed. Please try again.",
  voucherNotFound: "Voucher code not found or already expired.",
};

export const SW_DICTIONARY: TranslationDictionary = {
  welcomeTitle: "Tovuti ya Mtandao wa Kasi",
  welcomeSubtitle: "Chagua kifurushi au weka vocha ili uunganishwe mara moja.",
  selectPackage: "Chagua Kifurushi Chako",
  redeemVoucher: "Tumia Vocha Yako",
  enterVoucherCode: "Weka nambari ya vocha ya tarakimu 8",
  connectButton: "Unganisha Mtandaoni",
  connectingText: "Inathibitisha akaunti yako…",
  buyWithMpesa: "Lipa na M-Pesa",
  buyWithPaystack: "Lipa kwa Kadi ya Benki",
  phoneNumber: "Nambari ya Simu ya Safaricom (07...)",
  emailAddress: "Barua Pepe",
  payNowButton: "Tuma Ombi la M-Pesa",
  memberLogin: "Akaunti ya Mteja",
  memberPhone: "Nambari ya Simu Iliyosajiliwa",
  memberPassword: "Nenosiri la Akaunti",
  supportHelp: "Unahitaji Msaada?",
  whatsappHelp: "Wasiliana kwa WhatsApp",
  callHelp: "Piga Simu kwa Msaada",
  faqTitle: "Maswali Yanayoulizwa Mara kwa Mara",
  timeRemaining: "Muda Uliosalia",
  dataRemaining: "Data Iliyosalia",
  statusOnline: "Imeunganishwa & Inafanya Kazi",
  disconnectButton: "Tenganisha",
  scanQrTitle: "Piga Picha ya QR ya Wi-Fi",
  scanQrSubtitle: "Tumia kamera yako kuunganisha bila kuandika nenosiri",
  popularBadge: "INAYOPENDWA ZAIDI",
  bestValueBadge: "OFISI BORA",
  duration: "Muda",
  speed: "Kasi",
  paymentSuccess: "Malipo yamekamilika! Furahia intaneti yenye kasi.",
  paymentFailed: "Malipo hayakukamilika. Tafadhali jaribu tena.",
  voucherNotFound: "Nambari ya vocha haijapatikana au imekwisha muda.",
};

export function getDictionary(lang: "en" | "sw", customEn?: Record<string, string>, customSw?: Record<string, string>): TranslationDictionary {
  const base = lang === "sw" ? SW_DICTIONARY : EN_DICTIONARY;
  const custom = lang === "sw" ? customSw : customEn;
  if (!custom) return base;
  return { ...base, ...custom };
}
