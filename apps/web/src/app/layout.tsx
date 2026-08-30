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
  maximumScale: 1,
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
