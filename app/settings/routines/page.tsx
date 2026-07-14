import { RoutineList } from "@/components/settings/RoutineList";
import CenteredLayout from '@/components/layout/CenteredLayout';

export default function RoutinesSettingsPage() {
  return (
    <CenteredLayout>
      <div className="flex max-w-3xl flex-col gap-6">
        <div>
          <h1 className="text-lg font-semibold">Routines</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Create and manage reusable JavaScript routines. Routines can be run
            manually by the AI in chat or scheduled automatically with cron
            expressions. Perfect for automation tasks like health checks,
            backups, or data processing.
          </p>
        </div>
        <RoutineList />
      </div>
    </CenteredLayout>
  );
}
