"use client";

import { AlertTriangle } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

/**
 * One-time "I understand" confirmation when installing a skill from a repo
 * that is not in the curated/preloaded set (mirrors the ToolList.tsx
 * code-execution confirmation pattern).
 */
export function InstallSecurityDialog({
  open,
  repoName,
  onCancel,
  onConfirm,
  busy,
}: {
  open: boolean;
  repoName: string;
  onCancel: () => void;
  onConfirm: () => void;
  busy?: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && !busy && onCancel()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
            <AlertTriangle className="h-5 w-5" />
            Install from unverified repository?
          </DialogTitle>
          <DialogDescription className="space-y-3 pt-2" render={<div />}>
            <p className="text-sm font-medium text-foreground">
              {repoName} is not in Remi&apos;s curated set of trusted repositories.
            </p>
            <ul className="list-disc space-y-1.5 pl-4 text-xs text-muted-foreground">
              <li>
                Skills are <strong>instructions that steer the AI</strong> —
                they can change how it behaves and what it suggests.
              </li>
              <li>Malicious skills could attempt prompt injection.</li>
              <li>Only install from repositories you trust.</li>
            </ul>
            <p className="text-xs text-muted-foreground">
              You can remove the skill anytime from the Library tab.
            </p>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="default"
            className="bg-amber-600 text-white hover:bg-amber-700 ml-2"
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? "Installing…" : "I Understand, Install"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
