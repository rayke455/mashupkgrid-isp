"use client";

import { useEffect, useState } from "react";
import { getAccessToken, getApiBaseUrl } from "@/lib/api-client";

/** An image from an authenticated API path; a plain <img src> cannot send the bearer token. */
export function AuthImage({ path, alt, className }: { path: string; alt: string; className?: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let revoked = false;
    let objectUrl: string | null = null;
    const token = getAccessToken();
    fetch(`${getApiBaseUrl()}${path}`, { headers: token ? { authorization: `Bearer ${token}` } : {}, credentials: "include" })
      .then((r) => (r.ok ? r.blob() : null))
      .then((blob) => {
        if (!blob || revoked) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => undefined);
    return () => {
      revoked = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [path]);
  // eslint-disable-next-line @next/next/no-img-element
  return url ? <img src={url} alt={alt} className={className} /> : <div className={`${className ?? ""} animate-pulse bg-slate-200 dark:bg-obsidian-800`} />;
}
