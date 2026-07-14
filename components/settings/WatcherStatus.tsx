"use client";

import { useEffect, useState, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Activity,
  Eye,
  EyeOff,
  FolderOpen,
  FileText,
  Loader2,
  ScanSearch,
} from "lucide-react";
import { toast } from "sonner";
import { watcherApi, type WatcherStatus } from "@/lib/api/watcher";
import { cn } from "@/lib/utils";

export function WatcherStatus() {
  const queryClient = useQueryClient();

  // Initial data load — SSE handles real-time updates, but we fall back
  // to polling every 60s as a safety net if the SSE connection drops.
  const { data: initialData, isLoading } = useQuery({
    queryKey: ["watcher-status"],
    queryFn: watcherApi.status,
    staleTime: 60_000,
    refetchInterval: 60_000,
  });

  // Live state driven by SSE events
  const [liveStatus, setLiveStatus] = useState<WatcherStatus | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  // Connect to SSE for real-time updates
  useEffect(() => {
    // Close any existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const es = new EventSource("/api/watcher/stream");
    eventSourceRef.current = es;

    es.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.type === "connected") {
          // Connection established — ignore, initial load already happened via query
          return;
        }
        if (payload.status) {
          setLiveStatus(payload.status);
        }
      } catch {
        // Ignore malformed SSE data
      }
    };

    es.onerror = () => {
      // SSE connection lost — will auto-reconnect by default
      // If it fails permanently, we still have the initial data
    };

    return () => {
      es.close();
      eventSourceRef.current = null;
    };
  }, []);

  // Merge initial data with live SSE updates
  const data = liveStatus ?? initialData;

  const scanMutation = useMutation({
    mutationFn: watcherApi.scan,
    onSuccess: (result) => {
      toast.success(result.message);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const scanDirMutation = useMutation({
    mutationFn: watcherApi.scanDirectory,
    onSuccess: (result) => {
      toast.success(result.message);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Loading watcher status...
      </div>
    );
  }

  const isScanning = data?.scanning || scanMutation.isPending;
  const hasWatched = data?.watchedDirs?.some((d) => d.watchEnabled) ?? false;
  const hasIndexed = (data?.totalFiles ?? 0) > 0;

  return (
    <div className="flex flex-col gap-4">
      {/* Overall status card */}
      <Card>
        <CardHeader className="flex-row items-center gap-3 space-y-0">
          <div className="flex flex-1 items-center gap-2">
            <Activity className="h-5 w-5 text-muted-foreground" />
            <span className="font-medium">File Watcher</span>
            <Button
              size="sm"
              variant="outline"
              className="h-6 gap-1"
              disabled={isScanning || !hasWatched}
              onClick={() => scanMutation.mutate()}
            >
              {isScanning ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <ScanSearch className="h-3 w-3" />
              )}
              {isScanning ? "Scanning..." : "Rescan All"}
            </Button>
            {data?.running ? (
              <Badge
                variant="outline"
                className={cn(
                  "text-[10px] uppercase",
                  isScanning
                    ? "border-amber-500 text-amber-600"
                    : "border-emerald-500 text-emerald-600",
                )}
              >
                {isScanning ? "Scanning" : "Active"}
              </Badge>
            ) : (
              <Badge variant="outline" className="text-[10px] uppercase text-muted-foreground">
                Inactive
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="flex flex-col gap-0.5">
              <span className="text-xs text-muted-foreground">Status</span>
              <span className="text-sm font-medium">
                {isScanning ? "Scanning files..." : data?.running ? "Running" : "Not started"}
              </span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-xs text-muted-foreground">Indexed Files</span>
              <span className="text-sm font-medium">
                {hasIndexed ? data!.totalFiles.toLocaleString() : "0"}
              </span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-xs text-muted-foreground">Watched Directories</span>
              <span className="text-sm font-medium">
                {data?.watchedDirs?.filter((d) => d.watchEnabled).length ?? 0}
              </span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-xs text-muted-foreground">Last Updated</span>
              <span className="text-sm font-medium">
                {data?.lastScanTime
                  ? new Date(data.lastScanTime).toLocaleTimeString()
                  : "—"}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Per-directory status */}
      {data?.watchedDirs && data.watchedDirs.length > 0 ? (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-medium text-muted-foreground">Directories</h3>
          {data.watchedDirs.map((dir) => {
            const isDirScanning = scanDirMutation.isPending && scanDirMutation.variables === dir.id;
            return (
              <Card key={dir.id} className={cn(!dir.watchEnabled && "opacity-50")}>
                <CardHeader className="flex-row items-center gap-3 space-y-0 py-3">
                  <div className="flex flex-1 items-center gap-2">
                    {dir.watchEnabled ? (
                      <Eye className="h-4 w-4 text-emerald-500" />
                    ) : (
                      <EyeOff className="h-4 w-4 text-muted-foreground" />
                    )}
                    <span className="text-sm font-medium">{dir.label}</span>
                    {dir.watchEnabled && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 gap-1 text-xs"
                        disabled={isDirScanning || isScanning}
                        onClick={() => scanDirMutation.mutate(dir.id)}
                      >
                        {isDirScanning ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <ScanSearch className="h-3 w-3" />
                        )}
                        {isDirScanning ? "Scanning..." : "Scan"}
                      </Button>
                    )}
                    <Badge variant="outline" className="text-[10px]">
                      {dir.path}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <FileText className="h-3 w-3" />
                      {dir.indexedFiles.toLocaleString()} files
                    </span>
                    {dir.watchEnabled && (
                      <span className="inline-flex items-center gap-1 text-emerald-600">
                        <Activity className="h-3 w-3" />
                        Watching
                      </span>
                    )}
                    {!dir.watchEnabled && (
                      <span className="text-muted-foreground">Not watched</span>
                    )}
                  </div>
                </CardHeader>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
            <FolderOpen className="h-8 w-8 opacity-30" />
            <p>No directories configured yet.</p>
            <p className="text-xs">
              Add directories in{" "}
              <a
                href="/settings/directories"
                className="underline underline-offset-2 hover:text-foreground"
              >
                Settings &gt; Directories
              </a>{" "}
              and enable the <strong>Watch</strong> toggle.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
