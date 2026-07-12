import { ProviderForm } from "@/components/settings/ProviderForm";
import { ProviderList } from "@/components/settings/ProviderList";
import CenteredLayout from '@/components/layout/CenteredLayout';

export default function ProvidersSettingsPage() {
  return (
    <CenteredLayout>
      <div className="flex max-w-3xl flex-col gap-6 w-full">
        <div>
          <h1 className="text-lg font-semibold">Models & Providers</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Configure Anthropic, OpenAI, Ollama, or any custom OpenAI-compatible endpoint,
            and pick which models are available to chat with.
          </p>
        </div>
        <div className="flex flex-col gap-6">
          <ProviderForm />
          <ProviderList />
        </div>
      </div>
    </CenteredLayout>
  );
}
