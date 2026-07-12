import CenteredLayout from '@/components/layout/CenteredLayout';

export default function ChatHomePage() {
  return (
    <CenteredLayout>
      <div className="w-full max-w-sm space-y-2">
        <h1 className="text-lg font-medium">RemiAI</h1>
        <p className="text-sm text-muted-foreground">
          Start a new conversation, or configure your directories, providers,
          and MCP servers in the sidebar first.
        </p>
      </div>
    </CenteredLayout>
  );
}
