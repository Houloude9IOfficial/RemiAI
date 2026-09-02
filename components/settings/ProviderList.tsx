"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ChevronDown, KeyRound, Layers, Loader2, PlugZap, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { providersApi, type Provider } from "@/lib/api/providers";
import { preferencesApi } from "@/lib/api/preferences";
import { ProviderModelList } from "./ProviderModelList";
import { PROVIDER_KIND_META } from "./provider-kind";
import { cn } from "@/lib/utils";

export function NewModelDefaults() {
  const queryClient = useQueryClient();
  const {
    data: preferences,
    isLoading: preferencesLoading,
    isError: preferencesError,
    refetch: refetchPreferences,
  } = useQuery({
    queryKey: ["preferences"],
    queryFn: preferencesApi.get,
  });

  const newModelsMutation = useMutation({
    mutationFn: (enableNewModels: boolean) => preferencesApi.update({ enableNewModels }),
    onSuccess: (updatedPreferences) => {
      queryClient.setQueryData(["preferences"], updatedPreferences);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const status = preferencesLoading
    ? "Loading saved setting..."
    : preferencesError
      ? "Could not load the saved setting"
      : newModelsMutation.isPending
        ? "Saving..."
        : preferences?.enableNewModels
          ? "New models will start enabled"
          : "New models will start disabled";

  return (
    <Card>
      <CardHeader className="!flex !flex-row items-center gap-3 space-y-0">
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-medium">New model defaults</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Choose whether models found during refresh, provider setup, or manual adds start enabled.
          </p>
        </div>
        <Switch
          checked={preferences?.enableNewModels ?? true}
          disabled={preferencesLoading || newModelsMutation.isPending}
          aria-label="Enable newly discovered or added models"
          onCheckedChange={(enabled) => newModelsMutation.mutate(enabled)}
        />
      </CardHeader>
      <CardContent className="flex items-center justify-between gap-3 border-t pt-3">
        <p className="text-[11px] text-muted-foreground" role="status">
          {status}
        </p>
        {preferencesError && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 shrink-0 gap-1.5 text-xs"
            onClick={() => void refetchPreferences()}
          >
            <RefreshCw className="h-3 w-3" />
            Retry
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

export function ProviderList() {
  const queryClient = useQueryClient();
  const { data: providers = [], isLoading } = useQuery({
    queryKey: ["providers"],
    queryFn: providersApi.list,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: number; enabled: boolean }) =>
      providersApi.update(id, { enabled }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["providers"] }),
    onError: (err: Error) => toast.error(err.message),
  });

  const removeMutation = useMutation({
    mutationFn: providersApi.remove,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["providers"] });
      toast.success("Provider removed");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground/70">
          Your providers
        </h2>
        <span className="text-xs text-muted-foreground">
          {providers.length} {providers.length === 1 ? "provider" : "providers"}
        </span>
      </div>

      {providers.length === 0 ? (
        <div className="flex flex-col items-center gap-1.5 rounded-lg border border-dashed py-10 text-center">
          <PlugZap className="h-7 w-7 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">No providers connected yet.</p>
          <p className="text-xs text-muted-foreground/70">
            Add one above to start chatting with an AI model.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {providers.map((provider) => (
            <ProviderCard
              key={provider.id}
              provider={provider}
              enabled={provider.enabled}
              onToggle={(enabled) => updateMutation.mutate({ id: provider.id, enabled })}
              onRemove={() => removeMutation.mutate(provider.id)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function ProviderCard({
  provider,
  enabled,
  onToggle,
  onRemove,
}: {
  provider: Provider;
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  onRemove: () => void;
}) {
  const meta = PROVIDER_KIND_META[provider.kind];
  const Icon = meta?.icon ?? PlugZap;
  const [expanded, setExpanded] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Shares the ["provider-models", id] cache with ProviderModelList, so this
  // is only ever fetched once and lets us show a count while collapsed.
  const { data: models = [] } = useQuery({
    queryKey: ["provider-models", provider.id],
    queryFn: () => providersApi.listModels(provider.id),
  });

  return (
    <Card className={cn(!enabled && "opacity-70")}>
      <CardHeader className="!flex !flex-row items-center gap-3 space-y-0">
        <div
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
            enabled ? "text-primary" : "text-muted-foreground",
          )}
        >
          <Icon className="h-5 w-5" />
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-medium">{provider.label}</span>
            <Badge variant="outline" className="text-[10px] uppercase">
              {meta?.label ?? provider.kind}
            </Badge>
          </div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Layers className="h-3 w-3" />
              {models.length} {models.length === 1 ? "model" : "models"}
            </span>
            {provider.hasApiKey && (
              <span className="inline-flex items-center gap-1 font-mono">
                <KeyRound className="h-3 w-3" />
                {provider.apiKey}
              </span>
            )}
            {provider.baseUrl && (
              <span className="truncate font-mono">{provider.baseUrl}</span>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            aria-label={expanded ? `Hide ${provider.label} models` : `Show ${provider.label} models`}
            aria-expanded={expanded}
            onClick={() => setExpanded((v) => !v)}
          >
            <ChevronDown
              className={cn("h-4 w-4 transition-transform", expanded && "rotate-180")}
            />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 text-muted-foreground hover:text-destructive"
            aria-label={`Remove ${provider.label}`}
            onClick={() => setConfirmOpen(true)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
          <Switch checked={enabled} onCheckedChange={onToggle} />
        </div>
      </CardHeader>

      {expanded && (
        <CardContent>
          <ProviderModelList provider={provider} />
        </CardContent>
      )}

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove provider</DialogTitle>
            <DialogDescription>
              Remove <span className="font-medium text-foreground">{provider.label}</span>? All
              its models will be deleted. This can&apos;t be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setConfirmOpen(false);
                onRemove();
              }}
            >
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
