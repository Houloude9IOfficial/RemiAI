export const GITHUB_URL = "https://github.com/Houloude9IOfficial/RemiAI";
export const GITHUB_REPO = "RemiAI";
export const GITHUB_USER = "Houloude9IOfficial";
export const SITE_URL = "https://remi-ai.vercel.app";
export const SITE_NAME = "RemiAI";

/** Root URL for the creations directory on GitHub */
export const CREATIONS_URL = `${GITHUB_URL}/tree/main/creations`;

/* ------------------------------------------------------------------ */
/*  Recommended MCP Servers                                            */
/* ------------------------------------------------------------------ */

export interface McpServerRecommendation {
  name: string;
  description: string;
  pkg: string;
  command: string;
  args: string[];
  env?: { key: string; description: string }[];
  tags: string[];
  docsUrl: string;
  gradient: string;
  iconColor: string;
  iconName?: string;
  /** URL for a custom image/icon — takes precedence over iconName */
  iconUrl?: string;
}

export const MCP_SERVERS: McpServerRecommendation[] = [
  {
    name: "GitHub",
    description:
      "Manage repositories, issues, pull requests, code reviews, and more directly from your AI assistant.",
    pkg: "@modelcontextprotocol/server-github",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-github"],
    env: [
      {
        key: "GITHUB_PERSONAL_ACCESS_TOKEN",
        description: "GitHub personal access token with repo scope",
      },
    ],
    tags: ["Git", "DevOps", "STDIO"],
    docsUrl:
      "https://github.com/modelcontextprotocol/servers-archived/tree/main/src/github",
    gradient: "from-gray-50 to-slate-50",
    iconColor: "text-gray-700",
    iconUrl: "https://upload.wikimedia.org/wikipedia/commons/9/91/Octicons-mark-github.svg",
  },
  {
    name: "PostgreSQL",
    description:
      "Query PostgreSQL databases with read-only access. Introspect schemas, run queries, and analyze data.",
    pkg: "@modelcontextprotocol/server-postgres",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-postgres", "postgresql://..."],
    tags: ["Database", "SQL", "STDIO"],
    docsUrl:
      "https://github.com/modelcontextprotocol/servers-archived/tree/main/src/postgres",
    gradient: "from-blue-50 to-indigo-50",
    iconColor: "text-blue-600",
    iconUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/2/29/Postgresql_elephant.svg/1280px-Postgresql_elephant.svg.png",
  },
  {
    name: "Composio",
    description:
      "Connect 100+ external apps (Gmail, Slack, Linear, Jira, and more) through a single managed MCP server with OAuth handling.",
    pkg: "composio-mcp",
    command: "npx",
    args: ["composio@latest", "mcp", "add"],
    tags: ["Integrations", "API", "STDIO"],
    docsUrl: "https://composio.dev/",
    gradient: "from-emerald-50 to-teal-50",
    iconColor: "text-emerald-600",
    iconUrl: "https://avatars.githubusercontent.com/u/128464815?s=280&v=4",
  },
];
