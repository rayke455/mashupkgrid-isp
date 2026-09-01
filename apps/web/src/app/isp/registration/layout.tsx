import type { Metadata } from "next";

/**
 * Metadata only. The page itself is a client component ("use client"), and a client component
 * cannot export `metadata` — so without this wrapper every one of these pages would inherit the
 * site-wide title and appear in search results as a duplicate of the homepage.
 */
export const metadata: Metadata = {
  title: "Register your ISP",
  description:
    "Start selling internet with M-Pesa and card billing, Wi-Fi vouchers and MikroTik router management.",
  alternates: { canonical: "/isp/registration" },
  openGraph: { title: "Register your ISP", description: "Start selling internet with M-Pesa and card billing, Wi-Fi vouchers and MikroTik router management.", url: "/isp/registration" },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
