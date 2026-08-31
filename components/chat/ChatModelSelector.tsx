"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Bot, ChevronDown, Settings2 } from "lucide-react";
import {
  SiGooglegemini,
  SiDeepseek,
  SiQwen,
  SiMeta,
  SiClaude,
  SiMistralai,
  SiPerplexity,
  SiOllama,
  SiHuggingface,
  SiNvidia,
  SiOpenrouter,
  SiGoogle,
  SiMoonshotai,
} from "react-icons/si";
import { FaBrain } from "react-icons/fa";
import { BsOpenai } from "react-icons/bs";
import { RiGrokAiFill } from "react-icons/ri";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuLabel,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { availableModelsApi, type AvailableProvider } from "@/lib/api/available-models";
import type { ProviderKind } from "@/lib/api/providers";
import { PROVIDER_KIND_META } from "@/components/settings/provider-kind";
import { cn } from "@/lib/utils";

function encode(providerId: number, modelId: string) {
  return `${providerId}::${modelId}`;
}

function decode(value: string): { providerId: number; modelId: string } {
  const [providerId, modelId] = value.split("::");
  return { providerId: Number(providerId), modelId };
}

function prettyModelLabel(label: string | null | undefined): string {
  if (!label) return "Pick a model";
  const cleaned = label
    .replaceAll(/[_-]/g, " ")
    .replaceAll(":", " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

/**
 * Brand icons keyed by model-name substring — lets models like Gemini (served
 * through a custom OpenAI-compatible endpoint) show their own logo instead of
 * the generic provider icon. More specific names should be listed first.
 */
const MODEL_NAME_ICONS: Record<
  string,
  null | React.ComponentType<React.SVGProps<SVGSVGElement>>
> = {
  auto: FaBrain,
  gemini: SiGooglegemini,
  gemma: SiGooglegemini,
  deepseek: SiDeepseek,
  qwen: SiQwen,
  llama: SiMeta,
  grok: RiGrokAiFill,
  claude: SiClaude,
  anthropic: SiClaude,
  sonnet: SiClaude,
  opus: SiClaude,
  fable: SiClaude,
  kimi: SiMoonshotai,
  stral: SiMistralai,
  xstral: SiMistralai,
  perplexity: SiPerplexity,
  haiku: SiClaude,
  gpt: BsOpenai,
  openai: BsOpenai,
  mistral: SiMistralai,
  google: SiGoogle,
  qwq: SiQwen,
  codellama: SiMeta,
  meta: SiMeta,
  xai: RiGrokAiFill,
  chatgpt: BsOpenai,
  o1: BsOpenai,
  o3: BsOpenai,
  nemotron: SiNvidia,
  o4: BsOpenai,
  codex: BsOpenai,
  mixtral: SiMistralai,
  ollama: SiOllama,
  huggingface: SiHuggingface,
  hugging: SiHuggingface,
  nvidia: SiNvidia,
  openrouter: SiOpenrouter,
};

/**
 * Icon shown for a model: its own brand (from the model name, e.g. Gemini) if
 * known, otherwise the provider kind's brand icon (same source as the Models &
 * Providers settings page, e.g. OpenAI/Anthropic/Ollama), otherwise a generic
 * bot. Declared at module scope (not created during render) so
 * react-hooks/static-components stays happy.
 */
function ProviderBrandIcon({
  kind,
  modelId,
  className,
}: {
  kind?: string;
  modelId?: string | null;
  className?: string;
}) {
  const ModelIcon = modelId
    ? Object.entries(MODEL_NAME_ICONS).find(([key]) =>
        modelId.toLowerCase().includes(key),
      )?.[1]
    : undefined;
  if (ModelIcon) {
    return <ModelIcon className={className} />;
  }
  const KindIcon = kind ? PROVIDER_KIND_META[kind as ProviderKind]?.icon : undefined;
  const Icon = ModelIcon ?? KindIcon ?? Bot;
  return <Icon className={className} />;
}

/**
 * Cursor/Claude-style model selector for the chat composer. The trigger is a
 * pill showing the active model's icon + name; the dropdown groups enabled
 * models by provider, with brand icons, the raw model id as a secondary line,
 * and a check on the current selection.
 */
export function ChatModelSelector({
  providerId,
  modelId,
  onChange,
  disabled,
  large,
}: {
  providerId: number | null;
  modelId: string | null;
  onChange: (providerId: number, modelId: string) => void;
  disabled?: boolean;
  /** Larger pill to match the centered "new chat" composer. */
  large?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const { data: availableProviders = [], refetch, isSuccess } = useQuery({
    queryKey: ["available-models"],
    queryFn: availableModelsApi.list,
    // Keep the list in sync with Settings changes — models can be disabled or
    // removed (or providers turned off) while this page is open, and the
    // conversation's stored selection must not keep advertising them. This is
    // the same shared query the header's model picker uses, so one poll
    // refreshes both.
    staleTime: 15_000,
    refetchInterval: 30_000,
  });

  const value = providerId && modelId ? encode(providerId, modelId) : "";

  const currentProvider = availableProviders.find((p) => p.providerId === providerId);
  const currentModel = currentProvider?.models.find((m) => m.modelId === modelId);
  const modelLabel = currentModel?.modelLabel
    ? currentModel.modelLabel
    : modelId
      ? prettyModelLabel(modelId)
      : "Pick a model";

  const nothingConfigured = availableProviders.length === 0;

  // ── Stale-selection reconciliation ──────────────────────────────────
  // The conversation remembers its model locally (its DB row, plus the
  // `lastModel` localStorage entry reused for new chats). If that model was
  // disabled or no longer exists in the active list, silently fall back to a
  // valid one so the trigger never advertises (or sends with) a dead model.
  // Fires at most once per stale value, only after the list has loaded, and
  // re-evaluates on every refresh.
  const healedRef = useRef<string | null>(null);
  const selectionKey = value;
  const selectionIsStale = !!selectionKey && !currentModel;

  useEffect(() => {
    if (!isSuccess || !selectionIsStale) return;
    if (healedRef.current === selectionKey) return;
    healedRef.current = selectionKey;

    // Prefer the same provider's default (or first) model — its API key and
    // custom base URL still apply. Otherwise fall back to any provider's
    // default, then the very first available model.
    const pickFirst = (providerList: AvailableProvider[]) => {
      for (const p of providerList) {
        const fallback = p.models.find((m) => m.isDefault) ?? p.models[0];
        if (fallback) return { providerId: p.providerId, modelId: fallback.modelId };
      }
      return null;
    };
    const sameProvider = currentProvider ? [currentProvider] : [];
    const candidate = pickFirst(sameProvider) ?? pickFirst(availableProviders);
    if (!candidate) return;
    onChange(candidate.providerId, candidate.modelId);
  }, [
    isSuccess,
    selectionIsStale,
    selectionKey,
    currentProvider,
    availableProviders,
    onChange,
  ]);

  return (
    <DropdownMenu
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        // Refresh the active list the moment the user looks at it, so a model
        // just disabled in Settings isn't still listed.
        if (next) refetch();
      }}
    >
      <DropdownMenuTrigger
        type="button"
        disabled={disabled}
        aria-label="Choose model"
        title={`Model: ${modelLabel}${currentProvider ? ` · ${currentProvider.label}` : ""}`}
        className={cn(
          "flex cursor-pointer items-center gap-1.5 rounded-full border border-border/60 py-0 pr-2 pl-2.5 text-[13px] font-medium text-foreground/85 transition-colors select-none outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40",
          large ? "h-9" : "h-8",
          disabled && "pointer-events-none opacity-40",
        )}
      >
        <ProviderBrandIcon
          kind={currentProvider?.kind}
          modelId={modelId}
          className={`h-4 w-4 shrink-0 ${modelLabel == 'Auto' ? 'hidden' : ''}`}
        />
        <span className="max-w-36 truncate">{modelLabel}</span>
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        />
      </DropdownMenuTrigger>

      {/* Fixed width overrides the default --anchor-width so long model ids
          render in full (same approach as the header ModelPicker). */}
      <DropdownMenuContent
        align="start"
        side="top"
        sideOffset={6}
        style={{ width: "18rem" }}
        className="p-1.5"
      >
        {nothingConfigured ? (
          <div className="flex flex-col items-center gap-2 px-1 py-4 text-center">
            <p className="text-xs text-muted-foreground">No models enabled yet.</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => router.push("/settings/providers")}
            >
              Open model settings
            </Button>
          </div>
        ) : (
          <DropdownMenuRadioGroup
            value={value}
            onValueChange={(v) => {
              if (typeof v !== "string") return;
              const { providerId: nextProviderId, modelId: nextModelId } = decode(v);
              onChange(nextProviderId, nextModelId);
              setOpen(false);
            }}
          >
            {availableProviders.map((provider, idx) => {
              return (
                <div key={provider.providerId}>
                  {idx > 0 && <DropdownMenuSeparator className="my-1" />}
                  <DropdownMenuLabel className="px-2 py-1 text-[10px] font-semibold tracking-wider text-muted-foreground/80 uppercase">
                    {provider.label}
                  </DropdownMenuLabel>
                  {provider.models.map((m) => (
                    <DropdownMenuRadioItem
                      key={m.modelId}
                      value={encode(provider.providerId, m.modelId)}
                      className="gap-2.5 rounded-lg py-1.5 pr-8 pl-2"
                    >
                      <ProviderBrandIcon
                        kind={provider.kind}
                        modelId={m.modelId}
                        className="h-4 w-4 shrink-0"
                      />
                      <span className="flex min-w-0 flex-col items-start">
                        <span className="truncate text-[13px] leading-tight font-medium text-foreground">
                          {m.modelLabel ?? prettyModelLabel(m.modelId)}
                        </span>
                        <span className="truncate font-mono text-[10px] leading-tight text-muted-foreground">
                          {m.modelId}
                        </span>
                      </span>
                    </DropdownMenuRadioItem>
                  ))}
                </div>
              );
            })}
          </DropdownMenuRadioGroup>
        )}

        {!nothingConfigured && (
          <>
            <DropdownMenuSeparator className="my-1" />
            <DropdownMenuItem
              onClick={() => router.push("/settings/providers")}
              className="justify-center gap-1.5 rounded-lg py-1.5 text-xs text-muted-foreground"
            >
              <Settings2 className="h-3.5 w-3.5" />
              Manage models
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
