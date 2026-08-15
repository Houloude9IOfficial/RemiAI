#!/usr/bin/env tsx
/**
 * RemiAI Webhook Testing Client
 *
 * A STANDALONE, interactive inquirer CLI for manually testing webhook
 * deliveries against a RUNNING RemiAI server. It is deliberately NOT wired
 * to the app's code — no imports from `lib/`, `db/`, or `app/`. It only
 * speaks HTTP to the server, so you can fire a request by hand, inspect the
 * response, and verify the endpoint behaves (auth, conditions, sync reply…).
 *
 * Usage:
 *   npx tsx tests/webhook/cli.ts                # Default: http://127.0.0.1:3000
 *   npx tsx tests/webhook/cli.ts --base-url http://127.0.0.1:3456
 *   npx tsx tests/webhook/cli.ts --port 3456
 *   npx tsx tests/webhook/cli.ts --help
 *
 * Env: REMI_BASE_URL overrides the base URL.
 */

// ---------------------------------------------------------------------------
// Types (local — the CLI must not depend on the main codebase)
// ---------------------------------------------------------------------------

type WebhookRow = {
  id: number;
  name: string;
  secret: string;
  systemPrompt: string;
  enabled: boolean;
  respondSync: boolean;
  lastStatus: string | null;
  lastReceivedAt: string | null;
};

type EventRow = {
  id: number;
  status: string;
  payload: unknown;
  result: string | null;
  error: string | null;
  receivedAt: string;
};

type Inq = { prompt: (questions: unknown[]) => Promise<Record<string, unknown>> };

// ---------------------------------------------------------------------------
// Config / helpers
// ---------------------------------------------------------------------------

function getBaseUrl(): string {
  const arg = process.argv.indexOf("--base-url");
  if (arg !== -1 && process.argv[arg + 1]) return process.argv[arg + 1];
  const portArg = process.argv.indexOf("--port");
  const port = portArg !== -1 ? process.argv[portArg + 1] : process.env.PORT || "3000";
  return (process.env.REMI_BASE_URL || `http://127.0.0.1:${port}`).replace(/\/$/, "");
}

function printHelp(): void {
  console.log(`
RemiAI Webhook Testing Client — manually fire webhook requests at a running server

Usage:
  npx tsx tests/webhook/cli.ts                Interactive (defaults to http://127.0.0.1:3000)
  npx tsx tests/webhook/cli.ts --base-url URL Target a specific server (Electron uses 3456)
  npx tsx tests/webhook/cli.ts --port 3456    Same, but only the port
  npx tsx tests/webhook/cli.ts --help         Show this help

Env: REMI_BASE_URL overrides the base URL. The server must be running
(npm run dev / npm start). This client only talks HTTP — it never touches
the app's database or code.
  `.trim());
  console.log();
}

async function loadInquirer(): Promise<Inq> {
  // inquirer is ESM-only — dynamic import + interop fallback (same pattern
  // as scripts/launcher.ts).
  const inquirer = await import("inquirer");
  return (inquirer.default ?? inquirer) as unknown as Inq;
}

/** fetch helper that returns { status, body } and throws only on network errors. */
async function request(
  baseUrl: string,
  path: string,
  init?: RequestInit,
): Promise<{ status: number; body: unknown }> {
  let res: Response;
  try {
    res = await fetch(`${baseUrl}${path}`, init);
  } catch {
    throw new Error(
      `Could not reach ${baseUrl} — is RemiAI running? (npm run dev / npm start)`,
    );
  }
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: res.status, body };
}

function formatBody(body: unknown): string {
  if (typeof body === "string") return body;
  try {
    return JSON.stringify(body, null, 2);
  } catch {
    return String(body);
  }
}

const SAMPLE_PAYLOADS: { name: string; value: unknown }[] = [
  {
    name: "Generic message payload",
    value: { type: "message", sender: { id: "12345" }, message: { text: "Hey! What can you do?" } },
  },
  {
    name: "Instagram DM payload (Meta style)",
    value: {
      object: "instagram",
      entry: [
        {
          id: "0",
          time: 1786800000000,
          messaging: [
            {
              sender: { id: "111222333" },
              recipient: { id: "999888777" },
              message: { mid: "abc123", text: "hi! do you ship internationally?" },
            },
          ],
        },
      ],
    },
  },
  {
    name: "GitHub event payload",
    value: { action: "opened", repository: { full_name: "Houloude9IOfficial/RemiAI" }, issue: { title: "Webhook test", number: 42 } },
  },
];

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

