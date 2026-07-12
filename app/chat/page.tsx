export default function ChatHomePage() {
  return (
    <div className="flex flex-1 items-center justify-center text-center">
      <div className="max-w-sm space-y-2">
        <h1 className="text-lg font-medium">RemiAI</h1>
        <p className="text-sm text-muted-foreground">
          Start a new conversation, or configure your directories, providers,
          and MCP servers in the sidebar first.
        </p>
      </div>
    </div>
  );
}
