"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { directoriesApi } from "@/lib/api/directories";
import { toast } from "sonner";

export function DirectoryForm() {
  const queryClient = useQueryClient();
  const [path, setPath] = useState("");
  const [label, setLabel] = useState("");
  const [canRead, setCanRead] = useState(true);
  const [canWrite, setCanWrite] = useState(false);
  const [pathStatus, setPathStatus] = useState<
    { state: "idle" } | { state: "checking" } | { state: "valid" } | { state: "invalid"; error: string }
  >({ state: "idle" });

  const checkPath = async (value: string) => {
    if (!value.trim()) {
      setPathStatus({ state: "idle" });
      return;
    }
    setPathStatus({ state: "checking" });
    const result = await directoriesApi.validate(value);
    if (result.valid) {
      setPathStatus({ state: "valid" });
      if (!label) {
        const parts = (result.resolvedPath ?? value).split("/").filter(Boolean);
        setLabel(parts[parts.length - 1] ?? value);
      }
    } else {
      setPathStatus({ state: "invalid", error: result.error ?? "Invalid path" });
    }
  };

  const createMutation = useMutation({
    mutationFn: directoriesApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["directories"] });
      setPath("");
      setLabel("");
      setCanRead(true);
      setCanWrite(false);
      setPathStatus({ state: "idle" });
      toast.success("Directory added");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <form
      className="flex flex-col gap-3 rounded-lg border p-4"
      onSubmit={(e) => {
        e.preventDefault();
        createMutation.mutate({ path, label: label || path, canRead, canWrite });
      }}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="dir-path">Absolute path</Label>
          <Input
            id="dir-path"
            placeholder="/Users/you/Documents or ~/Projects"
            value={path}
            onChange={(e) => setPath(e.target.value)}
            onBlur={(e) => checkPath(e.target.value)}
          />
          {pathStatus.state === "checking" && (
            <p className="text-xs text-muted-foreground">Checking...</p>
          )}
          {pathStatus.state === "valid" && (
            <p className="text-xs text-emerald-600">Path exists</p>
          )}
          {pathStatus.state === "invalid" && (
            <p className="text-xs text-destructive">{pathStatus.error}</p>
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="dir-label">Label</Label>
          <Input
            id="dir-label"
            placeholder="Documents"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
        </div>
      </div>

      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2">
          <Switch id="dir-read" checked={canRead} onCheckedChange={setCanRead} />
          <Label htmlFor="dir-read">Read</Label>
        </div>
        <div className="flex items-center gap-2">
          <Switch id="dir-write" checked={canWrite} onCheckedChange={setCanWrite} />
          <Label htmlFor="dir-write">Write</Label>
        </div>
        <Button
          type="submit"
          className="ml-auto"
          disabled={pathStatus.state !== "valid" || createMutation.isPending}
        >
          {createMutation.isPending ? "Adding..." : "Add directory"}
        </Button>
      </div>
    </form>
  );
}
