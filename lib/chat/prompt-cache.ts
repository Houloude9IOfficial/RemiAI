import type { SystemModelMessage } from "ai";
import type { providers } from "@/db/schema";

type ProviderRow = typeof providers.$inferSelect;

/**
 * Anthropic explicit prompt-cache breakpoint (5-minute TTL, refreshed for
 * free on each hit). Marks the END of a cached prefix segment.
 *
 * Anthropic computes its cache prefix in the order: **tools → system →
 * messages**. Tool definitions therefore sit at the very START of the cached
 * prefix and stay identical across every step of an agentic loop, so marking
 * the static system prompt + the last tool caches the ENTIRE per-request
 * overhead (all tool schemas + the base prompt) — the part that would
 * otherwise be re-billed at full rate on every step.
 *
 * NOTE: Anthropic requires consecutive breakpoints to be at least 1024
 * tokens apart (closer breakpoints are silently ignored). The static system
 * prompt must therefore stay ≳1024 tokens or its breakpoint stops caching.
 * Keep this in mind before trimming the base prompt further.
 */
export const ANTHROPIC_CACHE_CONTROL = { type: "ephemeral" } as const;

/**
 * Whether this provider needs explicit `cache_control` breakpoints.
 *
 * - **anthropic**: requires explicit breakpoints (this module).
 * - **openai**: prompt caching is fully automatic for inputs ≥1024 tokens —
 *   no opt-in or providerOptions needed, so nothing to do here.
 * - **ollama / openai-compatible**: no provider-side prompt caching.
 */
export function supportsPromptCache(
  provider: ProviderRow | undefined,
): boolean {
  return provider?.kind === "anthropic";
}

/**
 * Build the `instructions` option for streamText/generateText.
 *
 * For Anthropic, the system prompt is split into two system messages:
 *  1. a **static** part (base prompt + tool guidance — byte-identical on
 *     every request and every step) marked with a `cache_control`
 *     breakpoint, and
 *  2. a **dynamic** part (memories, file changes, prefs, plan mode — changes
 *     between requests) placed AFTER the breakpoint so it never invalidates
 *     the cached prefix.
 *
 * All other providers get the plain concatenated string, exactly as before.
 */
export function buildCachedInstructions(
  provider: ProviderRow | undefined,
  staticPrompt: string,
  dynamicPrompt: string,
): string | SystemModelMessage[] {
  if (!supportsPromptCache(provider)) {
    return staticPrompt + dynamicPrompt;
  }
  const parts: SystemModelMessage[] = [
    {
      role: "system",
      content: staticPrompt,
      providerOptions: {
        anthropic: { cacheControl: ANTHROPIC_CACHE_CONTROL },
      },
    },
  ];
  if (dynamicPrompt) {
    parts.push({ role: "system", content: dynamicPrompt });
  }
  return parts;
}

/**
 * Attach a `cache_control` breakpoint to the LAST tool in the set so the
 * entire tool-definitions prefix is cached (Anthropic places the breakpoint
 * at the end of the tools array; the AI SDK serializes tools in insertion
 * order when `toolOrder` is unset).
 *
 * Scans backwards to skip provider-defined tools (which can't carry
 * providerOptions). Returns the set unchanged for providers without explicit
 * caching.
 */
export function markLastToolForCache<T extends object>(
  provider: ProviderRow | undefined,
  tools: T | undefined,
): T | undefined {
  if (!supportsPromptCache(provider) || !tools) return tools;

  const entries = tools as Record<string, unknown>;
  const names = Object.keys(entries);
  for (let i = names.length - 1; i >= 0; i--) {
    const tool = entries[names[i]];
    if (tool === null || typeof tool !== "object") continue;
    const toolObj = tool as Record<string, unknown>;
    if (toolObj.type === "provider") continue; // can't carry providerOptions
    return {
      ...tools,
      [names[i]]: {
        ...toolObj,
        providerOptions: {
          ...((toolObj.providerOptions as Record<string, unknown> | undefined) ??
            {}),
          anthropic: { cacheControl: ANTHROPIC_CACHE_CONTROL },
        },
      },
    } as T;
  }
  return tools;
}
