"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Plus, X, Copy, Check, RefreshCw } from "lucide-react";
import { webhooksApi, type Webhook } from "@/lib/api/webhooks";
import { conversationsApi, type Conversation } from "@/lib/api/conversations";

const CONDITION_OPS = [
  { value: "eq", label: "equals" },
  { value: "neq", label: "not equals" },
  { value: "contains", label: "contains" },
  { value: "startsWith", label: "starts with" },
  { value: "endsWith", label: "ends with" },
  { value: "exists", label: "exists" },
  { value: "matches", label: "matches regex" },
] as const;

type ConditionRow = {
  field: string;
  op: (typeof CONDITION_OPS)[number]["value"];
  value: string;
};

const VARIABLE_HINTS = [
  "{{payload.type}}",
  "{{payload.sender.name}}",
  "{{payload.message.text}}",
  "{{payload.entry.0.messaging.0.message.text}}",
  "{{headers.user-agent}}",
  "{{query.from}}",
];

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      className="h-6 w-6 shrink-0"
      title={label}
      aria-label={label}
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

export function WebhookForm({
  initialWebhook,
  onCancelEdit,
}: {
  initialWebhook?: Webhook;
  onCancelEdit?: () => void;
}) {
  const queryClient = useQueryClient();
  const isEditing = !!initialWebhook;

  const [name, setName] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [conversationId, setConversationId] = useState<number | "">("");
  const [conditions, setConditions] = useState<ConditionRow[]>([]);
  const [respondSync, setRespondSync] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [secret, setSecret] = useState<string | null>(null); // shown once on create / from edit row
  const [deliveryUrl, setDeliveryUrl] = useState("");

  const { data: conversations = [] } = useQuery({
    queryKey: ["conversations"],
    queryFn: conversationsApi.list,
  });

  const conversationOptions = useMemo(() => {
    const map = new Map<number, Conversation>();
    for (const c of conversations) map.set(c.id, c);
    return { map, list: conversations };
  }, [conversations]);

  // Populate form when editing
  useEffect(() => {
    if (initialWebhook) {
      setName(initialWebhook.name);
      setSystemPrompt(initialWebhook.systemPrompt);
      setConversationId(initialWebhook.conversationId ?? "");
      setConditions(
        (initialWebhook.conditions ?? []).map((c) => ({
          field: c.field,
          op: c.op,
          value: c.value ?? "",
        })),
      );
      setRespondSync(initialWebhook.respondSync);
      setEnabled(initialWebhook.enabled);
      setSecret(initialWebhook.secret);
      setDeliveryUrl(`${window.location.origin}/api/webhooks/${initialWebhook.id}`);
    } else {
      setSecret(null);
      setDeliveryUrl("");
    }
  }, [initialWebhook]);

  const resetForm = () => {
    setName("");
    setSystemPrompt("");
    setConversationId("");
    setConditions([]);
    setRespondSync(false);
    setEnabled(true);
  };

  const createMutation = useMutation({
    mutationFn: webhooksApi.create,
    onSuccess: (row) => {
      queryClient.invalidateQueries({ queryKey: ["webhooks"] });
      // Show the secret + delivery URL once after creation.
      setSecret(row.secret);
      setDeliveryUrl(`${window.location.origin}/api/webhooks/${row.id}`);
      resetForm();
      toast.success("Webhook created");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: number;
      input: Parameters<typeof webhooksApi.update>[1];
    }) => webhooksApi.update(id, input),
    onSuccess: (row) => {
      queryClient.invalidateQueries({ queryKey: ["webhooks"] });
      setSecret(row.secret);
      setDeliveryUrl(`${window.location.origin}/api/webhooks/${row.id}`);
      resetForm();
      onCancelEdit?.();
      toast.success("Webhook updated");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const regenerateMutation = useMutation({
    mutationFn: (id: number) =>
      webhooksApi.update(id, { regenerateSecret: true }),
    onSuccess: (row) => {
      setSecret(row.secret);
      queryClient.invalidateQueries({ queryKey: ["webhooks"] });
      toast.success("Secret regenerated — update your service with the new secret");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const payload = {
      name: name.trim(),
      systemPrompt,
      conditions: conditions
        .filter((c) => c.field.trim())
        .map((c) => ({
          field: c.field.trim(),
          op: c.op,
          value: c.op === "exists" ? undefined : c.value,
        })),
      conversationId: conversationId === "" ? null : conversationId,
      respondSync,
      enabled,
    };

    if (isEditing && initialWebhook) {
      updateMutation.mutate({ id: initialWebhook.id, input: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;
  const submitText = isEditing
    ? isPending
      ? "Saving..."
      : "Save changes"
    : isPending
      ? "Creating..."
      : "Create webhook";

  return (
    <form
      className="flex flex-col gap-4 rounded-lg border p-4"
      onSubmit={handleSubmit}
    >
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium">
          {isEditing ? `Edit ${initialWebhook.name}` : "Add webhook"}
        </h2>
        {isEditing && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 text-xs"
            onClick={() => {
              resetForm();
              onCancelEdit?.();
            }}
          >
            Cancel
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="webhook-name">Name</Label>
          <Input
            id="webhook-name"
            placeholder="Instagram DMs"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <p className="text-xs text-muted-foreground">
            A label so you can recognize this endpoint
          </p>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="webhook-conversation">Run in conversation</Label>
          <Select
            value={conversationId === "" ? "__auto__" : String(conversationId)}
            onValueChange={(v) =>
              setConversationId(v === "__auto__" ? "" : Number(v))
            }
          >
            <SelectTrigger id="webhook-conversation">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__auto__">
                Auto-create a dedicated conversation
              </SelectItem>
              {conversationOptions.list.map((c) => (
                <SelectItem key={c.id} value={String(c.id)}>
                  #{c.id} — {c.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Triggered runs appear in this chat
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="webhook-prompt">Trigger instructions (system prompt)</Label>
        <Textarea
          id="webhook-prompt"
          placeholder={
            "You are my Instagram auto-reply assistant. When a follower sends a message, answer it helpfully and naturally. If it's a question about my products, check my site first.\n\nSender: {{payload.entry.0.messaging.0.sender.id}}\nMessage: {{payload.entry.0.messaging.0.message.text}}"
          }
          className="min-h-[110px] resize-y text-xs"
          value={systemPrompt}
          onChange={(e) => setSystemPrompt(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          Give the AI the event&apos;s context and what to do. Use{" "}
          <span className="font-mono">{"{{payload.path}}"}</span> placeholders
          to inject values from the webhook JSON (also{" "}
          <span className="font-mono">{"{{headers.*}}"}</span> and{" "}
          <span className="font-mono">{"{{query.*}}"}</span>). Leave empty for a
          sensible default.
        </p>
        <div className="flex flex-wrap gap-1.5">
          {VARIABLE_HINTS.map((hint) => (
            <button
              key={hint}
              type="button"
              className="rounded-md border px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground hover:bg-muted"
              onClick={() =>
                setSystemPrompt((p) => (p ? `${p} ${hint}` : hint))
              }
            >
              {hint}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <Label>Trigger conditions (optional)</Label>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="h-6 w-6"
            onClick={() =>
              setConditions([...conditions, { field: "", op: "eq", value: "" }])
            }
            aria-label="Add condition"
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
        {conditions.length === 0 && (
          <p className="text-xs italic text-muted-foreground">
            None — fires on every delivery. Add conditions to only trigger when
            payload fields match (e.g. only when the message isn&apos;t yours).
          </p>
        )}
        <div className="flex flex-col gap-1.5">
          {conditions.map((cond, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <Input
                placeholder="payload.type"
                className="h-7 flex-1 font-mono text-xs"
                value={cond.field}
                onChange={(e) => {
                  const next = [...conditions];
                  next[i] = { ...next[i], field: e.target.value };
                  setConditions(next);
                }}
              />
              <Select
                value={cond.op}
                onValueChange={(v) => {
                  const next = [...conditions];
                  next[i] = {
                    ...next[i],
                    op: v as ConditionRow["op"],
                    value: v === "exists" ? "" : next[i].value,
                  };
                  setConditions(next);
                }}
              >
                <SelectTrigger className="h-7 w-[130px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CONDITION_OPS.map((op) => (
                    <SelectItem key={op.value} value={op.value}>
                      {op.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {cond.op !== "exists" && (
                <Input
                  placeholder="value"
                  className="h-7 flex-1 font-mono text-xs"
                  value={cond.value}
                  onChange={(e) => {
                    const next = [...conditions];
                    next[i] = { ...next[i], value: e.target.value };
                    setConditions(next);
                  }}
                />
              )}
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive"
                onClick={() =>
                  setConditions(conditions.filter((_, idx) => idx !== i))
                }
                aria-label="Remove condition"
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
          <div>
            <p className="text-sm font-medium">Respond to caller</p>
            <p className="text-xs text-muted-foreground">
              Wait for the AI and return its reply to the webhook request
              (needed to answer messaging-platform APIs). Off = run in the
              background.
            </p>
          </div>
          <Switch
            checked={respondSync}
            onCheckedChange={setRespondSync}
            aria-label="Respond to caller"
          />
        </div>
        <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
          <div>
            <p className="text-sm font-medium">Enabled</p>
            <p className="text-xs text-muted-foreground">
              Disabled endpoints acknowledge deliveries but do nothing.
            </p>
          </div>
          <Switch
            checked={enabled}
            onCheckedChange={setEnabled}
            aria-label="Enabled"
          />
        </div>
      </div>

      {secret && (
        <div className="flex flex-col gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
          <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
            {isEditing
              ? "Secret (send this header with every delivery)"
              : "Webhook ready — save the delivery URL and secret now. You won't see the secret again after leaving this page."}
          </p>
          <div className="flex items-center gap-1.5">
            <code className="min-w-0 flex-1 truncate rounded-md bg-background/60 px-2 py-1 font-mono text-[11px]">
              {deliveryUrl}
            </code>
            <CopyButton text={deliveryUrl} label="Copy delivery URL" />
          </div>
          <div className="flex items-center gap-1.5">
            <code className="min-w-0 flex-1 truncate rounded-md bg-background/60 px-2 py-1 font-mono text-[11px]">
              {secret}
            </code>
            <CopyButton text={secret} label="Copy secret" />
            {isEditing && initialWebhook && (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="h-6 w-6 shrink-0"
                disabled={regenerateMutation.isPending}
                title="Regenerate secret"
                aria-label="Regenerate secret"
                onClick={() => regenerateMutation.mutate(initialWebhook.id)}
              >
                <RefreshCw className="h-3 w-3" />
              </Button>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground">
            Send as{" "}
            <code className="font-mono">
              X-Webhook-Secret: {secret.slice(0, 8)}…
            </code>{" "}
            or{" "}
            <code className="font-mono">Authorization: Bearer &lt;secret&gt;</code>
            . For Meta platforms, use the secret as the verify token and point
            your service at the delivery URL.
          </p>
        </div>
      )}

      <Button type="submit" className="ml-auto" disabled={isPending || !name.trim()}>
        {submitText}
      </Button>
    </form>
  );
}
