"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Activity, Pause, Play, Plus, Search, Trash2, X } from "lucide-react";
import CenteredLayout from "@/components/layout/CenteredLayout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toolsApi } from "@/lib/api/tools";
import { mcpServersApi, type McpServer } from "@/lib/api/mcp-servers";
import type { ToolWithConfig } from "@/app/api/tools/route";
import { providersApi, type ProviderModel } from "@/lib/api/providers";

type Heartbeat = {
  id: number;
  name: string;
  prompt: string;
  enabled: boolean;
  schedule: string;
  nextRunAt: string;
  providerId: number | null;
  modelId: string | null;
  fallbackMode: "auto" | "fail";
  allowedToolNames: string[];
  allowedToolGroups: string[];
  deniedToolNames: string[];
  allowedMcpServerIds: number[];
};
async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "Request failed");
  return data;
}

function PermissionPicker({
  options,
  selected,
  denied,
  onAdd,
  onRemove,
  onToggleTool,
}: {
  options: Array<{
    value: string;
    label: string;
    description?: string;
    kind: "tool" | "group" | "mcp";
    tools?: string[];
  }>;
  selected: Array<{ key: string; label: string; kind: string }>;
  denied: string[];
  onAdd: (option: {
    value: string;
    label: string;
    kind: "tool" | "group" | "mcp";
  }) => void;
  onRemove: (key: string) => void;
  onToggleTool: (toolName: string, group?: string) => void;
}) {
  const [query, setQuery] = useState("");
  const tools = options.filter((option) => option.kind === "tool");
  const groups = options.filter((option) => option.kind === "group");
  const mcp = options.filter((option) => option.kind === "mcp");
  const has = (kind: string, value: string) =>
    selected.some((item) => item.key === `${kind}:${value}`);
  const checkbox = (checked: boolean, onChange: () => void) => (
    <input
      type="checkbox"
      checked={checked}
      onChange={onChange}
      className="accent-primary"
    />
  );
  return (
    <div className="space-y-4">
      <label className="text-sm font-medium">Heartbeat permissions</label>
      <p className="text-xs text-muted-foreground">
        Groups grant all tools inside them. Expand a group to turn individual
        tools off.
      </p>
      <div className="relative">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="h-10 pl-9"
          placeholder="Filter tools, groups, or MCP servers…"
        />
      </div>
      <div className="max-h-80 space-y-2 overflow-y-auto rounded-xl border border-border/70 bg-muted/20 p-2 shadow-sm [scrollbar-width:thin]">
        <div className="rounded-lg p-3 transition-colors border-none bg-none">
          <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Tools
          </h3>
          <div className="space-y-1">
            {tools
              .filter(
                (option) =>
                  !query ||
                  `${option.label} ${option.description ?? ""}`
                    .toLowerCase()
                    .includes(query.toLowerCase()),
              )
              .map((option) => (
                <label
                  key={option.value}
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted/70"
                >
                  <input
                    type="checkbox"
                    checked={
                      (has("tool", option.value) ||
                        groups.some(
                          (group) =>
                            has("group", group.value) &&
                            group.tools?.includes(option.value),
                        )) &&
                      !denied.includes(option.value)
                    }
                    onChange={() => {
                      const grantingGroup = groups.find(
                        (group) =>
                          has("group", group.value) &&
                          group.tools?.includes(option.value),
                      );
                      onToggleTool(option.value, grantingGroup?.value);
                    }}
                    className="accent-primary"
                  />
                  {option.label}
                </label>
              ))}
          </div>
        </div>
        <div className="rounded-lg border-none p-3 transition-colors">
          <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Groups
          </h3>
          <div className="space-y-2">
            {groups
              .filter(
                (option) =>
                  !query ||
                  `${option.label} ${option.description ?? ""}`
                    .toLowerCase()
                    .includes(query.toLowerCase()),
              )
              .map((option) => {
                const groupSelected = has("group", option.value);
                return (
                  <div key={option.value}>
                    <label className="flex items-start gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted/70">
                      {checkbox(groupSelected, () =>
                        groupSelected
                          ? onRemove(`group:${option.value}`)
                          : onAdd(option),
                      )}
                      <span>
                        <span className="font-medium">{option.label}</span>
                        <span className="block text-xs text-muted-foreground">
                          {option.description}
                        </span>
                      </span>
                    </label>
                    {groupSelected && (
                      <div className="mt-2 ml-5 space-y-1 border-l border-primary/20 pl-3 animate-in slide-in-from-top-1 fade-in duration-200">
                        {(option.tools ?? []).map((toolName) => (
                          <label
                            key={toolName}
                            className="flex items-center gap-2 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground"
                          >
                            <input
                              type="checkbox"
                              checked={!denied.includes(toolName)}
                              onChange={() =>
                                onToggleTool(toolName, option.value)
                              }
                              className="accent-primary"
                            />
                            {toolName}
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        </div>
        <div className="rounded-lg border-none p-3 transition-colors">
          <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            MCP servers
          </h3>
          <div className="space-y-1">
            {mcp
              .filter(
                (option) =>
                  !query ||
                  `${option.label} ${option.description ?? ""}`
                    .toLowerCase()
                    .includes(query.toLowerCase()),
              )
              .map((option) => (
                <label
                  key={option.value}
                  className="flex items-start gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted/70"
                >
                  {checkbox(has("mcp", option.value), () =>
                    has("mcp", option.value)
                      ? onRemove(`mcp:${option.value}`)
                      : onAdd(option),
                  )}
                  <span>
                    {option.label}
                    <span className="block text-xs text-muted-foreground">
                      {option.description}
                    </span>
                  </span>
                </label>
              ))}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {selected.map((item) => (
          <span
            key={item.key}
            className="inline-flex items-center gap-1.5 rounded-full border bg-muted/60 px-2.5 py-1 text-xs"
          >
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
              {item.kind}
            </span>
            <span>{item.label}</span>
            <button
              type="button"
              onClick={() => onRemove(item.key)}
              aria-label={`Remove ${item.label}`}
            >
              <X size={12} />
            </button>
          </span>
        ))}
        {denied.length > 0 && (
          <span className="text-xs text-muted-foreground">
            {denied.length} group tool exclusion{denied.length === 1 ? "" : "s"}
          </span>
        )}
      </div>
    </div>
  );
}

export default function HeartbeatsPage() {
  const client = useQueryClient();
  const [editing, setEditing] = useState<Heartbeat | null>(null);
  const [name, setName] = useState("");
  const [prompt, setPrompt] = useState("");
  const [schedule, setSchedule] = useState("3600");
  const [providerId, setProviderId] = useState("");
  const [modelId, setModelId] = useState("");
  const [fallbackMode, setFallbackMode] = useState<"auto" | "fail">("fail");
  const [tools, setTools] = useState<string[]>([
    "get_time_details",
    "web_fetch",
  ]);
  const [groups, setGroups] = useState<string[]>([]);
  const [deniedTools, setDeniedTools] = useState<string[]>([]);
  const [mcpIds, setMcpIds] = useState<string[]>([]);
  const { data } = useQuery({
    queryKey: ["heartbeats"],
    queryFn: () => request<{ heartbeats: Heartbeat[] }>("/api/heartbeats"),
  });
  const { data: toolDefs = [] } = useQuery({
    queryKey: ["tools"],
    queryFn: toolsApi.list,
  });
  const { data: mcpServers = [] } = useQuery({
    queryKey: ["mcp-servers"],
    queryFn: mcpServersApi.list,
  });
  const { data: providers = [] } = useQuery({
    queryKey: ["providers"],
    queryFn: providersApi.list,
  });
  const { data: models = [] } = useQuery({
    queryKey: ["heartbeat-models", providerId],
    queryFn: () =>
      providerId
        ? providersApi.listModels(Number(providerId))
        : Promise.resolve([] as ProviderModel[]),
  });
  const toolOptions = useMemo(
    () =>
      toolDefs.flatMap((tool: ToolWithConfig) =>
        tool.toolNames.map((name) => ({
          value: name,
          label: name,
          description: tool.name,
        })),
      ),
    [toolDefs],
  );
  const groupOptions = useMemo(
    () =>
      toolDefs
        .filter((tool) => tool.toolNames.length > 1)
        .map((tool) => ({
          value: tool.id,
          label: tool.name,
          description: tool.description,
          tools: tool.toolNames,
        })),
    [toolDefs],
  );
  const mcpOptions = useMemo(
    () =>
      mcpServers.map((server: McpServer) => ({
        value: String(server.id),
        label: server.name,
        description: `${server.transport} MCP server${server.enabled ? " · enabled" : " · disabled in MCP settings"}`,
      })),
    [mcpServers],
  );
  const permissionOptions = useMemo(
    () => [
      ...toolOptions.map((option) => ({ ...option, kind: "tool" as const })),
      ...groupOptions.map((option) => ({ ...option, kind: "group" as const })),
      ...mcpOptions.map((option) => ({ ...option, kind: "mcp" as const })),
    ],
    [toolOptions, groupOptions, mcpOptions],
  );
  const selectedPermissions = useMemo(
    () => [
      ...tools.map((value) => ({
        key: `tool:${value}`,
        label: value,
        kind: "tool",
      })),
      ...groups.map((value) => ({
        key: `group:${value}`,
        label: value,
        kind: "group",
      })),
      ...mcpIds.map((value) => ({
        key: `mcp:${value}`,
        label:
          mcpOptions.find((option) => option.value === value)?.label ?? value,
        kind: "mcp",
      })),
    ],
    [tools, groups, mcpIds, mcpOptions],
  );
  const addPermission = (option: {
    value: string;
    label: string;
    kind: "tool" | "group" | "mcp";
  }) => {
    if (option.kind === "tool")
      setTools((value) =>
        value.includes(option.value) ? value : [...value, option.value],
      );
    else if (option.kind === "group")
      setGroups((value) =>
        value.includes(option.value) ? value : [...value, option.value],
      );
    else
      setMcpIds((value) =>
        value.includes(option.value) ? value : [...value, option.value],
      );
  };
  const removePermission = (key: string) => {
    const [kind, value] = key.split(":");
    if (kind === "tool")
      setTools((items) => items.filter((item) => item !== value));
    else if (kind === "group")
      setGroups((items) => items.filter((item) => item !== value));
    else setMcpIds((items) => items.filter((item) => item !== value));
  };
  const toggleTool = (toolName: string, group?: string) => {
    if (group && groups.includes(group))
      setDeniedTools((items) =>
        items.includes(toolName)
          ? items.filter((item) => item !== toolName)
          : [...items, toolName],
      );
    else
      setTools((items) =>
        items.includes(toolName)
          ? items.filter((item) => item !== toolName)
          : [...items, toolName],
      );
  };
  const save = useMutation({
    mutationFn: () =>
      request("/api/heartbeats" + (editing ? `/${editing.id}` : ""), {
        method: editing ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name,
          prompt,
          scheduleType: "interval",
          schedule,
          providerId: providerId ? Number(providerId) : null,
          modelId: modelId || null,
          fallbackMode,
          allowedToolNames: tools,
          allowedToolGroups: groups,
          deniedToolNames: deniedTools,
          allowedMcpServerIds: mcpIds.map(Number),
        }),
      }),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["heartbeats"] });
      setEditing(null);
      setName("");
      setPrompt("");
      setProviderId("");
      setModelId("");
      setFallbackMode("fail");
      setTools(["get_time_details", "web_fetch"]);
      setGroups([]);
      setDeniedTools([]);
      setMcpIds([]);
    },
  });
  const action = (id: number, actionName: string) =>
    request<{ message?: string }>(
      `/api/heartbeats/${id}?action=${actionName}`,
      { method: "POST" },
    )
      .then((result) => {
        if (actionName === "run")
          toast.success(result.message ?? "Heartbeat started successfully");
        return client.invalidateQueries({ queryKey: ["heartbeats"] });
      })
      .catch((error: Error) => {
        if (actionName === "run")
          toast.error(error.message || "Could not start Heartbeat");
      });
  const remove = (id: number) =>
    request(`/api/heartbeats/${id}`, { method: "DELETE" }).then(() =>
      client.invalidateQueries({ queryKey: ["heartbeats"] }),
    );
  const beginEdit = (item: Heartbeat) => {
    setEditing(item);
    setName(item.name);
    setPrompt(item.prompt);
    setSchedule(item.schedule);
    setProviderId(item.providerId ? String(item.providerId) : "");
    setModelId(item.modelId ?? "");
    setFallbackMode(item.fallbackMode ?? "fail");
    setTools(item.allowedToolNames);
    setGroups(item.allowedToolGroups ?? []);
    setDeniedTools(item.deniedToolNames ?? []);
    setMcpIds((item.allowedMcpServerIds ?? []).map(String));
  };
  return (
    <CenteredLayout>
      <div className="flex max-w-3xl w-full flex-col gap-6">
        <div>
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            <h1 className="text-lg font-semibold">Heartbeats</h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Autonomous AI jobs that run on the server while RemiAI is running,
            without a chat or connected browser.
          </p>
        </div>
        <Card className="p-4 space-y-4">
          <h2 className="font-medium">
            {editing ? "Edit Heartbeat" : "Create Heartbeat"}
          </h2>
          <Input
            placeholder="Name"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <textarea
            className="min-h-24 w-full rounded-md border bg-background px-3 py-2 text-sm"
            placeholder="What should the AI do?"
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
          />
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="space-y-1 text-xs font-medium text-muted-foreground">
              Provider
              <select
                className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm font-normal text-foreground"
                value={providerId}
                onChange={(event) => {
                  setProviderId(event.target.value);
                  setModelId("");
                }}
              >
                <option value="">Any enabled provider</option>
                {providers
                  .filter((provider) => provider.enabled)
                  .map((provider) => (
                    <option key={provider.id} value={provider.id}>
                      {provider.label}
                    </option>
                  ))}
              </select>
            </label>
            <label className="space-y-1 text-xs font-medium text-muted-foreground">
              Model
              <select
                className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm font-normal text-foreground"
                value={modelId}
                onChange={(event) => setModelId(event.target.value)}
                disabled={!providerId}
              >
                <option value="">Provider default</option>
                {models.map((model) => (
                  <option key={model.modelId} value={model.modelId}>
                    {model.label || model.modelId}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-xs font-medium text-muted-foreground">
              Fallback
              <select
                className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm font-normal text-foreground"
                value={fallbackMode}
                onChange={(event) =>
                  setFallbackMode(event.target.value as "auto" | "fail")
                }
              >
                <option value="auto">Auto</option>
                <option value="fail">Fail</option>
              </select>
            </label>
          </div>
          <PermissionPicker
            options={permissionOptions}
            selected={selectedPermissions}
            denied={deniedTools}
            onAdd={addPermission}
            onRemove={removePermission}
            onToggleTool={toggleTool}
          />
          <div className="flex items-end justify-between gap-3 border-t pt-4">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">
                Run every
              </label>
              <div className="flex items-center gap-2">
                <Input
                  className="h-9 w-28"
                  type="number"
                  min={60}
                  value={schedule}
                  onChange={(event) => setSchedule(event.target.value)}
                />
                <span className="text-xs text-muted-foreground">seconds</span>
              </div>
            </div>
            <Button
              onClick={() => save.mutate()}
              disabled={!name || !prompt || save.isPending}
            >
              {editing ? (
                "Save"
              ) : (
                <>
                  <Plus className="mr-1 h-4 w-4" />
                  Create
                </>
              )}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Only selected permissions are available to this Heartbeat. Type to
            search; press Enter or click a result to add it.
          </p>
        </Card>
        <div className="space-y-3">
          {(data?.heartbeats ?? []).map((item) => (
            <Card key={item.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Activity
                      className={
                        item.enabled
                          ? "text-emerald-500"
                          : "text-muted-foreground"
                      }
                      size={16}
                    />
                    <h2 className="font-medium">{item.name}</h2>
                    <span className="text-xs text-muted-foreground">
                      {item.enabled ? "Active" : "Paused"}
                    </span>
                  </div>
                  <p className="mt-2 text-sm whitespace-pre-wrap">
                    {item.prompt}
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Every {item.schedule} seconds · Next run{" "}
                    {new Date(item.nextRunAt).toLocaleString()} ·{" "}
                    {item.modelId || "provider default"} ·{" "}
                    {item.fallbackMode === "auto"
                      ? "Auto fallback"
                      : "Fail on error"}{" "}
                    · {item.allowedToolNames.length} tools allowed
                  </p>
                </div>
                <div className="flex gap-1">
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    onClick={() => action(item.id, "run")}
                    title="Run now"
                  >
                    <Play size={15} />
                  </Button>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    onClick={() =>
                      action(item.id, item.enabled ? "pause" : "resume")
                    }
                    title={item.enabled ? "Pause" : "Resume"}
                  >
                    {item.enabled ? <Pause size={15} /> : <Play size={15} />}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => beginEdit(item)}
                  >
                    Edit
                  </Button>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    onClick={() => remove(item.id)}
                  >
                    <Trash2 size={15} />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </CenteredLayout>
  );
}
