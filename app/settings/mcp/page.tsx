"use client";

import { useState } from "react";
import { McpServerForm } from "@/components/settings/McpServerForm";
import { McpServerImport } from "@/components/settings/McpServerImport";
import { McpServerList } from "@/components/settings/McpServerList";
import CenteredLayout from "@/components/layout/CenteredLayout";
import type { McpServer } from "@/lib/api/mcp-servers";

export default function McpSettingsPage() {
  const [editingServer, setEditingServer] = useState<McpServer | null>(null);

  return (
    <CenteredLayout>
      <div className="flex max-w-3xl flex-col gap-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-lg font-semibold">MCP Servers</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Connect external MCP servers to give your AI more tools.
              Tools are automatically namespaced by server name to avoid collisions.
            </p>
          </div>
          <McpServerImport />
        </div>
        <McpServerForm
          key={editingServer?.id ?? "new"}
          initialServer={editingServer ?? undefined}
          onCancelEdit={() => setEditingServer(null)}
        />
        <McpServerList onEdit={setEditingServer} />
      </div>
    </CenteredLayout>
  );
}
