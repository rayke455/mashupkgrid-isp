import type { Metadata, Viewport } from "next";
import "./globals.css";
import { QueryProvider } from "@/lib/query-provider";
import { AuthProvider } from "@/lib/auth-context";
import { MaintenanceBanner } from "@/components/maintenance-banner";
import { PwaInstallPrompt } from "@/components/pwa-install-prompt";

export const viewport: Viewport = {
  themeColor: "#090d16",
  width: "device-width",
  initialScale: 1,
  // No maximumScale: 1. Pinch-to-zoom is how a low-vision customer reads a voucher code or an
  // invoice line on a phone, and locking it out fails WCAG 1.4.4. iOS's "zooms on focus" quirk
  // that this is usually reached for is already avoided by the app's 16px form-field sizing.
};

export const metadata: Metadata = {
  title: "MASHUPKGRID ISP Platform",
  description: "Enterprise ISP billing, network management, and operations platform",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/logo.jpg",
    apple: "/logo.jpg",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="bg-obsidian-950 text-slate-100 antialiased min-h-screen">
        <QueryProvider>
          <AuthProvider>
            <MaintenanceBanner />
            {children}
            <PwaInstallPrompt />
          </AuthProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
