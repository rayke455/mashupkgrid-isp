import type { Metadata } from "next";

/**
 * Metadata only. The page itself is a client component ("use client"), and a client component
 * cannot export `metadata` — so without this wrapper every one of these pages would inherit the
 * site-wide title and appear in search results as a duplicate of the homepage.
 */
export const metadata: Metadata = {
  title: "Age Policy",
  description:
    "Minimum age requirements for holding an account and purchasing internet access.",
  alternates: { canonical: "/age-policy" },
  openGraph: { title: "Age Policy", description: "Minimum age requirements for holding an account and purchasing internet access.", url: "/age-policy" },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
