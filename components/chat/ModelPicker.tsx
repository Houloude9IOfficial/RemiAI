"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { availableModelsApi } from "@/lib/api/available-models";
import { cn } from "@/lib/utils";
import type { ChatStatus } from "ai";

function encode(providerId: number, modelId: string) {
  return `${providerId}::${modelId}`;
}

export function decodeModelValue(value: string): { providerId: number; modelId: string } {
  const [providerId, modelId] = value.split("::");
  return { providerId: Number(providerId), modelId };
}

/** Small colored dot reflecting the live generation status (header variant). */
function ModelStatusDot({ status }: { status?: ChatStatus }) {
  const isBusy = status === "streaming" || status === "submitted";
  const isError = status === "error";
  if (isBusy) {
    return (
      <span
        className="relative flex h-2 w-2 shrink-0"
        title="Generating…"
        aria-label="Generating"
      >
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
      </span>
    );
  }
  return (
    <span
      className={cn(
        "relative inline-flex h-2 w-2 shrink-0 rounded-full",
        isError ? "bg-status-danger" : "bg-status-success",
      )}
      title={isError ? "Error" : "Ready"}
      aria-label={isError ? "Error" : "Ready"}
    />
  );
}

function prettyModelLabel(label: string | null | undefined): string {
  if (!label) return "Pick a model";
  const cleaned = label
    .replaceAll(/[_-]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

export function ModelPicker({
  providerId,
  modelId,
  onChange,
  status,
  variant = "compact",
  className,
}: {
  providerId: number | null;
  modelId: string | null;
  onChange: (providerId: number, modelId: string) => void;
  /** Live generation status — drives the readiness dot in the header variant. */
  status?: ChatStatus;
  variant?: "compact" | "header";
  className?: string;
}) {
  const { data: availableProviders = [] } = useQuery({
    queryKey: ["available-models"],
    queryFn: availableModelsApi.list,
  });

  const value = providerId && modelId ? encode(providerId, modelId) : "";

  // Look up the current model's clean display label for the trigger preview
  const currentProvider = availableProviders.find((p) => p.providerId === providerId);
  const currentModel = currentProvider?.models.find((m) => m.modelId === modelId);
  const modelLabel = prettyModelLabel(currentModel?.modelLabel ?? modelId);
  const providerLabel = currentProvider?.label ?? null;

  if (availableProviders.length === 0) {
    return (
      <span className="text-xs text-muted-foreground">
        No models enabled — add one in Models &amp; Providers settings.
      </span>
    );
  }

  return (
    <Select
      value={value}
      onValueChange={(v) => {
        if (!v) return;
        const decoded = decodeModelValue(v);
        onChange(decoded.providerId, decoded.modelId);
      }}
    >
      {variant === "header" ? (
        <SelectTrigger
          size="sm"
          className={cn(
            "h-9 gap-2 rounded-lg border-border/70 bg-surface-1 px-2.5 hover:bg-muted/70 dark:bg-input/30 dark:hover:bg-input/50",
            className,
          )}
          title={`Model: ${modelLabel}${providerLabel ? ` · ${providerLabel}` : ""}`}
        >
          <SelectValue>
            <span className="flex items-center gap-2">
              <ModelStatusDot status={status} />
              <span className="flex min-w-0 flex-col items-start leading-tight">
                <span className="max-w-44 truncate text-[13px] font-semibold text-foreground">
                  {modelLabel}
                </span>
                {/* {providerLabel && (
                  <span className="max-w-44 truncate text-[10px] font-normal text-muted-foreground">
                    {providerLabel}
                  </span>
                )} */}
              </span>
            </span>
          </SelectValue>
        </SelectTrigger>
      ) : (
        <SelectTrigger size="sm" className={cn("h-7 w-50 text-xs", className)}>
          <SelectValue placeholder="Pick a model">
            {value ? modelLabel : null}
          </SelectValue>
        </SelectTrigger>
      )}
      {/* The popup is anchored to the trigger's width (--anchor-width) by
          default, which clips long model ids (nemotron-3-ultra-550b, …).
          Inline min-width overrides that so names render in full; inline
          style avoids any Tailwind utility-order conflict with the wrapper's
          own min-w-36. */}
      <SelectContent
        style={variant === "header" ? { minWidth: "17rem" } : { minWidth: "14rem" }}
      >
        {availableProviders.map((provider) => (
          <SelectGroup key={provider.providerId}>
            <SelectLabel>{provider.label}</SelectLabel>
            {provider.models.map((model) => (
              <SelectItem
                key={model.modelId}
                value={encode(provider.providerId, model.modelId)}
              >
                {`${model.modelLabel ?? model.modelId}`}
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}
