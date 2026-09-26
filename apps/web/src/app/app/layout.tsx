import type { Metadata, Viewport } from "next";
import { LanguageProvider } from "@/lib/language-context";

/** The installable customer app: its own manifest, so it installs as "My Internet" and opens on /app. */
export const metadata: Metadata = {
  title: "My Internet",
  description: "Your internet account: balance, bills, M-Pesa payment and support.",
  manifest: "/customer.webmanifest",
  appleWebApp: { capable: true, title: "My Internet", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: "#090d16",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function CustomerAppLayout({ children }: { children: React.ReactNode }) {
  return <LanguageProvider>{children}</LanguageProvider>;
}
