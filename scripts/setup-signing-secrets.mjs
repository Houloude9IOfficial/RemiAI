#!/usr/bin/env node
/**
 * Prepare GitHub Actions secrets for macOS code signing.
 *
 * electron-builder signs the macOS installer when the repository has the
 * following secrets set (see .github/workflows/build-installer.yml):
 *
 *   CSC_LINK          — base64-encoded .p12 certificate (Developer ID)
 *   CSC_KEY_PASSWORD  — password of that .p12 file
 *
 * This script does all of it in one go:
 *   1. validates the .p12 and password (via openssl, if installed)
 *   2. base64-encodes the .p12
 *   3. prints the exact values + instructions to paste into GitHub
 *   4. optionally sets the secrets directly using the GitHub CLI (`--set`)
 *
 * Usage:
 *   node scripts/setup-signing-secrets.mjs <cert.p12> [--password <pw>]
 *   node scripts/setup-signing-secrets.mjs <cert.p12> --set
 *   node scripts/setup-signing-secrets.mjs <cert.p12> --output secrets.env
 *
 * Options:
 *   --password <pw>   Certificate password. If omitted, the script prompts
 *                     (hidden input). Can also be supplied via the
 *                     CSC_KEY_PASSWORD or P12_PASSWORD env var.
 *   --set             Push the secrets to GitHub now using `gh` (must be
 *                     installed and authenticated).
 *   --output <file>   Also write a `NAME=VALUE` file you can paste from.
 *   --no-validate     Skip the openssl certificate check.
 *   --help, -h        Show this help.
 *
 * ⚠️ SECURITY: the base64 output IS your signing identity. Treat it like a
 *    password: don't commit it, don't paste it into logs or chat, and don't
 *    leave the --output file around.
 */

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(SCRIPT_DIR, "..");

const USAGE = `Usage:
  node scripts/setup-signing-secrets.mjs <cert.p12> [options]

Options:
  --password <pw>   Certificate password (or set CSC_KEY_PASSWORD / P12_PASSWORD)
  --set             Set the secrets in GitHub via the gh CLI
  --output <file>   Also write a NAME=VALUE file for manual pasting
  --no-validate     Skip the openssl certificate check
  --help, -h        Show this help`;

// ── Argument parsing ─────────────────────────────────────────────────

const args = process.argv.slice(2);
let p12Path = null;
let password = null;
let doSet = false;
let outputFile = null;
let doValidate = true;

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === "--help" || arg === "-h") {
    console.log(USAGE);
    process.exit(0);
  } else if (arg === "--password") {
    password = args[++i];
    if (password == null) {
      console.error("❌ --password requires a value");
      process.exit(2);
    }
  } else if (arg === "--set") {
    doSet = true;
  } else if (arg === "--output") {
    outputFile = args[++i];
    if (outputFile == null) {
      console.error("❌ --output requires a value");
      process.exit(2);
    }
  } else if (arg === "--no-validate") {
    doValidate = false;
  } else if (arg.startsWith("-")) {
    console.error(`❌ Unknown option: ${arg}\n`);
    console.error(USAGE);
    process.exit(2);
  } else if (p12Path == null) {
    p12Path = arg;
  } else {
    console.error(`❌ Unexpected argument: ${arg}\n`);
    console.error(USAGE);
    process.exit(2);
  }
}

// ── Helpers ──────────────────────────────────────────────────────────

function fail(message) {
  console.error(`❌ ${message}`);
  process.exit(1);
}

function run(cmd, args, opts = {}) {
  return spawnSync(cmd, args, { encoding: "utf8", ...opts });
}

function hasCommand(cmd) {
  return run("which", [cmd]).status === 0;
}

/**
 * Prompt for the password with hidden input (macOS/Linux TTY).
 * Falls back to a visible readline prompt when raw mode is unavailable.
 */
