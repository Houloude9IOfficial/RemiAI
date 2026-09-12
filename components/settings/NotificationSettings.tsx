"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, BellOff, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  disableWebPushNotifications,
  enableWebPushNotifications,
  getPushStatus,
  sendElectronTestNotification,
} from "@/lib/notifications/client";

type Status = Awaited<ReturnType<typeof getPushStatus>>;

export function NotificationSettings() {
  const queryClient = useQueryClient();
  const { data: status } = useQuery<Status>({
    queryKey: ["push-notification-status"],
    queryFn: getPushStatus,
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["push-notification-status"] });
  };

  const enableMutation = useMutation({
    mutationFn: () => enableWebPushNotifications(true),
    onSuccess: async (result) => {
      if (result.ok) toast.success(status?.electron ? "Native notifications enabled" : "Push notifications enabled");
      else if (result.reason === "not-configured") toast.error("The server has not configured Web Push yet.");
      else if (result.reason === "denied") toast.error("Notifications are blocked. Allow them in your browser settings.");
      else toast.error(status?.electron ? "Native notifications are not supported on this Mac." : "Could not enable push notifications on this device.");
      refresh();
    },
  });

  const disableMutation = useMutation({
    mutationFn: disableWebPushNotifications,
    onSuccess: (ok) => {
      if (ok) toast.success(status?.electron ? "Native notifications remain available while Electron is running" : "Push notifications disabled on this device");
      else toast.error("Could not disable notifications");
      refresh();
    },
  });

  const testMutation = useMutation({
    mutationFn: async (): Promise<number | null> => {
      if (status?.electron) {
        if (!(await sendElectronTestNotification())) throw new Error("Native notifications are not supported on this Mac.");
        return null;
      }
      const response = await fetch("/api/notifications/test", { method: "POST" });
      const data = await response.json() as { error?: string; delivered?: number };
      if (!response.ok) throw new Error(data.error ?? "Test notification failed");
      return data.delivered ?? 0;
    },
    onSuccess: (delivered) => {
      if (delivered === null) {
        toast.success("Native test notification sent");
      } else if (delivered > 0) {
        toast.success(`Test notification sent to ${delivered} Web Push device${delivered === 1 ? "" : "s"}`);
      } else {
        toast.info("Test sent to the active app, but no Web Push device was reached.");
      }
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const pending = enableMutation.isPending || disableMutation.isPending || testMutation.isPending;
  const isElectron = status?.electron === true;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          {status?.subscribed ? <Bell className="h-4 w-4 text-primary" /> : <BellOff className="h-4 w-4 text-primary" />}
          Notifications
        </CardTitle>
        <CardDescription>
          {isElectron
            ? "Receive native notifications from this local RemiAI server while Electron is running, including when it is hidden in the tray."
            : "Receive background-task results on this browser or installed phone app, even when the web page is closed."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {isElectron ? (
          status?.permission === "unsupported" ? (
            <p className="text-xs text-muted-foreground">Native notifications are not supported on this system.</p>
          ) : (
            <>
              <p className="text-xs text-emerald-600 dark:text-emerald-400">Native notifications are available while Electron is running.</p>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => testMutation.mutate()} disabled={pending}>Send test</Button>
              </div>
            </>
          )
        ) : status?.permission === "unsupported" ? (
          <p className="text-xs text-muted-foreground">This browser does not support Web Push notifications.</p>
        ) : !status?.configured ? (
          <p className="text-xs text-muted-foreground">Web Push is not configured on this server.</p>
        ) : status.subscribed ? (
          <>
            <p className="text-xs text-emerald-600 dark:text-emerald-400">Push notifications are enabled on this device.</p>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => testMutation.mutate()} disabled={pending}>Send test</Button>
              <Button variant="ghost" size="sm" onClick={() => disableMutation.mutate()} disabled={pending}>Disable</Button>
            </div>
          </>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">Push notifications are not enabled on this device.</p>
            <Button size="sm" onClick={() => enableMutation.mutate()} disabled={pending}>
              {pending && <Loader2 className="animate-spin" />}
              Enable notifications
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
