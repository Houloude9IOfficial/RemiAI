import { McpServerForm } from "@/components/settings/McpServerForm";
import { McpServerList } from "@/components/settings/McpServerList";

export default function McpSettingsPage() {
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold">MCP Servers</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Connect external MCP servers to give the AI more tools.
          Tools are automatically namespaced by server name to avoid collisions.
        </p>
      </div>
      <McpServerForm />
      <McpServerList />
    </div>
  );
}