function promptPassword() {
  return new Promise((resolve) => {
    process.stdout.write("🔑 Certificate password: ");
    const stdin = process.stdin;

    if (!stdin.isTTY) {
      // Not a terminal (e.g. piped input) — read a line visibly.
      console.warn("⚠️  Non-interactive terminal — the password will be visible as you type.");
      let buffer = "";
      stdin.resume();
      stdin.setEncoding("utf8");
      stdin.on("data", (chunk) => {
        buffer += chunk;
        const nl = buffer.indexOf("\n");
        if (nl !== -1) {
          stdin.pause();
          console.log();
          resolve(buffer.slice(0, nl));
        }
      });
      return;
    }

    let password = "";
    let raw = false;
    const onData = (chunk) => {
      // Decode the whole chunk as UTF-8 so multi-byte characters work.
      const text = chunk.toString("utf8");
      for (const ch of text) {
        if (ch === "\x03") {
          // Ctrl+C
          process.stdout.write("\n");
          process.exit(130);
        } else if (ch === "\r" || ch === "\n") {
          // Enter
          finish();
          return;
        } else if (ch === "\x7f" || ch === "\b") {
          // Backspace
          password = password.slice(0, -1);
        } else {
          password += ch;
        }
      }
    };
    const finish = () => {
      if (raw) {
        try {
          stdin.setRawMode(false);
        } catch {
          /* ignore */
        }
      }
      stdin.off("data", onData);
      stdin.pause();
      process.stdout.write("\n");
      resolve(password);
    };
    try {
      stdin.setRawMode(true);
      raw = true;
    } catch {
      raw = false;
      stdin.setEncoding("utf8");
    }
    stdin.resume();
    stdin.on("data", raw ? onData : (chunk) => {
      const text = String(chunk);
      if (text.includes("\n") || text.includes("\r")) {
        password += text.replace(/[\r\n]/g, "");
        finish();
      } else {
        password += text;
      }
    });
  });
}

/**
 * Validate the .p12 with openssl and return a description of the certificate.
 *
 * macOS Keychain Access exports .p12 files whose certificate bags are
 * encrypted with legacy algorithms (RC2-40-CBC / RC4). OpenSSL 3.x refuses
 * those unless `-legacy` is passed, failing with a generic "Error outputting
 * keys and certificates" even when the password is correct. A wrong password
 * produces a distinct "Mac verify error" instead, so we only retry with
 * `-legacy` when the MAC check succeeded.
 */
function pkcs12CertPem(file, pass, legacy) {
  const args = ["pkcs12", "-in", file, "-passin", `pass:${pass}`, "-clcerts", "-nokeys"];
  if (legacy) args.push("-legacy");
  return run("openssl", args);
}

const MAC_ERROR_RE = /mac verify|invalid password|wrong password|mac.*fail/i;

function validateCertificate(file, pass) {
  let check = pkcs12CertPem(file, pass, false);
  let usedLegacy = false;

  if (check.status !== 0) {
    const stderr = (check.stderr || "").trim();
    // Only retry with -legacy when the password was accepted (otherwise the
    // first attempt would have reported a MAC verification failure).
    if (!MAC_ERROR_RE.test(stderr)) {
      const legacy = pkcs12CertPem(file, pass, true);
      if (legacy.status === 0) {
        check = legacy;
        usedLegacy = true;
      }
    }
  }

  if (check.status !== 0) {
    const detail = (check.stderr || check.stdout || "").trim() ||
      "openssl could not open the certificate";
    return {
      ok: false,
      reason: MAC_ERROR_RE.test(detail)
        ? "wrong password (openssl could not verify the .p12 MAC)"
        : "openssl could not parse the certificate (unusual or unsupported format?)",
      detail: detail.split("\n")[0] || detail,
    };
  }

  const info = run("openssl", ["x509", "-noout", "-subject", "-dates"], {
    input: check.stdout,
  });
  return {
    ok: true,
    usedLegacy,
    detail: (info.stdout || "").trim(),
  };
}

/** Detect the GitHub repo (owner/name) via gh, then git remote. */
function detectRepo() {
  const gh = run("gh", ["repo", "view", "--json", "nameWithOwner", "-q", ".nameWithOwner"]);
  if (gh.status === 0 && gh.stdout.trim()) return gh.stdout.trim();

  const git = run("git", ["remote", "get-url", "origin"], { cwd: PROJECT_ROOT });
  if (git.status === 0) {
    const match = git.stdout
      .trim()
      .match(/(?:github\.com[:/])([^/\s]+\/[^/\s]+?)(?:\.git)?$/);
    if (match) return match[1];
  }
  return null;
}

// ── Main ─────────────────────────────────────────────────────────────

const banner = `
┌──────────────────────────────────────────────────────────┐
│  macOS code signing — GitHub secrets preparation         │
└──────────────────────────────────────────────────────────┘`;
console.log(banner);

// 1. Resolve the .p12 file
if (p12Path == null) {
  fail("no .p12 file given\n\n" + USAGE);
}
const p12File = path.resolve(PROJECT_ROOT, p12Path);
let stat;
try {
  stat = fs.statSync(p12File);
} catch {
  fail(`file not found: ${p12File}`);
}
if (!stat.isFile()) {
  fail(`not a file: ${p12File}`);
}
console.log(`\n📄 Certificate: ${p12File} (${(stat.size / 1024).toFixed(1)} KB)`);

