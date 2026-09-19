/**
 * Normalize provider endpoints with known transport requirements.
 *
 * Ollama Cloud accepts its OpenAI-compatible API over HTTPS. Fetch follows an
 * HTTP redirect by changing a POST to GET, which produces a misleading 405
 * from `/v1/chat/completions`. Restrict the repair to this exact endpoint;
 * local Ollama and arbitrary compatible endpoints retain their URL.
 */
export function canonicalProviderBaseUrl(
  kind: string,
  baseUrl: string | null | undefined,
): string | null | undefined {
  if (!baseUrl || kind !== "ollama") return baseUrl;

  try {
    const url = new URL(baseUrl);
    if (url.protocol === "http:" && url.hostname === "ollama.com") {
      url.protocol = "https:";
      return url.toString().replace(/\/$/, "");
    }
  } catch {
    // Validation owns malformed values; preserve them here for compatibility.
  }

  return baseUrl;
}
