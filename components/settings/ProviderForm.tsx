"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
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
import { toast } from "sonner";
import { providersApi, type ProviderKind } from "@/lib/api/providers";
import { PROVIDER_PRESET_DEFAULTS } from "@/lib/providers/catalog";

const KIND_OPTIONS: { value: ProviderKind; label: string }[] = [
  { value: "anthropic", label: "Anthropic" },
  { value: "openai", label: "OpenAI" },
  { value: "ollama", label: "Ollama (local)" },
  { value: "openai-compatible", label: "Custom (OpenAI-compatible)" },
];

export function ProviderForm() {
  const queryClient = useQueryClient();
  const [kind, setKind] = useState<ProviderKind>("anthropic");
  const [label, setLabel] = useState(PROVIDER_PRESET_DEFAULTS.anthropic.label);
  const [baseUrl, setBaseUrl] = useState(PROVIDER_PRESET_DEFAULTS.anthropic.baseUrl ?? "");
  const [apiKey, setApiKey] = useState("");

  const defaults = PROVIDER_PRESET_DEFAULTS[kind];
  const needsBaseUrl = kind === "ollama" || kind === "openai-compatible";

  const createMutation = useMutation({
    mutationFn: providersApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["providers"] });
      setApiKey("");
      toast.success("Provider added");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const handleKindChange = (value: ProviderKind) => {
    setKind(value);
    setLabel(PROVIDER_PRESET_DEFAULTS[value].label);
    setBaseUrl(PROVIDER_PRESET_DEFAULTS[value].baseUrl ?? "");
  };

  return (
    <form
      className="flex flex-col gap-3 rounded-lg border p-4"
      onSubmit={(e) => {
        e.preventDefault();
        createMutation.mutate({
          kind,
          isPreset: kind !== "openai-compatible",
          label,
          baseUrl: needsBaseUrl ? baseUrl : null,
          apiKey: apiKey || null,
        });
      }}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label>Provider type</Label>
          <Select value={kind} onValueChange={(v) => handleKindChange(v as ProviderKind)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {KIND_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="provider-label">Label</Label>
          <Input id="provider-label" value={label} onChange={(e) => setLabel(e.target.value)} />
        </div>
      </div>

      {needsBaseUrl && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="provider-base-url">Base URL</Label>
          <Input
            id="provider-base-url"
            placeholder="http://localhost:11434/v1"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
          />
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="provider-api-key">
          API key{!defaults.requiresApiKey && " (optional)"}
        </Label>
        <Input
          id="provider-api-key"
          type="password"
          placeholder={defaults.requiresApiKey ? "sk-..." : "leave blank if not required"}
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
        />
      </div>

      <Button type="submit" className="ml-auto" disabled={createMutation.isPending}>
        {createMutation.isPending ? "Adding..." : "Add provider"}
      </Button>
    </form>
  );
}
