"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import Link from "next/link";
import { apiFetch, ApiRequestError } from "@/lib/api-client";
import { ErrorText, Input, Label } from "@/components/ui";
import { IconCheck } from "@/components/icons";
import { AuthShell, Spinner, authPrimaryButton, authSecondaryButton } from "@/components/marketing/auth-shell";

const schema = z.object({
  email: z.string().email("Please enter a valid email address"),
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
    <AuthShell
      title="Reset your password"
      description="Enter your account email, and we'll send you a link to set a new password."
    >
      {sent ? (
        <div className="space-y-5">
          <div role="status" className="flex gap-3 rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm leading-6 text-emerald-900">
            <IconCheck size={18} className="mt-0.5 shrink-0 text-emerald-700" aria-hidden="true" />
            <span>If an account exists for that email, a reset link is on its way. Check your inbox and spam folder.</span>
          </div>
          <Link href="/login" className={authSecondaryButton}>
            Back to sign in
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
          <div>
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" autoComplete="email" placeholder="you@yourisp.co.ke" {...register("email")} />
            {errors.email && <ErrorText>{errors.email.message}</ErrorText>}
          </div>

          {serverError && (
            <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-3.5 py-3 text-sm text-red-800">
              {serverError}
            </div>
          )}

          <button type="submit" disabled={isSubmitting} className={authPrimaryButton}>
            {isSubmitting && <Spinner />}
            {isSubmitting ? "Sending…" : "Send reset link"}
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
