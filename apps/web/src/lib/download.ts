import { getAccessToken, getApiBaseUrl } from "@/lib/api-client";

/**
 * Downloads a file from an authenticated API endpoint (a CSV export, say). `apiFetch` parses
 * JSON, so it cannot be used for this; the bearer token is attached the same way it does.
 */
export async function downloadFromApi(path: string, fallbackFilename: string): Promise<void> {
  const token = getAccessToken();
  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
    credentials: "include",
  });
  if (!response.ok) {
    let message = `Download failed (${response.status})`;
    try {
      const body = (await response.json()) as { error?: { message?: string } };
      if (body.error?.message) message = body.error.message;
    } catch {
      // not JSON; keep the status message
    }
    throw new Error(message);
  }
  const disposition = response.headers.get("content-disposition") ?? "";
  const filename = /filename="([^"]+)"/.exec(disposition)?.[1] ?? fallbackFilename;
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
