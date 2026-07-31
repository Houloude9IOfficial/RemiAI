"use client";

import { useState, useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  ExternalLink,
  Eye,
  EyeOff,
  Loader2,
  Wrench,
  Brain,
  Globe,
  AlertTriangle,
  BookOpen,
  FileSearch,
  Clock,
  Mic,
} from "lucide-react";
import { toast } from "sonner";
import { toolsApi } from "@/lib/api/tools";
import type { ToolWithConfig } from "@/app/api/tools/route";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// ── STT browser support check ──────────────────────────────────────

function getSttSupport(): { supported: boolean; browser: string } {
  if (typeof window === "undefined") return { supported: false, browser: "Server" };
  const hasApi =
    typeof window.SpeechRecognition !== "undefined" ||
    typeof window.webkitSpeechRecognition !== "undefined";
  // Detect browser
  const ua = navigator.userAgent;
  let browser = "Unknown";
  if (ua.includes("Chrome")) browser = "Chrome";
  else if (ua.includes("Firefox")) browser = "Firefox";
  else if (ua.includes("Safari")) browser = "Safari";
  else if (ua.includes("Edg")) browser = "Edge";
  return { supported: hasApi, browser };
}

const CATEGORY_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  builtin: Wrench,
  memory: Brain,
  integration: Globe,
};

function getCategoryIcon(category: string) {
  return CATEGORY_ICONS[category] ?? Wrench;
}

function getCategoryLabel(category: string): string {
  switch (category) {
    case "builtin":
      return "Built-in";
    case "memory":
      return "Memory";
    case "integration":
      return "Integration";
    default:
      return category;
  }
}

