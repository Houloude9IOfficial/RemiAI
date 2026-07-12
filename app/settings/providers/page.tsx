import { ProviderForm } from "@/components/settings/ProviderForm";
import { ProviderList } from "@/components/settings/ProviderList";

export default function ProvidersSettingsPage() {
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold">Models &amp; Providers</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Configure Anthropic, OpenAI, Ollama, or any custom OpenAI-compatible endpoint,
          and pick which models are available to chat with.
        </p>
      </div>
      <ProviderForm />
      <ProviderList />
    </div>
  );
}
