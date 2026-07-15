import { WatcherStatus } from "@/components/settings/WatcherStatus";
import CenteredLayout from "@/components/layout/CenteredLayout";

export default function WatcherSettingsPage() {
  return (
    <CenteredLayout>
      <div className="flex max-w-3xl flex-col gap-6">
        <div>
          <h1 className="text-lg font-semibold">File Watcher</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Monitor the file index status, track which directories are being watched,
            and trigger manual re-scans. The watcher runs automatically and indexes
            file changes in the background.
          </p>
        </div>
        <WatcherStatus />
      </div>
    </CenteredLayout>
  );
}
