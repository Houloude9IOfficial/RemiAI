import { ProviderForm } from "@/components/settings/ProviderForm";
import { ProviderList } from "@/components/settings/ProviderList";
import CenteredLayout from '@/components/layout/CenteredLayout';

export default function ProvidersSettingsPage() {
  return (
    <CenteredLayout>
      <div className="flex max-w-3xl w-full flex-col gap-8">
        <div>
          <h1 className="text-lg font-semibold">Models & Providers</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Connect Anthropic, OpenAI, Ollama, or any OpenAI-compatible endpoint,
            then choose which models are available to chat with.
          </p>
        </div>
        <div className="flex flex-col gap-8">
          <ProviderForm />
          <ProviderList />
        </div>
      </div>
    </CenteredLayout>
  );
}
