export type ToolCategory = "builtin" | "memory" | "integration";

export interface ToolDefinition {
  id: string;
  name: string;
  icon?: string | null;
  description: string;
  toolNames: string[];
  category: ToolCategory;
  togglable: boolean;
  requiresApiKey: boolean;
  apiKeyLabel?: string;
  apiKeyPlaceholder?: string;
  docsUrl?: string;
  extraFields?: {
    key: string;
    label: string;
    placeholder: string;
    type: "text" | "password";
  }[];
}

export const TOOL_CATALOG: ToolDefinition[] = [
  // ── Filesystem tools (builtin, always on, not togglable) ──
  {
    id: "filesystem",
    name: "Filesystem",
    description:
      "List, read, search, and write files in permitted directories. Includes directory listing, file reading (text, media), content search, glob matching, and file writing.",
    toolNames: [
      "list_permitted_roots",
      "list_directory",
      "read_file",
      "read_media",
      "search_files",
      "glob_files",
      "write_file",
    ],
    category: "builtin",
    togglable: false,
    requiresApiKey: false,
  },
  // ── Context tools (builtin, always on, not togglable) ──
  {
    id: "context",
    name: "Environment Context",
    description:
      "Get current date, time, timezone, and details about the user's device and browser.",
    toolNames: ["get_time_details", "get_device_details"],
    category: "builtin",
    togglable: false,
    requiresApiKey: false,
  },
  // ── Memory tools (builtin, always on, not togglable) ──
  {
    id: "memory",
    name: "Memory",
    description:
      "Save and recall facts about the user across conversations. The AI can remember preferences, interests, and personal details.",
    toolNames: ["remember", "search_memories", "get_recent_memories"],
    category: "memory",
    togglable: false,
    requiresApiKey: false,
  },
  // ── Brave Search (integration, togglable, needs API key) ──
  {
    id: "brave_search",
    name: "Brave Search",
    icon: "https://upload.wikimedia.org/wikipedia/commons/5/51/Brave_icon_lionface.png",
    description:
      "Search the web using Brave Search. Get up-to-date information, news, and answers from the internet.",
    toolNames: ["brave_web_search"],
    category: "integration",
    togglable: true,
    requiresApiKey: true,
    apiKeyLabel: "Brave Search API Key",
    apiKeyPlaceholder: "sk-...",
    docsUrl: "https://api-dashboard.search.brave.com/app/keys",
  },
  // ── Notion (integration, togglable, needs API key) ──
  {
    id: "notion",
    name: "Notion (Read-only)",
    icon: "https://upload.wikimedia.org/wikipedia/commons/4/45/Notion_app_logo.png",
    description:
      "Search pages and read page content from your Notion workspace. Uses a Notion integration token for read-only access.",
    toolNames: ["notion_search_pages", "notion_get_page"],
    category: "integration",
    togglable: true,
    requiresApiKey: true,
    apiKeyLabel: "Notion Integration Token",
    apiKeyPlaceholder: "ntn_...",
    docsUrl: "https://developers.notion.com/",
  },
  // ── Context7 (integration, togglable, needs API key) ──
  {
    id: "context7",
    name: "Context7",
    icon: "https://upstash.gallerycdn.vsassets.io/extensions/upstash/context7-mcp/1.1.0/1781270197176/Microsoft.VisualStudio.Services.Icons.Default",
    description:
      "Fetch up-to-date documentation and code examples for libraries and frameworks. Helps the AI provide accurate, version-specific answers.",
    toolNames: ["context7_get_docs"],
    category: "integration",
    togglable: true,
    requiresApiKey: true,
    apiKeyLabel: "Context7 API Key",
    apiKeyPlaceholder: "ctx7_...",
    docsUrl: "https://context7.com/dashboard",
  },
];

export function getToolDef(id: string): ToolDefinition | undefined {
  return TOOL_CATALOG.find((t) => t.id === id);
}
