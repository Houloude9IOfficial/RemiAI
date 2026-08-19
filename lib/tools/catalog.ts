export type ToolCategory = "builtin" | "memory" | "integration";

export interface ToolDefinition {
  id: string;
  name: string;
  icon?: string | null;
  description: string;
  toolNames: string[];
  category: ToolCategory;
  /** Optional display sub-group used to break large categories (e.g. Built-in) into scannable clusters. */
  subgroup?: string;
  togglable: boolean;
  requiresApiKey: boolean;
  apiKeyLabel?: string;
  apiKeyPlaceholder?: string;
  docsUrl?: string;
  extraFields?: {
    key: string;
    label: string;
    placeholder?: string;
    type: "text" | "password" | "toggle" | "select";
    options?: { value: string; label: string }[];
    description?: string;
  }[];
}

export const TOOL_CATALOG: ToolDefinition[] = [
  // ── Filesystem tools (builtin, always on, not togglable) ──
  {
    id: "filesystem",
    name: "Filesystem",
    description:
      "List, read, search, write, create, and delete files and directories in permitted directories. Includes directory listing, file reading (text, media), content search, glob matching, file writing, directory creation, and directory deletion.",
    toolNames: [
      "list_permitted_roots",
      "list_directory",
      "read_file",
      "read_media",
      "search_files",
      "glob_files",
      "write_file",
      "create_directory",
      "delete_directory",
      "rename_item",
    ],
    category: "builtin",
    subgroup: "Files & Storage",
    togglable: false,
    requiresApiKey: false,
  },
  // ── Session files (builtin, always on — per-conversation private sandbox) ──
  {
    id: "session_files",
    name: "Session Files",
    description:
      "A private file sandbox scoped to the current conversation. The AI can create, read, list, inspect media, move, download-link, and delete files (websites, scripts, documents) that the user can view in a side panel and download as a .zip archive. Every file has a canonical /api/chat/{conversationId}/session-files/{path} URL.",
    toolNames: [
      "session_file_list",
      "session_file_read",
      "session_file_read_media",
      "session_file_write",
      "session_file_mkdir",
      "session_file_move",
      "session_file_download",
      "session_file_delete",
      "session_present_file",
      "session_present_files",
    ],
    category: "builtin",
    subgroup: "Files & Storage",
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
    subgroup: "Context & Profile",
    togglable: false,
    requiresApiKey: false,
  },
  // ── Browser Automation — native Playwright (togglable, disabled by default) ──
  {
    id: "playwright",
    name: "Browser Automation",
    description:
      "Drive a real headless Chromium browser natively (Playwright) right on this machine. Open pages rendered with JavaScript, click links/buttons, fill forms, extract page text, take screenshots into the chat, and run custom Playwright scripts. Works offline and in both the website and desktop app.",
    toolNames: [
      "browser_open",
      "browser_click",
      "browser_fill",
      "browser_extract",
      "browser_screenshot",
      "browser_interact",
      "browser_close",
    ],
    category: "builtin",
    subgroup: "Automation",
    togglable: true,
    requiresApiKey: false,
  },
  // ── Code execution tools (togglable, disabled by default, security warning) ──
  {
    id: "code_execution",
    name: "Code Execution",
    description:
      "Run Python, JavaScript, or Bash commands on your machine. Useful for executing code snippets, analysis, experimentation, and running CLI tools. Includes python_exec, js_exec, and bash_execute with console output.",
    toolNames: ["python_exec", "js_exec", "bash_execute"],
    category: "builtin",
    subgroup: "Automation",
    togglable: true,
    requiresApiKey: false,
  },
  // ── Document reader tools (builtin, always on, not togglable) ──
  {
    id: "document_reader",
    name: "Document Reader",
    description:
      "Extract text from PDF, DOCX, DOC, ODT, RTF, and EPUB files. Uses pdf-parse and mammoth libraries for document parsing.",
    toolNames: ["read_document"],
    category: "builtin",
    subgroup: "Files & Storage",
    togglable: false,
    requiresApiKey: false,
  },
  // ── Media tools (builtin, always on, not togglable — ffmpeg-powered) ──
  {
    id: "media_tools",
    name: "Media Tools",
    description:
      "Analyze and process video/audio files with ffmpeg. Get technical metadata (codec, fps, duration, bitrate, resolution, sample rate), convert between formats (mp4, webm, mkv, mov, avi, gif, mp3, wav, m4a, ogg, flac, opus, aac), extract audio from videos, extract still frames from videos that the AI can inspect visually, and transcribe speech to text (local Whisper offline or your configured provider). Outputs are saved to the chat's session files (downloadable) or to a permitted directory.",
    toolNames: [
      "get_media_metadata",
      "convert_media",
      "extract_audio",
      "extract_video_frames",
    ],
    category: "builtin",
    subgroup: "Media & Audio",
    togglable: false,
    requiresApiKey: false,
  },
  // ── Transcription tools (builtin, always on — configured in Settings > Tools) ──
  {
    id: "transcription",
    name: "Transcription",
    description:
      "Transcribe speech in video/audio files to text. Choose a local Whisper model (offline, private, free — downloaded once and cached locally) or your configured OpenAI-compatible provider (fast, uses provider credits). The AI uses transcribe_audio automatically when you ask what was said in a recording.",
    toolNames: ["transcribe_audio", "manage_transcription_models"],
    category: "builtin",
    subgroup: "Media & Audio",
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
  // ── Profile tools (builtin, always on, not togglable) ──
  {
    id: "profile",
    name: "Profile",
    description:
      "View and update the user's permanent profile. (name, bio, location, occupation, interests, skills, pronouns, birthday, social links, and AI preferences)",
    toolNames: ["get_profile", "update_profile"],
    category: "builtin",
    subgroup: "Context & Profile",
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
  // ── File index tools (builtin, always on, not togglable) ──
  {
    id: "file_index",
    name: "File Index",
    description:
      "Query recently changed files and search the file index by path. The file index is automatically updated by a background watcher when files are created, modified, or deleted in watched directories.",
    toolNames: ["query_recent_changes", "query_file_index"],
    category: "builtin",
    subgroup: "Files & Storage",
    togglable: false,
    requiresApiKey: false,
  },
  // ── Delay tool (builtin, always on, not togglable) ──
  {
    id: "delay",
    name: "Delay",
    description:
      "Wait for a specified number of milliseconds before continuing. Useful for rate-limiting between consecutive tool calls or API requests.",
    toolNames: ["delay"],
    category: "builtin",
    subgroup: "AI & Assistance",
    togglable: false,
    requiresApiKey: false,
  },
  // ── Ask Questions tool (builtin, always on, not togglable) ──
  {
    id: "ask_questions",
    name: "Ask Questions",
    description:
      "Ask the user up to 7 structured questions at once, each with 3 predefined choices plus optional custom answers. Use this to gather multiple pieces of information from the user efficiently.",
    toolNames: ["ask_questions", "suggest_followups"],
    category: "builtin",
    subgroup: "AI & Assistance",
    togglable: false,
    requiresApiKey: false,
  },
  // ── Notifications (builtin, always on, not togglable) ──
  {
    id: "notifications",
    name: "App Notifications",
    description:
      "Send concise local notifications to the user's active RemiAI web/PWA or desktop app. Does not send email or SMS.",
    toolNames: ["send_notification"],
    category: "builtin",
    subgroup: "Automation",
    togglable: false,
    requiresApiKey: false,
  },
  // ── Web Fetch tool (builtin, always on, not togglable) ──
  {
    id: "web_fetch",
    name: "Web Fetch",
    description:
      "Fetch a specific URL and return its content as text. Use this to read web pages, REST APIs, or any publicly accessible URL.",
    toolNames: ["web_fetch"],
    category: "builtin",
    subgroup: "Web & Research",
    togglable: false,
    requiresApiKey: false,
  },
  // ── Todo List (builtin, always on, not togglable) ──
  {
    id: "todo",
    name: "Todo List",
    description:
      "Plan and track multi-step tasks with a todo list. Use todos_init to create a plan, todos_update to mark items as completed/in_progress/failed, and todos_view to check progress. Perfect for breaking down complex requests into manageable steps.",
    toolNames: ["todos_init", "todos_update", "todos_view"],
    category: "builtin",
    subgroup: "AI & Assistance",
    togglable: false,
    requiresApiKey: false,
  },
  // ── Agent Spawner (builtin, always on, not togglable) ──
  {
    id: "agent_spawner",
    name: "Agent Spawner",
    description:
      "Spawn specialised sub-agents (researcher, coder, analyst, summarizer, or custom) to handle tasks independently. Supports blocking (wait for result) and background (fire-and-forget) modes. Features agent chaining — sub-agents can spawn their own sub-agents up to 3 levels deep, creating a tree of collaborating specialists. Token usage is tracked on the conversation.",
    toolNames: ["spawn_agent", "get_agent_result"],
    category: "builtin",
    subgroup: "AI & Assistance",
    togglable: false,
    requiresApiKey: false,
  },
  // ── Routines (builtin, togglable — lets AI create & run reusable JS scripts) ──
  {
    id: "routines",
    name: "Routines",
    description:
      "Create, manage, and run reusable JavaScript routines. Routines are named scripts that persist across conversations and can be scheduled with cron expressions. Includes create_routine, run_routine, list_routines, update_routine, delete_routine, and get_routine_logs.",
    toolNames: [
      "create_routine",
      "run_routine",
      "list_routines",
      "update_routine",
      "delete_routine",
      "get_routine_logs",
    ],
    category: "builtin",
    subgroup: "Automation",
    togglable: true,
    requiresApiKey: false,
  },
  // ── NewsAPI (integration, togglable, needs API key) ──
  {
    id: "newsapi",
    name: "NewsAPI",
    icon: "https://newsapi.org/favicon-32x32.png",
    description:
      "Search news articles from thousands of sources worldwide using NewsAPI. Get headlines, descriptions, URLs, publication dates, and source info for current events and breaking stories.",
    toolNames: ["news_search", "news_top_headlines"],
    category: "integration",
    togglable: true,
    requiresApiKey: true,
    apiKeyLabel: "NewsAPI API Key",
    apiKeyPlaceholder: "YOUR_API_KEY",
    docsUrl: "https://newsapi.org/register",
  },
  // ── Scheduled Tasks (builtin, always on, not togglable) ──
  {
    id: "scheduling",
    name: "Scheduled Tasks",
    description:
      "Schedule tasks for future execution. The AI will execute the task at the specified time, using all available tools, and send a desktop notification with results. Perfect for reminders, timed checks, and future lookups.",
    toolNames: ["schedule_task", "list_scheduled_tasks", "update_scheduled_task", "cancel_scheduled_task"],
    category: "builtin",
    subgroup: "Automation",
    togglable: false,
    requiresApiKey: false,
  },
  // ── Create Visual (builtin, togglable) ──
  {
    id: "create_visual",
    name: "Create Visual",
    description:
      "Generate dynamic visuals — SVG charts, diagrams, and HTML cards/dashboards — rendered directly in the chat. The AI uses this automatically when it needs to show data visually.",
    toolNames: ["create_visual"],
    category: "builtin",
    subgroup: "Media & Audio",
    togglable: false,
    requiresApiKey: false,
  },
  // ── ElevenLabs Voice (integration, togglable, needs API key) ──
  {
    id: "elevenlabs",
    name: "ElevenLabs Voice",
    icon: "https://11labs-nonprd-15f22c1d.s3.eu-west-3.amazonaws.com/a2ea339b-8b5e-41bb-b706-24eda8a4c9e3/elevenlabs-symbol.png",
    description:
      "Premium AI voice and speech recognition. When enabled with an API key, responses are spoken with lifelike ElevenLabs voices. Configure which features are active below.",
    toolNames: [],
    category: "integration",
    togglable: true,
    requiresApiKey: true,
    apiKeyLabel: "ElevenLabs API Key",
    apiKeyPlaceholder: "sk_...",
    docsUrl: "https://elevenlabs.io/app/settings/api-keys",
    extraFields: [
      {
        key: "tts_enabled",
        label: "Text-to-Speech",
        type: "toggle",
        description: "Speak AI responses aloud using ElevenLabs voice",
      },
      {
        key: "stt_enabled",
        label: "Speech-to-Text",
        type: "toggle",
        description: "Enable voice input via speech recognition in Talk mode",
      },
      {
        key: "voice_id",
        label: "Voice Profile",
        type: "select",
        placeholder: "Select a voice...",
        description: "Which ElevenLabs voice to use for TTS",
        options: [
          { value: "pNInz6obpgDQGcFmaJgB", label: "Adam — Deep, warm (Jarvis-like)" },
          { value: "21m00Tcm4TlvDq8ikWAM", label: "Rachel — Clear, friendly" },
          { value: "EXAVITQu4vrRV7JRYJfU", label: "Bella — Soft, warm" },
          { value: "TxGEqnHWrfWFTfGW9XjX", label: "Josh — Deep, resonant" },
          { value: "ODq5zmih8GrVes37Dizd", label: "Patrick — Professional, engaging" },
          { value: "ThT5KcBeYPX3keUQqHPh", label: "Dorothy — Warm, mature" },
          { value: "OeT7wF4h3aXNBcVF9JtV", label: "Liam — Authoritative, calm" },
          { value: "XrExE9yKIg1WjnnlVkGX", label: "Fin — Energetic, bright" },
        ],
      },
    ],
  },
  // ── Firecrawl (integration, togglable, needs API key) ──
  {
    id: "firecrawl",
    name: "Firecrawl",
    icon: "https://firecrawl.dev/logo.png",
    description:
      "Powerful web scraping, crawling, searching, and browser interaction powered by Firecrawl. Includes fc_search (web search), fc_scrape (single page scrape), fc_crawl (multi-page crawl), fc_interact (browser interaction), and fc_stop_interaction.",
    toolNames: [
      "fc_search",
      "fc_scrape",
      "fc_crawl",
      "fc_interact",
      "fc_stop_interaction",
    ],
    category: "integration",
    togglable: true,
    requiresApiKey: true,
    apiKeyLabel: "Firecrawl API Key",
    apiKeyPlaceholder: "fc-...",
    docsUrl: "https://firecrawl.dev",
  },
];

export function getToolDef(id: string): ToolDefinition | undefined {
  return TOOL_CATALOG.find((t) => t.id === id);
}
