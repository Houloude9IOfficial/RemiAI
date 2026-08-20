"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { RefreshCw, Trash2, ToggleLeft, ToggleRight } from "lucide-react";
import { toast } from "sonner";
import { providersApi, type Provider } from "@/lib/api/providers";
import { PROVIDER_MODEL_CATALOG } from "@/lib/providers/catalog";
import { cn } from "@/lib/utils";

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

  const allEnabled = models.length > 0 && models.every((m) => m.enabled);

  const toggleAllMutation = useMutation({
    mutationFn: (enable: boolean) =>
      providersApi.batchUpdateModels(
        provider.id,
        models.map((m) => ({ modelId: m.modelId, enabled: enable })),
      ),
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
    <div className="flex flex-col gap-2.5 border-t pt-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground">
          {models.length === 0 ? "No models yet" : "Models"}
        </p>
        <div className="flex items-center gap-1">
          {models.length > 0 && (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    className="h-6 w-6"
                    disabled={toggleAllMutation.isPending}
                    onClick={() => toggleAllMutation.mutate(!allEnabled)}
                  />
                }
              >
                {allEnabled ? (
                  <ToggleRight className="h-3 w-3" />
                ) : (
                  <ToggleLeft className="h-3 w-3" />
                )}
              </TooltipTrigger>
              <TooltipContent>{allEnabled ? "Disable all" : "Enable all"}</TooltipContent>
            </Tooltip>
          )}
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  size="icon-xs"
                  variant="ghost"
                  className="h-6 w-6"
                  disabled={refreshMutation.isPending}
                  onClick={() => refreshMutation.mutate()}
                />
              }
            >
              <RefreshCw
                className={cn("h-3 w-3", refreshMutation.isPending && "animate-spin")}
              />
            </TooltipTrigger>
            <TooltipContent>Refresh models from provider</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {models.length > 0 && (
        <div className="flex flex-col gap-0.5">
          {models.map((model) => (
            <div
              key={model.id}
              className="flex items-center gap-2.5 rounded-md px-1.5 py-1 transition-colors hover:bg-muted/40"
            >
              <Switch
                size="sm"
                checked={model.enabled}
                onCheckedChange={(enabled) =>
                  updateMutation.mutate({ modelId: model.modelId, enabled })
                }
              />
              <span className="font-mono text-xs">{model.modelId}</span>
              {model.label && (
                <span className="text-[11px] text-muted-foreground">· {model.label}</span>
              )}
              <Button
                size="icon-xs"
                variant="ghost"
                className="ml-auto h-6 w-6 text-muted-foreground hover:text-destructive"
                aria-label={`Remove ${model.modelId}`}
                onClick={() => removeMutation.mutate(model.modelId)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2 pt-0.5">
        <Input
          placeholder="Add a model id, e.g. claude-sonnet-5"
          className="h-7 text-xs"
          value={newModelId}
          onChange={(e) => setNewModelId(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && newModelId.trim()) {
              e.preventDefault();
              addMutation.mutate(newModelId.trim());
            }
          }}
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
