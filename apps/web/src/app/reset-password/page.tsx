"use client";

import { Suspense, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import Link from "next/link";
import { apiFetch, ApiRequestError } from "@/lib/api-client";
import { Button, Card, ErrorText, HintText, Input, Label, Badge } from "@/components/ui";
import { IconCheck, IconShield, IconArrowRight, IconPulse } from "@/components/icons";

const PASSWORD_MIN_LENGTH = 10;
const schema = z.object({
  password: z.string().min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters`),
  confirmPassword: z.string().min(1, "Please confirm your password"),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});
type FormValues = z.infer<typeof schema>;

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  );
}

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token");
  const [serverError, setServerError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [success, setSuccess] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema), mode: "onChange" });

  const passwordValue = watch("password") ?? "";

  // Password strength calculation
  const getStrength = (pass: string) => {
    let score = 0;
    if (pass.length >= 10) score += 1;
    if (/[A-Z]/.test(pass)) score += 1;
    if (/[0-9]/.test(pass)) score += 1;
    if (/[^A-Za-z0-9]/.test(pass)) score += 1;
    return score;
  };

  const strength = getStrength(passwordValue);
  const strengthLabels = ["Weak", "Fair", "Good", "Strong"];
  const strengthColors = ["bg-rose-500", "bg-amber-500", "bg-cyan-500", "bg-emerald-500"];

  const onSubmit = async (values: FormValues) => {
    if (!token) {
      setServerError("Missing or invalid password reset token.");
      return;
    }
    setServerError(null);
    try {
      await apiFetch("/api/v1/auth/reset-password", {
        method: "POST",
        skipAuth: true,
        body: JSON.stringify({ token, password: values.password }),
      });
      setSuccess(true);
      setTimeout(() => router.push("/login"), 2000);
    } catch (err) {
      setServerError(err instanceof ApiRequestError ? err.message : "Reset failed or token expired.");
    }
  };

  return (
    <main className="relative flex min-h-screen items-center justify-center px-4 bg-obsidian-950 text-slate-100 font-sans selection:bg-brand-500 selection:text-white">
      {/* Ambient Glow */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[800px] h-[500px] bg-brand-500/15 blur-[140px] rounded-full" />
        <div className="absolute bottom-10 right-10 w-[600px] h-[400px] bg-emerald-500/10 blur-[130px] rounded-full" />
        <div className="absolute inset-0 bg-grid-pattern opacity-50" />
      </div>

      <Card className="relative z-10 w-full max-w-md p-8 shadow-2xl border-slate-800 bg-slate-900/90 backdrop-blur-xl">
        <div className="flex flex-col items-center text-center mb-6">
          <Link href="/" className="group mb-4">
            <div className="h-16 w-16 overflow-hidden rounded-2xl ring-2 ring-cyan-500/40 shadow-xl shadow-cyan-500/25 bg-slate-950 flex items-center justify-center transition-transform group-hover:scale-105">
              <img src="/logo.jpg" alt="Mashupkgrid ISP Logo" className="h-full w-full object-cover" />
            </div>
          </Link>

          <Badge variant="info">Credential Update</Badge>
          <h1 className="text-2xl font-black tracking-tight text-white mt-2">
            Set New Password
          </h1>
          <p className="mt-1 text-xs text-slate-400">
            Create a robust password to secure your ISP console and MikroTik API keys.
          </p>
        </div>

        {success ? (
          <div className="p-4 rounded-xl bg-emerald-950/60 border border-emerald-500/40 text-emerald-300 text-xs font-mono text-center space-y-2">
            <IconCheck size={20} className="mx-auto text-emerald-400" />
            <div className="font-bold text-white">Password Updated Successfully!</div>
            <div>Redirecting you to login...</div>
          </div>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {/* New Password */}
            <div>
              <div className="flex items-center justify-between">
                <Label htmlFor="password">New Password</Label>
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="text-[11px] font-mono text-brand-400 hover:text-brand-300"
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>

              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                placeholder="••••••••••••"
                className="font-mono text-xs"
                {...register("password")}
              />

              {/* Password Strength Meter */}
              {passwordValue.length > 0 && (
                <div className="mt-2 space-y-1">
                  <div className="flex gap-1 h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                    {[1, 2, 3, 4].map((step) => (
                      <div
                        key={step}
                        className={`h-full flex-1 transition-all duration-300 ${
                          strength >= step ? strengthColors[strength - 1] : "bg-transparent"
                        }`}
                      />
                    ))}
                  </div>
                  <div className="flex justify-between text-[10px] font-mono text-slate-400">
                    <span>Strength: <strong className="text-white">{strengthLabels[strength - 1] ?? "Too short"}</strong></span>
                    <span>Min {PASSWORD_MIN_LENGTH} chars</span>
                  </div>
                </div>
              )}

              {errors.password && <ErrorText>{errors.password.message}</ErrorText>}
            </div>

            {/* Confirm Password */}
            <div>
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <Input
                id="confirmPassword"
                type={showPassword ? "text" : "password"}
                placeholder="••••••••••••"
                className="font-mono text-xs"
                {...register("confirmPassword")}
              />
              {errors.confirmPassword && <ErrorText>{errors.confirmPassword.message}</ErrorText>}
            </div>

            {serverError && <ErrorText>{serverError}</ErrorText>}

            <Button type="submit" disabled={isSubmitting} className="w-full py-3 font-bold shadow-glow gap-2">
              {isSubmitting ? <IconPulse size={14} className="animate-spin" /> : <IconCheck size={14} />}
              <span>{isSubmitting ? "Updating Password..." : "Save New Password"}</span>
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
            <span>SHA-256 Argon2id</span>
          </span>
          <Link href="/refund-policy" className="hover:text-slate-400">Refunds</Link>
        </div>
      </Card>
    </main>
  );
}
