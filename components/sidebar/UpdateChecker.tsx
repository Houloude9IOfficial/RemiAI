"use client";

import { useState } from "react";
import { Download, Rocket } from "lucide-react";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MarkdownRenderer } from "@/components/chat/MarkdownRenderer";
import { useUpdateChecker } from "@/lib/hooks/use-update-checker";
import type { ReleaseAsset } from "@/lib/updates";

/**
 * In-app update notification.
 *
 * Renders nothing while the app is up to date (or the check hasn't run yet).
 * When the GitHub release is newer than the bundled version, shows a download
 * icon (with a small indicator dot) in the sidebar next to the Info button.
 * Clicking it opens a modal with the new version, the release changelog and
 * download links.
 */
export function UpdateChecker({ className }: { className?: string }) {
  const { release, updateAvailable, checked, currentVersion } = useUpdateChecker();
  const [open, setOpen] = useState(false);

  // Only surface the icon once we know there is something newer.
  if (!checked || !updateAvailable || !release) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="New update available"
        title={`Update available — RemiAI ${release.version}`}
        className={cn(
          "relative flex h-8 w-8 items-center justify-center rounded-lg text-primary transition-colors hover:bg-muted",
          className,
        )}
      >
        <Download className="h-4 w-4" />
        <span
          aria-hidden="true"
          className="absolute right-1 top-1 h-2 w-2 rounded-full bg-primary ring-2 ring-background"
        />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader className="items-start gap-1.5">
            <DialogTitle className="flex items-center gap-2 text-base">
              <Rocket className="h-4 w-4 text-primary" />
              Update available — RemiAI {release.version}
            </DialogTitle>
            <DialogDescription className="text-xs">
              You&apos;re on version {currentVersion}
              {release.publishedAt
                ? ` · Published ${formatDate(release.publishedAt)}`
                : ""}
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-80 overflow-y-auto rounded-xl border border-border/60 bg-muted/30 p-4 custom-scrollbar">
            {release.body ? (
              <MarkdownRenderer content={release.body} />
            ) : (
              <p className="text-sm text-muted-foreground">
                No changelog was provided for this release.
              </p>
            )}
          </div>

          {release.assets.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {release.assets.map((asset) => (
                <AssetLink key={asset.url} asset={asset} />
              ))}
            </div>
          )}

          <DialogFooter className="items-center gap-2">
            <a
              href={release.htmlUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonVariants({ size: "sm" })}
            >
              Download
            </a>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function AssetLink({ asset }: { asset: ReleaseAsset }) {
  return (
    <a
      href={asset.url}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        buttonVariants({ variant: "outline", size: "xs" }),
        "text-xs",
      )}
    >
      {asset.name}
      {asset.size > 0 ? (
        <span className="text-muted-foreground">{formatBytes(asset.size)}</span>
      ) : null}
    </a>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return "";
  }
}
