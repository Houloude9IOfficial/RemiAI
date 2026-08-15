"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Trash2,
  Webhook,
  Pencil,
  Copy,
  Check,
  History,
  ChevronDown,
  ChevronUp,
  Loader2,
  Zap,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  webhooksApi,
  type Webhook as WebhookRow,
  type WebhookEvent,
} from "@/lib/api/webhooks";
import { WebhookForm } from "./WebhookForm";

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      size="icon"
      variant="ghost"
      className="h-6 w-6"
      title="Copy"
      aria-label="Copy"
      onClick={() => {
        navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          toast.success("Copied to clipboard");
          setTimeout(() => setCopied(false), 1500);
        });
      }}
    >
      {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
    </Button>
  );
}

function StatusBadge({ webhook }: { webhook: WebhookRow }) {
  if (!webhook.lastStatus) {
    return (
      <Badge variant="outline" className="text-[10px] uppercase">
        Never fired
      </Badge>
    );
  }
  if (webhook.lastStatus === "ok") {
    return (
      <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-600 text-[10px] uppercase dark:text-emerald-400">
        Ok
      </Badge>
    );
  }
  if (webhook.lastStatus === "skipped") {
    return (
      <Badge variant="secondary" className="text-[10px] uppercase">
        Skipped
      </Badge>
    );
  }
  return (
    <Badge variant="destructive" className="text-[10px] uppercase">
      Error
    </Badge>
  );
}

