"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { FileJson, Loader2 } from "lucide-react";
import { mcpServersApi, type McpImportInput } from "@/lib/api/mcp-servers";

const EXAMPLE = `{
  "mcpServers": {
    "ntfy": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-ntfy"],
      "env": {
        "ENVVAR": "VARVALUE"
      }
    }
  }
}`;

export function McpServerImport() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [jsonText, setJsonText] = useState("");

  const importMutation = useMutation({
    mutationFn: mcpServersApi.import,
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["mcp-servers"] });

      const parts: string[] = [];
      if (res.created.length) parts.push(`${res.created.length} added`);
      if (res.updated.length) parts.push(`${res.updated.length} updated`);

      if (res.errors.length) {
        const detail = res.errors
          .map((e) => `${e.name}: ${e.error}`)
          .join("\n");
        toast.error(`${res.errors.length} server(s) failed to import`, {
          description: detail,
        });
      }

      if (parts.length) {
        toast.success(`MCP servers ${parts.join(", ")}`);
      }

      setOpen(false);
      setJsonText("");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const handleImport = () => {
    let parsed: McpImportInput;
    try {
      parsed = JSON.parse(jsonText) as McpImportInput;
    } catch {
      toast.error("Invalid JSON");
      return;
    }
    importMutation.mutate(parsed);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        nativeButton={false}
        render={
          <span>
            <Button variant="outline" size="sm">
              <FileJson className="h-3.5 w-3.5" />
              Import from JSON
            </Button>
          </span>
        }
      />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Import MCP servers</DialogTitle>
          <DialogDescription>
            Paste a standard MCP client config. Servers are matched by name —
            new ones are added and existing ones updated.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <Textarea
            value={jsonText}
            onChange={(e) => setJsonText(e.target.value)}
            placeholder={EXAMPLE}
            spellCheck={false}
            className="min-h-[200px] resize-y font-mono text-xs"
          />
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleImport}
              disabled={importMutation.isPending || !jsonText.trim()}
            >
              {importMutation.isPending ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Importing...
                </>
              ) : (
                "Import"
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
