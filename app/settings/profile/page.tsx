import { ProfileForm } from "@/components/settings/ProfileForm";
import { AccountSecurity } from "@/components/settings/AccountSecurity";
import { NotificationSettings } from "@/components/settings/NotificationSettings";

export default function ProfileSettingsPage() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <ProfileForm />
      <NotificationSettings />
      <AccountSecurity />
      <p className="text-center text-[11px] leading-relaxed text-muted-foreground/60">
        This interface gives the AI a wide range of tools to be as accurate as
        possible. However, the performance and quality of the results ultimately
        depend on the capabilities of the underlying model and, as with all AI,
        it may be wrong or make up information. Always double-check important
        results and use your own judgment. The AI has access to your data and
        information, so please be cautious with what you share.
      </p>
    </div>
  );
}