function EventRow({ event }: { event: WebhookEvent }) {
  const [expanded, setExpanded] = useState(false);
  const statusColor =
    event.status === "completed"
      ? "text-emerald-600 dark:text-emerald-400"
      : event.status === "failed"
        ? "text-destructive"
        : event.status === "skipped"
          ? "text-muted-foreground"
          : "text-amber-600 dark:text-amber-400";

  return (
    <div className="rounded-md border p-2">
      <button
        type="button"
        className="flex w-full items-center gap-2 text-left text-xs"
        onClick={() => setExpanded((v) => !v)}
      >
        <span className={cn("font-medium uppercase", statusColor)}>
          {event.status}
        </span>
        <span className="text-muted-foreground">#{event.id}</span>
        <span className="ml-auto text-muted-foreground">
          {new Date(event.receivedAt).toLocaleString()}
        </span>
        {expanded ? (
          <ChevronUp className="h-3 w-3" />
        ) : (
          <ChevronDown className="h-3 w-3" />
        )}
      </button>
      {expanded && (
        <div className="mt-2 flex flex-col gap-1.5">
          {event.error && (
            <p className="text-xs text-destructive">{event.error}</p>
          )}
          <pre className="max-h-40 overflow-auto rounded-md bg-muted/60 p-2 font-mono text-[11px] whitespace-pre-wrap">
            {JSON.stringify(event.payload, null, 2).slice(0, 2000)}
          </pre>
          {event.result && (
            <p className="text-xs text-muted-foreground whitespace-pre-wrap">
              {event.result.slice(0, 600)}
              {event.result.length > 600 ? "…" : ""}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export function WebhookList() {
  const queryClient = useQueryClient();
  const { data: webhooks = [], isLoading } = useQuery({
    queryKey: ["webhooks"],
    queryFn: webhooksApi.list,
  });

  const [editing, setEditing] = useState<WebhookRow | null>(null);
  const [showEventsFor, setShowEventsFor] = useState<number | null>(null);
  const [testPendingFor, setTestPendingFor] = useState<number | null>(null);
  const [testResult, setTestResult] = useState<{
    webhookId: number;
    result?: string;
    error?: string;
  } | null>(null);

  const { data: eventsMap } = useQuery({
    queryKey: ["webhook-events", showEventsFor],
    queryFn: async () => {
      if (showEventsFor === null) return null;
      const events = await webhooksApi.events(showEventsFor);
      return { webhookId: showEventsFor, events };
    },
    enabled: showEventsFor !== null,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: number; enabled: boolean }) =>
      webhooksApi.update(id, { enabled }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["webhooks"] }),
    onError: (err: Error) => toast.error(err.message),
  });

  const removeMutation = useMutation({
    mutationFn: webhooksApi.remove,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["webhooks"] });
      toast.success("Webhook removed");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const runTest = (webhook: WebhookRow) => {
    setTestPendingFor(webhook.id);
    setTestResult(null);
    webhooksApi
      .test(webhook.id)
      .then((res) => {
        queryClient.invalidateQueries({ queryKey: ["webhooks"] });
        if (res.ok) {
          setTestResult({
            webhookId: webhook.id,
            result: res.result ?? (res.processing ? "(still processing…)" : ""),
          });
          toast.success("Test run finished — check the conversation");
        } else {
          setTestResult({ webhookId: webhook.id, error: res.error });
          toast.error(`Test failed: ${res.error}`);
        }
      })
      .catch((err: Error) => {
        setTestResult({ webhookId: webhook.id, error: err.message });
        toast.error(err.message);
      })
      .finally(() => setTestPendingFor(null));
  };

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading...</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      {editing ? (
        <WebhookForm
          initialWebhook={editing}
          onCancelEdit={() => setEditing(null)}
        />
      ) : (
        <WebhookForm />
      )}

      {webhooks.length === 0 && !editing && (
        <p className="text-sm text-muted-foreground">
          No webhooks yet. Create one above, then point a service at the
          delivery URL.
        </p>
      )}

      {webhooks.map((webhook) => {
        const url = `${window.location.origin}/api/webhooks/${webhook.id}`;
        const expandedEvents = eventsMap?.webhookId === webhook.id ? eventsMap.events : [];
        return (
          <Card key={webhook.id}>
            <CardHeader className="flex-row items-center gap-3 space-y-0">
              <div className="flex flex-1 flex-wrap items-center gap-2">
                <Webhook className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">{webhook.name}</span>
                <StatusBadge webhook={webhook} />
                <Badge variant="outline" className="text-[10px] uppercase">
                  {webhook.respondSync ? "Responds to caller" : "Async"}
                </Badge>
                {webhook.conversationId && (
                  <a
                    href={`/chat/${webhook.conversationId}`}
                    className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    Conversation #{webhook.conversationId}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6"
                        disabled={testPendingFor === webhook.id}
                        onClick={() => runTest(webhook)}
                      />
                    }
                  >
                    {testPendingFor === webhook.id ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Zap className="h-3 w-3" />
                    )}
                  </TooltipTrigger>
                  <TooltipContent>Fire test event</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6"
                        onClick={() => setEditing(webhook)}
                      />
                    }
                  >
                    <Pencil className="h-3 w-3" />
                  </TooltipTrigger>
                  <TooltipContent>Edit</TooltipContent>
                </Tooltip>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6 text-muted-foreground hover:text-destructive"
                  onClick={() => removeMutation.mutate(webhook.id)}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
                <Switch
                  checked={webhook.enabled}
                  onCheckedChange={(enabled) =>
                    updateMutation.mutate({ id: webhook.id, enabled })
                  }
                  aria-label={`Toggle ${webhook.name}`}
                />
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              <div className="flex items-center gap-1.5">
                <code className="min-w-0 flex-1 truncate rounded-md bg-muted/60 px-2 py-1 font-mono text-[11px]">
                  {url}
                </code>
                <CopyButton text={url} />
              </div>
              {webhook.systemPrompt && (
                <p className="line-clamp-2 text-xs text-muted-foreground">
                  {webhook.systemPrompt}
                </p>
              )}
              {webhook.lastReceivedAt && (
                <p className="text-[11px] text-muted-foreground">
                  Last delivery: {new Date(webhook.lastReceivedAt).toLocaleString()}
                </p>
              )}
              {testResult?.webhookId === webhook.id && testResult.result && (
                <p className="rounded-md bg-muted/50 p-2 text-xs text-muted-foreground whitespace-pre-wrap">
                  <span className="font-medium">Test result:</span>{" "}
                  {testResult.result.slice(0, 500)}
                  {testResult.result.length > 500 ? "…" : ""}
                </p>
              )}
              {testResult?.webhookId === webhook.id && testResult.error && (
                <p className="rounded-md bg-destructive/5 p-2 text-xs text-destructive">
                  Test failed: {testResult.error}
                </p>
              )}
              <button
                type="button"
                className="flex items-center gap-1.5 self-start text-xs text-muted-foreground hover:text-foreground"
                onClick={() =>
                  setShowEventsFor((cur) => (cur === webhook.id ? null : webhook.id))
                }
              >
                <History className="h-3.5 w-3.5" />
                Delivery log
                {showEventsFor === webhook.id ? (
                  <ChevronUp className="h-3 w-3" />
                ) : (
                  <ChevronDown className="h-3 w-3" />
                )}
              </button>
              {showEventsFor === webhook.id && (
                <div className="flex flex-col gap-1.5">
                  {expandedEvents.length === 0 ? (
                    <p className="text-xs italic text-muted-foreground">
                      No deliveries yet.
                    </p>
                  ) : (
                    expandedEvents.slice(0, 10).map((event) => (
                      <EventRow key={event.id} event={event} />
                    ))
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
