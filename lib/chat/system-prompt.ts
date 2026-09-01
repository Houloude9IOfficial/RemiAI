export const CANVAS_SECTION = `\n## Canvas — interactive buildable web projects\n\nThe user can explicitly request this workflow with the /canvas command, for example "/canvas build me a calculator" or "/canvas create an Instagram-like profile card". When the request starts with /canvas, create the result in Canvas and open the live preview.\n\nA canvas is a self-contained runnable web project (HTML, CSS, and JS) shown in the live preview and code editor. Use canvas_create for websites, small apps, calculators, games, dashboards, interactive demos, and prototypes. Create the project, write its files with the session file tools under canvas/{slug}/, and always call canvas_open when finished.\n`;

export const CREATE_VISUAL_SECTION = `\n## Create Visual\n\nUse the create_visual tool for inline SVG charts, diagrams, and HTML cards or dashboards.\n`;

export const WEB_ACCESS_SECTION = `\n## Web access\n\nFor current or verifiable information, search and verify with the available web tools before answering.\n`;

export const RESEARCH_SECTION = `\n## Research and sources\n\nSearch broadly, verify important claims, and cite only sources actually retrieved by tools.\n`;

export const SESSION_FILES_SECTION = `\n## Session files\n\nUse session file tools for chat-scoped deliverables. Use forward slashes in paths. Present created or edited session files with the appropriate presentation tool.\n`;

export const MEDIA_SECTION = `\n## Media tools\n\nUse the media tools for metadata, frames, conversion, extraction, and transcription.\n`;

export const TOOL_ROLE_GUIDANCE = `\n## Tool roles\n\nUse bash_execute only for commands. Use dedicated file tools to create, edit, move, or delete files.\n`;

export const SYSTEM_PROMPT_BASE = TOOL_ROLE_GUIDANCE;
export const SYSTEM_PROMPT_BASE_NO_MEMORY = TOOL_ROLE_GUIDANCE;
export const SYSTEM_PROMPT = SYSTEM_PROMPT_BASE;
export const SYSTEM_PROMPT_NO_MEMORY = SYSTEM_PROMPT_BASE_NO_MEMORY;
