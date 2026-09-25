"use client";

import { Suspense, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import Link from "next/link";
import { apiFetch, ApiRequestError } from "@/lib/api-client";
import { ErrorText, Input, Label } from "@/components/ui";
import { IconCheck } from "@/components/icons";
import { AuthShell, Spinner, authPrimaryButton } from "@/components/marketing/auth-shell";

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
  const strengthColors = ["bg-red-500", "bg-amber-500", "bg-blue-600", "bg-emerald-600"];

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

  if (!token) {
    return (
      <AuthShell
        title="This link isn't valid"
        description="The password reset link is missing its token. It may have been copied incompletely — request a new one."
      >
        <Link href="/forgot-password" className={authPrimaryButton}>
          Request a new link
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Set a new password" description="Choose a password you don't use anywhere else.">
      {success ? (
        <div role="status" className="flex gap-3 rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm leading-6 text-emerald-900">
          <IconCheck size={18} className="mt-0.5 shrink-0 text-emerald-700" aria-hidden="true" />
          <span>
            <strong className="font-semibold">Password updated.</strong> Taking you to sign in…
          </span>
        </div>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <Label htmlFor="password" className="mb-0">
                New password
              </Label>
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                aria-pressed={showPassword}
                className="rounded text-xs font-medium text-blue-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              {...register("password")}
            />

            {passwordValue.length > 0 && (
              <div className="mt-2 space-y-1.5">
                <div className="flex h-1 w-full gap-1">
                  {[1, 2, 3, 4].map((step) => (
                    <div
                      key={step}
                      className={`h-full flex-1 rounded-full transition-colors duration-300 ${
                        strength >= step ? strengthColors[strength - 1] : "bg-slate-200"
                      }`}
                    />
                  ))}
                </div>
                <div className="flex justify-between text-xs text-slate-500">
                  <span>
                    Strength: <strong className="font-medium text-slate-800">{strengthLabels[strength - 1] ?? "Too short"}</strong>
                  </span>
                  <span>Min {PASSWORD_MIN_LENGTH} characters</span>
                </div>
              </div>
            )}

            {errors.password && <ErrorText>{errors.password.message}</ErrorText>}
          </div>

          <div>
            <Label htmlFor="confirmPassword">Confirm password</Label>
            <Input
              id="confirmPassword"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              {...register("confirmPassword")}
            />
            {errors.confirmPassword && <ErrorText>{errors.confirmPassword.message}</ErrorText>}
          </div>

          {serverError && (
            <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-3.5 py-3 text-sm text-red-800">
              {serverError}{" "}
              <Link href="/forgot-password" className="font-semibold underline">
                Request a new link
              </Link>
            </div>
          )}

          <button type="submit" disabled={isSubmitting} className={authPrimaryButton}>
            {isSubmitting && <Spinner />}
            {isSubmitting ? "Saving…" : "Save new password"}
          </button>

          <p className="text-center text-sm">
            <Link href="/login" className="font-medium text-slate-600 hover:text-slate-950">
              &larr; Back to sign in
            </Link>
          </p>
        </form>
      )}
    </AuthShell>
  );
}
