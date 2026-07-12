"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { mcpServersApi, type McpTransportKind } from "@/lib/api/mcp-servers";

export function McpServerForm() {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [transport, setTransport] = useState<McpTransportKind>("stdio");

  // stdio fields
  const [command, setCommand] = useState("");
  const [args, setArgs] = useState("");
  const [envJson, setEnvJson] = useState("");

  // http fields
  const [url, setUrl] = useState("");
  const [headersJson, setHeadersJson] = useState("");

  const createMutation = useMutation({
    mutationFn: mcpServersApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mcp-servers"] });
      setName("");
      setCommand("");
      setArgs("");
      setEnvJson("");
      setUrl("");
      setHeadersJson("");
      toast.success("MCP server added");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const parsedArgs = args
      ? args
          .split("\n")
          .map((a) => a.trim())
          .filter(Boolean)
      : null;

    const parsedEnv = envJson?.trim()
      ? parseJsonFieldOrWarn(envJson)
      : null;
    if (envJson?.trim() && parsedEnv === null) {
      toast.error("Invalid JSON in environment variables");
      return;
    }

    const parsedHeaders = headersJson?.trim()
      ? parseJsonFieldOrWarn(headersJson)
      : null;
    if (headersJson?.trim() && parsedHeaders === null) {
      toast.error("Invalid JSON in headers");
      return;
    }

    createMutation.mutate({
      name,
      transport,
      command: transport === "stdio" ? command : null,
      args: transport === "stdio" ? parsedArgs : null,
      env: transport === "stdio" ? parsedEnv : null,
      url: transport === "http" ? url : null,
      headers: transport === "http" ? parsedHeaders : null,
    });
  };

  return (
    <form
      className="flex flex-col gap-3 rounded-lg border p-4"
      onSubmit={handleSubmit}
    >
      <h2 className="text-sm font-medium">Add MCP Server</h2>

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
              placeholder="-y\n@modelcontextprotocol/server-filesystem\n/path/to/allowed/dir"
              className="min-h-[60px] resize-y text-xs font-mono"
              value={args}
              onChange={(e) => setArgs(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="mcp-env">
              Environment variables{" "}
              <span className="text-xs text-muted-foreground">(JSON)</span>
            </Label>
            <Textarea
              id="mcp-env"
              placeholder='{"KEY": "value"}'
              className="min-h-[60px] resize-y text-xs font-mono"
              value={envJson}
              onChange={(e) => setEnvJson(e.target.value)}
            />
          </div>
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
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="mcp-headers">
              Headers{" "}
              <span className="text-xs text-muted-foreground">(JSON)</span>
            </Label>
            <Textarea
              id="mcp-headers"
              placeholder='{"Authorization": "Bearer ..."}'
              className="min-h-[60px] resize-y text-xs font-mono"
              value={headersJson}
              onChange={(e) => setHeadersJson(e.target.value)}
            />
          </div>
        </>
      )}

      <Button
        type="submit"
        className="ml-auto"
        disabled={createMutation.isPending || !name.trim()}
      >
        {createMutation.isPending ? "Adding..." : "Add server"}
      </Button>
    </form>
  );
}

function parseJsonFieldOrWarn(json: string): Record<string, string> | null {
  try {
    const parsed = JSON.parse(json);
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}
