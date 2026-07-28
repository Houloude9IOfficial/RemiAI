import { ProfileForm } from "@/components/settings/ProfileForm";
import { AccountSecurity } from "@/components/settings/AccountSecurity";

export default function ProfileSettingsPage() {
  return <div className="flex flex-col gap-6"><ProfileForm /><AccountSecurity /></div>;
}
