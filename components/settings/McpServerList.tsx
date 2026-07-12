"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Trash2,
  Plug,
  CheckCircle2,
  XCircle,
  Loader2,
  Cable,
  Globe,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { mcpServersApi, type McpTestResult } from "@/lib/api/mcp-servers";

export function McpServerList() {
  const queryClient = useQueryClient();
  const { data: servers = [], isLoading } = useQuery({
    queryKey: ["mcp-servers"],
    queryFn: mcpServersApi.list,
  });

  const [testResult, setTestResult] = useState<{
    serverId: number;
    serverName: string;
    result: McpTestResult;
  } | null>(null);

  const updateMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: number; enabled: boolean }) =>
      mcpServersApi.update(id, { enabled }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["mcp-servers"] }),
    onError: (err: Error) => toast.error(err.message),
  });

  const testMutation = useMutation({
    mutationFn: mcpServersApi.test,
    onSuccess: (result, serverId) => {
      const server = servers.find((s) => s.id === serverId);
      queryClient.invalidateQueries({ queryKey: ["mcp-servers"] });
      if (result.ok) {
        setTestResult({
          serverId,
          serverName: server?.name ?? "Unknown",
          result,
        });
        toast.success(`Connected — ${result.toolCount} tool(s) found`);
      } else {
        toast.error(`Connection failed: ${result.error}`);
      }
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const removeMutation = useMutation({
    mutationFn: mcpServersApi.remove,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mcp-servers"] });
      toast.success("MCP server removed");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading...</p>;
  }

  if (servers.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No MCP servers configured yet. Add one above to give your AI extra tools.
      </p>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-3">
        {servers.map((server) => (
          <Card key={server.id}>
            <CardHeader className="flex-row items-center gap-3 space-y-0">
              <div className="flex flex-1 items-center gap-2">
                {server.transport === "stdio" ? (
                  <Cable className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <Globe className="h-4 w-4 text-muted-foreground" />
                )}
                <span className="font-medium">{server.name}</span>
                <Badge variant="outline" className="text-[10px] uppercase">
                  {server.transport}
                </Badge>
                {server.lastError ? (
                  <Tooltip>
                    <TooltipTrigger>
                      <XCircle className="h-3.5 w-3.5 text-destructive" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="max-w-xs text-xs">{server.lastError}</p>
                    </TooltipContent>
                  </Tooltip>
                ) : server.lastConnectedAt ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                ) : null}
              </div>
              <Tooltip>
                <TooltipTrigger>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    disabled={testMutation.isPending && testMutation.variables === server.id}
                    onClick={() => testMutation.mutate(server.id)}
                  >
                    {testMutation.isPending && testMutation.variables === server.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Plug className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Test connection</TooltipContent>
              </Tooltip>
              <Switch
                checked={server.enabled}
                onCheckedChange={(enabled) =>
                  updateMutation.mutate({ id: server.id, enabled })
                }
              />
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                onClick={() => removeMutation.mutate(server.id)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                {server.transport === "stdio" ? (
                  <>
                    <span className="font-mono">{server.command} {server.args?.join(" ")}</span>
                  </>
                ) : (
                  <span className="font-mono">{server.url}</span>
                )}
                {server.lastConnectedAt && (
                  <span>
                    Last connected:{" "}
                    {new Date(server.lastConnectedAt).toLocaleString()}
                  </span>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog
        open={!!testResult}
        onOpenChange={(open) => {
          if (!open) setTestResult(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{testResult?.serverName}</DialogTitle>
            <DialogDescription>Connection test results</DialogDescription>
          </DialogHeader>
          {testResult && (
            <div className="space-y-3 text-sm">
              <div className="flex items-center gap-2">
                {testResult.result.ok ? (
                  <>
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    <span>Connected successfully</span>
                  </>
                ) : (
                  <>
                    <XCircle className="h-4 w-4 text-destructive" />
                    <span className="text-destructive">{testResult.result.error}</span>
                  </>
                )}
              </div>
              {testResult.result.serverInfo && (
                <p>
                  Server:{" "}
                  <span className="font-medium">
                    {testResult.result.serverInfo.name} v
                    {testResult.result.serverInfo.version}
                  </span>
                </p>
              )}
              {testResult.result.toolNames && testResult.result.toolNames.length > 0 && (
                <div>
                  <p className="mb-1 font-medium">Available tools ({testResult.result.toolCount}):</p>
                  <div className="flex flex-wrap gap-1.5">
                    {testResult.result.toolNames.map((name) => (
                      <Badge key={name} variant="secondary" className="text-xs">
                        {name}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
              {testResult.result.instructions && (
                <div>
                  <p className="mb-1 font-medium">Server instructions:</p>
                  <p className="text-xs text-muted-foreground">
                    {testResult.result.instructions}
                  </p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
