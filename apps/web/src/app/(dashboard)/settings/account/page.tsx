"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiFetch, ApiRequestError } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { Button, Card, ErrorText, HintText, Input, Label } from "@/components/ui";
import { IconLock, IconUser } from "@/components/icons";

interface Profile {
  id: string;
  email: string | null;
  phone: string | null;
  createdAt: string;
}

export default function AccountSettingsPage() {
  const router = useRouter();
  const { logout } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const { data: profile } = useQuery({
    queryKey: ["my-profile"],
    queryFn: () => apiFetch<Profile>("/api/v1/me/profile"),
  });

  const changePassword = useMutation({
    mutationFn: () =>
      apiFetch("/api/v1/me/change-password", {
        method: "POST",
        body: JSON.stringify({ currentPassword, newPassword }),
      }),
    onSuccess: async () => {
      setDone(true);
      // The API just revoked every session, including this one — the stored access token is
      // already dead, so clear local state and send the user back to /login rather than let the
      // next request surface a confusing 401.
      await logout().catch(() => {});
      setTimeout(() => router.replace("/login"), 2000);
    },
    onError: (err) => setError(err instanceof ApiRequestError ? err.message : "Failed to change password"),
  });

  return (
    <div className="max-w-lg space-y-8">
      <div>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Account</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">Your profile and sign-in security.</p>
      </div>

      <Card>
        <div className="mb-3 flex items-center gap-2">
          <IconUser className="text-brand-600 dark:text-brand-400" />
          <h3 className="font-semibold text-slate-900 dark:text-white">Profile</h3>
        </div>
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-slate-500">Email</dt>
            <dd className="font-medium text-slate-900 dark:text-white">{profile?.email ?? "—"}</dd>
          </div>
          {profile?.phone && (
            <div className="flex justify-between">
              <dt className="text-slate-500">Phone</dt>
              <dd className="font-medium text-slate-900 dark:text-white">{profile.phone}</dd>
            </div>
          )}
        </dl>
      </Card>

      <Card>
        <div className="mb-3 flex items-center gap-2">
          <IconLock className="text-brand-600 dark:text-brand-400" />
          <h3 className="font-semibold text-slate-900 dark:text-white">Password</h3>
        </div>

        {done ? (
          <p className="text-sm text-emerald-600 dark:text-emerald-400">
            Password changed. You&apos;ve been signed out everywhere — redirecting to login...
          </p>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setError(null);
              if (newPassword !== confirmPassword) {
                setError("New password and confirmation do not match");
                return;
              }
              changePassword.mutate();
            }}
            className="space-y-4"
          >
            <div>
              <Label htmlFor="currentPassword">Current password</Label>
              <Input
                id="currentPassword"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
              />
            </div>
            <div>
              <Label htmlFor="newPassword">New password</Label>
              <Input
                id="newPassword"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={10}
              />
              <HintText>At least 10 characters, with a letter and a digit or symbol.</HintText>
            </div>
            <div>
              <Label htmlFor="confirmPassword">Confirm new password</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
            </div>
            <Button type="submit" disabled={changePassword.isPending}>
              {changePassword.isPending ? "Changing..." : "Change password"}
            </Button>
            {error && <ErrorText>{error}</ErrorText>}
          </form>
        )}
      </Card>
    </div>
  );
}
