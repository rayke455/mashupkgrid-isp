import type { Metadata } from "next";

/**
 * Metadata only. The page itself is a client component ("use client"), and a client component
 * cannot export `metadata` — so without this wrapper every one of these pages would inherit the
 * site-wide title and appear in search results as a duplicate of the homepage.
 */
export const metadata: Metadata = {
  title: "Refund Policy",
  description:
    "How refunds are handled for hotspot vouchers, subscription payments and service credits.",
  alternates: { canonical: "/refund-policy" },
  openGraph: { title: "Refund Policy", description: "How refunds are handled for hotspot vouchers, subscription payments and service credits.", url: "/refund-policy" },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
