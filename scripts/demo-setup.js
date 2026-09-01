#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import inquirer from "inquirer";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = resolve(root, ".env");
const providerKinds = [
  { name: "Anthropic", value: "anthropic" },
  { name: "OpenAI", value: "openai" },
  { name: "Google", value: "google" },
  { name: "Mistral", value: "mistral" },
  { name: "Groq", value: "groq" },
  { name: "OpenRouter", value: "openrouter" },
  { name: "Custom OpenAI-compatible endpoint", value: "openai-compatible" },
];

function existingEnv() {
  if (!existsSync(envPath)) return {};
  return Object.fromEntries(
    readFileSync(envPath, "utf8")
      .split(/\r?\n/)
      .map((line) => line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/))
      .filter(Boolean)
      .map((match) => [match[1], match[2].replace(/^['"]|['"]$/g, "")]),
  );
}

function quote(value) {
  return JSON.stringify(value ?? "");
}

function run(command, args) {
  console.log(`\n$ ${command} ${args.join(" ")}`);
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const previous = existingEnv();
const answers = await inquirer.prompt([
  {
    type: "select",
    name: "providerKind",
    message: "Which provider should the public demo use?",
    choices: providerKinds,
    default: previous.DEMO_PROVIDER_KIND || "anthropic",
  },
  {
    type: "input",
    name: "model",
    message: "Demo provider model ID:",
    default: previous.DEMO_PROVIDER_MODEL || undefined,
    validate: (value) => value.trim() ? true : "A model ID is required.",
  },
  {
    type: "password",
    name: "apiKey",
    message: "Demo provider API key:",
    mask: "*",
    default: previous.DEMO_PROVIDER_API_KEY || undefined,
    validate: (value) => value.trim() ? true : "An API key is required.",
  },
  {
    type: "input",
    name: "baseUrl",
    message: "OpenAI-compatible base URL:",
    default: previous.DEMO_PROVIDER_BASE_URL || "http://host.docker.internal:11434/v1",
    when: (answers) => answers.providerKind === "openai-compatible",
    validate: (value) => {
      try {
        new URL(value);
        return true;
      } catch {
        return "Enter a valid absolute URL, including http:// or https://.";
      }
    },
  },
  {
    type: "input",
    name: "authEmail",
    message: "Shared demo login email:",
    default: previous.DEMO_AUTH_EMAIL || "demo@example.com",
    validate: (value) => /^(?=.{3,254}$)\S+@\S+\.\S+$/.test(String(value).trim()) || "Enter a valid email address.",
  },
  {
    type: "password",
    name: "authPassword",
    message: "Shared demo login password (8+ characters):",
    mask: "*",
    default: previous.DEMO_AUTH_PASSWORD || undefined,
    validate: (value) => value.length >= 8 || "Use at least 8 characters.",
  },
  {
    type: "input",
    name: "authDisplayName",
    message: "Shared demo display name:",
    default: previous.DEMO_AUTH_DISPLAY_NAME || "Demo Visitor",
  },
  {
    type: "confirm",
    name: "start",
    message: "Write .env and build/start the Docker demo now?",
    default: true,
  },
]);

const values = {
  ...previous,
  DEMO: "true",
  DEMO_PROVIDER_KIND: answers.providerKind,
  DEMO_PROVIDER_MODEL: answers.model.trim(),
  DEMO_PROVIDER_API_KEY: answers.apiKey.trim(),
  DEMO_PROVIDER_BASE_URL: answers.baseUrl?.trim() ?? "",
  DEMO_AUTH_EMAIL: answers.authEmail.trim().toLowerCase(),
  DEMO_AUTH_PASSWORD: answers.authPassword,
  DEMO_AUTH_DISPLAY_NAME: answers.authDisplayName.trim() || "Demo Visitor",
};

const managedKeys = new Set([
  "DEMO",
  "DEMO_PROVIDER_KIND",
  "DEMO_PROVIDER_MODEL",
  "DEMO_PROVIDER_API_KEY",
  "DEMO_PROVIDER_BASE_URL",
  "DEMO_AUTH_EMAIL",
  "DEMO_AUTH_PASSWORD",
  "DEMO_AUTH_DISPLAY_NAME",
]);
const untouched = Object.entries(values)
  .filter(([key]) => !managedKeys.has(key))
  .map(([key, value]) => `${key}=${quote(value)}`);
const managed = [
  "DEMO=true",
  `DEMO_PROVIDER_KIND=${quote(values.DEMO_PROVIDER_KIND)}`,
  `DEMO_PROVIDER_MODEL=${quote(values.DEMO_PROVIDER_MODEL)}`,
  `DEMO_PROVIDER_API_KEY=${quote(values.DEMO_PROVIDER_API_KEY)}`,
  `DEMO_PROVIDER_BASE_URL=${quote(values.DEMO_PROVIDER_BASE_URL)}`,
  `DEMO_AUTH_EMAIL=${quote(values.DEMO_AUTH_EMAIL)}`,
  `DEMO_AUTH_PASSWORD=${quote(values.DEMO_AUTH_PASSWORD)}`,
  `DEMO_AUTH_DISPLAY_NAME=${quote(values.DEMO_AUTH_DISPLAY_NAME)}`,
];
writeFileSync(envPath, `${[...untouched, ...managed].join("\n")}\n`, { mode: 0o600 });
console.log(`\nWrote ${envPath} with restrictive permissions.`);

if (answers.start) {
  run("docker", ["compose", "--profile", "demo", "up", "--build", "-d", "remiai-demo"]);
  console.log("\nDemo is running on http://127.0.0.1:3001.");
  console.log("Put it behind a TLS reverse proxy before making it public.");
}