export function ToolList() {
  const queryClient = useQueryClient();
  const { data: tools = [], isLoading } = useQuery({
    queryKey: ["tools"],
    queryFn: toolsApi.list,
  });

  const [apiKeyInputs, setApiKeyInputs] = useState<Record<string, string>>({});
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [confirmTool, setConfirmTool] = useState<ToolWithConfig | null>(null);
  const sttSupport = getSttSupport();

  const updateMutation = useMutation({
    mutationFn: ({
      toolId,
      ...input
    }: {
      toolId: string;
      enabled?: boolean;
      apiKey?: string | null;
      config?: Record<string, string>;
    }) => toolsApi.update(toolId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tools"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const handleToggle = (tool: ToolWithConfig) => {
    if (!tool.togglable) return;
    const newEnabled = !tool.config.enabled;

    // If enabling and requires API key but none saved, prompt via input
    if (newEnabled && tool.requiresApiKey && !tool.config.hasApiKey) {
      toast.error(`Set an API key for ${tool.name} first`);
      return;
    }

    // Show security warning for code execution
    if (newEnabled && tool.id === "code_execution") {
      setConfirmTool(tool);
      return;
    }

    updateMutation.mutate({ toolId: tool.id, enabled: newEnabled });
  };

  const handleConfirmEnable = () => {
    if (!confirmTool) return;
    updateMutation.mutate({ toolId: confirmTool.id, enabled: true });
    setConfirmTool(null);
  };

  const handleSaveApiKey = (tool: ToolWithConfig) => {
    const key = apiKeyInputs[tool.id]?.trim();
    if (!key) {
      toast.error("API key is required");
      return;
    }
    updateMutation.mutate(
      { toolId: tool.id, apiKey: key, enabled: true },
      {
        onSuccess: () => {
          setApiKeyInputs((prev) => ({ ...prev, [tool.id]: "" }));
          toast.success(`${tool.name} configured and enabled`);
        },
      },
    );
  };

  const handleRemoveApiKey = (tool: ToolWithConfig) => {
    updateMutation.mutate(
      { toolId: tool.id, apiKey: null, enabled: false },
      {
        onSuccess: () => toast.success(`${tool.name} API key removed`),
      },
    );
  };

  // ── Extra field handlers ───────────────────────────────────────

  const handleExtraToggle = useCallback(
    (toolId: string, key: string, value: boolean) => {
      updateMutation.mutate({
        toolId,
        config: { [key]: value ? "true" : "false" },
      });
    },
    [updateMutation],
  );

  const handleExtraSelect = useCallback(
    (toolId: string, key: string, value: string) => {
      updateMutation.mutate({
        toolId,
        config: { [key]: value },
      });
    },
    [updateMutation],
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Group tools by category, with togglable tools sorted to the end of each group
  const groups = [
    {
      label: "Built-in",
      tools: tools
        .filter((t) => t.category === "builtin" || t.category === "memory")
        .sort((a, b) => (a.togglable ? 1 : 0) - (b.togglable ? 1 : 0)),
    },
    {
      label: "Integrations",
      tools: tools
        .filter((t) => t.category === "integration")
        .sort((a, b) => (a.togglable ? 1 : 0) - (b.togglable ? 1 : 0)),
    },
  ].filter((g) => g.tools.length > 0);

  return (
    <div className="flex flex-col gap-6">
      {groups.map((group) => (
        <div key={group.label} className="flex flex-col gap-2">
          <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground/70">
            {group.label}
          </h2>
          <div className="flex flex-col gap-2">
            {group.tools.map((tool) => {
              const CategoryIcon = getCategoryIcon(tool.category);
              const isUpdating = updateMutation.isPending;
              const inputKey = `api-key-${tool.id}`;

              return (
                <Card key={tool.id} className="overflow-hidden mb-5">
                  <CardHeader className="flex flex-row items-start gap-3 space-y-0 py-3">
                    {tool.icon ? (
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center bg-none rounded-lg">
                        <img src={tool.icon} alt={tool.name} className="h-9 w-9" />
                      </div>
                    ) : (
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg">
                        <CategoryIcon className="h-4 w-4 text-muted-foreground" />
                      </div>
                    )}
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{tool.name}</span>
                        <Badge
                          variant="outline"
                          className="text-[9px] uppercase"
                        >
                          {getCategoryLabel(tool.category)}
                        </Badge>
                        {tool.config.enabled && (
                          <Badge
                            variant="secondary"
                            className="text-[9px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                          >
                            Active
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        {tool.description}
                      </p>
                      {tool.toolNames.length > 0 && (
                        <div className="flex flex-wrap gap-1 pt-0.5">
                          {tool.toolNames.map((name) => (
                            <code
                              key={name}
                              className="rounded bg-muted/50 px-1 py-0.5 text-[10px] font-mono text-muted-foreground"
                            >
                              {name}
                            </code>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Toggle switch */}
                    <div className="flex shrink-0 items-center pt-1">
                      {tool.togglable ? (
                        <Switch
                          checked={tool.config.enabled}
                          onCheckedChange={() => handleToggle(tool)}
                          disabled={isUpdating}
                        />
                      ) : (
                        <span className="text-[10px] text-muted-foreground/50 uppercase tracking-wider">
                          Always on
                        </span>
                      )}
                    </div>
                  </CardHeader>

                  {/* API key section for integrations */}
                  {tool.requiresApiKey && (
                    <CardContent className="border-t border-border/30 px-4 py-3 space-y-3">
                      {tool.config.hasApiKey ? (
                        <div className="flex items-center gap-2">
                          <div className="flex flex-1 items-center gap-2">
                            <div className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                            <span className="text-xs text-muted-foreground">
                              API key configured
                            </span>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs text-muted-foreground hover:text-destructive"
                            onClick={() => handleRemoveApiKey(tool)}
                            disabled={isUpdating}
                          >
                            Remove
                          </Button>
                          {tool.docsUrl && (
                            <a
                              href={tool.docsUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex h-7 items-center gap-1 rounded px-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
                            >
                              <ExternalLink className="h-3 w-3" />
                              Get key
                            </a>
                          )}
                        </div>
                      ) : (
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                          <div className="flex-1 space-y-1">
                            <Label
                              htmlFor={inputKey}
                              className="text-[11px] text-muted-foreground"
                            >
                              {tool.apiKeyLabel}
                            </Label>
                            <div className="relative">
                              <Input
                                id={inputKey}
                                type={showKeys[tool.id] ? "text" : "password"}
                                placeholder={tool.apiKeyPlaceholder}
                                value={apiKeyInputs[tool.id] ?? ""}
                                onChange={(e) =>
                                  setApiKeyInputs((prev) => ({
                                    ...prev,
                                    [tool.id]: e.target.value,
                                  }))
                                }
                                className="pr-8 text-xs"
                              />
                              <button
                                type="button"
                                onClick={() =>
                                  setShowKeys((prev) => ({
                                    ...prev,
                                    [tool.id]: !prev[tool.id],
                                  }))
                                }
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                tabIndex={-1}
                              >
                                {showKeys[tool.id] ? (
                                  <EyeOff className="h-3.5 w-3.5" />
                                ) : (
                                  <Eye className="h-3.5 w-3.5" />
                                )}
                              </button>
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            <Button
                              size="sm"
                              className="h-8 text-xs shrink-0"
                              onClick={() => handleSaveApiKey(tool)}
                              disabled={
                                isUpdating ||
                                !apiKeyInputs[tool.id]?.trim()
                              }
                            >
                              {isUpdating ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                "Save & Enable"
                              )}
                            </Button>
                            {tool.docsUrl && (
                              <a
                                href={tool.docsUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex h-8 items-center gap-1 rounded-md border px-2.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                              >
                                <ExternalLink className="h-3 w-3" />
                                Get key
                              </a>
                            )}
                          </div>
                        </div>
                      )}

                      {/* ── Extra configuration fields (toggles, selects) ── */}
                      {tool.config.hasApiKey && tool.extraFields && tool.extraFields.length > 0 && (
                        <div className="border-t border-border/20 pt-3 space-y-3">
                          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/50">
                            Configuration
                          </span>

                          {tool.extraFields.map((field) => {
                            const currentValue =
                              (tool.config.extraValues ?? {})[field.key] ??
                              (field.type === "toggle" ? "false" : "");

                            if (field.type === "toggle") {
                              const isChecked = currentValue === "true";
                              return (
                                <div key={field.key} className="flex items-center justify-between gap-3">
                                  <div className="flex flex-col gap-0.5">
                                    <span className="text-xs font-medium text-foreground/80">
                                      {field.label}
                                    </span>
                                    {field.description && (
                                      <span className="text-[10px] text-muted-foreground/50">
                                        {field.description}
                                      </span>
                                    )}
                                  </div>
                                  <Switch
                                    checked={isChecked}
                                    onCheckedChange={(v) => handleExtraToggle(tool.id, field.key, v)}
                                    disabled={isUpdating}
                                  />
                                </div>
                              );
                            }

                            if (field.type === "select") {
                              return (
                                <div key={field.key} className="flex flex-col gap-1.5">
                                  <Label className="text-[11px] text-muted-foreground">
                                    {field.label}
                                  </Label>
                                  {field.description && (
                                    <span className="text-[10px] text-muted-foreground/50 -mt-0.5">
                                      {field.description}
                                    </span>
                                  )}
                                  <select
                                    value={currentValue}
                                    onChange={(e) => handleExtraSelect(tool.id, field.key, e.target.value)}
                                    disabled={isUpdating}
                                    className={cn(
                                      "flex h-8 w-full rounded-md border border-input bg-transparent px-3 py-1 text-xs shadow-sm",
                                      "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                                      "disabled:cursor-not-allowed disabled:opacity-50",
                                    )}
                                  >
                                    <option value="" disabled>
                                      {field.placeholder ?? "Select..."}
                                    </option>
                                    {field.options?.map((opt) => (
                                      <option key={opt.value} value={opt.value}>
                                        {opt.label}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              );
                            }

                            return null;
                          })}
                        </div>
                      )}

                      {/* ── STT browser support (for ElevenLabs) ── */}
                      {tool.id === "elevenlabs" &&
                        (tool.config.extraValues?.stt_enabled === "true") && (
                        <div className="flex items-center gap-2 border-t border-border/20 pt-3">
                          <div
                            className={cn(
                              "flex items-center gap-1.5 rounded-md px-2 py-1",
                              sttSupport.supported
                                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                                : "bg-amber-500/10 text-amber-600 dark:text-amber-400",
                            )}
                          >
                            <Mic className="h-3 w-3" />
                            <span className="text-[10px] font-medium">
                              STT: {sttSupport.supported ? "Supported" : "Not supported"}
                            </span>
                          </div>
                          <span className="text-[10px] text-muted-foreground/40">
                            ({sttSupport.browser})
                          </span>
                        </div>
                      )}
                    </CardContent>
                  )}
                </Card>
              );
            })}
          </div>
        </div>
      ))}

      {/* Security warning dialog for code execution */}
      <Dialog open={confirmTool !== null} onOpenChange={(open) => !open && setConfirmTool(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
              <AlertTriangle className="h-5 w-5" />
              Enable Code Execution?
            </DialogTitle>
            <DialogDescription className="pt-2 space-y-3" render={<div />}>
              <p className="text-sm font-medium text-foreground">
                This is <strong>NOT a secure sandbox</strong>.
              </p>
              <ul className="text-xs space-y-1.5 text-muted-foreground list-disc pl-4">
                <li>The code runs as a subprocess on <strong>your machine</strong> with <strong>full filesystem access</strong></li>
                <li>It can read, write, and delete <strong>any file</strong> on your system</li>
                <li>It can make network connections</li>
                <li>Environment variables (PATH, HOME, etc.) are stripped to prevent easy file discovery</li>
                <li>But <strong>absolute paths still work</strong> — this is <strong>not</strong> a security boundary</li>
              </ul>
              <p className="text-xs text-muted-foreground">
                Only enable if you understand these risks. True sandboxing requires Docker containers.
              </p>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setConfirmTool(null)}
            >
              Cancel
            </Button>
            <Button
              variant="default"
              className="bg-amber-600 hover:bg-amber-700 text-white"
              onClick={handleConfirmEnable}
            >
              I Understand, Enable
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
