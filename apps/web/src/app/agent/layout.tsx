import type { Metadata, Viewport } from "next";
import { LanguageProvider } from "@/lib/language-context";

/** The agent's app: sell vouchers, take payments, see the monthly statement. */
export const metadata: Metadata = {
  title: "Agent",
  description: "Sell WiFi vouchers and take customers' bill payments.",
};

export const viewport: Viewport = {
  themeColor: "#090d16",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function AgentLayout({ children }: { children: React.ReactNode }) {
  return <LanguageProvider>{children}</LanguageProvider>;
}
