"use client";

import { useState, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Fuse from "fuse.js";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Trash2, Search, Brain, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { memoriesApi } from "@/lib/api/memories";

export function MemoryList() {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");

  const { data: memories = [], isLoading } = useQuery({
    queryKey: ["memories"],
    queryFn: memoriesApi.list,
  });

  // Client-side fuzzy search with Fuse.js
  const filteredMemories = useMemo(() => {
    if (!searchQuery.trim()) return memories;

    const fuse = new Fuse(memories, {
      keys: ["content"],
      threshold: 0.4,
      includeScore: true,
    });

    const results = fuse.search(searchQuery);
    return results.map((r) => r.item);
  }, [memories, searchQuery]);

  const deleteMutation = useMutation({
    mutationFn: memoriesApi.remove,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["memories"] });
      toast.success("Memory deleted");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <div className="flex flex-col gap-4">
      {/* Search bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search memories..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9 pr-8"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Memory list */}
      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : filteredMemories.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-12 text-center">
          <Brain className="h-8 w-8 text-muted-foreground/40" />
          {searchQuery ? (
            <>
              <p className="text-sm text-muted-foreground">
                No memories match your search.
              </p>
              <Button
                variant="link"
                size="sm"
                onClick={() => setSearchQuery("")}
              >
                Clear search
              </Button>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                No memories yet.
              </p>
              <p className="text-xs text-muted-foreground/60">
                The AI will automatically save memories during conversations
                when it learns something worth remembering about you.
              </p>
            </>
          )}
        </div>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12 text-center text-xs text-muted-foreground">
                  #
                </TableHead>
                <TableHead>Memory</TableHead>
                <TableHead className="w-40 text-xs text-muted-foreground hidden sm:table-cell">
                  Created
                </TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredMemories.map((memory, idx) => (
                <TableRow key={memory.id} className="group">
                  <TableCell className="text-center text-xs text-muted-foreground">
                    {idx + 1}
                  </TableCell>
                  <TableCell 
                    className="text-sm max-w-xs overflow-hidden text-ellipsis whitespace-nowrap cursor-pointer hover:underline"
                    onClick={() => {
                      navigator.clipboard.writeText(memory.content);
                      toast.success("Copied!");
                    }}
                  >
                    {memory.content}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground hidden sm:table-cell">
                    {new Date(memory.createdAt).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </TableCell>
                  <TableCell>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive transition-all"
                      onClick={() => deleteMutation.mutate(memory.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {searchQuery && (
            <div className="border-t px-4 py-2 text-xs text-muted-foreground">
              {filteredMemories.length} of {memories.length} memories match
            </div>
          )}
        </div>
      )}
    </div>
  );
}
