"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { ApiRequestError } from "@/lib/api-client";
import { Button, Card, ErrorText, HintText, Input, Label, StatusDot } from "@/components/ui";
import { GoogleSignInButton } from "@/components/google-sign-in-button";
import {
  IconRouter,
  IconShield,
  IconMpesa,
  IconLock,
  IconArrowRight,
  IconSparkles,
  IconPulse,
  IconUsers,
  IconEye,
  IconEyeOff,
} from "@/components/icons";
import { NetworkCablesAnimation } from "@/components/network-cables-animation";

const loginSchema = z.object({
  tenantSlug: z.string().optional(),
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

type LoginFormValues = z.infer<typeof loginSchema>;

// Reads the tenant from `useSearchParams()` rather than a `searchParams` page prop. Next 15
// makes that prop a Promise, which a client component can only unwrap with React 19's `use()` —
// and this app is on React 18. The hook is the idiomatic client-component route regardless, and
// it is already what register/, verify-email/ and reset-password/ do, so this also stops /login
// being the odd one out. `useSearchParams()` opts the route into client-side rendering, hence
// the Suspense boundary in the default export below.
function LoginContent() {
  const { login, loginWithGoogle } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const detectedTenant = searchParams.get("tenant");
  const [manualOverride, setManualOverride] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [googlePending, setGooglePending] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { tenantSlug: detectedTenant ?? "" },
  });

  const tenantSlug = watch("tenantSlug");
  const isTenantLocked = Boolean(detectedTenant) && !manualOverride;

  const onSubmit = async (values: LoginFormValues) => {
    setServerError(null);
    try {
      await login({
        tenantSlug: values.tenantSlug || undefined,
        email: values.email,
        password: values.password,
      });
      router.push("/dashboard");
    } catch (err) {
      if (err instanceof ApiRequestError) {
        setServerError(err.message);
      } else {
        setServerError("Invalid credentials. Please verify your email and password.");
      }
    }
  };

  const handleGoogleCredential = async (credential: string) => {
    setServerError(null);
    setGooglePending(true);
    try {
      await loginWithGoogle({ tenantSlug: tenantSlug || "", credential });
      router.push("/dashboard");
    } catch (err) {
      setServerError(err instanceof ApiRequestError ? err.message : "Google sign-in failed — please try again.");
    } finally {
      setGooglePending(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#070b14] text-slate-100 selection:bg-brand-500 selection:text-white font-sans antialiased flex flex-col justify-between">
      {/* Background Ambient Glow & Grid Pattern */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute -top-40 left-1/4 w-[800px] h-[500px] bg-brand-600/15 blur-[140px] rounded-full" />
        <div className="absolute bottom-10 right-10 w-[600px] h-[500px] bg-indigo-500/10 blur-[140px] rounded-full" />
        <div className="absolute inset-0 bg-grid-pattern opacity-60" />
      </div>

      {/* Top Header */}
      <header className="relative z-10 mx-auto w-full max-w-7xl px-5 sm:px-6 py-5 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5 group">
          <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl overflow-hidden ring-1 ring-cyan-500/40 shadow-md group-hover:scale-105 transition-transform bg-slate-950">
            <img
              src="/logo.jpg"
              alt="MashupHost Logo"
              className="h-full w-full object-cover"
            />
          </div>
          <span className="text-base font-extrabold tracking-tight text-white">
            MASHUPHOST
          </span>
          <span className="hidden sm:inline-block rounded-full bg-brand-500/15 border border-brand-500/30 px-2 py-0.5 text-[10px] font-bold text-brand-400 uppercase tracking-wider">
            ISP Console
          </span>
        </Link>

        <div className="flex items-center gap-3 text-xs">
          {detectedTenant ? (
            <Link
              href={`/register?tenant=${encodeURIComponent(detectedTenant)}`}
              className="px-3.5 py-2 rounded-xl border border-slate-700/80 bg-slate-900/70 font-semibold text-white hover:border-brand-500/50 hover:bg-slate-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
            >
              Subscriber Sign Up
            </Link>
          ) : (
            <>
              <span className="text-slate-400 hidden sm:inline">New to MashupHost?</span>
              <Link
                href="/register"
                className="px-3.5 py-2 rounded-xl border border-slate-700/80 bg-slate-900/70 font-semibold text-white hover:border-brand-500/50 hover:bg-slate-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
              >
                Create Account
              </Link>
            </>
          )}
        </div>
      </header>

      {/* Main Container */}
      <div className="relative z-10 mx-auto w-full max-w-6xl px-4 sm:px-6 py-6 lg:py-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-0 items-stretch overflow-hidden rounded-[2rem] border border-slate-700/80 bg-slate-950/60 shadow-2xl shadow-black/40 backdrop-blur-xl">
          <div className="lg:hidden space-y-3 text-left">
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-700/80 bg-slate-800/60 px-3 py-1 text-[11px] font-medium text-slate-300 backdrop-blur">
              <StatusDot status="ONLINE" pulse={true} />
              <span>MashupHost network services online</span>
            </div>
            <h1 className="max-w-xl text-3xl font-black tracking-tight text-white">
              Your network, clearly managed.
            </h1>
            <p className="max-w-xl text-sm leading-relaxed text-slate-400">
              Access billing, subscribers, routers, and support from one focused console.
            </p>
          </div>

          {/* Left Column: Console Telemetry Showcase */}
          <div className="lg:col-span-5 space-y-7 text-left hidden lg:flex lg:flex-col lg:justify-between bg-gradient-to-br from-cyan-950 via-slate-950 to-slate-950 p-8 xl:p-10 border-r border-slate-800">
            <div className="inline-flex w-fit items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/5 px-3.5 py-1 text-xs font-medium text-cyan-100 backdrop-blur">
              <StatusDot status="ONLINE" pulse={true} />
              <span>Network services online</span>
            </div>

            <div>
              <p className="mb-3 text-xs font-mono uppercase tracking-[0.2em] text-cyan-300">
                One console. Every connection.
              </p>
              <h1 className="text-4xl font-black tracking-tight text-white leading-[1.08]">
                Keep your network moving.
              </h1>
              <p className="mt-3 text-sm text-slate-300 leading-relaxed">
                Manage subscribers, routers, payments, and support from one calm operational workspace.
              </p>
            </div>

            <div className="rounded-2xl border border-cyan-400/15 bg-black/20 p-4 space-y-3 font-mono text-xs shadow-xl">
              <div className="flex items-center justify-between text-slate-400 pb-3 border-b border-slate-800/80">
                <span className="flex items-center gap-1.5 text-white font-semibold">
                  <IconRouter size={14} className="text-brand-400" />
                  <span>mashuphost / core network</span>
                </span>
                <span className="text-emerald-400">LIVE</span>
              </div>

              <div className="grid grid-cols-3 gap-2 pt-1">
                <div>
                  <span className="block text-lg font-bold text-white">1,482</span>
                  <span className="text-[10px] text-slate-500">sessions</span>
                </div>
                <div>
                  <span className="block text-lg font-bold text-brand-400">2.41</span>
                  <span className="text-[10px] text-slate-500">Gbps live</span>
                </div>
                <div>
                  <span className="block text-lg font-bold text-emerald-400">0.0%</span>
                  <span className="text-[10px] text-slate-500">packet loss</span>
                </div>
              </div>
            </div>

            {/* Role-Based Access Badges */}
            <div className="pt-1 flex flex-wrap gap-2 text-[11px] font-mono text-slate-400">
              <span className="px-2.5 py-1 rounded-full bg-slate-900/80 border border-slate-800 text-slate-400">
                MikroTik
              </span>
              <span className="px-2.5 py-1 rounded-full bg-slate-900/80 border border-slate-800 text-slate-400">
                FreeRADIUS
              </span>
              <span className="px-2.5 py-1 rounded-full bg-slate-900/80 border border-slate-800 text-slate-400">
                M-Pesa
              </span>
            </div>

            {/* Live Optical & Ethernet Cable Animation Widget */}
            <NetworkCablesAnimation compact={true} />
          </div>

          {/* Right Column: Login Card */}
          <div className="lg:col-span-7 flex justify-center bg-slate-950/90 p-5 sm:p-8 lg:p-10">
            <Card className="relative w-full max-w-lg p-2 sm:p-5 bg-transparent border-0 shadow-none text-left">
              {/* Card Header */}
              <div className="mb-6">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-brand-400 flex items-center gap-1.5">
                    <IconSparkles size={13} />
                    <span>Control Console</span>
                  </span>
                  <span className="text-[10px] font-mono text-emerald-400 flex items-center gap-1 whitespace-nowrap">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    RADIUS: 1.8ms
                  </span>
                </div>
                <h2 className="mt-2 text-3xl sm:text-4xl font-black tracking-tight text-white">
                  Welcome back
                </h2>
                <p className="mt-2 max-w-sm text-sm text-slate-400 leading-relaxed">
                  Sign in to manage your network, billing, and subscriber services.
                </p>
              </div>

              {/* Form */}
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
                {/* Tenant Slug Field */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <Label htmlFor="tenantSlug" className="mb-0">
                      Tenant Organization
                    </Label>
                    {isTenantLocked ? (
                      <button
                        type="button"
                        onClick={() => setManualOverride(true)}
                        className="text-[11px] text-brand-400 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 rounded"
                      >
                        Change manually
                      </button>
                    ) : (
                      <span className="text-[11px] text-slate-500 font-mono">Optional for Super Admin</span>
                    )}
                  </div>
                  <Input
                    id="tenantSlug"
                    placeholder="e.g. demo-isp"
                    readOnly={isTenantLocked}
                    className={`bg-slate-900/80 border-slate-700/80 text-white font-mono text-sm focus:border-brand-500 ${
                      isTenantLocked ? "opacity-75 cursor-default" : ""
                    }`}
                    {...register("tenantSlug")}
                  />
                  {isTenantLocked ? (
                    <HintText>Auto-detected from this ISP domain.</HintText>
                  ) : (
                    <HintText>Leave blank if logging into the Master Platform Console</HintText>
                  )}
                </div>

                {/* Email Field */}
                <div>
                  <Label htmlFor="email">Operator Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="admin@isp.co.ke"
                    className="bg-slate-900/80 border-slate-700/80 text-white text-sm focus:border-brand-500"
                    {...register("email")}
                  />
                  {errors.email && <ErrorText>{errors.email.message}</ErrorText>}
                </div>

                {/* Password Field with Show/Hide Toggle */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <Label htmlFor="password" className="mb-0">
                      Security Password
                    </Label>
                    <div className="flex items-center gap-3">
                      <Link
                        href="/forgot-password"
                        className="text-[11px] text-brand-400 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 rounded"
                      >
                        Forgot password?
                      </Link>
                    </div>
                  </div>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      placeholder="••••••••••••"
                      className="bg-slate-900/80 border-slate-700/80 text-white text-sm focus:border-brand-500 pr-12"
                      {...register("password")}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      aria-pressed={showPassword}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      title={showPassword ? "Hide password" : "Show password"}
                      className="absolute right-2 top-1/2 -translate-y-1/2 flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
                    >
                      {showPassword ? <IconEyeOff size={16} /> : <IconEye size={16} />}
                    </button>
                  </div>
                  {errors.password && <ErrorText>{errors.password.message}</ErrorText>}
                </div>

                {serverError && (
                  <div role="alert" className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs font-medium text-rose-300">
                    {serverError}
                  </div>
                )}

                {/* Submit Button */}
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-3.5 font-bold text-sm shadow-glow gap-2 mt-2 rounded-xl"
                >
                  {isSubmitting ? (
                    <>
                      <span className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>Authenticating Session...</span>
                    </>
                  ) : (
                    <>
                      <span>Sign in to Console</span>
                      <IconArrowRight size={15} />
                    </>
                  )}
                </Button>
              </form>

              {/* Google Sign-In Integration */}
              <div className="mt-5">
                {tenantSlug ? (
                  <GoogleSignInButton onCredential={handleGoogleCredential} />
                ) : (
                  <div className="rounded-lg bg-slate-900/60 border border-slate-800 p-2.5 text-center text-xs text-slate-400 font-mono">
                    Enter your Tenant Organization above to sign in with Google.
                  </div>
                )}
                {googlePending && (
                  <p className="mt-2 text-center text-xs text-brand-400 font-mono">
                    Signing in with Google...
                  </p>
                )}
              </div>

              {/* Footer Switcher */}
              <div className="mt-6 border-t border-slate-800/80 pt-4 text-center text-xs text-slate-400">
                {detectedTenant ? (
                  <>
                    Are you a subscriber?{" "}
                    <Link
                      href={`/register?tenant=${encodeURIComponent(detectedTenant)}`}
                      className="font-semibold text-brand-400 hover:text-brand-300 transition-colors"
                    >
                      Register customer account
                    </Link>
                  </>
                ) : (
                  <>
                    Need a new ISP tenant or customer account?{" "}
                    <Link
                      href="/register"
                      className="font-semibold text-brand-400 hover:text-brand-300 transition-colors"
                    >
                      Create an account
                    </Link>
                  </>
                )}
              </div>
            </Card>
          </div>
        </div>
      </div>

      {/* Simple Footer */}
      <footer className="relative z-10 mx-auto w-full max-w-7xl px-6 py-4 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 border-t border-slate-800/60 gap-2">
        <div>
          &copy; {new Date().getFullYear()} MashupHost. Telecom Billing &amp; MikroTik Cloud.
        </div>
        <div className="flex flex-wrap items-center gap-3 sm:gap-4">
          <Link href="/terms" className="hover:text-slate-300 transition-colors">
            Terms
          </Link>
          <Link href="/refund-policy" className="hover:text-slate-300 transition-colors">
            Refunds
          </Link>
          <Link href="/referral-policy" className="hover:text-slate-300 transition-colors">
            Referrals
          </Link>
          <Link href="/age-policy" className="hover:text-slate-300 transition-colors">
            Age Policy
          </Link>
          <Link href="/register" className="hover:text-slate-300 transition-colors">
            Create Account
          </Link>
        </div>
      </footer>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-900" />}>
      <LoginContent />
    </Suspense>
  );
}
