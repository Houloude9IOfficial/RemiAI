# Security Policy

## Supported Versions

The **latest stable release** of RemiAI receives active security support. Older releases are supported on a best-effort basis — we recommend upgrading to the newest version as soon as possible.

## Reporting a Vulnerability

We take security issues seriously. If you discover a vulnerability in RemiAI, please report it privately so we can address it before it is publicly disclosed.

**Do NOT open a public GitHub issue** for security vulnerabilities. Instead, report via one of the following channels:

- **GitHub Private Vulnerability Reporting**: Use the "Report a vulnerability" feature on the [repository](https://github.com/Houloude9IOfficial/RemiAI/security/advisories)
- **Email**: Open a GitHub issue requesting a contact method, and we will respond with an appropriate private channel

You should receive an acknowledgment within **48 hours**. We will work with you to understand the severity, develop a fix, and coordinate a responsible disclosure.

### What to include in your report

When reporting, please provide as much detail as possible:

- Type of vulnerability (e.g., XSS, SQL injection, remote code execution, privilege escalation)
- Steps to reproduce the issue
- Affected component(s) and version(s)
- Potential impact
- Any suggested mitigation or fix (if known)

### What to expect

1. **Acknowledgment** within 48 hours
2. **Initial triage** within 5 business days — we will confirm the vulnerability and assess severity
3. **Fix timeline** — we will work on a fix and communicate an estimated release date
4. **Disclosure coordination** — once a fix is released, we will coordinate public disclosure with you

---

## Security Features

RemiAI includes several security features and considerations that users should be aware of.

### File System Permissions

RemiAI uses a **directory root system** that strictly limits file access:

- The AI can only read and write files inside directories you explicitly add via **Settings -> Directories**
- Each directory root has **independent read and write permissions** — you can grant read-only access to some directories and read-write access to others
- File operations are validated against the configured roots on every access — paths outside permitted roots are rejected
- The AI **cannot** access files outside configured directories, even if it knows the absolute path

### API Key Storage

- AI provider API keys and tool integration keys are stored in the **local SQLite database** (`data/remiai.sqlite`)
- Keys are **never sent to the client** in plaintext — the API masks them in responses (e.g., `sk-...abcd`)
- The database file is stored locally and is **not** exposed via the web server
- When using the **Backup** feature, all data including API keys is **encrypted** before export

### Backup Encryption

All backups are encrypted before leaving your machine:

- Backups use **AES-256-GCM** (authenticated encryption) with a password-derived key and a random salt per backup
- **Password required** — backups cannot be restored without the correct password
- Each backup gets a fresh random salt and initialization vector, so identical data never produces identical ciphertext
- The restore endpoint is authentication-protected and accepts payloads up to 10 GB

### Code Execution Sandbox

RemiAI supports executing JavaScript, Python, and Bash through its tool system:

- Code runs in **isolated temporary directories** that are cleaned up after execution
- **Strict timeouts** prevent runaway processes
- JavaScript execution uses Node.js's **vm module** with no `fs`, `network`, or `timer` access
- Python execution uses a **minimal environment** with only PATH and SYSTEMROOT variables
- **Bash execution** (`bash_execute`) has a per-conversation mode:
  - **`sandboxed` (default)** — the working directory is pinned to a permitted root, the command is checked against a safety list, and writes are redirected to a temporary directory
  - **`full`** — runs arbitrary shell commands with your full user permissions and normal filesystem access

**Important caveat**: The code execution sandbox is designed to prevent accidents, not to provide true security isolation. It is **not** a hardened sandbox — it has full filesystem access and can run other executables, and `bash_execute` in **full** mode is equivalent to running commands yourself in a terminal. Do not enable code execution tools in environments where untrusted users can interact with the AI.

### Browser Automation

RemiAI can drive a real headless Chromium browser through its Browser Automation tool (`browser_open`, `browser_click`, `browser_fill`, `browser_extract`, `browser_screenshot`, `browser_interact`):

- **Opt-in** — disabled by default; tools are only registered when you enable it via **Settings -> Tools -> Browser Automation**
- Each conversation gets **one browser session**, created lazily on first use; sessions idle out after 5 minutes and a global cap (4) protects low-memory machines
- Chromium is bundled with the desktop installers and the Docker image; in dev it falls back to Playwright's cache or your system Chrome/Edge
- The browser runs **on your machine/container** and can reach local and private-network services that ordinary `web_fetch` cannot — including `localhost` services on the host

**Important caveat**: The browser is a real browser running with your network access. It can visit internal/local URLs, use any credentials already stored in its profile, and make requests from your machine's IP. Do not enable Browser Automation in environments where untrusted users can interact with the AI.

### MCP Servers

MCP servers extend the AI's capabilities by connecting to external tools:

- Each MCP server is manually configured by you via **Settings -> MCP Servers**
- Servers can use STDIO (local subprocess) or HTTP (network) transports
- Review the source and capabilities of any MCP server before adding it
- MCP servers have access to the same tools and context as the AI

### File Watcher

The background file watcher indexes files in watched directories:

- It **only stores metadata** (path, size, modification time, content hash) — **never file contents**
- File contents are only read when the AI explicitly calls a read tool
- The index is local and is never sent anywhere

### Authentication

RemiAI uses a **local, single-account authentication layer**:

- The first startup with no account generates a one-time signup code and prints it to the server console
- Signup requires that code plus an email and password; the code is stored only as a hash and is consumed once
- Passwords are stored as salted, slow hashes; plaintext passwords are never persisted
- Protected API requests require an opaque, server-side session stored in an HttpOnly SameSite cookie
- Sessions are revocable and expire; users may choose a browser-only session or a remembered session
- Changing the password revokes all sessions, and `npm run auth:reset` provides a local console recovery path
- Existing pre-auth databases are preserved and claimed by the first account
- Encrypted backups preserve account credentials when restoring to a fresh installation, but never include active sessions or bootstrap secrets

The app should still run on `127.0.0.1` by default. Authentication protects the application but does not make arbitrary remote exposure safe: review MCP servers, code execution, directory permissions, Browser Automation, and network access before exposing RemiAI beyond localhost.

### Docker and public deployment

The included `Dockerfile` runs the production standalone server as the unprivileged `node` user. The only intended writable location is `/app/data`, which contains the SQLite database, uploads, provider credentials, and other user data. Keep that volume private and back it up securely.

The image also bundles Playwright's headless Chromium for the Browser Automation tool (adds roughly 350 MB) plus its system dependencies. The browser runs inside the container with the container's network access — treat the tool as opt-in and keep the container behind the reverse proxy.

For a public deployment:

1. Put the container behind a TLS reverse proxy and forward only to `127.0.0.1:3000` (the included Compose file uses this binding).
2. Do not publish port 3000 directly to the Internet or run the container with `--privileged`.
3. Use a strong account password, restrict access to the one-time signup code, and remove/restrict server-console log access after first setup.
4. Review MCP servers, external provider keys, watched directories, code-execution tools, and Browser Automation before allowing any remote access.
5. Preserve the named Docker volume and test encrypted backups; losing `/app/data` loses the account and stored credentials.

---

## Best Practices

To keep your RemiAI installation secure:

1. **Run on localhost only** — the dev server binds to `127.0.0.1` by default. Keep it that way.
2. **Use strong passwords** for backup encryption
3. **Review directory permissions** — only grant write access to directories that need it
4. **Keep dependencies updated** — run `npm audit` periodically and update packages
5. **Secure your API keys** — treat API keys stored in RemiAI with the same care as any other credential store
6. **Review MCP servers** — only add MCP servers from trusted sources
7. **Be cautious with code execution** — the exec tools (`python_exec`, `js_exec`, `bash_execute`) have full filesystem access; keep `bash_execute` in **sandboxed** mode unless you fully trust the conversation
8. **Don't disable the file watcher security** — keep watched directories limited to what you need
9. **Backup regularly** — use encrypted backups to protect your data and API keys
10. **Monitor the data directory** — the SQLite database at `data/remiai.sqlite` contains all your data and API keys
11. **Keep Browser Automation opt-in** — it runs a real browser with your network access; only enable it for conversations you trust

---

## Threat Model

RemiAI is designed for a **single-user local environment**. The following are considered in-scope for security:

| Threat | Mitigation |
|---|---|
| AI probes files outside permitted directories | Directory root system blocks access with path containment checks |
| AI exfiltrates data via web_fetch | web_fetch can read public URLs; API keys grant access to external services |
| Malicious MCP server exploits the system | Manual opt-in; review server before adding |
| Code execution abused for malware | Isolated temp dirs, timeouts, no network in JS sandbox; `bash_execute` sandboxed mode by default |
| AI uses the browser to reach local/private services | Browser Automation is opt-in and disabled by default; per-conversation sessions idle out after 5 minutes |
| Unauthorized physical access to database | Data directory is local; backup encryption protects exports |
| XSS in rendered chat output | React's default escaping; review any `dangerouslySetInnerHTML` usage |

### Out of Scope

- Attacks requiring physical access to the host machine
- Side-channel attacks on the local network
- Denial of service via resource exhaustion
- Vulnerabilities in third-party dependencies (please report them to the respective maintainer)

---

## Dependency Security

This project uses automated tools to manage dependency security:

- `npm audit` is run periodically to identify known vulnerabilities
- Dependencies are updated regularly via standard npm update workflows
- Critical security updates for Next.js, the AI SDK, and other core dependencies are applied promptly

> **Note:** `npm audit` may report advisories in nested dependencies of the currently published Next.js release. Do **not** run `npm audit fix --force` to silence them — it proposes an incompatible downgrade. Re-run the audit after each Next.js upgrade and update when a compatible patched release is available.

If you discover a vulnerability in a dependency, please report it following the [Reporting a Vulnerability](#reporting-a-vulnerability) process above, and we will update the affected package.

---

## Acknowledgments

We appreciate the community's help in keeping RemiAI secure. Contributors who report valid security issues will be acknowledged in release notes (with their consent).