/** Fire a delivery request by hand — the core use case. */
async function fireDelivery(inq: Inq, baseUrl: string): Promise<void> {
  let webhooks: WebhookRow[] = [];
  try {
    const res = await request(baseUrl, "/api/webhooks");
    if (res.status === 200 && Array.isArray(res.body)) webhooks = res.body as WebhookRow[];
  } catch (err) {
    console.error(`  ⚠️  ${(err as Error).message}`);
  }

  let webhookId: number;
  let secret = "";
  if (webhooks.length > 0) {
    const pick = await inq.prompt([
      {
        type: "select",
        name: "webhook",
        message: "Which webhook?",
        choices: [
          ...webhooks.map((w) => ({
            name: `#${w.id} — ${w.name}  [${w.enabled ? "enabled" : "disabled"}${w.respondSync ? ", sync" : ""}${w.lastStatus ? `, last: ${w.lastStatus}` : ""}]`,
            value: w.id,
          })),
          { name: "Enter webhook ID manually…", value: -1 },
        ],
      },
    ]);
    const chosen = webhooks.find((w) => w.id === pick.webhook);
    if (chosen) {
      webhookId = chosen.id;
      secret = chosen.secret;
    } else {
      webhookId = -1;
    }
  } else {
    webhookId = -1;
  }

  if (webhookId === -1) {
    const manual = await inq.prompt([
      {
        type: "input",
        name: "id",
        message: "Webhook ID (from Settings → Webhooks):",
        validate: (v: unknown) => (/^\d+$/.test(String(v)) ? true : "Must be a number"),
      },
    ]);
    webhookId = Number(manual.id);
  }

  const secretRes = await inq.prompt([
    {
      type: "input",
      name: "secret",
      message: "Webhook secret (X-Webhook-Secret):",
      default: secret,
      validate: (v: unknown) => (String(v).length > 0 ? true : "Secret is required"),
    },
  ]);
  secret = String(secretRes.secret);

  // Payload: preset sample or custom JSON.
  const payloadChoice = await inq.prompt([
    {
      type: "select",
      name: "choice",
      message: "Payload:",
      choices: [
        ...SAMPLE_PAYLOADS.map((s) => ({ name: s.name, value: "sample" })),
        { name: "Type custom JSON…", value: "custom" },
        { name: "Empty body", value: "empty" },
      ],
    },
  ]);
  let payload: unknown;
  if (payloadChoice.choice === "empty") {
    payload = null;
  } else if (payloadChoice.choice === "custom") {
    const custom = await inq.prompt([
      {
        type: "input",
        name: "json",
        message: "Payload (JSON):",
        default: JSON.stringify(SAMPLE_PAYLOADS[0].value),
        validate: (v: unknown) => {
          try {
            JSON.parse(String(v));
            return true;
          } catch {
            return "Invalid JSON";
          }
        },
      },
    ]);
    payload = JSON.parse(String(custom.json));
  } else {
    payload = SAMPLE_PAYLOADS[0].value;
  }

  console.log(`\n➡️  POST ${baseUrl}/api/webhooks/${webhookId}`);
  const started = Date.now();
  const { status, body } = await request(baseUrl, `/api/webhooks/${webhookId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Webhook-Secret": secret },
    body: payload === null ? "" : JSON.stringify(payload),
  });
  const elapsed = ((Date.now() - started) / 1000).toFixed(2);

  console.log(`\n📨  HTTP ${status} (${elapsed}s)\n${formatBody(body)}`);
}

/** Test the Meta-style GET verification ping (hub.challenge echo). */
async function verifyPing(inq: Inq, baseUrl: string): Promise<void> {
  const id = await inq.prompt([
    {
      type: "input",
      name: "id",
      message: "Webhook ID:",
      validate: (v: unknown) => (/^\d+$/.test(String(v)) ? true : "Must be a number"),
    },
  ]);
  const secret = await inq.prompt([
    {
      type: "input",
      name: "secret",
      message: "Webhook secret (verify token):",
      validate: (v: unknown) => (String(v).length > 0 ? true : "Required"),
    },
  ]);
  const includeChallenge = await inq.prompt([
    {
      type: "confirm",
      name: "challenge",
      message: "Include hub.challenge (Meta verification)?",
      default: true,
    },
  ]);

  const query = includeChallenge.challenge
    ? `?hub.mode=subscribe&hub.verify_token=${encodeURIComponent(String(secret.secret))}&hub.challenge=TEST_CHALLENGE_123`
    : "";
  const { status, body } = await request(baseUrl, `/api/webhooks/${id.id}${query}`);
  console.log(`\n✅  HTTP ${status}\n${formatBody(body)}`);
}

/** List webhooks and inspect recent deliveries for one. */
async function inspectWebhooks(inq: Inq, baseUrl: string): Promise<void> {
  const { status, body } = await request(baseUrl, "/api/webhooks");
  if (status !== 200) {
    console.log(`\n❌  HTTP ${status}\n${formatBody(body)}`);
    return;
  }
  const webhooks = body as WebhookRow[];
  if (webhooks.length === 0) {
    console.log("\nNo webhooks configured yet.");
    return;
  }
  console.log("\n📋  Webhooks:");
  for (const w of webhooks) {
    console.log(
      `  #${w.id}  ${w.name}  [${w.enabled ? "enabled" : "disabled"}${w.respondSync ? ", sync" : ""}${w.lastStatus ? `, last: ${w.lastStatus}` : ""}]`,
    );
  }

  const pick = await inq.prompt([
    {
      type: "select",
      name: "webhook",
      message: "Inspect deliveries for:",
      choices: [
        { name: "Back to menu", value: -1 },
        ...webhooks.map((w) => ({ name: `#${w.id} — ${w.name}`, value: w.id })),
      ],
    },
  ]);
  if (pick.webhook === -1) return;

  const eventsRes = await request(baseUrl, `/api/webhooks/${pick.webhook}/events`);
  if (eventsRes.status !== 200 || !Array.isArray(eventsRes.body)) {
    console.log(`\n❌  HTTP ${eventsRes.status}\n${formatBody(eventsRes.body)}`);
    return;
  }
  const events = eventsRes.body as EventRow[];
  if (events.length === 0) {
    console.log("\nNo deliveries recorded yet.");
    return;
  }
  console.log("\n📦  Recent deliveries:");
  for (const e of events.slice(0, 10)) {
    const when = new Date(e.receivedAt).toLocaleString();
    console.log(`  #${e.id}  [${e.status}]  ${when}`);
    if (e.error) console.log(`        error: ${e.error}`);
    if (e.result) console.log(`        result: ${e.result.slice(0, 120)}${e.result.length > 120 ? "…" : ""}`);
  }
}

