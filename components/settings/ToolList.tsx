"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Fuse from "fuse.js";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ChevronDown,
  ExternalLink,
  Eye,
  EyeOff,
  Loader2,
  Search,
  Wrench,
  Brain,
  Globe,
  AlertTriangle,
  Mic,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { toolsApi } from "@/lib/api/tools";
import { TranscriptionConfig } from "./TranscriptionConfig";
import type { ToolWithConfig } from "@/app/api/tools/route";
import type { ToolCategory } from "@/lib/tools/catalog";
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

type CategoryFilter = "all" | ToolCategory;

const CATEGORY_FILTERS: { value: CategoryFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "builtin", label: "Built-in" },
  { value: "memory", label: "Memory" },
  { value: "integration", label: "Integrations" },
];

const GROUP_ORDER: { label: string; category: ToolCategory }[] = [
  { label: "Built-in", category: "builtin" },
  { label: "Memory", category: "memory" },
  { label: "Integrations", category: "integration" },
];

// Display order for sub-groups within the (large) Built-in category
const SUBGROUP_ORDER = [
  "Files & Storage",
  "Context & Profile",
  "Automation",
  "Media & Audio",
  "Web & Research",
  "AI & Assistance",
];

// Tools with an expandable configuration panel
function hasConfig(tool: ToolWithConfig): boolean {
  return tool.requiresApiKey || tool.id === "transcription";
}

// Every row can expand: to read the full description, or to reach config
// (API key / transcription) when the tool has it.
function canExpand(tool: ToolWithConfig): boolean {
  return hasConfig(tool) || tool.description.length > 90;
}

interface ToolGroup {
  label: string;
  category: ToolCategory;
  subgroups: { label: string | null; tools: ToolWithConfig[] }[];
}

