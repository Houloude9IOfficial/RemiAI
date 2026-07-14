"use client";

import { useEffect, useState } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  mcpServersApi,
  type McpServer,
  type McpTransportKind,
} from "@/lib/api/mcp-servers";
import { Plus, X } from "lucide-react";

type KeyValuePair = { key: string; value: string };

function recordToPairs(record: Record<string, string> | null): KeyValuePair[] {
  if (!record) return [];
  return Object.entries(record).map(([key, value]) => ({ key, value }));
}

function KeyValueList({
  label,
  pairs,
  onChange,
  keyPlaceholder = "Key",
  valuePlaceholder = "Value",
}: {
  label: string;
  pairs: KeyValuePair[];
  onChange: (pairs: KeyValuePair[]) => void;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
}) {
  const add = () => onChange([...pairs, { key: "", value: "" }]);
  const remove = (i: number) => onChange(pairs.filter((_, idx) => idx !== i));
  const update = (i: number, field: "key" | "value", val: string) => {
    const next = pairs.map((p, idx) => (idx === i ? { ...p, [field]: val } : p));
    onChange(next);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <Label>{label}</Label>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={add}
          className="h-6 w-6"
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div className="flex flex-col gap-1.5">
        {pairs.length === 0 && (
          <p className="text-xs text-muted-foreground italic">None</p>
        )}
        {pairs.map((pair, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <Input
              placeholder={keyPlaceholder}
              className="h-7 text-xs font-mono flex-1"
              value={pair.key}
              onChange={(e) => update(i, "key", e.target.value)}
            />
            <span className="text-muted-foreground text-xs shrink-0">:</span>
            <Input
              placeholder={valuePlaceholder}
              className="h-7 text-xs font-mono flex-1"
              value={pair.value}
              onChange={(e) => update(i, "value", e.target.value)}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive"
              onClick={() => remove(i)}
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

export function McpServerForm({
  initialServer,
  onCancelEdit,
}: {
  initialServer?: McpServer;
  onCancelEdit?: () => void;
}) {
  const queryClient = useQueryClient();
  const isEditing = !!initialServer;

  const [name, setName] = useState("");
  const [transport, setTransport] = useState<McpTransportKind>("stdio");

  // stdio fields
  const [command, setCommand] = useState("");
  const [args, setArgs] = useState("");
  const [env, setEnv] = useState<KeyValuePair[]>([]);

  // http fields
  const [url, setUrl] = useState("");
  const [headers, setHeaders] = useState<KeyValuePair[]>([]);

  // Populate form when editing server changes
  useEffect(() => {
    if (initialServer) {
      setName(initialServer.name);
      setTransport(initialServer.transport);
      setCommand(initialServer.command ?? "");
      setArgs(initialServer.args?.join("\n") ?? "");
      setEnv(recordToPairs(initialServer.env));
      setUrl(initialServer.url ?? "");
      setHeaders(recordToPairs(initialServer.headers));
    } else {
      setName("");
      setTransport("stdio");
      setCommand("");
      setArgs("");
      setEnv([]);
      setUrl("");
      setHeaders([]);
    }
  }, [initialServer]);

  const createMutation = useMutation({
    mutationFn: mcpServersApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mcp-servers"] });
      resetForm();
      toast.success("MCP server added");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: number;
      input: Parameters<typeof mcpServersApi.update>[1];
    }) => mcpServersApi.update(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mcp-servers"] });
      resetForm();
      onCancelEdit?.();
      toast.success("MCP server updated");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const toRecord = (pairs: KeyValuePair[]): Record<string, string> | null => {
    const entries = pairs
      .map(({ key, value }) => [key.trim(), value] as [string, string])
      .filter(([key]) => key);
    return entries.length > 0 ? Object.fromEntries(entries) : null;
  };

  const resetForm = () => {
    setName("");
    setTransport("stdio");
    setCommand("");
    setArgs("");
    setEnv([]);
    setUrl("");
    setHeaders([]);
  };

  const handleCancel = () => {
    resetForm();
    onCancelEdit?.();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const parsedArgs = args
      ? args
          .split("\n")
          .map((a) => a.trim())
          .filter(Boolean)
      : null;

    const envRecord = toRecord(env);
    const headersRecord = toRecord(headers);

    const payload = {
      name,
      transport,
      command: transport === "stdio" ? command : null,
      args: transport === "stdio" ? parsedArgs : null,
      env: transport === "stdio" ? envRecord : null,
      url: transport === "http" ? url : null,
      headers: transport === "http" ? headersRecord : null,
    };

    if (isEditing && initialServer) {
      updateMutation.mutate({ id: initialServer.id, input: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;
  const submitText = isEditing
    ? isPending
      ? "Saving..."
      : "Save changes"
    : isPending
      ? "Adding..."
      : "Add server";

  return (
    <form
      className="flex flex-col gap-3 rounded-lg border p-4"
      onSubmit={handleSubmit}
    >
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium">
          {isEditing ? `Edit ${initialServer.name}` : "Add MCP Server"}
        </h2>
        {isEditing && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleCancel}
            className="h-6 text-xs"
          >
            Cancel
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="mcp-name">Server name</Label>
          <Input
            id="mcp-name"
            placeholder="my-server"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <p className="text-xs text-muted-foreground">
            Used as a namespace prefix for tools
          </p>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Transport</Label>
          <Select
            value={transport}
            onValueChange={(v) => setTransport(v as McpTransportKind)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="stdio">STDIO (local process)</SelectItem>
              <SelectItem value="http">HTTP (remote server)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {transport === "stdio" ? (
        <>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="mcp-command">Command</Label>
            <Input
              id="mcp-command"
              placeholder="npx"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="mcp-args">
              Arguments{" "}
              <span className="text-xs text-muted-foreground">(one per line)</span>
            </Label>
            <Textarea
              id="mcp-args"
              placeholder={[
                "-y",
                "@modelcontextprotocol/server-filesystem",
                "/path/to/allowed/dir",
              ].join("\n")}
              className="min-h-[60px] resize-y text-xs font-mono"
              value={args}
              onChange={(e) => setArgs(e.target.value)}
            />
          </div>
          <KeyValueList
            label="Environment variables"
            pairs={env}
            onChange={setEnv}
            keyPlaceholder="KEY"
            valuePlaceholder="value"
          />
        </>
      ) : (
        <>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="mcp-url">URL</Label>
            <Input
              id="mcp-url"
              placeholder="http://localhost:3001"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              required
            />
          </div>
          <KeyValueList
            label="Headers"
            pairs={headers}
            onChange={setHeaders}
            keyPlaceholder="Header-Name"
            valuePlaceholder="value"
          />
        </>
      )}

      <Button
        type="submit"
        className="ml-auto"
        disabled={isPending || !name.trim()}
      >
        {submitText}
      </Button>
    </form>
  );
}
