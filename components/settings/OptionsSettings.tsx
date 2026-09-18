"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageSquareText, Brain, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { preferencesApi, type UserPreferences } from "@/lib/api/preferences";

export function OptionsSettings() {
  const queryClient = useQueryClient();
  const {
    data: preferences,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["preferences"],
    queryFn: preferencesApi.get,
  });

  const updateMutation = useMutation({
    mutationFn: (data: Partial<UserPreferences>) => preferencesApi.update(data),
    onSuccess: (updatedPreferences) => {
      queryClient.setQueryData(["preferences"], updatedPreferences);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const disabled = isLoading || updateMutation.isPending;

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold">Options</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Customize how messages and model activity are displayed in chat.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <MessageSquareText className="h-4 w-4 text-primary" />
            Messages
          </CardTitle>
          <CardDescription className="text-xs">
            Reduce visual noise in conversations without removing message controls.
          </CardDescription>
        </CardHeader>
        <CardContent className="border-t pt-4">
          <OptionRow
            title="Collapse long user messages"
            description="Fold long prompts by default. You can still expand any message when needed."
            checked={preferences?.collapseLongUserMessages ?? true}
            disabled={disabled}
            onCheckedChange={(collapseLongUserMessages) =>
              updateMutation.mutate({ collapseLongUserMessages })
            }
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <Brain className="h-4 w-4 text-primary" />
            Reasoning
          </CardTitle>
          <CardDescription className="text-xs">
            Control whether model reasoning opens automatically while work is in progress.
          </CardDescription>
        </CardHeader>
        <CardContent className="border-t pt-4">
          <OptionRow
            title="Expand reasoning while working"
            description="Open active reasoning automatically, then fold it once the final response begins."
            checked={preferences?.expandReasoningWhileWorking ?? true}
            disabled={disabled}
            onCheckedChange={(expandReasoningWhileWorking) =>
              updateMutation.mutate({ expandReasoningWhileWorking })
            }
          />
        </CardContent>
      </Card>

      {isError && (
        <div className="flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          <span className="flex-1">Could not load your saved options.</span>
          <Button size="sm" variant="outline" onClick={() => void refetch()}>
            <RefreshCw className="h-3.5 w-3.5" />
            Retry
          </Button>
        </div>
      )}
    </div>
  );
}

function OptionRow({
  title,
  description,
  checked,
  disabled,
  onCheckedChange,
}: {
  title: string;
  description: string;
  checked: boolean;
  disabled: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <p className="text-sm font-medium">{title}</p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p>
      </div>
      <Switch
        checked={checked}
        disabled={disabled}
        aria-label={title}
        onCheckedChange={onCheckedChange}
      />
    </div>
  );
}
