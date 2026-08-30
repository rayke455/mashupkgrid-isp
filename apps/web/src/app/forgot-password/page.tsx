"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import Link from "next/link";
import { apiFetch, ApiRequestError } from "@/lib/api-client";
import { Button, Card, ErrorText, Input, Label, Badge } from "@/components/ui";
import { IconArrowRight, IconShield, IconCheck, IconPulse } from "@/components/icons";

const schema = z.object({
  tenantSlug: z.string().min(1, "Tenant slug is required"),
  email: z.string().email("Invalid email address"),
});
type FormValues = z.infer<typeof schema>;

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = async (values: FormValues) => {
    setServerError(null);
    try {
      await apiFetch("/api/v1/auth/forgot-password", {
        method: "POST",
        skipAuth: true,
        body: JSON.stringify(values),
      });
      setSent(true);
    } catch (err) {
      setServerError(err instanceof ApiRequestError ? err.message : "Something went wrong.");
    }
  };

  return (
    <main className="relative flex min-h-screen items-center justify-center px-4 bg-obsidian-950 text-slate-100 font-sans selection:bg-brand-500 selection:text-white">
      {/* Dynamic Cyber Ambient Glow */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[800px] h-[500px] bg-brand-500/15 blur-[140px] rounded-full" />
        <div className="absolute bottom-10 right-10 w-[600px] h-[400px] bg-cyan-500/10 blur-[130px] rounded-full" />
        <div className="absolute inset-0 bg-grid-pattern opacity-50" />
      </div>

      <Card className="relative z-10 w-full max-w-md p-8 shadow-2xl border-slate-800 bg-slate-900/90 backdrop-blur-xl">
        {/* Brand Logo Header */}
        <div className="flex flex-col items-center text-center mb-6">
          <Link href="/" className="group mb-4">
            <div className="h-16 w-16 overflow-hidden rounded-2xl ring-2 ring-cyan-500/40 shadow-xl shadow-cyan-500/25 bg-slate-950 flex items-center justify-center transition-transform group-hover:scale-105">
              <img src="/logo.jpg" alt="Mashupkgrid ISP Logo" className="h-full w-full object-cover" />
            </div>
          </Link>

          <Badge variant="info">Account Security</Badge>
          <h1 className="text-2xl font-black text-white tracking-tight mt-2">
            Reset Password
          </h1>
          <p className="text-xs text-slate-400 mt-1 max-w-xs">
            We will dispatch a secure recovery token to your registered email address.
          </p>
        </div>

        {sent ? (
          <div className="text-center py-4 space-y-4 font-sans">
            <div className="p-4 rounded-xl bg-emerald-950/60 border border-emerald-500/40 text-emerald-300 text-xs font-mono">
              <IconCheck size={20} className="mx-auto mb-2 text-emerald-400" />
              If an account exists for that email, a password recovery token has been dispatched. Please check your inbox and spam folder.
            </div>

            <Link href="/login" className="block">
              <Button className="w-full py-2.5 font-semibold shadow-glow">
                Return to Operator Sign In
              </Button>
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <Label htmlFor="tenantSlug">Tenant Organization ID / Slug</Label>
              <Input
                id="tenantSlug"
                placeholder="e.g. demo-isp or master"
                className="font-mono text-xs"
                {...register("tenantSlug")}
              />
              {errors.tenantSlug && <ErrorText>{errors.tenantSlug.message}</ErrorText>}
            </div>

            <div>
              <Label htmlFor="email">Registered Email Address</Label>
              <Input
                id="email"
                type="email"
                placeholder="operator@yourisp.co.ke"
                className="font-mono text-xs"
                {...register("email")}
              />
              {errors.email && <ErrorText>{errors.email.message}</ErrorText>}
            </div>

            {serverError && <ErrorText>{serverError}</ErrorText>}

            <Button type="submit" disabled={isSubmitting} className="w-full py-3 font-bold shadow-glow gap-2">
              {isSubmitting ? <IconPulse size={14} className="animate-spin" /> : <IconArrowRight size={14} />}
              <span>{isSubmitting ? "Dispatching Token..." : "Send Reset Token"}</span>
            </Button>

            <div className="text-center pt-2">
              <Link href="/login" className="text-xs text-slate-400 hover:text-white transition-colors">
                &larr; Back to sign in
              </Link>
            </div>
          </form>
        )}

        {/* Footer */}
        <div className="mt-6 pt-4 border-t border-slate-800/80 text-[11px] font-mono text-slate-500 flex items-center justify-between">
          <Link href="/terms" className="hover:text-slate-400">Terms</Link>
          <span className="flex items-center gap-1 text-emerald-400">
            <IconShield size={12} />
            <span>TLS 1.3 Active</span>
          </span>
          <Link href="/refund-policy" className="hover:text-slate-400">Refunds</Link>
        </div>
      </Card>
    </main>
  );
}
