import { MemoryList } from "@/components/settings/MemoryList";
import CenteredLayout from '@/components/layout/CenteredLayout';

export default function MemoriesSettingsPage() {
  return (
    <CenteredLayout>
      <div className="flex max-w-3xl flex-col gap-6">
        <div>
          <h1 className="text-lg font-semibold">Memories</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Memories are short facts the AI remembers about you across conversations.
            The AI saves them automatically — you can review, search, or delete them here.
          </p>
        </div>
        <MemoryList />
      </div>
    </CenteredLayout>
  );
}
