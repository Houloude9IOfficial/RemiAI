"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Download, Trash2, HardDrive, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { transcriptionApi, type TranscriptionSettingsResponse } from "@/lib/api/transcription";
import { cn } from "@/lib/utils";

function formatSize(bytes: number): string {
  return bytes > 0 ? `${(bytes / 1024 / 1024).toFixed(0)} MB` : "—";
}

export function TranscriptionConfig() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["transcription-settings"],
    queryFn: transcriptionApi.get,
  });

  const [engine, setEngine] = useState<"offline" | "provider">("offline");
  const [offlineModel, setOfflineModel] = useState("whisper-base");
  const [providerId, setProviderId] = useState<number | "">("");
  const [providerModel, setProviderModel] = useState("whisper-1");
  const [language, setLanguage] = useState("");
  const [dirty, setDirty] = useState(false);

  // Hydrate local state when the server data arrives.
  const hydrated = data && !isLoading;
  const config = data?.config;
  const localEngine = hydrated && engine === "offline" && offlineModel === "whisper-base" && providerModel === "whisper-1" && !dirty
    ? (config?.engine ?? "offline")
    : engine;
  const localOffline = hydrated && offlineModel === "whisper-base" && !dirty ? (config?.offlineModel ?? "whisper-base") : offlineModel;
  const localProviderModel = hydrated && providerModel === "whisper-1" && !dirty ? (config?.providerModel ?? "whisper-1") : providerModel;
  const localProviderId = hydrated && providerId === "" && !dirty ? (config?.providerId ?? "") : providerId;
  const localLanguage = hydrated && language === "" && !dirty ? (config?.language ?? "") : language;

  const saveMutation = useMutation({
    mutationFn: (patch: Parameters<typeof transcriptionApi.save>[0]) => transcriptionApi.save(patch),
    onSuccess: (res) => {
      queryClient.setQueryData(["transcription-settings"], (old: TranscriptionSettingsResponse | undefined) =>
        old ? { ...old, config: res.config } : old,
      );
      setDirty(false);
      toast.success("Transcription settings saved");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const modelMutation = useMutation({
    mutationFn: ({ action, model }: { action: "download" | "delete"; model: string }) =>
      action === "download" ? transcriptionApi.download(model) : transcriptionApi.delete(model),
    onSuccess: (res: Awaited<ReturnType<typeof transcriptionApi.download>> | Awaited<ReturnType<typeof transcriptionApi.delete>>) => {
      queryClient.setQueryData(["transcription-settings"], (old: TranscriptionSettingsResponse | undefined) =>
        old ? { ...old, offlineModels: res.offlineModels } : old,
      );
      toast.success(
        "deleted" in res
          ? res.deleted
            ? "Model deleted"
            : "Nothing to delete"
          : "Model downloaded",
      );
    },
    onError: (err: Error) => toast.error(err.message),
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-3 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading transcription settings…
      </div>
    );
  }

  if (!data) return null;

  const configEngine = localEngine;
  const selectedOffline = localOffline;
  const selectedProviderId = localProviderId;

  const handleSave = () => {
    const patch: Record<string, unknown> = { engine: configEngine };
    if (configEngine === "offline") patch.offlineModel = selectedOffline;
    else {
      patch.providerModel = localProviderModel.trim() || "whisper-1";
      if (selectedProviderId) patch.providerId = Number(selectedProviderId);
    }
    if (localLanguage.trim()) patch.language = localLanguage.trim();
    else patch.language = undefined;
    saveMutation.mutate(patch);
  };

  const transcribeProviders = data.providers.filter((p) => p.supportsTranscription);

  return (
    <div className="space-y-4 border-t border-border/30 px-4 py-4">
      {/* Engine */}
      <div className="space-y-1.5">
        <Label className="text-[11px] text-muted-foreground">Engine</Label>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => { setEngine("offline"); setDirty(true); }}
            className={cn(
              "rounded-md border px-3 py-2 text-left text-xs transition-colors",
              configEngine === "offline"
                ? "border-primary/50 bg-primary/5 text-foreground"
                : "border-border/60 text-muted-foreground hover:border-border",
            )}
          >
            <div className="font-medium">Offline (local)</div>
            <div className="mt-0.5 text-[10px] text-muted-foreground/70">
              Private &amp; free — Whisper runs on this machine
            </div>
          </button>
          <button
            type="button"
            onClick={() => { setEngine("provider"); setDirty(true); }}
            className={cn(
              "rounded-md border px-3 py-2 text-left text-xs transition-colors",
              configEngine === "provider"
                ? "border-primary/50 bg-primary/5 text-foreground"
                : "border-border/60 text-muted-foreground hover:border-border",
            )}
          >
            <div className="font-medium">Provider</div>
            <div className="mt-0.5 text-[10px] text-muted-foreground/70">
              Fast — uses your configured API provider
            </div>
          </button>
        </div>
      </div>

      {configEngine === "offline" ? (
        <div className="space-y-1.5">
          <Label className="text-[11px] text-muted-foreground">Offline Whisper model</Label>
          <div className="space-y-1.5">
            {data.offlineModels.map((m) => {
              const isSelected = selectedOffline === m.model;
              const isBusy = modelMutation.isPending && modelMutation.variables?.model === m.model;
              return (
                <div
                  key={m.model}
                  className={cn(
                    "flex items-center justify-between gap-2 rounded-md border px-3 py-2",
                    isSelected ? "border-primary/50 bg-primary/5" : "border-border/60",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => { setOfflineModel(m.model); setDirty(true); }}
                    className="flex flex-1 items-center gap-2 text-left"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-medium">
                        {m.model}
                        <span className="ml-2 text-[10px] text-muted-foreground/70">
                          {m.params} · {m.size}
                        </span>
                      </div>
                      <div className="text-[10px] text-muted-foreground/60 truncate">{m.description}</div>
                    </div>
                  </button>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {m.downloaded ? (
                      <>
                        <span className="flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400">
                          <HardDrive className="h-3 w-3" />
                          {formatSize(m.sizeBytes)}
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                          onClick={() => modelMutation.mutate({ action: "delete", model: m.model })}
                          disabled={modelMutation.isPending}
                          title="Delete downloaded model"
                        >
                          {isBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                        </Button>
                      </>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-6 gap-1 text-[10px]"
                        onClick={() => modelMutation.mutate({ action: "download", model: m.model })}
                        disabled={modelMutation.isPending}
                      >
                        {isBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
                        Download
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-[10px] text-muted-foreground/60">
            Offline models are downloaded once (from Hugging Face) and cached locally — transcription then works fully offline.
            Larger models are more accurate but slower on CPU.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">Provider</Label>
              {transcribeProviders.length > 0 ? (
                <select
                  value={String(selectedProviderId ?? "")}
                  onChange={(e) => { setProviderId(e.target.value ? Number(e.target.value) : ""); setDirty(true); }}
                  className="flex h-8 w-full rounded-md border border-input bg-transparent px-3 py-1 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="">Auto (conversation's provider)</option>
                  {transcribeProviders.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label} ({p.kind})
                    </option>
                  ))}
                </select>
              ) : (
                <div className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[10px] text-amber-600 dark:text-amber-400">
                  No OpenAI-compatible provider configured. Add one in Settings &gt; Providers, or use the offline engine.
                </div>
              )}
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">Provider model</Label>
              <Input
                value={localProviderModel}
                onChange={(e) => { setProviderModel(e.target.value); setDirty(true); }}
                placeholder="whisper-1"
                className="h-8 text-xs"
              />
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground/60">
            Defaults to <code className="rounded bg-muted/50 px-1">whisper-1</code>, which works with most OpenAI-compatible
            providers. The audio is sent to that provider for transcription.
          </p>
        </div>
      )}

      {/* Default language */}
      <div className="space-y-1">
        <Label className="text-[11px] text-muted-foreground">
          Default language <span className="font-normal text-muted-foreground/50">(optional)</span>
        </Label>
        <Input
          value={localLanguage}
          onChange={(e) => { setLanguage(e.target.value); setDirty(true); }}
          placeholder="auto-detect (e.g. en, es, fr)"
          className="h-8 max-w-xs text-xs"
        />
        <p className="text-[10px] text-muted-foreground/60">
          ISO-639-1 code used as a hint when transcribing. Leave empty to auto-detect.
        </p>
      </div>

      {/* Save */}
      <div className="flex items-center justify-between gap-2 border-t border-border/20 pt-3">
        <span className="text-[10px] text-muted-foreground/50">
          The AI can also change these in-chat via manage_transcription_models.
        </span>
        <Button
          size="sm"
          className="h-8 text-xs"
          onClick={handleSave}
          disabled={saveMutation.isPending || (!dirty && !hydrated)}
        >
          {saveMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          {dirty ? "Save changes" : "Saved"}
        </Button>
      </div>
    </div>
  );
}
