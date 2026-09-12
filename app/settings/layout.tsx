import { redirect } from "next/navigation";
import { SettingsShell } from "@/components/settings/SettingsShell";

export const dynamic = "force-dynamic";

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  if (process.env.DEMO?.trim().toLowerCase() === "true") {
    redirect("/chat");
  }
  return <SettingsShell>{children}</SettingsShell>;
}
