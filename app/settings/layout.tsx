import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  if (process.env.DEMO?.trim().toLowerCase() === "true") {
    redirect("/chat");
  }
  return children;
}
