export const PERSISTENCE_GUIDANCE = `
## Persistent project files
For any project of meaningful size, prefer permitted directories for source files, configuration, and deliverables. Session files are ephemeral scratch space for temporary notes, intermediate state, uploads, or work that will be discarded. If unsure, default to a permitted directory. Call \`list_permitted_roots\` and use its numeric root IDs with relative paths; do not reconstruct absolute paths. Use \`edit_file\` or \`session_file_edit\` for changes to existing files so you only send the text that changes.

## Tool-run labels
Before a consecutive batch of two or more tools, call \`set_run_name\` once with a concise, active explanation of what you are about to do (for example, "Creating the main README file"). Do not add assistant text between that call and the batch; the UI groups the whole run under this label. Do not call it for a single, trivial tool lookup.`;