/** Raw request builder for power users (method / path / headers / body). */
async function rawRequest(inq: Inq, baseUrl: string): Promise<void> {
  const method = await inq.prompt([
    {
      type: "select",
      name: "method",
      message: "Method:",
      choices: ["GET", "POST", "PATCH", "DELETE"].map((m) => ({ name: m, value: m })),
    },
  ]);
  const path = await inq.prompt([
    {
      type: "input",
      name: "path",
      message: "Path (e.g. /api/webhooks/1):",
      default: "/api/webhooks",
      validate: (v: unknown) => (String(v).startsWith("/") ? true : "Must start with /"),
    },
  ]);
  const body = await inq.prompt([
    {
      type: "input",
      name: "body",
      message: "JSON body (optional, Enter for none):",
      default: "",
      validate: (v: unknown) => {
        if (!String(v).trim()) return true;
        try {
          JSON.parse(String(v));
          return true;
        } catch {
          return "Invalid JSON";
        }
      },
    },
  ]);

  const hasBody = String(body.body).trim().length > 0;
  const { status, body: respBody } = await request(baseUrl, String(path.path), {
    method: String(method.method),
    headers: hasBody ? { "Content-Type": "application/json" } : undefined,
    body: hasBody ? String(body.body) : undefined,
  });
  console.log(`\n📨  HTTP ${status}\n${formatBody(respBody)}`);
}

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    printHelp();
    process.exit(0);
  }

  const baseUrl = getBaseUrl();
  const inq = await loadInquirer();

  console.log(`\n🔌  RemiAI Webhook Testing Client — target: ${baseUrl}\n`);

  let running = true;
  while (running) {
    const menu = await inq.prompt([
      {
        type: "select",
        name: "action",
        message: "What do you want to do?",
        choices: [
          { name: "🔥  Fire a delivery request manually", value: "fire" },
          { name: "🔍  Verification ping (GET /api/webhooks/:id)", value: "verify" },
          { name: "📋  List webhooks + recent deliveries", value: "inspect" },
          { name: "🧪  Raw request (method / path / body)", value: "raw" },
          { name: "🚪  Exit", value: "exit" },
        ],
      },
    ]);

    try {
      switch (menu.action) {
        case "fire":
          await fireDelivery(inq, baseUrl);
          break;
        case "verify":
          await verifyPing(inq, baseUrl);
          break;
        case "inspect":
          await inspectWebhooks(inq, baseUrl);
          break;
        case "raw":
          await rawRequest(inq, baseUrl);
          break;
        default:
          running = false;
          break;
      }
    } catch (err) {
      console.error(`\n❌  ${err instanceof Error ? err.message : String(err)}`);
    }
    console.log();
  }

  console.log("Bye! 👋");
}

main().catch((err) => {
  console.error(`\n❌  ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