export function ToolList() {
  const queryClient = useQueryClient();
  const { data: tools = [], isLoading } = useQuery({
    queryKey: ["tools"],
    queryFn: toolsApi.list,
  });

  // ── Search & filter state ──────────────────────────────────────
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const seededExpanded = useRef(false);

  // Auto-expand tools that need an API key to be usable (first load only).
  useEffect(() => {
    if (seededExpanded.current || isLoading) return;
    seededExpanded.current = true;
    const needsSetup = new Set(
      tools.filter((t) => t.requiresApiKey && !t.config.hasApiKey).map((t) => t.id),
    );
    setExpandedIds(needsSetup);
  }, [tools, isLoading]);

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

    // Show security warning for tools that run native code / a real browser
    if (
      newEnabled &&
      (tool.id === "code_execution" || tool.id === "playwright")
    ) {
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

  const handleExtraToggle = (toolId: string, key: string, value: boolean) => {
    updateMutation.mutate({
      toolId,
      config: { [key]: value ? "true" : "false" },
    });
  };

  const handleExtraSelect = (toolId: string, key: string, value: string) => {
    updateMutation.mutate({
      toolId,
      config: { [key]: value },
    });
  };

  const toggleExpanded = (toolId: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(toolId)) next.delete(toolId);
      else next.add(toolId);
      return next;
    });
  };

  // ── Filtering & grouping ───────────────────────────────────────

  const filteredTools = useMemo(() => {
    let list = tools;
    if (category !== "all") list = list.filter((t) => t.category === category);

    const q = query.trim();
    if (q) {
      const fuse = new Fuse(list, {
        keys: ["name", "description", "toolNames"],
        threshold: 0.4,
        ignoreLocation: true,
      });
      list = fuse.search(q).map((r) => r.item);
    }
    return list;
  }, [tools, category, query]);

  const counts = useMemo(() => {
    const c: Record<ToolCategory, number> = { builtin: 0, memory: 0, integration: 0 };
    for (const t of tools) c[t.category] += 1;
    return c;
  }, [tools]);

  const activeCount = useMemo(
    () => tools.filter((t) => t.config.enabled).length,
    [tools],
  );

  const groups: ToolGroup[] = useMemo(() => {
    const out: ToolGroup[] = [];
    for (const g of GROUP_ORDER) {
      const catTools = filteredTools
        .filter((t) => t.category === g.category)
        .sort((a, b) => (a.togglable ? 1 : 0) - (b.togglable ? 1 : 0));
      if (catTools.length === 0) continue;

      // Cluster tools by subgroup (built-in only), keeping a stable display order.
      const bySubgroup = new Map<string, ToolWithConfig[]>();
      const ungrouped: ToolWithConfig[] = [];
      for (const t of catTools) {
        if (t.subgroup) {
          const arr = bySubgroup.get(t.subgroup) ?? [];
          arr.push(t);
          bySubgroup.set(t.subgroup, arr);
        } else {
          ungrouped.push(t);
        }
      }

      const subgroups: ToolGroup["subgroups"] = [];
      for (const sg of SUBGROUP_ORDER) {
        const arr = bySubgroup.get(sg);
        if (arr && arr.length) subgroups.push({ label: sg, tools: arr });
      }
      if (ungrouped.length) subgroups.push({ label: null, tools: ungrouped });

      out.push({ label: g.label, category: g.category, subgroups });
    }
    return out;
  }, [filteredTools]);

  const isFiltering = query.trim() !== "" || category !== "all";

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* ── Toolbar: search + category filter ── */}
      <div className="flex flex-col gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search tools by name or description..."
            className="h-9 pl-9 pr-8"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <Tabs
          value={category}
          onValueChange={(value) => setCategory((value as CategoryFilter) ?? "all")}
        >
          <TabsList className="h-9 w-full">
            {CATEGORY_FILTERS.map((f) => (
              <TabsTrigger key={f.value} value={f.value} className="gap-1.5">
                {f.label}
                <span className="text-[10px] font-normal text-muted-foreground/60">
                  {f.value === "all" ? tools.length : counts[f.value]}
                </span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {activeCount} of {tools.length} tools active
          </span>
          {isFiltering && <span>{filteredTools.length} shown</span>}
        </div>
      </div>

      {/* ── Empty state ── */}
      {filteredTools.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-12 text-center">
          <Search className="h-8 w-8 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">
            No tools match your search.
          </p>
          <Button
            variant="link"
            size="sm"
            onClick={() => {
              setQuery("");
              setCategory("all");
            }}
          >
            Clear search and filters
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {groups.map((group) => (
            <div key={group.label} className="flex flex-col gap-3">
              {/* Category header — hidden when a single category tab is active */}
              {category === "all" && (
                <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground/70">
                  {group.label}{" "}
                  <span className="font-normal normal-case text-muted-foreground/50">
                    ({group.subgroups.reduce((n, s) => n + s.tools.length, 0)})
                  </span>
                </h2>
              )}

              {group.subgroups.map((sub) => (
                <div key={sub.label ?? "other"} className="flex flex-col gap-1.5">
                  {sub.label && (
                    <h3 className="pl-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/50">
                      {sub.label}
                    </h3>
                  )}
                  <div className="divide-y divide-border/60 overflow-hidden rounded-lg border bg-card">
                    {sub.tools.map((tool) => {
                      const CategoryIcon = getCategoryIcon(tool.category);
                      const isUpdating = updateMutation.isPending;
                      const inputKey = `api-key-${tool.id}`;
                      const isExpanded = expandedIds.has(tool.id);

                      return (
                        <div
                          key={tool.id}
                          className="px-3.5 py-3 transition-colors hover:bg-muted/30"
                        >
                          <div className="flex items-start gap-3">
                            {/* Icon */}
                            {tool.icon ? (
                              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-none">
                                <img
                                  src={tool.icon}
                                  alt={tool.name}
                                  className="h-8 w-8 rounded-lg"
                                />
                              </div>
                            ) : (
                              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted/60">
                                <CategoryIcon className="h-4 w-4 text-muted-foreground" />
                              </div>
                            )}

                            {/* Name, description, chips */}
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                                <span className="text-sm font-medium">
                                  {tool.name}
                                </span>
                                {category === "all" && (
                                  <Badge
                                    variant="outline"
                                    className="text-[9px] uppercase"
                                  >
                                    {getCategoryLabel(tool.category)}
                                  </Badge>
                                )}
                                {tool.config.enabled && (
                                  <Badge
                                    variant="secondary"
                                    className="text-[9px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                                  >
                                    Active
                                  </Badge>
                                )}
                              </div>
                              <p
                                className={cn(
                                  "mt-0.5 text-xs leading-relaxed text-muted-foreground",
                                  !isExpanded && "line-clamp-2",
                                )}
                              >
                                {tool.description}
                              </p>
                              {tool.toolNames.length > 0 && (
                                <div className="mt-1.5 flex items-center gap-1 overflow-x-auto whitespace-nowrap [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                                  {tool.toolNames.map((name) => (
                                    <code
                                      key={name}
                                      className="shrink-0 rounded bg-muted/50 px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground"
                                    >
                                      {name}
                                    </code>
                                  ))}
                                </div>
                              )}
                            </div>

                            {/* Expand + toggle controls */}
                            <div className="flex shrink-0 items-center gap-1 pt-0.5">
                              {canExpand(tool) && (
                                <button
                                  type="button"
                                  onClick={() => toggleExpanded(tool.id)}
                                  className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                                  aria-expanded={isExpanded}
                                  aria-label={
                                    isExpanded
                                      ? `Hide ${tool.name} details`
                                      : `Show ${tool.name} details`
                                  }
                                >
                                  <ChevronDown
                                    className={cn(
                                      "h-4 w-4 transition-transform",
                                      isExpanded && "rotate-180",
                                    )}
                                  />
                                </button>
                              )}
                              {tool.togglable ? (
                                <Switch
                                  checked={tool.config.enabled}
                                  onCheckedChange={() => handleToggle(tool)}
                                  disabled={isUpdating}
                                />
                              ) : (
                                <span className="text-[10px] text-muted-foreground/50 uppercase tracking-wider whitespace-nowrap">
                                  Always on
                                </span>
                              )}
                            </div>
                          </div>

                          {/* ── Expandable panel: full description and/or config ── */}
                          {isExpanded && (
                            <div className="mt-3 space-y-3 border-t border-border/30 pt-3">
                              {!hasConfig(tool) && (
                                <p className="text-xs leading-relaxed text-muted-foreground">
                                  {tool.description}
                                </p>
                              )}

                              {/* Transcription configuration (builtin, always on) */}
                              {tool.id === "transcription" && (
                                <TranscriptionConfig />
                              )}

                              {tool.requiresApiKey && (
                                <>
                                  {/* API key section */}
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
                                            aria-label={
                                              showKeys[tool.id]
                                                ? "Hide API key"
                                                : "Show API key"
                                            }
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
                                  {tool.config.hasApiKey &&
                                    tool.extraFields &&
                                    tool.extraFields.length > 0 && (
                                      <div className="space-y-3 border-t border-border/20 pt-3">
                                        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/50">
                                          Configuration
                                        </span>

                                        {tool.extraFields.map((field) => {
                                          const currentValue =
                                            (tool.config.extraValues ?? {})[
                                              field.key
                                            ] ??
                                            (field.type === "toggle" ? "false" : "");

                                          if (field.type === "toggle") {
                                            const isChecked = currentValue === "true";
                                            return (
                                              <div
                                                key={field.key}
                                                className="flex items-center justify-between gap-3"
                                              >
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
                                                  onCheckedChange={(v) =>
                                                    handleExtraToggle(
                                                      tool.id,
                                                      field.key,
                                                      v,
                                                    )
                                                  }
                                                  disabled={isUpdating}
                                                />
                                              </div>
                                            );
                                          }

                                          if (field.type === "select") {
                                            return (
                                              <div
                                                key={field.key}
                                                className="flex flex-col gap-1.5"
                                              >
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
                                                  onChange={(e) =>
                                                    handleExtraSelect(
                                                      tool.id,
                                                      field.key,
                                                      e.target.value,
                                                    )
                                                  }
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
                                                    <option
                                                      key={opt.value}
                                                      value={opt.value}
                                                    >
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
                                    tool.config.extraValues?.stt_enabled ===
                                      "true" && (
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
                                            STT:{" "}
                                            {sttSupport.supported
                                              ? "Supported"
                                              : "Not supported"}
                                          </span>
                                        </div>
                                        <span className="text-[10px] text-muted-foreground/40">
                                          ({sttSupport.browser})
                                        </span>
                                      </div>
                                    )}
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Security warning dialog for native tools (code execution, browser automation) */}
      <Dialog open={confirmTool !== null} onOpenChange={(open) => !open && setConfirmTool(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
              <AlertTriangle className="h-5 w-5" />
              {confirmTool?.id === "playwright"
                ? "Enable Browser Automation?"
                : "Enable Code Execution?"}
            </DialogTitle>
            <DialogDescription className="pt-2 space-y-3" render={<div />}>
              {confirmTool?.id === "playwright" ? (
                <>
                  <p className="text-sm font-medium text-foreground">
                    This runs a <strong>real Chromium browser</strong> on your machine.
                  </p>
                  <ul className="text-xs space-y-1.5 text-muted-foreground list-disc pl-4">
                    <li>It can visit <strong>any website</strong> and click, fill forms, and submit actions <strong>as you</strong></li>
                    <li>It uses your network and can log in to sites with your saved sessions</li>
                    <li>It can take screenshots and extract page content into the chat</li>
                    <li>It can execute custom Playwright scripts (<code>browser_interact</code>) with <strong>full access</strong> on this server</li>
                    <li>It runs headless (no visible window) in a per-conversation session</li>
                    <li>Chromium is bundled with the desktop app and Docker image; in local dev install it once with <code>npm run playwright:install</code></li>
                  </ul>
                  <p className="text-xs text-muted-foreground">
                    Only enable if you understand these risks and trust the requests the assistant makes.
                  </p>
                </>
              ) : (
                <>
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
                </>
              )}
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
              className="bg-amber-600 hover:bg-amber-700 text-white ml-2"
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
