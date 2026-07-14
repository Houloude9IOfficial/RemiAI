"use client";

import { useQuery } from "@tanstack/react-query";
import { RoutineList } from "@/components/settings/RoutineList";
import CenteredLayout from "@/components/layout/CenteredLayout";
import { toolsApi } from "@/lib/api/tools";
import { Button } from "@/components/ui/button";
import { Terminal, Settings } from "lucide-react";
import Link from "next/link";

export default function RoutinesSettingsPage() {
  const { data: tools, isLoading, isError } = useQuery({
    queryKey: ["tools"],
    queryFn: toolsApi.list,
  });

  const routinesTool = tools?.find((t) => t.id === "routines");
  const isEnabled = routinesTool?.config?.enabled ?? false;

  return (
    <CenteredLayout>
      <div className="flex max-w-3xl flex-col gap-6">
        <div>
          <h1 className="text-lg font-semibold">Routines</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Create and manage reusable JavaScript routines. Routines can be run
            manually by the AI in chat or from this settings panel. Perfect for
            automation tasks like health checks, backups, or data processing.
          </p>
        </div>

        {!isLoading && !isError && !isEnabled ? (
          <div className="relative flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-muted-foreground/25 bg-background/50 p-8 min-h-[300px]">
            <Terminal className="h-10 w-10 text-muted-foreground/40" />
            <div className="text-center max-w-sm">
              <h3 className="text-sm font-medium">Routines Disabled</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                The Routines tool is currently disabled in your tool settings.
                Enable it to create, manage, and run JavaScript routines.
              </p>
            </div>
            <Link href="/settings/tools">
              <Button size="sm" variant="outline">
                <Settings className="h-3.5 w-3.5 mr-1.5" />
                Open Tool Settings
              </Button>
            </Link>
          </div>
        ) : (
          <RoutineList />
        )}
      </div>
    </CenteredLayout>
  );
}
