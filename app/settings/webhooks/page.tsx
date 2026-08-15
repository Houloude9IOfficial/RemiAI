import { WebhookList } from "@/components/settings/WebhookList";
import CenteredLayout from "@/components/layout/CenteredLayout";

export default function WebhooksSettingsPage() {
  return (
    <CenteredLayout>
      <div className="flex max-w-3xl flex-col gap-6">
        <div>
          <h1 className="text-lg font-semibold">Webhooks</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Expose AI-triggered automation endpoints. Point any service (chat
            platforms like Instagram, GitHub, Stripe, custom scripts…) at your
            webhook URL, and RemiAI runs your trigger instructions with full
            tool &amp; MCP access when an event arrives. Runs appear in the
            webhook&apos;s conversation so you can follow up manually.
          </p>
        </div>

        <div className="flex flex-col gap-2 rounded-lg border p-4 text-sm">
          <h2 className="text-sm font-semibold">How it works</h2>
          <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
            <li>
              Create a webhook below. RemiAI gives you a <strong>delivery URL</strong>{" "}
              (<code className="font-mono">/api/webhooks/&lt;id&gt;</code>) and a{" "}
              <strong>secret</strong>.
            </li>
            <li>
              Write <strong>trigger instructions</strong> — what the AI should do
              when an event arrives. Reference payload values with{" "}
              <code className="font-mono">{"{{payload.path}}"}</code> (e.g.{" "}
              <code className="font-mono">{"{{payload.entry.0.messaging.0.message.text}}"}</code>
              ). Add <strong>conditions</strong> to only fire on matching payloads.
            </li>
            <li>
              Point your service at the delivery URL, sending the secret as{" "}
              <code className="font-mono">X-Webhook-Secret</code> (or{" "}
              <code className="font-mono">Authorization: Bearer</code>). Meta
              platforms verify via GET — paste the delivery URL with the secret
              as the verify token; the <code className="font-mono">hub.challenge</code>{" "}
              echo is handled automatically.
            </li>
            <li>
              On each delivery the AI runs your instructions with every tool it
              has (files, web, code, MCP servers…), posts the event into the
              webhook&apos;s conversation, and — when <strong>Respond to caller</strong>{" "}
              is on — returns its reply to the requester (so a messaging API can
              answer the sender).
            </li>
          </ol>
          <p className="text-xs text-muted-foreground">
            Manual test:
          </p>
          <pre className="overflow-x-auto rounded-md bg-muted/60 p-2 font-mono text-[11px]">
{`curl -X POST <delivery-url> \\
  -H "X-Webhook-Secret: <secret>" \\
  -H "Content-Type: application/json" \\
  -d '{"type":"message","sender":{"id":"123"},"message":{"text":"hello"}}'`}
          </pre>
        </div>

        <WebhookList />
      </div>
    </CenteredLayout>
  );
}
