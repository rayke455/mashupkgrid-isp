import type { Metadata } from "next";

/**
 * Metadata only. The page itself is a client component ("use client"), and a client component
 * cannot export `metadata` — so without this wrapper every one of these pages would inherit the
 * site-wide title and appear in search results as a duplicate of the homepage.
 */
export const metadata: Metadata = {
  title: "Referral Policy",
  description:
    "How referral rewards are earned, credited and paid out.",
  alternates: { canonical: "/referral-policy" },
  openGraph: { title: "Referral Policy", description: "How referral rewards are earned, credited and paid out.", url: "/referral-policy" },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
