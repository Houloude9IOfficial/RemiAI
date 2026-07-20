# Security Policy

## Supported Versions

The following versions of RemiAI receive active security support:

| Version | Supported |
|---|---|
| 1.2.x | Yes |
| < 1.2 | No |

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
- When using the **Backup** feature, all data including API keys is **encrypted with AES-256-GCM** before export

### Backup Encryption

All backups are encrypted before leaving your machine:

- **Algorithm**: AES-256-GCM (authenticated encryption)
- **Key derivation**: PBKDF2 with a random salt (100,000 iterations)
- **Password required**: backups cannot be restored without the correct password
- Both the salt and initialization vector (IV) are randomly generated per backup

### Code Execution Sandbox

RemiAI supports executing JavaScript and Python code through its tool system:

- Code runs in **isolated temporary directories** that are cleaned up after execution
- **Strict timeouts** prevent runaway processes (30s default for Python, 15s for JavaScript)
- JavaScript execution uses Node.js's **vm module** with no `fs`, `network`, or `timer` access
- Python execution uses a **minimal environment** with only PATH and SYSTEMROOT variables

**Important caveat**: The code execution sandbox is designed to prevent accidents, not to provide true security isolation. It is **not** a hardened sandbox — it has full filesystem access and can run other executables. Do not enable code execution tools in environments where untrusted users can interact with the AI.

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

RemiAI is designed as a **local, single-user application**:

- There is **no authentication layer** — the app is intended to run on `127.0.0.1` (localhost only)
- **Do not expose RemiAI to the internet** or a network without adding authentication
- If you need remote access, use a reverse proxy with authentication (e.g., nginx + basic auth, Tailscale, Cloudflare Tunnel with Access policies)

---

## Best Practices

To keep your RemiAI installation secure:

1. **Run on localhost only** — the dev server binds to `127.0.0.1` by default. Keep it that way.
2. **Use strong passwords** for backup encryption
3. **Review directory permissions** — only grant write access to directories that need it
4. **Keep dependencies updated** — run `npm audit` periodically and update packages
5. **Secure your API keys** — treat API keys stored in RemiAI with the same care as any other credential store
6. **Review MCP servers** — only add MCP servers from trusted sources
7. **Be cautious with code execution** — the exec tools (`python_exec`, `js_exec`) have full filesystem access
8. **Don't disable the file watcher security** — keep watched directories limited to what you need
9. **Backup regularly** — use encrypted backups to protect your data and API keys
10. **Monitor the data directory** — the SQLite database at `data/remiai.sqlite` contains all your data and API keys

---

## Threat Model

RemiAI is designed for a **single-user local environment**. The following are considered in-scope for security:

| Threat | Mitigation |
|---|---|
| AI probes files outside permitted directories | Directory root system blocks access with path containment checks |
| AI exfiltrates data via web_fetch | web_fetch can read public URLs; API keys grant access to external services |
| Malicious MCP server exploits the system | Manual opt-in; review server before adding |
| Code execution abused for malware | Isolated temp dirs, timeouts, no network in JS sandbox |
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

If you discover a vulnerability in a dependency, please report it following the [Reporting a Vulnerability](#reporting-a-vulnerability) process above, and we will update the affected package.

---

## Acknowledgments

We appreciate the community's help in keeping RemiAI secure. Contributors who report valid security issues will be acknowledged in release notes (with their consent).
