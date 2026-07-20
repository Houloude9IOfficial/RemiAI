"use client";

import { ScheduledTaskList } from "@/components/settings/ScheduledTaskList";
import CenteredLayout from "@/components/layout/CenteredLayout";
import { Clock } from "lucide-react";

export default function ScheduledTasksSettingsPage() {
  return (
    <CenteredLayout>
      <div className="flex max-w-3xl flex-col gap-6">
        <div>
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-muted-foreground" />
            <h1 className="text-lg font-semibold">Scheduled Tasks</h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            View and manage tasks you&apos;ve asked the AI to execute at a
            future time. When a task is due, the AI will process it in the
            original conversation and send you a desktop notification with
            the results.
          </p>
        </div>

        <ScheduledTaskList />
      </div>
    </CenteredLayout>
  );
}
