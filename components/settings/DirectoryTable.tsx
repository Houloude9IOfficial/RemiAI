"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Eye, Trash2 } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { directoriesApi } from "@/lib/api/directories";
import { toast } from "sonner";

export function DirectoryTable() {
  const queryClient = useQueryClient();
  const { data: directories = [], isLoading } = useQuery({
    queryKey: ["directories"],
    queryFn: directoriesApi.list,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...input }: { id: number; canRead?: boolean; canWrite?: boolean; watchEnabled?: boolean }) =>
      directoriesApi.update(id, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["directories"] }),
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: directoriesApi.remove,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["directories"] });
      toast.success("Directory removed");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading...</p>;
  }

  if (directories.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No directories added yet — add one above to let the AI access it.
      </p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Label</TableHead>
          <TableHead>Path</TableHead>
          <TableHead className="text-center">Read</TableHead>
          <TableHead className="text-center">Write</TableHead>
          <TableHead className="text-center">
            <Tooltip>
              {/* <TooltipTrigger className="inline-flex items-center gap-1 text-xs font-medium"> */}
              <TooltipTrigger>
                {/* <Eye className="h-3 w-3" /> */}
                <span>Watch</span>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs">Monitor for file changes in background</p>
              </TooltipContent>
            </Tooltip>
          </TableHead>
          <TableHead className="w-10" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {directories.map((dir) => (
          <TableRow key={dir.id}>
            <TableCell className="font-medium">{dir.label}</TableCell>
            <TableCell className="font-mono text-xs text-muted-foreground">
              {dir.path}
            </TableCell>
            <TableCell className="text-center">
              <Switch
                checked={dir.canRead}
                onCheckedChange={(canRead) => updateMutation.mutate({ id: dir.id, canRead })}
              />
            </TableCell>
            <TableCell className="text-center">
              <Switch
                checked={dir.canWrite}
                onCheckedChange={(canWrite) => updateMutation.mutate({ id: dir.id, canWrite })}
              />
            </TableCell>
            <TableCell className="text-center">
              <Switch
                checked={dir.watchEnabled}
                disabled={!dir.canRead}
                onCheckedChange={(watchEnabled) => updateMutation.mutate({ id: dir.id, watchEnabled })}
              />
            </TableCell>
            <TableCell>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                onClick={() => deleteMutation.mutate(dir.id)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
