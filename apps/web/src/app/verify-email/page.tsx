"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch, ApiRequestError } from "@/lib/api-client";
import { IconCheck, IconArrowRight } from "@/components/icons";
import { AuthShell, authPrimaryButton } from "@/components/marketing/auth-shell";

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={null}>
      <VerifyEmailForm />
    </Suspense>
  );
}

function VerifyEmailForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [status, setStatus] = useState<"pending" | "success" | "error">("pending");
  const [message, setMessage] = useState<string>("Checking your verification link…");
  const [countdown, setCountdown] = useState(5);

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setMessage("This verification link is incomplete or has expired.");
      return;
    }

    apiFetch(`/api/v1/auth/verify-email?token=${encodeURIComponent(token)}`, { skipAuth: true })
      .then(() => {
        setStatus("success");
        setMessage("Your email address is verified and your account is active.");
      })
      .catch((err) => {
        setStatus("error");
        setMessage(err instanceof ApiRequestError ? err.message : "This verification link has expired or has already been used.");
      });
  }, [token]);

  // Auto-redirect countdown on success
  useEffect(() => {
    if (status !== "success") return;
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          router.push("/login");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [status, router]);

  return (
    <AuthShell
      title={
        status === "pending" ? "Verifying your email…" : status === "success" ? "Email verified" : "We couldn't verify your email"
      }
    >
      {status === "pending" && (
        <div role="status" className="flex items-center gap-3 text-sm text-slate-600">
          <span aria-hidden="true" className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-blue-700" />
          {message}
        </div>
      )}

      {status === "success" && (
        <div className="space-y-5">
          <div role="status" className="flex gap-3 rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm leading-6 text-emerald-900">
            <IconCheck size={18} className="mt-0.5 shrink-0 text-emerald-700" aria-hidden="true" />
            <span>{message}</span>
          </div>
          <p className="text-sm text-slate-600">
            Taking you to sign in in <span className="font-semibold tabular-nums text-slate-900">{countdown}s</span>.
          </p>
          <Link href="/login" className={authPrimaryButton}>
            Sign in now <IconArrowRight size={15} />
          </Link>
        </div>
      )}

      {status === "error" && (
        <div className="space-y-5">
          <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-3.5 py-3 text-sm leading-6 text-red-800">
            {message}
          </div>
          <Link href="/login" className={authPrimaryButton}>
            Go to sign in
          </Link>
          <p className="text-center text-sm">
            <Link href="/register" className="font-medium text-blue-700 hover:text-blue-800">
              Create a new account
            </Link>
          </p>
        </div>
      )}
    </AuthShell>
  );
}
