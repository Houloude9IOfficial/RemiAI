"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { toast } from "sonner";
import { providersApi, type ProviderKind } from "@/lib/api/providers";
import { PROVIDER_PRESET_DEFAULTS } from "@/lib/providers/catalog";
import { PROVIDER_KIND_META } from "./provider-kind";
import { cn } from "@/lib/utils";

const KIND_ORDER: ProviderKind[] = [
  "anthropic",
  "openai",
  "google",
  "mistral",
  "groq",
  "openrouter",
  "ollama",
  "openai-compatible",
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
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["providers"] });
      setApiKey("");
      if (result._discovered) {
        toast.success(
          `Provider added — discovered ${result._modelCount} model${result._modelCount === 1 ? "" : "s"}`,
        );
      } else if (result._modelCount > 0) {
        toast.success(
          `Provider added — ${result._modelCount} default model${result._modelCount === 1 ? "" : "s"} (auto-discovery unavailable)`,
        );
      } else {
        toast.success("Provider added");
      }
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
      <Card>
        <CardHeader>
          <CardTitle>Connect a provider</CardTitle>
        </CardHeader>

        <CardContent className="flex flex-col gap-4">
          <div
            role="radiogroup"
            aria-label="Provider type"
            className="grid grid-cols-2 gap-2 sm:grid-cols-4"
          >
            {KIND_ORDER.map((k) => {
              const meta = PROVIDER_KIND_META[k];
              const Icon = meta.icon;
              const selected = k === kind;
              return (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => handleKindChange(k)}
                  className={cn(
                    "flex flex-col items-start gap-2 rounded-lg border p-3 text-left transition-colors",
                    selected
                      ? "border-primary bg-primary/5 ring-1 ring-primary/40"
                      : "border-border hover:bg-muted/50",
                  )}
                >
                  <Icon
                    className={cn(
                      "h-4 w-4",
                      selected ? "text-primary" : "text-muted-foreground",
                    )}
                  />
                  <span className="text-sm font-medium leading-none">{meta.label}</span>
                  <span className="text-[11px] leading-tight text-muted-foreground">
                    {meta.description}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="provider-label">Name</Label>
              <Input
                id="provider-label"
                placeholder="e.g. My Claude"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="provider-api-key">
                API key
                {!defaults.requiresApiKey && (
                  <span className="font-normal text-muted-foreground"> (optional)</span>
                )}
              </Label>
              <Input
                id="provider-api-key"
                type="password"
                placeholder={defaults.requiresApiKey ? "sk-..." : "Leave blank if not required"}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
              />
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
                <p className="text-[11px] text-muted-foreground">
                  Endpoint for this provider&apos;s OpenAI-compatible API.
                </p>
              </div>
            )}
          </div>
        </CardContent>

        <CardFooter className="justify-end">
          <Button type="submit" disabled={createMutation.isPending}>
            {createMutation.isPending ? (
              "Adding..."
            ) : (
              <>
                <Plus />
                Add provider
              </>
            )}
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}
