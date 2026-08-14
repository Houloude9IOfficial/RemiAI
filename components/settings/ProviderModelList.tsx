"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { providersApi, type Provider } from "@/lib/api/providers";
import { PROVIDER_MODEL_CATALOG } from "@/lib/providers/catalog";

export function ProviderModelList({ provider }: { provider: Provider }) {
  const queryClient = useQueryClient();
  const [newModelId, setNewModelId] = useState("");

  const { data: models = [] } = useQuery({
    queryKey: ["provider-models", provider.id],
    queryFn: () => providersApi.listModels(provider.id),
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["provider-models", provider.id] });

  const addMutation = useMutation({
    mutationFn: (modelId: string) => providersApi.addModel(provider.id, { modelId }),
    onSuccess: () => {
      invalidate();
      setNewModelId("");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({
      modelId,
      ...input
    }: { modelId: string; enabled?: boolean; isDefault?: boolean }) =>
      providersApi.updateModel(provider.id, modelId, input),
    onSuccess: invalidate,
    onError: (err: Error) => toast.error(err.message),
  });

  const removeMutation = useMutation({
    mutationFn: (modelId: string) => providersApi.removeModel(provider.id, modelId),
    onSuccess: invalidate,
    onError: (err: Error) => toast.error(err.message),
  });

  const refreshMutation = useMutation({
    mutationFn: () => providersApi.refreshModels(provider.id),
    onSuccess: (result) => {
      invalidate();
      toast.success(result.message);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const suggestions = (PROVIDER_MODEL_CATALOG[provider.kind] ?? []).filter(
    (m) => !models.some((existing) => existing.modelId === m.modelId),
  );

  return (
    <div className="flex flex-col gap-2 border-t pt-3">
      <div className="flex items-center justify-between">
        {models.length === 0 ? (
          <p className="text-xs text-muted-foreground">No models enabled yet.</p>
        ) : (
          <p className="text-xs text-muted-foreground">
            {models.length} model{models.length === 1 ? "" : "s"}
          </p>
        )}
        <button
          type="button"
          onClick={() => refreshMutation.mutate()}
          disabled={refreshMutation.isPending}
          className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50"
          title="Refresh models from provider"
        >
          <RefreshCw
            className={`h-3 w-3 ${refreshMutation.isPending ? "animate-spin" : ""}`}
          />
          Refresh
        </button>
      </div>
      {models.map((model) => (
        <div key={model.id} className="flex items-center gap-2 text-sm">
          <Switch
            size="sm"
            checked={model.enabled}
            onCheckedChange={(enabled) =>
              updateMutation.mutate({ modelId: model.modelId, enabled })
            }
          />
          <span className="font-mono text-xs">{model.modelId}</span>
          {/* {model.isDefault ? (
            <Badge variant="secondary" className="text-[10px]">
              default
            </Badge>
          ) : (
            <button
              type="button"
              className="text-[10px] text-muted-foreground underline-offset-2 hover:underline"
              onClick={() => updateMutation.mutate({ modelId: model.modelId, isDefault: true })}
            >
              set default
            </button>
          )} */}
          <Button
            size="icon"
            variant="ghost"
            className="ml-auto h-6 w-6 text-muted-foreground hover:text-destructive"
            onClick={() => removeMutation.mutate(model.modelId)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}

      <div className="flex items-center gap-2 pt-1">
        <Input
          placeholder="model id, e.g. claude-sonnet-5"
          className="h-7 text-xs"
          value={newModelId}
          onChange={(e) => setNewModelId(e.target.value)}
        />
        <Button
          size="sm"
          variant="outline"
          className="h-7 shrink-0"
          disabled={!newModelId.trim() || addMutation.isPending}
          onClick={() => addMutation.mutate(newModelId.trim())}
        >
          Add
        </Button>
      </div>

      {suggestions.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {suggestions.map((s) => (
            <button
              key={s.modelId}
              type="button"
              className="rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
              onClick={() => addMutation.mutate(s.modelId)}
            >
              + {s.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
