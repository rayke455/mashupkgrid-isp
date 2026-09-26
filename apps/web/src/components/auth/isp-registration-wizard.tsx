"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiFetch, ApiRequestError } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { Button, Card, Input, Label, Badge } from "@/components/ui";
import { Logo } from "@/components/marketing/brand";
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
  const [otpChannel, setOtpChannel] = useState<"whatsapp" | "email">("whatsapp");
  const [otpDigits, setOtpDigits] = useState<string[]>(["", "", "", "", "", ""]);
  const [otpTimer, setOtpTimer] = useState(600); // 10 minutes
  const [resendCooldown, setResendCooldown] = useState(60);
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);
  // Proof this exact phone/email completed OTP verification — the backend requires this on final
  // submission (see apps/api's /isp-registration route) so skipping straight to step 5 can't
  // create an account without ever actually verifying the code.
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
        return { label: "Too weak", tone: "bg-rose-500", text: "text-red-700" };
      case 2:
        return { label: "Weak", tone: "bg-orange-500", text: "text-orange-700" };
      case 3:
        return { label: "Fair", tone: "bg-amber-500", text: "text-amber-700" };
      case 4:
        return { label: "Strong", tone: "bg-emerald-500", text: "text-emerald-700" };
      case 5:
        return { label: "Excellent", tone: "bg-emerald-600", text: "text-emerald-700" };
      default:
        return { label: "", tone: "bg-slate-200", text: "text-slate-500" };
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
      const endpoint =
        otpChannel === "whatsapp"
          ? "/api/v1/auth/isp-registration/whatsapp-otp/send"
          : "/api/v1/auth/isp-registration/email-otp/send";
      const body =
        otpChannel === "whatsapp"
          ? { phone: `+${selectedCountryInfo.phoneCode} ${nationalPhone.trim()}` }
          : { email: email.trim().toLowerCase() };

      await apiFetch(endpoint, {
        method: "POST",
        skipAuth: true,
        body: JSON.stringify(body),
      });

      setOtpDigits(["", "", "", "", "", ""]);
      setOtpTimer(600);
      setResendCooldown(60);
      setStep(2);
      setTimeout(() => {
        otpInputRefs.current[0]?.focus();
      }, 100);
    } catch (err) {
      setErrorMessage(
        err instanceof ApiRequestError
          ? err.message
          : `Couldn't send the ${otpChannel === "whatsapp" ? "WhatsApp" : "Email"} verification code — try again.`
      );
    } finally {
      setIsSendingOtp(false);
    }
  };

  const sendOtpCode = async () => {
    setErrorMessage(null);
    setIsSendingOtp(true);
    try {
      const endpoint =
        otpChannel === "whatsapp"
          ? "/api/v1/auth/isp-registration/whatsapp-otp/send"
          : "/api/v1/auth/isp-registration/email-otp/send";
      const body =
        otpChannel === "whatsapp"
          ? { phone: `+${selectedCountryInfo.phoneCode} ${nationalPhone.trim()}` }
          : { email: email.trim().toLowerCase() };

      await apiFetch(endpoint, {
        method: "POST",
        skipAuth: true,
        body: JSON.stringify(body),
      });
      setOtpDigits(["", "", "", "", "", ""]);
      setOtpTimer(600);
      setResendCooldown(60);
      otpInputRefs.current[0]?.focus();
    } catch (err) {
      setErrorMessage(
        err instanceof ApiRequestError
          ? err.message
          : `Couldn't resend the ${otpChannel === "whatsapp" ? "WhatsApp" : "Email"} code — try again.`
      );
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
      setErrorMessage(`Please enter all 6 digits of your ${otpChannel === "whatsapp" ? "WhatsApp" : "Email"} verification code.`);
      return;
    }

    setErrorMessage(null);
    setIsVerifyingOtp(true);
    try {
      const verifyEndpoint =
        otpChannel === "whatsapp"
          ? "/api/v1/auth/isp-registration/whatsapp-otp/verify"
          : "/api/v1/auth/isp-registration/email-otp/verify";
      const verifyBody =
        otpChannel === "whatsapp"
          ? { phone: `+${selectedCountryInfo.phoneCode} ${nationalPhone.trim()}`, code }
          : { email: email.trim().toLowerCase(), code };

      const res = await apiFetch<{
        verified: boolean;
        ticket: string;
        subdomain?: string;
        subdomainUrl?: string;
        companyName?: string;
      }>(verifyEndpoint, {
        method: "POST",
        skipAuth: true,
        body: JSON.stringify(verifyBody),
      });

      setPhoneVerificationTicket(res.ticket);
      if (res.subdomain) setSlug(res.subdomain);
      if (res.companyName) setCompanyName(res.companyName);
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
  const [registrationComplete, setRegistrationComplete] = useState(false);
  const [registeredTenantName, setRegisteredTenantName] = useState("");

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
          verificationType: otpChannel,
          country: operatingCountry,
          timezone,
          currency,
          password,
          heardAboutUs,
        }),
      });

      // Registration successful — show pending approval page instead of redirecting
      setRegisteredTenantName(res.tenant?.name ?? companyName.trim());
      setRegistrationComplete(true);
      setIsSubmitting(false);
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
    <div className="force-light flex min-h-screen flex-col bg-slate-50 text-slate-900 antialiased">
      <header className="flex items-center justify-between gap-4 border-b border-slate-200 bg-white px-5 py-4 sm:px-8">
        <Link href="/" aria-label="MashupHost home" className="rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600">
          <Logo />
        </Link>
        <p className="text-sm text-slate-600">
          <span className="hidden sm:inline">Already have an account? </span>
          <Link href="/login" className="font-semibold text-blue-700 hover:text-blue-800">
            Sign in
          </Link>
        </p>
      </header>

      <main className="flex flex-1 items-start justify-center px-4 py-10 sm:items-center sm:py-14">
        {registrationComplete ? (
          <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_12px_32px_-16px_rgba(15,23,42,0.18)] sm:p-8 text-center">
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
              <IconCheck className="h-8 w-8 text-emerald-600" />
            </div>
            <h2 className="text-xl font-bold text-slate-900 mb-2">Registration Submitted!</h2>
            <p className="text-sm text-slate-600 mb-4">
              Your ISP account <span className="font-semibold text-slate-800">&quot;{registeredTenantName}&quot;</span> has been registered successfully.
            </p>
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 mb-6">
              <div className="flex items-start gap-2.5">
                <IconShield className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="text-left">
                  <p className="text-sm font-semibold text-amber-800 mb-1">Pending Approval</p>
                  <p className="text-xs text-amber-700 leading-relaxed">
                    Your account is currently pending approval from the platform administrator. You will receive a notification via WhatsApp and Email once your account has been approved.
                  </p>
                </div>
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5 mb-6 text-left">
              <p className="text-xs font-semibold text-slate-700 mb-2">What happens next?</p>
              <ul className="text-xs text-slate-600 space-y-1.5">
                <li className="flex items-start gap-2">
                  <span className="text-emerald-500 mt-0.5">✓</span>
                  <span>Our team will review your registration</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-500 mt-0.5">✓</span>
                  <span>You&apos;ll be notified via WhatsApp &amp; Email once approved</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-500 mt-0.5">✓</span>
                  <span>After approval, log in at your subdomain to get started</span>
                </li>
              </ul>
            </div>
            <Link
              href="/login"
              className="inline-flex items-center justify-center gap-2 rounded-md bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow hover:bg-blue-700 transition-colors"
            >
              Go to Login
            </Link>
          </div>
        ) : (
        <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_12px_32px_-16px_rgba(15,23,42,0.18)] sm:p-8">
          {/* 5-step progress */}
          <div className="mb-7">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>
                Step <span className="font-semibold text-slate-900">{step}</span> of 5
              </span>
              {step > 1 && (
                <button
                  type="button"
                  onClick={() => setStep((s) => (s > 1 ? ((s - 1) as any) : s))}
                  className="rounded font-medium text-slate-600 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                >
                  &larr; Back
                </button>
              )}
            </div>
            <div
              className="mt-2.5 grid grid-cols-5 gap-1.5"
              role="progressbar"
              aria-label="Registration progress"
              aria-valuemin={1}
              aria-valuemax={5}
              aria-valuenow={step}
            >
              {[1, 2, 3, 4, 5].map((s) => (
                <span
                  key={s}
                  className={`h-1 rounded-full transition-colors duration-300 ${s <= step ? "bg-blue-700" : "bg-slate-200"}`}
                />
              ))}
            </div>
          </div>

          {/* Global Error Banner */}
          {errorMessage && (
            <div className="mb-5 p-3 rounded-md bg-red-50 border border-red-200 text-red-800 text-xs flex items-start gap-2">
              <span className="shrink-0 mt-0.5 px-1 py-0.5 rounded bg-red-100 text-red-700 font-mono text-[9px] font-bold uppercase">
                ERROR
              </span>
              <span className="leading-relaxed">{errorMessage}</span>
            </div>
          )}

          {/* ============================================================ */}
          {/* STEP 1: CONTACT & VERIFICATION */}
          {/* ============================================================ */}
          {step === 1 && (
            <form onSubmit={handleStep1Submit} className="space-y-4">
              <div className="text-left space-y-1">
                <h1 className="text-xl sm:text-2xl font-semibold text-slate-950 tracking-tight">
                  Create your ISP account
                </h1>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Tell us who you are, verify your number, and choose your ISP&rsquo;s address. Takes about two minutes.
                </p>
              </div>

              {/* Registration is open; approval is the gate. The old "authorized tenants only"
                  notice predates that and told real applicants they could not sign up. */}
              <div className="p-2.5 bg-blue-50 border border-blue-200 rounded-lg text-left">
                <p className="text-xs font-semibold text-blue-900">Reviewed before going live</p>
                <p className="text-[11px] text-blue-900/80 mt-0.5">
                  New ISPs are checked by our team, usually within a business day. You&rsquo;ll get an email and WhatsApp message with your sign-in link as soon as you&rsquo;re approved.
                </p>
              </div>

              <div className="space-y-3 pt-1 text-left text-xs">
                <div>
                  <Label htmlFor="reg-name" className="text-slate-700">
                    Full name <span className="text-red-600">*</span>
                  </Label>
                  <Input
                    id="reg-name"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="e.g. John Kamau"
                    required
                    autoFocus
                    className="mt-1 bg-white border-slate-300 text-slate-950 focus:border-blue-600"
                  />
                </div>

                <div>
                  <Label htmlFor="reg-email" className="text-slate-700">
                    Email address <span className="text-red-600">*</span>
                  </Label>
                  <Input
                    id="reg-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@company.com"
                    required
                    className="mt-1 bg-white border-slate-300 text-slate-950 focus:border-blue-600"
                  />
                  <p className="text-[10px] text-slate-500 mt-1">
                    This email will be used for your account login.
                  </p>
                </div>

                <div>
                  <Label htmlFor="reg-phone" className="text-slate-700">
                    WhatsApp phone number <span className="text-red-600">*</span>
                  </Label>
                  <div className="mt-1 flex gap-2">
                    <select
                      value={phoneCountry}
                      onChange={(e) => setPhoneCountry(e.target.value)}
                      className="bg-white border border-slate-300 text-slate-950 rounded-md px-2.5 py-2 text-xs font-mono focus:border-blue-600 focus:outline-none shrink-0"
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
                      placeholder="07XX XXX XXX or 7XX XXX XXX"
                      required
                      className="flex-1 bg-white border-slate-300 text-slate-950 font-mono focus:border-blue-600"
                    />
                  </div>
                  <p className="text-[10px] text-slate-500 mt-1">
                    Kenyan numbers auto-format to +254.
                  </p>
                </div>

                <div>
                  <Label className="text-slate-700 block mb-1">Receive verification code via:</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setOtpChannel("whatsapp")}
                      className={`py-2 px-3 rounded-md text-xs font-medium border flex items-center justify-center gap-1.5 transition-all ${
                        otpChannel === "whatsapp"
                          ? "bg-emerald-500/10 border-emerald-500 text-emerald-700 font-bold"
                          : "bg-slate-100 border-slate-200 text-slate-600 hover:bg-slate-200/60"
                      }`}
                    >
                      <span>💬</span> WhatsApp
                    </button>
                    <button
                      type="button"
                      onClick={() => setOtpChannel("email")}
                      className={`py-2 px-3 rounded-md text-xs font-medium border flex items-center justify-center gap-1.5 transition-all ${
                        otpChannel === "email"
                          ? "bg-blue-500/10 border-blue-500 text-blue-700 font-bold"
                          : "bg-slate-100 border-slate-200 text-slate-600 hover:bg-slate-200/60"
                      }`}
                    >
                      <span>✉️</span> Email
                    </button>
                  </div>
                </div>

                <Button
                  type="submit"
                  disabled={isSendingOtp}
                  className="w-full py-2.5 font-bold text-xs flex items-center justify-center gap-1.5 mt-4"
                >
                  <span>{isSendingOtp ? "Sending verification code..." : `Send ${otpChannel === "whatsapp" ? "WhatsApp" : "Email"} Code`}</span>
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
                <h2 className="text-xl sm:text-2xl font-semibold text-slate-950 tracking-tight">
                  Check your {otpChannel === "whatsapp" ? "WhatsApp" : "Email"}
                </h2>
                <p className="text-xs text-slate-600">
                  We sent a 6-digit code to{" "}
                  <strong className="text-blue-700 font-mono">
                    {otpChannel === "whatsapp" ? formattedWhatsApp : email}
                  </strong>.{" "}
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="text-blue-700 hover:underline inline ml-1"
                  >
                    Change details
                  </button>
                </p>
              </div>

              <div className="pt-3 space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-600">Verification code</span>
                  <span className="font-mono text-[11px] text-amber-700">
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
                      className="w-11 h-12 rounded-md bg-white border border-slate-300 text-center font-mono text-lg font-bold text-slate-950 focus:border-blue-600 focus:ring-1 focus:ring-brand-500 focus:outline-none"
                    />
                  ))}
                </div>

                <Button
                  type="submit"
                  disabled={otpDigits.join("").length < 6 || isVerifyingOtp}
                  className="w-full py-2.5 font-bold text-xs flex items-center justify-center gap-1.5 mt-2"
                >
                  <span>{isVerifyingOtp ? "Verifying..." : "Verify code & Continue"}</span>
                  {!isVerifyingOtp && <IconArrowRight size={14} />}
                </Button>

                <div className="flex items-center justify-between pt-2 text-xs">
                  <button
                    type="button"
                    disabled={resendCooldown > 0 || isSendingOtp}
                    onClick={sendOtpCode}
                    className={`font-mono ${
                      resendCooldown > 0 ? "text-slate-400" : "text-blue-700 hover:underline"
                    }`}
                  >
                    {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Resend code"}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setOtpChannel(otpChannel === "whatsapp" ? "email" : "whatsapp");
                      setStep(1);
                    }}
                    className="text-slate-500 hover:text-slate-800 text-[11px] underline"
                  >
                    {otpChannel === "whatsapp" ? "Switch to Email code" : "Switch to WhatsApp code"}
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
                <h2 className="text-xl sm:text-2xl font-semibold text-slate-950 tracking-tight">
                  Name your account
                </h2>
                <p className="text-xs text-slate-600">
                  Your ISP name becomes your permanent account address (a subdomain) — pick something short and memorable.
                </p>
              </div>

              <div className="space-y-3 pt-2">
                <div>
                  <Label htmlFor="company-name" className="text-slate-700 text-xs">
                    ISP / Company name <span className="text-red-600">*</span>
                  </Label>
                  <Input
                    id="company-name"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    placeholder="e.g. Nairobi FastNet Telecom"
                    required
                    autoFocus
                    className="mt-1 bg-white border-slate-300 text-slate-950 focus:border-blue-600"
                  />
                </div>

                {/* Subdomain Preview with Live Indicator */}
                <div
                  className={`p-3 rounded-md border font-mono text-xs flex items-center justify-between transition-all ${
                    slugStatus === "available"
                      ? "bg-emerald-50 border-emerald-300 text-emerald-800"
                      : slugStatus === "unavailable"
                      ? "bg-red-50 border-red-300 text-red-800"
                      : "bg-slate-50 border-slate-200 text-slate-600"
                  }`}
                >
                  <div className="flex items-center gap-1 truncate">
                    <strong className="text-slate-950">{slug || "yourcompany"}</strong>
                    <span className="text-slate-500">{tenantDomain(slug).slice((slug || "yourcompany").length)}</span>
                  </div>

                  <div className="shrink-0 flex items-center gap-1.5 text-[11px] font-bold">
                    {slugStatus === "checking" && (
                      <span className="h-3 w-3 rounded-full border-2 border-blue-600 border-t-transparent animate-spin" />
                    )}
                    {slugStatus === "available" && (
                      <span className="flex items-center gap-1 text-emerald-700">
                        <IconCheck size={14} /> Available
                      </span>
                    )}
                    {slugStatus === "unavailable" && (
                      <span className="text-red-600 font-sans font-bold">Taken</span>
                    )}
                  </div>
                </div>

                {slugMessage && (
                  <p
                    className={`text-[11px] font-mono ${
                      slugStatus === "available" ? "text-emerald-700" : "text-red-600"
                    }`}
                  >
                    {slugMessage}
                  </p>
                )}

                {/* Suggestions if taken */}
                {slugSuggestions.length > 0 && (
                  <div className="space-y-1.5 pt-1">
                    <span className="text-[10px] text-slate-600 font-mono block uppercase">
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
                          className="px-2.5 py-1 rounded-lg bg-white hover:bg-slate-50 border border-slate-300 text-blue-700 text-[11px] font-mono transition-all"
                        >
                          {tenantDomain(sug)}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <Button
                  type="submit"
                  disabled={slugStatus !== "available"}
                  className="w-full py-2.5 font-bold text-xs flex items-center justify-center gap-1.5 mt-2"
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
                <h2 className="text-xl sm:text-2xl font-semibold text-slate-950 tracking-tight">
                  Where you operate
                </h2>
                <p className="text-xs text-slate-600">
                  Set your country, timezone, and billing currency — we&apos;ll use these as your account defaults.
                </p>
              </div>

              {/* Verified Badges Preview */}
              <div className="p-3 rounded-md bg-white border border-slate-300 space-y-1.5 text-[11px] font-mono">
                <div className="flex justify-between items-center text-slate-600">
                  <span>Email:</span>
                  <span className="text-slate-950 flex items-center gap-1">
                    <IconCheck size={12} className="text-emerald-700" /> {email}
                  </span>
                </div>
                <div className="flex justify-between items-center text-slate-600">
                  <span>WhatsApp:</span>
                  <span className="text-slate-950 flex items-center gap-1">
                    <IconCheck size={12} className="text-emerald-700" /> {formattedWhatsApp}
                  </span>
                </div>
                <div className="flex justify-between items-center text-slate-600">
                  <span>Subdomain:</span>
                  <span className="text-blue-700 font-bold">{tenantDomain(slug)}</span>
                </div>
              </div>

              <div className="space-y-3 pt-1 text-xs">
                <div>
                  <Label htmlFor="country-select" className="text-slate-700">
                    Operating Country <span className="text-red-600">*</span>
                  </Label>
                  <select
                    id="country-select"
                    value={operatingCountry}
                    onChange={(e) => handleCountryChange(e.target.value)}
                    className="w-full mt-1 bg-white border border-slate-300 text-slate-950 rounded-md px-3 py-2 text-xs focus:border-blue-600 focus:outline-none"
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
                    <Label htmlFor="tz-select" className="text-slate-700">
                      Timezone <span className="text-red-600">*</span>
                    </Label>
                    <select
                      id="tz-select"
                      value={timezone}
                      onChange={(e) => setTimezone(e.target.value)}
                      className="w-full mt-1 bg-white border border-slate-300 text-slate-950 rounded-md px-2.5 py-2 text-xs font-mono focus:border-blue-600 focus:outline-none"
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
                    <Label htmlFor="curr-select" className="text-slate-700">
                      Billing Currency <span className="text-red-600">*</span>
                    </Label>
                    <select
                      id="curr-select"
                      value={currency}
                      onChange={(e) => setCurrency(e.target.value)}
                      className="w-full mt-1 bg-white border border-slate-300 text-slate-950 rounded-md px-2.5 py-2 text-xs font-mono focus:border-blue-600 focus:outline-none"
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
                  <Label htmlFor="source-select" className="text-slate-700">
                    How did you hear about us?
                  </Label>
                  <select
                    id="source-select"
                    value={heardAboutUs}
                    onChange={(e) => setHeardAboutUs(e.target.value)}
                    className="w-full mt-1 bg-white border border-slate-300 text-slate-950 rounded-md px-3 py-2 text-xs focus:border-blue-600 focus:outline-none"
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
                  className="w-full py-2.5 font-bold text-xs flex items-center justify-center gap-1.5 mt-2"
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
                <h2 className="text-xl sm:text-2xl font-semibold text-slate-950 tracking-tight">
                  Secure your account
                </h2>
                <p className="text-xs text-slate-600">
                  Choose a strong password — you&apos;ll use it to sign in to your ISP console.
                </p>
              </div>

              <div className="space-y-3.5 pt-2 text-xs">
                {/* Password Input */}
                <div>
                  <Label htmlFor="reg-pw" className="text-slate-700">
                    Password <span className="text-red-600">*</span>
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
                      className="bg-white border-slate-300 text-slate-950 pr-10 focus:border-blue-600"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      aria-pressed={showPassword}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700 text-xs"
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
                              passwordStrengthScore >= level ? strengthMeta.tone : "bg-slate-200"
                            }`}
                          />
                        ))}
                      </div>

                      <div className="flex justify-between items-center text-[10px] font-mono">
                        <span className={`font-bold ${strengthMeta.text}`}>
                          {strengthMeta.label}
                        </span>
                        <div className="flex gap-2 text-slate-500">
                          <span className={passwordCriteria.length ? "text-emerald-700" : ""}>10+ chars</span>
                          <span className={passwordCriteria.bothCases ? "text-emerald-700" : ""}>aA</span>
                          <span className={passwordCriteria.hasNumber ? "text-emerald-700" : ""}>123</span>
                          <span className={passwordCriteria.hasSymbol ? "text-emerald-700" : ""}>#$%</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Confirm Password Input */}
                <div>
                  <Label htmlFor="reg-confirm-pw" className="text-slate-700">
                    Confirm password <span className="text-red-600">*</span>
                  </Label>
                  <div className="relative mt-1">
                    <Input
                      id="reg-confirm-pw"
                      type={showConfirmPassword ? "text" : "password"}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Re-enter your password"
                      required
                      className="bg-white border-slate-300 text-slate-950 pr-10 focus:border-blue-600"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      aria-pressed={showConfirmPassword}
                      aria-label={showConfirmPassword ? "Hide confirmed password" : "Show confirmed password"}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700 text-xs"
                    >
                      {showConfirmPassword ? "Hide" : "Show"}
                    </button>
                  </div>
                  {confirmPassword && password !== confirmPassword && (
                    <p className="text-[10px] text-red-600 mt-1">Passwords do not match.</p>
                  )}
                </div>

                {/* Terms Agreement Checkbox */}
                <label className="flex items-start gap-2 pt-1 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={agreeTerms}
                    onChange={(e) => setAgreeTerms(e.target.checked)}
                    className="mt-0.5 rounded border-slate-300 bg-white text-brand-600 focus:ring-brand-500"
                  />
                  <span className="text-[11px] text-slate-600 leading-snug">
                    I agree to the{" "}
                    <Link href="/terms" target="_blank" className="text-blue-700 hover:underline">
                      Terms of Service
                    </Link>
                    .
                  </span>
                </label>

                <Button
                  type="submit"
                  disabled={isSubmitting || !agreeTerms || password !== confirmPassword}
                  className="w-full py-3 font-bold text-xs flex items-center justify-center gap-1.5 mt-3"
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
        )}
      </main>

      {/* Footer */}
      <footer className="px-5 py-6 text-center text-xs text-slate-500">
        &copy; {new Date().getFullYear()} MashupHost &middot;{" "}
        <Link href="/terms" className="hover:text-slate-800">Terms</Link>
      </footer>
    </div>
  );
}
