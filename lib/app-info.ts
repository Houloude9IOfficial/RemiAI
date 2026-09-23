import fs from "node:fs";
import path from "node:path";

// ---------------------------------------------------------------------------
// App metadata (read from package.json at import time) — server-only.
// Client components must receive this via props from a server component.
// ---------------------------------------------------------------------------

const pkg = (() => {
  try {
    return JSON.parse(
      fs.readFileSync(
        path.join(/*turbopackIgnore: true*/ process.cwd(), "package.json"),
        "utf8",
      ),
    ) as {
      name?: string;
      description?: string;
      version?: string;
      author?: { name?: string; email?: string };
      homepage?: string;
    };
  } catch {
    return {};
  }
})();

export interface AppInfo {
  name: string;
  description: string;
  version: string;
  author: string;
  contactEmail: string;
  website: string;
}

export const appInfo: AppInfo = {
  name: pkg.name === "remiai" ? "RemiAI" : (pkg.name ?? "RemiAI"),
  description:
    pkg.description ??
    "Self-hosted, privacy-first AI assistant — chat, files, web search and automation in one workspace under your control.",
  version: pkg.version ?? "0.0.0",
  author: pkg.author?.name ?? "CrickDevs",
  contactEmail: pkg.author?.email ?? "support@crickdevs.com",
  website: pkg.homepage ?? "https://remiai.crickdevs.com",
};
