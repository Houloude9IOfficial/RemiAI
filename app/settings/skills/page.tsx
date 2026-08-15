import { SkillsSettings } from "@/components/settings/skills/SkillsSettings";
import CenteredLayout from "@/components/layout/CenteredLayout";

export default function SkillsSettingsPage() {
  return (
    <CenteredLayout>
      <div className="flex max-w-3xl flex-col gap-6">
        <div>
          <h1 className="text-lg font-semibold">Skills</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Skills are markdown instruction packages that extend Remi with
            specialized behaviors. Install them from curated repositories or
            the skills.sh ecosystem, then enable the ones you want active in
            every chat.
          </p>
        </div>
        <SkillsSettings />
      </div>
    </CenteredLayout>
  );
}
