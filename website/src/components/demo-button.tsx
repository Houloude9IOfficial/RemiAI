"use client";

import { useState } from "react";
import { IconCheck, IconCopy, IconExternalLink, IconX } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { DEMO_EMAIL, DEMO_PASSWORD, DEMO_URL } from "@/lib/constants";

export function DemoButton() {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<"email" | "password" | null>(null);

  const copyCredential = async (name: "email" | "password", value: string) => {
    await navigator.clipboard.writeText(value);
    setCopied(name);
    window.setTimeout(() => setCopied(null), 1600);
  };

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        Demo
      </Button>

      {open && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="demo-dialog-title"
            className="w-full max-w-sm rounded-2xl border border-border bg-background p-6 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="demo-dialog-title" className="text-lg font-semibold tracking-tight">
                  RemiAI Demo
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Use these credentials to sign in to the demo.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label="Close demo credentials"
              >
                <IconX className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-6 space-y-3">
              <Credential
                label="Email"
                value={DEMO_EMAIL}
                copied={copied === "email"}
                onCopy={() => copyCredential("email", DEMO_EMAIL)}
              />
              <Credential
                label="Password"
                value={DEMO_PASSWORD}
                copied={copied === "password"}
                onCopy={() => copyCredential("password", DEMO_PASSWORD)}
              />
            </div>

            <a href={DEMO_URL} target="_blank" rel="noopener noreferrer" className="mt-6 block">
              <Button type="button" className="w-full">
                Open Demo
                <IconExternalLink className="h-4 w-4" />
              </Button>
            </a>
          </div>
        </div>
      )}
    </>
  );
}

function Credential({
  label,
  value,
  copied,
  onCopy,
}: {
  label: string;
  value: string;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onCopy}
      className="flex w-full items-center justify-between gap-3 rounded-xl border border-border bg-muted/40 px-4 py-3 text-left transition-colors hover:bg-muted"
      aria-label={`Copy demo ${label.toLowerCase()}`}
    >
      <span className="min-w-0">
        <span className="block text-xs text-muted-foreground">{label}</span>
        <code className="mt-1 block truncate font-mono text-sm">{value}</code>
      </span>
      {copied ? (
        <IconCheck className="h-4 w-4 shrink-0 text-emerald-600" aria-label="Copied" />
      ) : (
        <IconCopy className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      )}
    </button>
  );
}
