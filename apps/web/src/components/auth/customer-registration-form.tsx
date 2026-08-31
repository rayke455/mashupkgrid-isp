"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import Link from "next/link";
import { apiFetch, ApiRequestError, setAccessToken } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { Button, Card, ErrorText, HintText, Input, Label, StatusDot } from "@/components/ui";
import {
  IconLock,
  IconArrowRight,
  IconSparkles,
  IconShield,
  IconUsers,
  IconCheck,
} from "@/components/icons";

const customerRegisterSchema = z
  .object({
    email: z.string().email("Please enter a valid email address"),
    phone: z.string().min(8, "Please enter a valid phone number (e.g. 0712345678)"),
    password: z.string().min(10, "Password must be at least 10 characters"),
    confirmPassword: z.string().min(1, "Please confirm your password"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

type CustomerRegisterValues = z.infer<typeof customerRegisterSchema>;

interface CustomerRegistrationFormProps {
  tenantSlug: string;
}

export function CustomerRegistrationForm({ tenantSlug }: CustomerRegistrationFormProps) {
  const router = useRouter();
  const { refresh } = useAuth();
  const [serverError, setServerError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CustomerRegisterValues>({
    resolver: zodResolver(customerRegisterSchema),
  });

  const onSubmit = async (values: CustomerRegisterValues) => {
    setServerError(null);
    try {
      const result = await apiFetch<{
        id: string;
        email: string;
        status: string;
        accessToken: string | null;
      }>("/api/v1/auth/register", {
        method: "POST",
        skipAuth: true,
        body: JSON.stringify({
          tenantSlug,
          email: values.email,
          phone: values.phone,
          password: values.password,
        }),
      });

      if (result.accessToken) {
        setAccessToken(result.accessToken);
        await refresh();
        router.push("/app");
      } else {
        setSuccess(true);
      }
    } catch (err) {
      if (err instanceof ApiRequestError) {
        setServerError(err.message);
      } else {
        setServerError("Registration failed. Please check your details and try again.");
      }
    }
  };

  if (success) {
    return (
      <main className="min-h-screen bg-slate-900 text-slate-100 flex items-center justify-center p-6">
        <Card className="w-full max-w-md p-8 bg-slate-950/90 border-slate-800 text-center space-y-4">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-400">
            <IconCheck size={24} />
          </div>
          <h2 className="text-2xl font-bold text-white">Account Created!</h2>
          <p className="text-sm text-slate-400">
            Your customer subscriber account has been created successfully.
          </p>
          <Button
            onClick={() => router.push(`/login?tenant=${encodeURIComponent(tenantSlug)}`)}
            className="w-full py-2.5 font-bold"
          >
            Go to Sign In
          </Button>
        </Card>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-900 text-slate-100 selection:bg-brand-500 selection:text-white font-sans antialiased flex flex-col justify-between">
      {/* Ambient background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute -top-40 left-1/3 w-[800px] h-[500px] bg-brand-600/15 blur-[140px] rounded-full" />
        <div className="absolute bottom-10 right-10 w-[600px] h-[500px] bg-indigo-500/10 blur-[140px] rounded-full" />
        <div className="absolute inset-0 bg-grid-pattern opacity-60" />
      </div>

      {/* Header */}
      <header className="relative z-10 mx-auto w-full max-w-7xl px-6 py-4 flex items-center justify-between">
        <Link href={`/login?tenant=${encodeURIComponent(tenantSlug)}`} className="flex items-center gap-2.5 group">
          <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl overflow-hidden ring-1 ring-cyan-500/40 shadow-md group-hover:scale-105 transition-transform bg-slate-950">
            <img src="/logo.jpg" alt="Logo" className="h-full w-full object-cover" />
          </div>
          <span className="text-base font-extrabold tracking-tight text-white uppercase">
            {tenantSlug}
          </span>
          <span className="hidden sm:inline-block rounded-full bg-brand-500/15 border border-brand-500/30 px-2 py-0.5 text-[10px] font-bold text-brand-400 uppercase tracking-wider">
            Subscriber Portal
          </span>
        </Link>

        <div className="flex items-center gap-3 text-xs">
          <span className="text-slate-400 hidden sm:inline">Already have an account?</span>
          <Link
            href={`/login?tenant=${encodeURIComponent(tenantSlug)}`}
            className="px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800/80 font-medium text-white hover:bg-slate-700 transition-colors"
          >
            Sign In
          </Link>
        </div>
      </header>

      {/* Main Content */}
      <div className="relative z-10 mx-auto w-full max-w-lg px-6 py-8">
        <Card className="p-6 sm:p-8 bg-slate-950/90 border-slate-800 shadow-2xl backdrop-blur-xl text-left">
          <div className="mb-6">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-brand-400 flex items-center gap-1.5">
                <IconSparkles size={13} />
                <span>Customer Access</span>
              </span>
              <span className="text-[11px] font-mono text-cyan-400">
                Tenant: {tenantSlug}
              </span>
            </div>
            <h1 className="mt-1 text-2xl font-black tracking-tight text-white">
              Create Subscriber Account
            </h1>
            <p className="mt-1 text-xs text-slate-400">
              Sign up to manage your home fiber subscriptions, view invoices, and buy hotspot vouchers.
            </p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {/* Email */}
            <div>
              <Label htmlFor="email">Email Address</Label>
              <Input
                id="email"
                type="email"
                placeholder="your.email@example.com"
                className="bg-slate-900 border-slate-800 text-white text-sm focus:border-brand-500"
                {...register("email")}
              />
              {errors.email && <ErrorText>{errors.email.message}</ErrorText>}
            </div>

            {/* Phone */}
            <div>
              <Label htmlFor="phone">Phone Number (M-Pesa / SMS)</Label>
              <Input
                id="phone"
                placeholder="0712345678 or +254..."
                className="bg-slate-900 border-slate-800 text-white text-sm focus:border-brand-500 font-mono"
                {...register("phone")}
              />
              {errors.phone ? (
                <ErrorText>{errors.phone.message}</ErrorText>
              ) : (
                <HintText>Used for automated M-Pesa payment receipts and renewal notifications.</HintText>
              )}
            </div>

            {/* Password */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <Label htmlFor="password" className="mb-0">
                  Password
                </Label>
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="text-[11px] text-slate-400 hover:text-white transition-colors"
                >
                  {showPassword ? "Hide" : "Show"} password
                </button>
              </div>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="At least 10 characters"
                  className="bg-slate-900 border-slate-800 text-white text-sm focus:border-brand-500 pr-10"
                  {...register("password")}
                />
                <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-slate-500">
                  <IconLock size={16} />
                </div>
              </div>
              {errors.password && <ErrorText>{errors.password.message}</ErrorText>}
            </div>

            {/* Confirm Password */}
            <div>
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <Input
                id="confirmPassword"
                type={showPassword ? "text" : "password"}
                placeholder="Re-enter your password"
                className="bg-slate-900 border-slate-800 text-white text-sm focus:border-brand-500"
                {...register("confirmPassword")}
              />
              {errors.confirmPassword && <ErrorText>{errors.confirmPassword.message}</ErrorText>}
            </div>

            {serverError && (
              <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-xs font-medium text-rose-400">
                {serverError}
              </div>
            )}

            <Button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3 font-bold text-sm shadow-glow gap-2 mt-2"
            >
              {isSubmitting ? (
                <>
                  <span className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Creating Account...</span>
                </>
              ) : (
                <>
                  <span>Create Account</span>
                  <IconArrowRight size={15} />
                </>
              )}
            </Button>
          </form>

          <div className="mt-6 border-t border-slate-800/80 pt-4 text-center text-xs text-slate-400">
            Already have an account?{" "}
            <Link
              href={`/login?tenant=${encodeURIComponent(tenantSlug)}`}
              className="font-semibold text-brand-400 hover:text-brand-300 transition-colors"
            >
              Sign In here
            </Link>
          </div>
        </Card>
      </div>

      {/* Footer */}
      <footer className="relative z-10 mx-auto w-full max-w-7xl px-6 py-4 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 border-t border-slate-800/60 gap-2">
        <div>&copy; {new Date().getFullYear()} {tenantSlug.toUpperCase()} Subscriber Services.</div>
        <div className="flex items-center gap-3">
          <Link href="/terms" className="hover:text-slate-300">Terms</Link>
          <Link href="/refund-policy" className="hover:text-slate-300">Refunds</Link>
        </div>
      </footer>
    </main>
  );
}
