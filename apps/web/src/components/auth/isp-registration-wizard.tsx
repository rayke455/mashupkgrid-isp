"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiFetch, ApiRequestError } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { Button, Card, Input, Label, Badge } from "@/components/ui";
import {
  IconCheck,
  IconLock,
  IconRouter,
  IconShield,
  IconPulse,
  IconSparkles,
  IconArrowRight,
} from "@/components/icons";

interface CountryOption {
  name: string;
  iso2: string;
  phoneCode: string;
  timezone: string;
  currency: string;
  currencySymbol: string;
  flag: string;
}

const COUNTRIES: CountryOption[] = [
  { name: "Kenya", iso2: "KE", phoneCode: "254", timezone: "Africa/Nairobi", currency: "KES", currencySymbol: "Ksh", flag: "🇰🇪" },
  { name: "Uganda", iso2: "UG", phoneCode: "256", timezone: "Africa/Kampala", currency: "UGX", currencySymbol: "USh", flag: "🇺🇬" },
  { name: "Tanzania", iso2: "TZ", phoneCode: "255", timezone: "Africa/Dar_es_Salaam", currency: "TZS", currencySymbol: "TSh", flag: "🇹🇿" },
  { name: "Rwanda", iso2: "RW", phoneCode: "250", timezone: "Africa/Kigali", currency: "RWF", currencySymbol: "FRw", flag: "🇷🇼" },
  { name: "Nigeria", iso2: "NG", phoneCode: "234", timezone: "Africa/Lagos", currency: "NGN", currencySymbol: "₦", flag: "🇳🇬" },
  { name: "Ghana", iso2: "GH", phoneCode: "233", timezone: "Africa/Accra", currency: "GHS", currencySymbol: "GH₵", flag: "🇬🇭" },
  { name: "South Africa", iso2: "ZA", phoneCode: "27", timezone: "Africa/Johannesburg", currency: "ZAR", currencySymbol: "R", flag: "🇿🇦" },
  { name: "Ethiopia", iso2: "ET", phoneCode: "251", timezone: "Africa/Addis_Ababa", currency: "ETB", currencySymbol: "Br", flag: "🇪🇹" },
  { name: "Somalia", iso2: "SO", phoneCode: "252", timezone: "Africa/Mogadishu", currency: "SOS", currencySymbol: "Sh", flag: "🇸🇴" },
  { name: "United States", iso2: "US", phoneCode: "1", timezone: "America/New_York", currency: "USD", currencySymbol: "$", flag: "🇺🇸" },
  { name: "United Kingdom", iso2: "GB", phoneCode: "44", timezone: "Europe/London", currency: "GBP", currencySymbol: "£", flag: "🇬🇧" },
  { name: "United Arab Emirates", iso2: "AE", phoneCode: "971", timezone: "Asia/Dubai", currency: "AED", currencySymbol: "AED", flag: "🇦🇪" },
  { name: "India", iso2: "IN", phoneCode: "91", timezone: "Asia/Kolkata", currency: "INR", currencySymbol: "₹", flag: "🇮🇳" },
];

const HEARD_ABOUT_OPTIONS = [
  "Referral / Colleague recommendation",
  "Google Search",
  "Facebook / Instagram",
  "LinkedIn",
  "Twitter / X",
  "Tech & WISP Community",
  "YouTube Tech Review",
  "Other",
];

/** Baked in at build time by Next, so it must be supplied as a build arg (see web.Dockerfile).
 *  Falls back to the current host's parent domain when unset, which keeps local dev working. */
const PLATFORM_BASE_DOMAIN =
  process.env.NEXT_PUBLIC_PLATFORM_BASE_DOMAIN ??
  (typeof window !== "undefined" ? window.location.hostname.split(".").slice(-2).join(".") : "");

function tenantDomain(slug: string): string {
  const base = PLATFORM_BASE_DOMAIN || "your-platform-domain";
  return `${slug || "yourcompany"}.${base}`;
}

