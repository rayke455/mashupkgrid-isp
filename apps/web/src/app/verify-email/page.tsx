"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch, ApiRequestError } from "@/lib/api-client";
import { Card, Button, Badge } from "@/components/ui";
import { IconCheck, IconArrowRight, IconPulse, IconShield } from "@/components/icons";

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
  const [message, setMessage] = useState<string>("Authenticating subscriber cryptographic token...");
  const [countdown, setCountdown] = useState(5);

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setMessage("Missing or expired verification token. Please request a fresh authorization link.");
      return;
    }

    apiFetch(`/api/v1/auth/verify-email?token=${encodeURIComponent(token)}`, { skipAuth: true })
      .then(() => {
        setStatus("success");
        setMessage("Your email address has been verified. Your FreeRADIUS ISP operator account is active and provisioned.");
      })
      .catch((err) => {
        setStatus("error");
        setMessage(err instanceof ApiRequestError ? err.message : "Verification link expired or already utilized.");
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
    <main className="relative flex min-h-screen items-center justify-center px-4 bg-obsidian-950 text-slate-100 font-sans selection:bg-brand-500 selection:text-white">
      {/* Dynamic Cyber Mesh Background */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[800px] h-[500px] bg-brand-500/15 blur-[140px] rounded-full" />
        <div className="absolute bottom-10 right-10 w-[600px] h-[400px] bg-emerald-500/10 blur-[130px] rounded-full" />
        <div className="absolute inset-0 bg-grid-pattern opacity-50" />
      </div>

      <Card className="relative z-10 w-full max-w-md p-8 text-center shadow-2xl border-slate-800 bg-slate-900/90 backdrop-blur-xl">
        {/* Brand Logo */}
        <div className="relative mx-auto mb-5 h-16 w-16 overflow-hidden rounded-2xl ring-2 ring-cyan-500/40 shadow-lg shadow-cyan-500/25 bg-slate-950 flex items-center justify-center">
          <img src="/logo.jpg" alt="Mashupkgrid ISP Logo" className="h-full w-full object-cover" />
        </div>

        {/* Verification Status Pill */}
        <div className="inline-flex items-center gap-2 mb-3">
          {status === "pending" && (
            <Badge variant="info">
              <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-pulse" />
              <span>Verifying Token</span>
            </Badge>
          )}
          {status === "success" && (
            <Badge variant="success">
              <IconCheck size={12} className="text-emerald-400" />
              <span>Account Activated</span>
            </Badge>
          )}
          {status === "error" && (
            <Badge variant="danger">
              <span>Token Unresolved</span>
            </Badge>
          )}
        </div>

        <h1 className="text-2xl font-black text-white tracking-tight">
          {status === "pending" && "Verifying Credentials"}
          {status === "success" && "Welcome to Mashupkgrid"}
          {status === "error" && "Verification Interrupted"}
        </h1>

        <p className={`mt-3 text-xs sm:text-sm leading-relaxed ${
          status === "error" ? "text-rose-400" : "text-slate-300"
        }`}>
          {message}
        </p>

        {/* Success State Details & Countdown */}
        {status === "success" && (
          <div className="mt-6 space-y-4">
            <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 text-xs font-mono text-slate-400 flex items-center justify-between">
              <span>Redirecting to Console in:</span>
              <span className="text-emerald-400 font-bold text-sm bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                {countdown}s
              </span>
            </div>

            <Link href="/login" className="block">
              <Button className="w-full py-3 font-bold shadow-glow gap-2">
                <span>Sign in to Console Now</span>
                <IconArrowRight size={14} />
              </Button>
            </Link>
          </div>
        )}

        {/* Error State CTAs */}
        {status === "error" && (
          <div className="mt-6 space-y-3">
            <Link href="/login" className="block">
              <Button className="w-full py-2.5 font-semibold">
                Proceed to Sign In
              </Button>
            </Link>

            <Link
              href="/register"
              className="inline-block text-xs font-mono text-brand-400 hover:text-brand-300 transition-colors"
            >
              Request New Account Verification &rarr;
            </Link>
          </div>
        )}

        {/* Bottom Telecom Trust Footer */}
        <div className="mt-8 pt-4 border-t border-slate-800/80 text-[11px] font-mono text-slate-500 flex items-center justify-center gap-2">
          <IconShield size={13} className="text-emerald-400" />
          <span>Secured by FreeRADIUS 3.2 TLS Handshake</span>
        </div>
      </Card>
    </main>
  );
}
