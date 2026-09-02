"use client";

import { useState, useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { backupApi, type HistoryEntry } from "@/lib/api/backup";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Loader2,
  Download,
  Shield,
  ShieldAlert,
  CheckCircle2,
  FileDown,
  FileUp,
  KeyRound,
  Database,
  FileType,
  AlertTriangle,
  Clock,
  RotateCcw,
  Image,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import CenteredLayout from "@/components/layout/CenteredLayout";

// ── Format helpers ─────────────────────────────────────────────────────────

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

// ── BackupHistoryRow component ─────────────────────────────────────────────

function BackupHistoryRow({ entry }: { entry: HistoryEntry }) {
  const totalRecords = Object.values(entry.tableStats).reduce(
    (sum, n) => sum + (n as number),
    0,
  );
  const fileCount =
    entry.uploadCount + entry.avatarCount + (entry.skillCount ?? 0);

  return (
    <div className="flex items-center justify-between gap-4 py-3 text-sm first:pt-0 last:pb-0">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
          <span className="truncate font-medium">
            Backup from {formatDate(entry.exportedAt)}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
          <span>{formatSize(entry.totalSize)}</span>
          <span>•</span>
          <span>{totalRecords} records</span>
          {fileCount > 0 && (
            <>
              <span>•</span>
              <span>{fileCount} files</span>
            </>
          )}
          {entry.includesFiles === false && (
            <>
              <span>•</span>
              <Badge variant="outline" className="text-[10px] font-normal">
                DB only
              </Badge>
            </>
          )}
        </div>
      </div>
      <Badge variant="secondary" className="shrink-0 text-[10px]">
        v{entry.appVersion || "?"}
      </Badge>
    </div>
  );
}

// ── Main content ───────────────────────────────────────────────────────────

export default function BackupContent() {
  // ── Export state ────────────────────────────────────────────────────────
  const [exportPassword, setExportPassword] = useState("");
  const [exportConfirmPassword, setExportConfirmPassword] = useState("");
  const [includeFiles, setIncludeFiles] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [exportResult, setExportResult] = useState<{
    stats: Record<string, number>;
    uploads: number;
    avatars: number;
    size: number;
  } | null>(null);

  // ── History state ──────────────────────────────────────────────────────
  const {
    data: historyData,
    isLoading: historyLoading,
    refetch: refetchHistory,
  } = useQuery({
    queryKey: ["backup-history"],
    queryFn: () => backupApi.history(20),
  });

  // ── Import state ────────────────────────────────────────────────────────
  const [importPassword, setImportPassword] = useState("");
  const [importFile, setImportFile] = useState<File | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);

  // ── Export handler ──────────────────────────────────────────────────────
  const handleExport = useCallback(async () => {
    if (exportPassword.length < 4) {
      toast.error("Password must be at least 4 characters.");
      return;
    }
    if (exportPassword !== exportConfirmPassword) {
      toast.error("Passwords do not match.");
      return;
    }

    setIsExporting(true);
    setExportResult(null);

    try {
      const result = await backupApi.export(exportPassword, includeFiles);
      const blob = await backupApi.download(result.downloadUrl);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      a.download = `remiai-backup-${timestamp}.remi-backup`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      try {
        await backupApi.recordHistory(result.history);
        refetchHistory();
      } catch (historyError) {
        console.warn("[backup] Failed to record backup history:", historyError);
        toast.warning("Backup downloaded, but history could not be updated.");
      }

      setExportResult({
        stats: result.stats.tables,
        uploads: result.stats.uploads,
        avatars: result.stats.avatars,
        size: result.size,
      });

      toast.success("Backup downloaded successfully!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Export failed");
    } finally {
      setIsExporting(false);
    }
  }, [exportPassword, exportConfirmPassword, includeFiles, refetchHistory]);

  // ── Import confirmation ─────────────────────────────────────────────────
  const handleImportClick = () => {
    if (!importFile) {
      toast.error("Please select a backup file.");
      return;
    }
    if (importPassword.length < 4) {
      toast.error("Password must be at least 4 characters.");
      return;
    }
    setConfirmDialogOpen(true);
  };

  // ── Import handler ──────────────────────────────────────────────────────
  const handleImport = useCallback(async () => {
    if (!importFile) return;
    setConfirmDialogOpen(false);
    setIsImporting(true);

    try {
      await backupApi.import(importFile, importPassword);
      toast.success("Backup restored successfully!", { duration: 8000 });
      setImportFile(null);
      setImportPassword("");
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import failed");
    } finally {
      setIsImporting(false);
    }
  }, [importFile, importPassword]);

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <CenteredLayout>
      <div className="flex max-w-3xl flex-col gap-8">
        {/* Header */}
      <div>
        <h1 className="text-lg font-semibold">Backup & Restore</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Create encrypted backups of your data and restore them when needed.
        </p>
      </div>

      {/* ═══ EXPORT ═══ */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
              <Download className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle>Export Backup</CardTitle>
              <CardDescription>
                Download all your data as an encrypted .remi-backup file.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="export-password">Encryption password</Label>
            <div className="relative">
              <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="export-password"
                type="password"
                placeholder="Enter a strong password..."
                value={exportPassword}
                onChange={(e) => setExportPassword(e.target.value)}
                className="pl-9"
                autoComplete="new-password"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="export-confirm">Confirm password</Label>
            <div className="relative">
              <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="export-confirm"
                type="password"
                placeholder="Re-enter the same password..."
                value={exportConfirmPassword}
                onChange={(e) => setExportConfirmPassword(e.target.value)}
                className={cn(
                  "pl-9",
                  exportConfirmPassword &&
                    exportPassword !== exportConfirmPassword &&
                    "border-destructive",
                )}
                autoComplete="new-password"
              />
            </div>
            {exportConfirmPassword && exportPassword !== exportConfirmPassword && (
              <p className="text-xs text-destructive">Passwords do not match</p>
            )}
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <div className="flex items-center gap-3">
              <Image className="h-4 w-4 text-muted-foreground" />
              <div>
                <Label htmlFor="include-files" className="cursor-pointer font-normal">
                  Include uploaded files & avatars
                </Label>
                <p className="text-xs text-muted-foreground">
                  Embeds file uploads and avatar images (makes backup larger)
                </p>
              </div>
            </div>
            <Switch
              id="include-files"
              checked={includeFiles}
              onCheckedChange={setIncludeFiles}
            />
          </div>

          <Button
            onClick={handleExport}
            disabled={isExporting || !exportPassword || exportPassword !== exportConfirmPassword}
            className="w-full"
          >
            {isExporting ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Encrypting & downloading...</>
            ) : (
              <><FileDown className="mr-2 h-4 w-4" /> Download Encrypted Backup</>
            )}
          </Button>

          {exportResult && (
            <Alert variant="default">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              <AlertTitle>Backup created successfully</AlertTitle>
              <AlertDescription>
                <div className="mt-1 space-y-1 text-xs">
                  <p><span className="font-medium">Backup size:</span> {(exportResult.size / 1024 / 1024).toFixed(2)} MB</p>
                  <p>
                    <span className="font-medium">Database records:</span>{" "}
                    {Object.entries(exportResult.stats)
                      .filter(([, c]) => c > 0)
                      .map(([t, c]) => `${t}: ${c}`)
                      .join(", ") || "none"}
                  </p>
                </div>
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* ═══ BACKUP HISTORY ═══ */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
              <Clock className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="flex-1">
              <CardTitle>Backup History</CardTitle>
              <CardDescription>
                Recent backups created from this device.
              </CardDescription>
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => refetchHistory()}
              disabled={historyLoading}
              aria-label="Refresh history"
            >
              <RotateCcw className={cn("h-4 w-4", historyLoading && "animate-spin")} />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {historyLoading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : !historyData?.entries.length ? (
            <div className="py-4 text-center text-sm text-muted-foreground">
              <Clock className="mx-auto mb-2 h-8 w-8 opacity-40" />
              <p>No backups created yet.</p>
              <p className="text-xs">Export a backup above to see it here.</p>
            </div>
          ) : (
            <div className="divide-y">
              {historyData.entries.map((entry) => (
                <BackupHistoryRow key={entry.id} entry={entry} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ═══ IMPORT / RESTORE ═══ */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-500/10">
              <ShieldAlert className="h-5 w-5 text-amber-500" />
            </div>
            <div>
              <CardTitle>Restore from Backup</CardTitle>
              <CardDescription>
                Restore all your data from a previously exported .remi-backup file.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription className="text-xs">
              Restoring a backup will replace all current data including providers,
              conversations, memories, preferences, and settings. Make sure you
              have a recent backup of your current data before proceeding.
            </AlertDescription>
          </Alert>

          <div className="space-y-2">
            <Label htmlFor="backup-file">Backup file (.remi-backup)</Label>
            <div className="flex h-9 w-full overflow-hidden rounded-lg border border-input">
              <Button
                type="button"
                variant="secondary"
                className="h-full rounded-none rounded-l-lg border-r"
                onClick={() => fileInputRef.current?.click()}
              >
                Browse...
              </Button>
              <div className="flex flex-1 items-center px-3 text-sm text-muted-foreground truncate">
                {importFile ? importFile.name : "No file selected"}
              </div>
              <input
                id="backup-file"
                ref={fileInputRef}
                type="file"
                accept=".remi-backup"
                className="hidden"
                onChange={(e) => setImportFile(e.target.files?.[0] ?? null)}
              />
            </div>
            {importFile && (
              <p className="text-xs text-muted-foreground">
                Selected: {importFile.name} ({(importFile.size / 1024).toFixed(1)} KB)
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="import-password">Decryption password</Label>
            <div className="relative">
              <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="import-password"
                type="password"
                placeholder="Password used when exporting..."
                value={importPassword}
                onChange={(e) => setImportPassword(e.target.value)}
                className="pl-9"
                autoComplete="off"
              />
            </div>
          </div>

          <Button
            onClick={handleImportClick}
            disabled={isImporting || !importFile || importPassword.length < 4}
            variant="destructive"
            className="w-full"
          >
            {isImporting ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Decrypting & restoring...</>
            ) : (
              <><FileUp className="mr-2 h-4 w-4" /> Restore from Backup</>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* ═══ CONFIRMATION DIALOG ═══ */}
      <Dialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <ShieldAlert className="h-5 w-5" />
              Confirm Restore
            </DialogTitle>
            <DialogDescription className="pt-2">
              This action will <strong>permanently replace</strong> all existing data
              with the data from the backup. This cannot be undone.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 rounded-lg border bg-muted/50 p-4 text-sm">
            <p className="font-medium">You are about to restore:</p>
            <ul className="space-y-1 text-muted-foreground">
              <li className="flex items-center gap-2">
                <Database className="h-3.5 w-3.5" /> All database records
              </li>
              <li className="flex items-center gap-2">
                <Shield className="h-3.5 w-3.5" /> All API keys and provider configs
              </li>
              {importFile && (
                <li className="flex items-center gap-2">
                  <FileType className="h-3.5 w-3.5" /> File: {importFile.name}
                </li>
              )}
            </ul>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
            <Button variant="destructive" onClick={handleImport} disabled={isImporting}>
              {isImporting ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Restoring...</>
              ) : (
                "Yes, Restore Everything"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
        </Dialog>
      </div>
    </CenteredLayout>
  );
}
