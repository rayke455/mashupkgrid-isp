import Link from "next/link";
import { AuthShell, authPrimaryButton, authSecondaryButton } from "@/components/marketing/auth-shell";

export default function NotFound() {
  return (
    <AuthShell
      title="Page not found"
      description="The page you're looking for doesn't exist or has moved. Check the address, or head somewhere useful below."
    >
      <p className="mb-6 font-mono text-xs text-slate-400">Error 404</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Link href="/" className={authPrimaryButton}>
          Go to homepage
        </Link>
        <Link href="/login" className={authSecondaryButton}>
          Sign in
        </Link>
      </div>
    </AuthShell>
  );
}
