import { MemoryList } from "@/components/settings/MemoryList";
import CenteredLayout from '@/components/layout/CenteredLayout';

export default function MemoriesSettingsPage() {
  return (
    <CenteredLayout>
      <div className="flex max-w-3xl flex-col gap-6">
        <div>
          <h1 className="text-lg font-semibold">Memories</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Your AI can remember information across conversations, like your name, preferences, or other details you share.
          </p>
        </div>
        <MemoryList />
      </div>
    </CenteredLayout>
  );
}
