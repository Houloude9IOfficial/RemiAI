import { ToolList } from "@/components/settings/ToolList";
import CenteredLayout from '@/components/layout/CenteredLayout';

export default function ToolsSettingsPage() {
  return (
    <CenteredLayout>
      <div className="flex max-w-3xl flex-col gap-6">
        <div>
          <h1 className="text-lg font-semibold">Tools</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Browse all available tools and manage integration settings.
            Built-in tools are always active, integrations can be toggled
            and configured with API keys.
          </p>
        </div>
        <ToolList />
      </div>
    </CenteredLayout>
  );
}
