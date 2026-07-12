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

function encode(providerId: number, modelId: string) {
  return `${providerId}::${modelId}`;
}

export function decodeModelValue(value: string): { providerId: number; modelId: string } {
  const [providerId, modelId] = value.split("::");
  return { providerId: Number(providerId), modelId };
}

export function ModelPicker({
  providerId,
  modelId,
  onChange,
}: {
  providerId: number | null;
  modelId: string | null;
  onChange: (providerId: number, modelId: string) => void;
}) {
  const { data: availableProviders = [] } = useQuery({
    queryKey: ["available-models"],
    queryFn: availableModelsApi.list,
  });

  const value = providerId && modelId ? encode(providerId, modelId) : "";

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
      <SelectTrigger size="sm" className="h-7 text-xs">
        <SelectValue placeholder="Pick a model" />
      </SelectTrigger>
      <SelectContent>
        {availableProviders.map((provider) => (
          <SelectGroup key={provider.providerId}>
            <SelectLabel>{provider.label}</SelectLabel>
            {provider.models.map((model) => (
              <SelectItem
                key={model.modelId}
                value={encode(provider.providerId, model.modelId)}
              >
                {model.modelLabel ?? model.modelId}
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}
