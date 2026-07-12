"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { providersApi } from "@/lib/api/providers";
import { ProviderModelList } from "./ProviderModelList";

export function ProviderList() {
  const queryClient = useQueryClient();
  const { data: providers = [], isLoading } = useQuery({
    queryKey: ["providers"],
    queryFn: providersApi.list,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: number; enabled: boolean }) =>
      providersApi.update(id, { enabled }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["providers"] }),
    onError: (err: Error) => toast.error(err.message),
  });

  const removeMutation = useMutation({
    mutationFn: providersApi.remove,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["providers"] });
      toast.success("Provider removed");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading...</p>;

  if (providers.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No providers configured yet — add one above to start chatting.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {providers.map((provider) => (
        <Card key={provider.id}>
          <CardHeader className="flex-row items-center gap-3 space-y-0">
            <div className="flex flex-1 items-center gap-2">
              <span className="font-medium">{provider.label}</span>
              <Badge variant="outline" className="text-[10px] uppercase">
                {provider.kind}
              </Badge>
              {provider.hasApiKey && (
                <span className="font-mono text-xs text-muted-foreground">{provider.apiKey}</span>
              )}
            </div>
            <Switch
              checked={provider.enabled}
              onCheckedChange={(enabled) => updateMutation.mutate({ id: provider.id, enabled })}
            />
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 text-muted-foreground hover:text-destructive"
              onClick={() => removeMutation.mutate(provider.id)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent>
            <ProviderModelList provider={provider} />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