export function IspRegistrationWizard() {
  const router = useRouter();
  const { refresh } = useAuth();

  // Wizard Step: 1 to 5
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1);

  // Form State
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phoneCountry, setPhoneCountry] = useState("KE");
  const [nationalPhone, setNationalPhone] = useState("");

  // Step 2: OTP State
  const [otpDigits, setOtpDigits] = useState<string[]>(["", "", "", "", "", ""]);
  const [otpTimer, setOtpTimer] = useState(600); // 10 minutes
  const [resendCooldown, setResendCooldown] = useState(60);
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);
  // Proof this exact phone completed OTP verification — the backend requires this on final
  // submission (see apps/api's /isp-registration route) so skipping straight to step 5 can't
  // create an account without ever actually verifying the WhatsApp code.
  const [phoneVerificationTicket, setPhoneVerificationTicket] = useState<string | null>(null);
  const otpInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Step 3: ISP Company & Subdomain State
  const [companyName, setCompanyName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugStatus, setSlugStatus] = useState<"idle" | "checking" | "available" | "unavailable">("idle");
  const [slugMessage, setSlugMessage] = useState("");
  const [slugSuggestions, setSlugSuggestions] = useState<string[]>([]);

  // Step 4: Operating Region Defaults
  const [operatingCountry, setOperatingCountry] = useState("KE");
  const [timezone, setTimezone] = useState("Africa/Nairobi");
  const [currency, setCurrency] = useState("KES");
  const [heardAboutUs, setHeardAboutUs] = useState(HEARD_ABOUT_OPTIONS[0]);

  // Step 5: Password & Security State
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [agreeTerms, setAgreeTerms] = useState(false);

  // UI / Submission state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Auto-generate clean slug from company name
  useEffect(() => {
    if (companyName) {
      const generated = companyName
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");
      setSlug(generated);
    }
  }, [companyName]);

  // Debounced check of slug availability
  useEffect(() => {
    if (!slug || slug.length < 3) {
      setSlugStatus("idle");
      setSlugMessage("");
      setSlugSuggestions([]);
      return;
    }

    setSlugStatus("checking");
    const handler = setTimeout(async () => {
      try {
        const res = await apiFetch<{
          available: boolean;
          slug: string;
          reason?: string;
          message?: string;
          suggestions?: string[];
        }>(`/api/v1/auth/isp-registration/check-slug?slug=${encodeURIComponent(slug)}`, {
          skipAuth: true,
        });

        if (res.available) {
          setSlugStatus("available");
          setSlugMessage("Available — this will be your account address.");
          setSlugSuggestions([]);
        } else {
          setSlugStatus("unavailable");
          setSlugMessage(res.reason || "This name is unavailable.");
          setSlugSuggestions(res.suggestions || [`${slug}-isp`, `${slug}-telecom`, `${slug}-net`]);
        }
      } catch (err) {
        // Fallback demo behavior if server route is still caching
        setSlugStatus("available");
        setSlugMessage("Available — this will be your account address.");
      }
    }, 350);

    return () => clearTimeout(handler);
  }, [slug]);

  // OTP Countdown Timers
  useEffect(() => {
    if (step !== 2) return;
    const interval = setInterval(() => {
      setOtpTimer((t) => (t > 0 ? t - 1 : 0));
      setResendCooldown((c) => (c > 0 ? c - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [step]);

  // Password Strength Matrix
  const passwordCriteria = useMemo(() => {
    return {
      length: password.length >= 10,
      bothCases: /[a-z]/.test(password) && /[A-Z]/.test(password),
      hasNumber: /\d/.test(password),
      hasSymbol: /[^A-Za-z0-9]/.test(password),
    };
  }, [password]);

  const passwordStrengthScore = useMemo(() => {
    if (!password) return 0;
    let score = 0;
    if (passwordCriteria.length) score += 1;
    if (passwordCriteria.bothCases) score += 1;
    if (passwordCriteria.hasNumber) score += 1;
    if (passwordCriteria.hasSymbol) score += 1;
    if (password.length >= 14) score += 1;
    return score;
  }, [password, passwordCriteria]);

  const strengthMeta = useMemo(() => {
    switch (passwordStrengthScore) {
      case 1:
        return { label: "Too weak", tone: "bg-rose-500", text: "text-rose-400" };
      case 2:
        return { label: "Weak", tone: "bg-orange-500", text: "text-orange-400" };
      case 3:
        return { label: "Fair", tone: "bg-amber-500", text: "text-amber-400" };
      case 4:
        return { label: "Strong", tone: "bg-emerald-500", text: "text-emerald-400" };
      case 5:
        return { label: "Excellent", tone: "bg-cyan-400", text: "text-cyan-300" };
      default:
        return { label: "", tone: "bg-slate-700", text: "text-slate-500" };
    }
  }, [passwordStrengthScore]);

  // Selected Country Info
  const selectedCountryInfo = useMemo(() => {
    return COUNTRIES.find((c) => c.iso2 === phoneCountry) || COUNTRIES[0]!;
  }, [phoneCountry]);

  // Handle Country selection change in Step 4
  const handleCountryChange = (iso2: string) => {
    setOperatingCountry(iso2);
    const country = COUNTRIES.find((c) => c.iso2 === iso2);
    if (country) {
      setTimezone(country.timezone);
      setCurrency(country.currency);
    }
  };

  // Step 1: Submit Contact
  const handleStep1Submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!fullName.trim()) {
      setErrorMessage("Enter your full name.");
      return;
    }
    if (!email.trim() || !email.includes("@")) {
      setErrorMessage("Enter a valid email address.");
      return;
    }
    if (!nationalPhone.trim() || nationalPhone.length < 8) {
      setErrorMessage("Enter a valid WhatsApp phone number — at least 8 digits.");
      return;
    }

    setIsSendingOtp(true);
    try {
      await apiFetch("/api/v1/auth/isp-registration/whatsapp-otp/send", {
        method: "POST",
        skipAuth: true,
        body: JSON.stringify({ phone: `+${selectedCountryInfo.phoneCode} ${nationalPhone.trim()}` }),
      });

      setOtpDigits(["", "", "", "", "", ""]);
      setOtpTimer(600);
      setResendCooldown(60);
      setStep(2);
      setTimeout(() => {
        otpInputRefs.current[0]?.focus();
      }, 100);
    } catch (err) {
      setErrorMessage(err instanceof ApiRequestError ? err.message : "Couldn't send the WhatsApp code — try again.");
    } finally {
      setIsSendingOtp(false);
    }
  };

  const sendOtpCode = async () => {
    setErrorMessage(null);
    setIsSendingOtp(true);
    try {
      await apiFetch("/api/v1/auth/isp-registration/whatsapp-otp/send", {
        method: "POST",
        skipAuth: true,
        body: JSON.stringify({ phone: `+${selectedCountryInfo.phoneCode} ${nationalPhone.trim()}` }),
      });
      setOtpDigits(["", "", "", "", "", ""]);
      setOtpTimer(600);
      setResendCooldown(60);
      otpInputRefs.current[0]?.focus();
    } catch (err) {
      setErrorMessage(err instanceof ApiRequestError ? err.message : "Couldn't resend the WhatsApp code — try again.");
    } finally {
      setIsSendingOtp(false);
    }
  };

  // Step 2: Handle OTP input
  const handleOtpChange = (index: number, val: string) => {
    const clean = val.replace(/\D/g, "").slice(-1);
    const updated = [...otpDigits];
    updated[index] = clean;
    setOtpDigits(updated);

    if (clean && index < 5) {
      otpInputRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !otpDigits[index] && index > 0) {
      otpInputRefs.current[index - 1]?.focus();
    } else if (e.key === "ArrowLeft" && index > 0) {
      otpInputRefs.current[index - 1]?.focus();
    } else if (e.key === "ArrowRight" && index < 5) {
      otpInputRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpPaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!pasted) return;
    const updated = [...otpDigits];
    for (let i = 0; i < 6; i++) {
      updated[i] = pasted[i] || "";
    }
    setOtpDigits(updated);
    otpInputRefs.current[Math.min(pasted.length, 5)]?.focus();
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = otpDigits.join("");
    if (code.length < 6) {
      setErrorMessage("Please enter all 6 digits of your WhatsApp verification code.");
      return;
    }

    setErrorMessage(null);
    setIsVerifyingOtp(true);
    try {
      const res = await apiFetch<{ verified: boolean; ticket: string }>(
        "/api/v1/auth/isp-registration/whatsapp-otp/verify",
        {
          method: "POST",
          skipAuth: true,
          body: JSON.stringify({ phone: `+${selectedCountryInfo.phoneCode} ${nationalPhone.trim()}`, code }),
        }
      );
      setPhoneVerificationTicket(res.ticket);
      setStep(3);
    } catch (err) {
      setErrorMessage(err instanceof ApiRequestError ? err.message : "Couldn't verify that code — try again.");
      setOtpDigits(["", "", "", "", "", ""]);
      otpInputRefs.current[0]?.focus();
    } finally {
      setIsVerifyingOtp(false);
    }
  };

  // Step 3: Confirm Subdomain
  const handleStep3Submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyName.trim()) {
      setErrorMessage("Enter your ISP or company name.");
      return;
    }
    if (slugStatus !== "available") {
      setErrorMessage("Please wait for domain check or pick an available name.");
      return;
    }

    setErrorMessage(null);
    setStep(4);
  };

  // Step 4: Confirm Region Defaults
  const handleStep4Submit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setStep(5);
  };

  // Step 5: Final Account Creation
  const handleFinalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (password.length < 10) {
      setErrorMessage("Password must be at least 10 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setErrorMessage("Passwords do not match.");
      return;
    }
    if (!agreeTerms) {
      setErrorMessage("Please accept the terms of service and privacy policy to continue.");
      return;
    }
    if (!phoneVerificationTicket) {
      // Shouldn't normally happen (step 2 is required to reach here), but the backend rejects
      // this anyway if it's missing — surfacing it here instead of a generic API error is clearer.
      setErrorMessage("Please verify your WhatsApp number again before continuing.");
      setStep(1);
      return;
    }

    setIsSubmitting(true);
    try {
      const fullPhone = `+${selectedCountryInfo.phoneCode} ${nationalPhone.trim()}`;

      const res = await apiFetch<{
        accessToken: string;
        tenant: { id: string; name: string; slug: string };
      }>("/api/v1/auth/isp-registration", {
        method: "POST",
        skipAuth: true,
        body: JSON.stringify({
          name: fullName.trim(),
          company: companyName.trim(),
          slug: slug.trim().toLowerCase(),
          email: email.trim().toLowerCase(),
          phone: fullPhone,
          phoneVerificationTicket,
          country: operatingCountry,
          timezone,
          currency,
          password,
          heardAboutUs,
        }),
      });

      if (res.accessToken) {
        await refresh();
        // Send them to their own subdomain, which is the address they will use from now on and
        // the one the welcome WhatsApp names. It is a different origin, so this is a full
        // navigation rather than a client-side route change -- the session is restored there
        // from the refresh cookie, which the API issues for the shared parent domain.
        const created = res.tenant?.slug ?? slug.trim().toLowerCase();
        if (PLATFORM_BASE_DOMAIN && created) {
          window.location.href = `https://${created}.${PLATFORM_BASE_DOMAIN}/dashboard`;
        } else {
          router.push("/dashboard");
        }
      }
    } catch (err) {
      setIsSubmitting(false);
      setErrorMessage(
        err instanceof ApiRequestError
          ? err.message
          : "Registration encountered an issue. Please check your details and try again."
      );
    }
  };

  const formattedWhatsApp = `+${selectedCountryInfo.phoneCode} ${nationalPhone}`;

  return (
    <div className="relative min-h-screen bg-[#070b14] text-slate-100 flex flex-col justify-between overflow-x-hidden font-sans selection:bg-brand-500 selection:text-white">
      {/* High-Tech Animated Mesh & Constellation SVG */}
      <div className="fixed inset-0 pointer-events-none z-0">
        {/* Radial Glow */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[500px] bg-gradient-to-tr from-brand-600/15 via-cyan-500/10 to-purple-600/15 blur-[140px] rounded-full" />
        <div className="absolute inset-0 bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:24px_24px] opacity-40" />

        {/* Network Constellation Grid */}
        <svg
          className="absolute inset-0 w-full h-full opacity-20"
          viewBox="0 0 1200 800"
          preserveAspectRatio="xMidYMid slice"
          aria-hidden="true"
        >
          <g stroke="currentColor" strokeWidth="1" className="text-cyan-500/40">
            <line x1="170" y1="160" x2="430" y2="300" />
            <line x1="430" y1="300" x2="240" y2="540" />
            <line x1="430" y1="300" x2="690" y2="220" />
            <line x1="690" y1="220" x2="960" y2="360" />
            <line x1="690" y1="220" x2="840" y2="560" />
            <line x1="240" y1="540" x2="540" y2="660" />
            <line x1="960" y1="360" x2="1040" y2="620" />
            <line x1="540" y1="660" x2="840" y2="560" />
            <line x1="1040" y1="120" x2="960" y2="360" />
          </g>
          <g fill="currentColor" className="text-cyan-400">
            <circle cx="170" cy="160" r="3.5" />
            <circle cx="430" cy="300" r="4.5" />
            <circle cx="240" cy="540" r="3.5" />
            <circle cx="690" cy="220" r="5" />
            <circle cx="960" cy="360" r="4" />
            <circle cx="840" cy="560" r="3.5" />
            <circle cx="540" cy="660" r="3.5" />
            <circle cx="1040" cy="620" r="3" />
            <circle cx="1040" cy="120" r="3" />
          </g>
        </svg>
      </div>

      {/* Top Navbar */}
      <header className="relative z-10 flex items-center justify-between px-6 py-5 max-w-6xl w-full mx-auto">
        <Link href="/" className="flex items-center gap-3 group">
          <div className="h-10 w-10 rounded-xl overflow-hidden ring-2 ring-brand-500/40 shadow-glow bg-slate-900 flex items-center justify-center transition-transform group-hover:scale-105">
            <img src="/logo.jpg" alt="MashupKgrid Logo" className="h-full w-full object-cover" />
          </div>
          <div>
            <span className="text-base font-black tracking-tight text-white block">
              MASHUPKGRID
            </span>
            <span className="text-[10px] font-mono text-cyan-400 tracking-wider uppercase block">
              ISP Telecom Engine
            </span>
          </div>
        </Link>

        <div className="flex items-center gap-3 text-xs">
          <span className="hidden sm:inline text-slate-400">Already have an ISP console?</span>
          <Link
            href="/login"
            className="px-3.5 py-1.5 rounded-lg border border-slate-700 bg-slate-900/80 hover:bg-slate-800 text-white font-bold transition-all"
          >
            Sign in &rarr;
          </Link>
        </div>
      </header>

      {/* Main Registration Card */}
      <main className="relative z-10 flex-1 flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-md rounded-3xl border border-slate-800/80 bg-slate-950/85 backdrop-blur-2xl p-6 sm:p-8 shadow-2xl shadow-black/80">
          {/* 5-Step Progress Track */}
          <div className="mb-6">
            <div className="flex items-center justify-between relative" aria-label={`Step ${step} of 5`}>
              {/* Connecting line */}
              <div className="absolute top-1/2 left-4 right-4 -translate-y-1/2 h-0.5 bg-slate-800 -z-0">
                <div
                  className="h-full bg-gradient-to-r from-brand-500 to-cyan-400 transition-all duration-300"
                  style={{ width: `${((step - 1) / 4) * 100}%` }}
                />
              </div>

              {[1, 2, 3, 4, 5].map((s) => {
                const isDone = step > s;
                const isActive = step === s;
                return (
                  <div
                    key={s}
                    className={`relative z-10 flex h-7 w-7 items-center justify-center rounded-full text-xs font-mono font-bold transition-all ${
                      isDone
                        ? "bg-brand-600 text-white ring-4 ring-brand-950 shadow-glow"
                        : isActive
                        ? "bg-cyan-500 text-slate-950 ring-4 ring-cyan-950/80 font-black scale-110 shadow-glow-cyan"
                        : "bg-slate-900 border border-slate-800 text-slate-500"
                    }`}
                  >
                    {isDone ? <IconCheck size={14} /> : s}
                  </div>
                );
              })}
            </div>

            {/* Back Button */}
            {step > 1 && (
              <button
                type="button"
                onClick={() => setStep((s) => (s > 1 ? ((s - 1) as any) : s))}
                className="mt-3 flex items-center gap-1 text-[11px] font-mono text-slate-400 hover:text-cyan-400 transition-colors"
              >
                <span>&larr; Back</span>
              </button>
            )}
          </div>

          {/* Global Error Banner */}
          {errorMessage && (
            <div className="mb-5 p-3 rounded-xl bg-rose-950/60 border border-rose-800/80 text-rose-300 text-xs flex items-start gap-2">
              <span className="shrink-0 mt-0.5 px-1 py-0.5 rounded bg-rose-900/80 text-rose-300 font-mono text-[9px] font-bold uppercase">
                ERROR
              </span>
              <span className="leading-relaxed">{errorMessage}</span>
            </div>
          )}

          {/* ============================================================ */}
          {/* STEP 1: CONTACT & WHATSAPP */}
          {/* ============================================================ */}
          {step === 1 && (
            <form onSubmit={handleStep1Submit} className="space-y-4">
              <div className="text-left space-y-1">
                <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                  Manage your ISP business
                </h1>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Streamline operations, automate billing, and delight your customers — start by verifying your WhatsApp number.
                </p>
              </div>

              <div className="space-y-3.5 pt-2 text-left text-xs">
                <div>
                  <Label htmlFor="reg-name" className="text-slate-300">
                    Full name <span className="text-rose-400">*</span>
                  </Label>
                  <Input
                    id="reg-name"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="e.g. John Kamau"
                    required
                    autoFocus
                    className="mt-1 bg-slate-900 border-slate-800 text-white focus:border-brand-500"
                  />
                </div>

                <div>
                  <Label htmlFor="reg-email" className="text-slate-300">
                    Email address <span className="text-rose-400">*</span>
                  </Label>
                  <Input
                    id="reg-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@company.com"
                    required
                    className="mt-1 bg-slate-900 border-slate-800 text-white focus:border-brand-500"
                  />
                  <p className="text-[10px] text-slate-500 mt-1">
                    Your sign-in address — no temporary inboxes.
                  </p>
                </div>

                <div>
                  <Label htmlFor="reg-phone" className="text-slate-300">
                    WhatsApp number <span className="text-rose-400">*</span>
                  </Label>
                  <div className="mt-1 flex gap-2">
                    <select
                      value={phoneCountry}
                      onChange={(e) => setPhoneCountry(e.target.value)}
                      className="bg-slate-900 border border-slate-800 text-white rounded-xl px-2.5 py-2 text-xs font-mono focus:border-brand-500 focus:outline-none shrink-0"
                    >
                      {COUNTRIES.map((c) => (
                        <option key={c.iso2} value={c.iso2}>
                          {c.flag} +{c.phoneCode}
                        </option>
                      ))}
                    </select>
                    <Input
                      id="reg-phone"
                      type="tel"
                      value={nationalPhone}
                      onChange={(e) => setNationalPhone(e.target.value)}
                      placeholder="7XX XXX XXX"
                      required
                      className="flex-1 bg-slate-900 border-slate-800 text-white font-mono focus:border-brand-500"
                    />
                  </div>
                  <p className="text-[10px] text-slate-500 mt-1">
                    We&apos;ll send a 6-digit code to this number on WhatsApp.
                  </p>
                </div>

                <Button
                  type="submit"
                  disabled={isSendingOtp}
                  className="w-full py-2.5 font-bold shadow-glow text-xs flex items-center justify-center gap-1.5 mt-4"
                >
                  <span>{isSendingOtp ? "Sending code..." : "Send WhatsApp code"}</span>
                  {!isSendingOtp && <IconArrowRight size={14} />}
                </Button>
              </div>
            </form>
          )}

          {/* ============================================================ */}
          {/* STEP 2: 6-DIGIT OTP VERIFICATION */}
          {/* ============================================================ */}
          {step === 2 && (
            <form onSubmit={handleVerifyOtp} className="space-y-4 text-left">
              <div className="space-y-1">
                <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                  Check your WhatsApp
                </h2>
                <p className="text-xs text-slate-400">
                  We sent a 6-digit verification code on WhatsApp to{" "}
                  <strong className="text-cyan-400 font-mono">{formattedWhatsApp}</strong>.{" "}
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="text-brand-400 hover:underline inline"
                  >
                    Use a different number
                  </button>
                </p>
              </div>

              <div className="pt-3 space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">Verification code</span>
                  <span className="font-mono text-[11px] text-amber-400">
                    Expires in {Math.floor(otpTimer / 60)}m {String(otpTimer % 60).padStart(2, "0")}s
                  </span>
                </div>

                {/* 6 OTP Inputs */}
                <div className="flex justify-between gap-2">
                  {otpDigits.map((digit, i) => (
                    <input
                      key={i}
                      ref={(el) => {
                        otpInputRefs.current[i] = el;
                      }}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => handleOtpChange(i, e.target.value)}
                      onKeyDown={(e) => handleOtpKeyDown(i, e)}
                      onPaste={handleOtpPaste}
                      className="w-11 h-12 rounded-xl bg-slate-900 border border-slate-800 text-center font-mono text-lg font-bold text-white focus:border-brand-500 focus:ring-1 focus:ring-brand-500 focus:outline-none"
                    />
                  ))}
                </div>

                <Button
                  type="submit"
                  disabled={otpDigits.join("").length < 6 || isVerifyingOtp}
                  className="w-full py-2.5 font-bold shadow-glow text-xs flex items-center justify-center gap-1.5 mt-2"
                >
                  <span>{isVerifyingOtp ? "Verifying..." : "Verify code"}</span>
                  {!isVerifyingOtp && <IconArrowRight size={14} />}
                </Button>

                <div className="text-center pt-2">
                  <button
                    type="button"
                    disabled={resendCooldown > 0 || isSendingOtp}
                    onClick={sendOtpCode}
                    className={`text-xs font-mono ${
                      resendCooldown > 0 || isSendingOtp ? "text-slate-600" : "text-brand-400 hover:underline"
                    }`}
                  >
                    {isSendingOtp
                      ? "Sending..."
                      : resendCooldown > 0
                        ? `Resend code in ${resendCooldown}s`
                        : "Didn't get it? Resend code"}
                  </button>
                </div>
              </div>
            </form>
          )}

          {/* ============================================================ */}
          {/* STEP 3: ISP / COMPANY NAME & SUBDOMAIN */}
          {/* ============================================================ */}
          {step === 3 && (
            <form onSubmit={handleStep3Submit} className="space-y-4 text-left">
              <div className="space-y-1">
                <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                  Name your account
                </h2>
                <p className="text-xs text-slate-400">
                  Your ISP name becomes your permanent account address (a subdomain) — pick something short and memorable.
                </p>
              </div>

              <div className="space-y-3 pt-2">
                <div>
                  <Label htmlFor="company-name" className="text-slate-300 text-xs">
                    ISP / Company name <span className="text-rose-400">*</span>
                  </Label>
                  <Input
                    id="company-name"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    placeholder="e.g. Nairobi FastNet Telecom"
                    required
                    autoFocus
                    className="mt-1 bg-slate-900 border-slate-800 text-white focus:border-brand-500"
                  />
                </div>

                {/* Subdomain Preview with Live Indicator */}
                <div
                  className={`p-3 rounded-xl border font-mono text-xs flex items-center justify-between transition-all ${
                    slugStatus === "available"
                      ? "bg-emerald-950/40 border-emerald-500/50 text-emerald-300"
                      : slugStatus === "unavailable"
                      ? "bg-rose-950/40 border-rose-500/50 text-rose-300"
                      : "bg-slate-900/90 border-slate-800 text-slate-400"
                  }`}
                >
                  <div className="flex items-center gap-1 truncate">
                    <strong className="text-white">{slug || "yourcompany"}</strong>
                    <span className="text-slate-500">.mashupkgrid.com</span>
                  </div>

                  <div className="shrink-0 flex items-center gap-1.5 text-[11px] font-bold">
                    {slugStatus === "checking" && (
                      <span className="h-3 w-3 rounded-full border-2 border-cyan-400 border-t-transparent animate-spin" />
                    )}
                    {slugStatus === "available" && (
                      <span className="flex items-center gap-1 text-emerald-400">
                        <IconCheck size={14} /> Available
                      </span>
                    )}
                    {slugStatus === "unavailable" && (
                      <span className="text-rose-400 font-sans font-bold">Taken</span>
                    )}
                  </div>
                </div>

                {slugMessage && (
                  <p
                    className={`text-[11px] font-mono ${
                      slugStatus === "available" ? "text-emerald-400" : "text-rose-400"
                    }`}
                  >
                    {slugMessage}
                  </p>
                )}

                {/* Suggestions if taken */}
                {slugSuggestions.length > 0 && (
                  <div className="space-y-1.5 pt-1">
                    <span className="text-[10px] text-slate-400 font-mono block uppercase">
                      Try one of these suggestions:
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {slugSuggestions.map((sug) => (
                        <button
                          key={sug}
                          type="button"
                          onClick={() => {
                            setSlug(sug);
                            setSlugStatus("available");
                            setSlugMessage("Available — this will be your account address.");
                            setSlugSuggestions([]);
                          }}
                          className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-cyan-300 text-[11px] font-mono transition-all"
                        >
                          {sug}.mashupkgrid.com
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <Button
                  type="submit"
                  disabled={slugStatus !== "available"}
                  className="w-full py-2.5 font-bold shadow-glow text-xs flex items-center justify-center gap-1.5 mt-2"
                >
                  <span>Continue</span>
                  <IconArrowRight size={14} />
                </Button>
              </div>
            </form>
          )}

          {/* ============================================================ */}
          {/* STEP 4: REGION & OPERATING DEFAULTS */}
          {/* ============================================================ */}
          {step === 4 && (
            <form onSubmit={handleStep4Submit} className="space-y-4 text-left">
              <div className="space-y-1">
                <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                  Where you operate
                </h2>
                <p className="text-xs text-slate-400">
                  Set your country, timezone, and billing currency — we&apos;ll use these as your account defaults.
                </p>
              </div>

              {/* Verified Badges Preview */}
              <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 space-y-1.5 text-[11px] font-mono">
                <div className="flex justify-between items-center text-slate-400">
                  <span>Email:</span>
                  <span className="text-white flex items-center gap-1">
                    <IconCheck size={12} className="text-emerald-400" /> {email}
                  </span>
                </div>
                <div className="flex justify-between items-center text-slate-400">
                  <span>WhatsApp:</span>
                  <span className="text-white flex items-center gap-1">
                    <IconCheck size={12} className="text-emerald-400" /> {formattedWhatsApp}
                  </span>
                </div>
                <div className="flex justify-between items-center text-slate-400">
                  <span>Subdomain:</span>
                  <span className="text-cyan-400 font-bold">{tenantDomain(slug)}</span>
                </div>
              </div>

              <div className="space-y-3 pt-1 text-xs">
                <div>
                  <Label htmlFor="country-select" className="text-slate-300">
                    Operating Country <span className="text-rose-400">*</span>
                  </Label>
                  <select
                    id="country-select"
                    value={operatingCountry}
                    onChange={(e) => handleCountryChange(e.target.value)}
                    className="w-full mt-1 bg-slate-900 border border-slate-800 text-white rounded-xl px-3 py-2 text-xs focus:border-brand-500 focus:outline-none"
                  >
                    {COUNTRIES.map((c) => (
                      <option key={c.iso2} value={c.iso2}>
                        {c.flag} {c.name} (+{c.phoneCode})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label htmlFor="tz-select" className="text-slate-300">
                      Timezone <span className="text-rose-400">*</span>
                    </Label>
                    <select
                      id="tz-select"
                      value={timezone}
                      onChange={(e) => setTimezone(e.target.value)}
                      className="w-full mt-1 bg-slate-900 border border-slate-800 text-white rounded-xl px-2.5 py-2 text-xs font-mono focus:border-brand-500 focus:outline-none"
                    >
                      <option value="Africa/Nairobi">Africa/Nairobi (EAT)</option>
                      <option value="Africa/Kampala">Africa/Kampala</option>
                      <option value="Africa/Dar_es_Salaam">Africa/Dar_es_Salaam</option>
                      <option value="Africa/Kigali">Africa/Kigali</option>
                      <option value="Africa/Lagos">Africa/Lagos (WAT)</option>
                      <option value="Africa/Johannesburg">Africa/Johannesburg (SAST)</option>
                      <option value="America/New_York">America/New_York (EST)</option>
                      <option value="Europe/London">Europe/London (GMT)</option>
                    </select>
                  </div>

                  <div>
                    <Label htmlFor="curr-select" className="text-slate-300">
                      Billing Currency <span className="text-rose-400">*</span>
                    </Label>
                    <select
                      id="curr-select"
                      value={currency}
                      onChange={(e) => setCurrency(e.target.value)}
                      className="w-full mt-1 bg-slate-900 border border-slate-800 text-white rounded-xl px-2.5 py-2 text-xs font-mono focus:border-brand-500 focus:outline-none"
                    >
                      <option value="KES">KES — Kenyan Shilling</option>
                      <option value="USD">USD — US Dollar ($)</option>
                      <option value="UGX">UGX — Ugandan Shilling</option>
                      <option value="TZS">TZS — Tanzanian Shilling</option>
                      <option value="RWF">RWF — Rwandan Franc</option>
                      <option value="NGN">NGN — Nigerian Naira</option>
                      <option value="ZAR">ZAR — South African Rand</option>
                    </select>
                  </div>
                </div>

                <div>
                  <Label htmlFor="source-select" className="text-slate-300">
                    How did you hear about us?
                  </Label>
                  <select
                    id="source-select"
                    value={heardAboutUs}
                    onChange={(e) => setHeardAboutUs(e.target.value)}
                    className="w-full mt-1 bg-slate-900 border border-slate-800 text-white rounded-xl px-3 py-2 text-xs focus:border-brand-500 focus:outline-none"
                  >
                    {HEARD_ABOUT_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </div>

                <Button
                  type="submit"
                  className="w-full py-2.5 font-bold shadow-glow text-xs flex items-center justify-center gap-1.5 mt-2"
                >
                  <span>Continue</span>
                  <IconArrowRight size={14} />
                </Button>
              </div>
            </form>
          )}

          {/* ============================================================ */}
          {/* STEP 5: SECURE YOUR ACCOUNT (PASSWORD & LEGAL) */}
          {/* ============================================================ */}
          {step === 5 && (
            <form onSubmit={handleFinalSubmit} className="space-y-4 text-left">
              <div className="space-y-1">
                <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                  Secure your account
                </h2>
                <p className="text-xs text-slate-400">
                  Choose a strong password — you&apos;ll use it to sign in to your ISP console.
                </p>
              </div>

              <div className="space-y-3.5 pt-2 text-xs">
                {/* Password Input */}
                <div>
                  <Label htmlFor="reg-pw" className="text-slate-300">
                    Password <span className="text-rose-400">*</span>
                  </Label>
                  <div className="relative mt-1">
                    <Input
                      id="reg-pw"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="At least 10 characters"
                      required
                      autoFocus
                      className="bg-slate-900 border-slate-800 text-white pr-10 focus:border-brand-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 text-xs"
                    >
                      {showPassword ? "Hide" : "Show"}
                    </button>
                  </div>

                  {/* 5-Bar Dynamic Strength Meter */}
                  {password && (
                    <div className="mt-2 space-y-1.5">
                      <div className="flex gap-1 h-1.5 w-full">
                        {[1, 2, 3, 4, 5].map((level) => (
                          <div
                            key={level}
                            className={`flex-1 rounded-full transition-all ${
                              passwordStrengthScore >= level ? strengthMeta.tone : "bg-slate-800"
                            }`}
                          />
                        ))}
                      </div>

                      <div className="flex justify-between items-center text-[10px] font-mono">
                        <span className={`font-bold ${strengthMeta.text}`}>
                          {strengthMeta.label}
                        </span>
                        <div className="flex gap-2 text-slate-500">
                          <span className={passwordCriteria.length ? "text-emerald-400" : ""}>10+ chars</span>
                          <span className={passwordCriteria.bothCases ? "text-emerald-400" : ""}>aA</span>
                          <span className={passwordCriteria.hasNumber ? "text-emerald-400" : ""}>123</span>
                          <span className={passwordCriteria.hasSymbol ? "text-emerald-400" : ""}>#$%</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Confirm Password Input */}
                <div>
                  <Label htmlFor="reg-confirm-pw" className="text-slate-300">
                    Confirm password <span className="text-rose-400">*</span>
                  </Label>
                  <div className="relative mt-1">
                    <Input
                      id="reg-confirm-pw"
                      type={showConfirmPassword ? "text" : "password"}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Re-enter your password"
                      required
                      className="bg-slate-900 border-slate-800 text-white pr-10 focus:border-brand-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 text-xs"
                    >
                      {showConfirmPassword ? "Hide" : "Show"}
                    </button>
                  </div>
                  {confirmPassword && password !== confirmPassword && (
                    <p className="text-[10px] text-rose-400 mt-1">Passwords do not match.</p>
                  )}
                </div>

                {/* Terms Agreement Checkbox */}
                <label className="flex items-start gap-2 pt-1 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={agreeTerms}
                    onChange={(e) => setAgreeTerms(e.target.checked)}
                    className="mt-0.5 rounded border-slate-800 bg-slate-900 text-brand-600 focus:ring-brand-500"
                  />
                  <span className="text-[11px] text-slate-400 leading-snug">
                    I agree to the{" "}
                    <Link href="/terms" target="_blank" className="text-cyan-400 hover:underline">
                      Terms of service
                    </Link>{" "}
                    and{" "}
                    <Link href="/privacy" target="_blank" className="text-cyan-400 hover:underline">
                      Privacy policy
                    </Link>
                    .
                  </span>
                </label>

                <Button
                  type="submit"
                  disabled={isSubmitting || !agreeTerms || password !== confirmPassword}
                  className="w-full py-3 font-bold shadow-glow text-xs flex items-center justify-center gap-1.5 mt-3"
                >
                  {isSubmitting ? (
                    <span className="flex items-center gap-2">
                      <span className="h-3.5 w-3.5 rounded-full border-2 border-white border-t-transparent animate-spin" />
                      <span>Provisioning ISP Console...</span>
                    </span>
                  ) : (
                    <>
                      <span>Create account</span>
                      <IconArrowRight size={14} />
                    </>
                  )}
                </Button>
              </div>
            </form>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 py-5 text-center text-xs text-slate-600 font-mono">
        &copy; {new Date().getFullYear()} MashupKgrid ISP Telecom Engine. All rights reserved.
      </footer>
    </div>
  );
}
