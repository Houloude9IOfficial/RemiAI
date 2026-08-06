"use client";

import { useState, type ReactNode } from "react";
import { GitBranch, Info } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import packagejson from "../../package.json";

interface PackageJson {
  name: string;
  version: string;
  author: string | { name?: string; email?: string };
  license: string;
  description?: string;
  repository?: { url?: string };
}

const packageJson = packagejson as PackageJson;

// Normalise author — package.json stores either "Name" or { name, email }
const authorName =
  typeof packageJson.author === "string"
    ? packageJson.author
    : packageJson.author?.name ?? "";

// Normalise "git+https://github.com/...git" → "https://github.com/..."
const repoUrl = packageJson.repository?.url
  ? packageJson.repository.url.replace(/^git\+/, "").replace(/\.git$/, "")
  : "";

const repoDisplay = repoUrl.replace(/^https?:\/\//, "");

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-3 items-center gap-2 px-3.5 py-2.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <div className="col-span-2 min-w-0 text-sm">{children}</div>
    </div>
  );
}

export function AboutModal() {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors"
        aria-label="About"
        title="About RemiAI"
      >
        <Info className="h-4 w-4" />
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="items-center gap-1 text-center">
          <div className="mb-1 flex h-16 w-16 items-center justify-center">
            <img
              src="/RemiAI.png"
              alt="RemiAI logo"
              className="block h-10 w-auto dark:hidden"
            />
            <img
              src="/RemiAI-Light.png"
              alt="RemiAI logo"
              className="hidden h-10 w-auto dark:block"
            />
          </div>
          <DialogTitle className="text-base font-semibold">RemiAI</DialogTitle>
          {packageJson.description ? (
            <p className="text-xs leading-relaxed text-muted-foreground">
              {packageJson.description}
            </p>
          ) : null}
        </DialogHeader>

        <div className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/60">
          <DetailRow label="Name">{packageJson.name}</DetailRow>
          <DetailRow label="Author">{authorName}</DetailRow>
          <DetailRow label="Version">{packageJson.version}</DetailRow>
          <DetailRow label="License">{packageJson.license}</DetailRow>
          {repoUrl ? (
            <DetailRow label="Repository">
              <a
                href={repoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex max-w-full items-center gap-1.5 text-primary hover:underline"
              >
                <GitBranch className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{repoDisplay}</span>
              </a>
            </DetailRow>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
