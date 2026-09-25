import { redirect } from "next/navigation";

// Portal design now lives in the Hotspot section.
export default function ThemesPage() {
  redirect("/vouchers?tab=portal");
}