// 2. Resolve the password
if (password == null) {
  password = process.env.CSC_KEY_PASSWORD ?? process.env.P12_PASSWORD ?? null;
}
if (password == null) {
  password = await promptPassword();
}
if (password === "") {
  console.warn("⚠️  Empty password — the .p12 may use one; if not, signing will fail.");
}  // 3. Validate with openssl
  if (doValidate) {
    if (hasCommand("openssl")) {
      const result = validateCertificate(p12File, password);
      if (!result.ok) {
        fail(
          `certificate validation failed — ${result.reason}\n` +
            `   openssl: ${result.detail}`,
        );
      }
      if (result.usedLegacy) {
        console.log(
          "ℹ️  Certificate uses legacy encryption (RC2/RC4 — normal for Keychain " +
            "Access exports); validated with OpenSSL -legacy.",
        );
      }
      const subjectLine =
        result.detail
          .split("\n")
          .find((l) => l.startsWith("subject=")) || "";
      const datesLine =
        result.detail
          .split("\n")
          .find((l) => l.startsWith("notAfter=")) || "";
      console.log(`✅ Certificate validated`);
      console.log(`   ${subjectLine || "(no subject — not a certificate chain?)"}`);
      if (datesLine) console.log(`   ${datesLine}`);
      if (subjectLine && !/developer id/i.test(subjectLine)) {
        console.warn(
          "⚠️  This does not look like a Developer ID Application certificate. " +
            "'Apple Development' certs can sign, but the app will only run on " +
            "devices in your provisioning profile — not on other Macs.",
        );
      }
    } else {
      console.warn("⚠️  openssl not found — skipping certificate validation.");
    }
  }

// 4. Base64-encode
const base64 = fs.readFileSync(p12File).toString("base64");
console.log(
  `✅ Base64 encoded (${stat.size} bytes → ${base64.length} chars, single line)`,
);

// 5. Write --output file
if (outputFile) {
  const outPath = path.resolve(PROJECT_ROOT, outputFile);
  fs.writeFileSync(
    outPath,
    `# Generated by scripts/setup-signing-secrets.mjs — DO NOT COMMIT\n` +
      `# Add these as repository secrets in GitHub (Settings → Secrets → Actions).\n` +
      `CSC_LINK=${base64}\n` +
      `CSC_KEY_PASSWORD=${password}\n`,
  );
  console.log(`📝 Wrote ${outPath} — keep it out of git and delete after use.`);
}

// 6. Print the secrets
console.log(`
────────────────────────────────────────────────────────────
Set these two secrets (Settings → Secrets and variables → Actions):

  Name:  CSC_LINK
  Value: ${base64}

  Name:  CSC_KEY_PASSWORD
  Value: ${password}
────────────────────────────────────────────────────────────`);

const repo = detectRepo();
if (base64.length > 65536) {
  console.warn(
    `⚠️  The base64 is ${base64.length} chars — GitHub secrets are capped at 64 KB,` +
      ` this may be rejected. If so, re-export the .p12 without extra chains.`,
  );
}
console.log(`Or, from your terminal (gh CLI):`);
console.log(
  `  gh secret set CSC_LINK --repo ${repo ?? "<owner>/<repo>"} --body "<paste the base64 above>"`,
);
console.log(
  `  gh secret set CSC_KEY_PASSWORD --repo ${repo ?? "<owner>/<repo>"} --body "<paste the password>"`,
);

// 7. Optionally push via gh
if (doSet) {
  if (!hasCommand("gh")) {
    fail("--set requires the GitHub CLI (brew install gh) — run without --set to get the values.");
  }
  // Use the detected repo when possible; otherwise let gh infer it from the
  // current directory / logged-in account.
  const targetArgs = repo ? ["--repo", repo] : [];
  console.log(`\n🚀 Setting secrets${repo ? ` on ${repo}` : ""} ...`);
  const setSecret = (name, value) => {
    const res = run("gh", ["secret", "set", name, ...targetArgs, "--body", value]);
    if (res.status !== 0) {
      fail(`gh secret set ${name} failed: ${(res.stderr || "").trim()}`);
    }
    console.log(`   ✓ ${name}`);
  };
  setSecret("CSC_LINK", base64);
  setSecret("CSC_KEY_PASSWORD", password);
  console.log(`\n✅ Done. The next "Build Installer" run will sign the macOS app.`);
}

console.log(`
⚠️  Keep this base64 string private — it is your signing identity.
   The workflow (.github/workflows/build-installer.yml) reads CSC_LINK and
   CSC_KEY_PASSWORD automatically; no other setup is needed for signing.
   (APPLE_ID / APPLE_APP_SPECIFIC_PASSWORD / APPLE_TEAM_ID are optional and
   only required if you also want notarization.)`);
